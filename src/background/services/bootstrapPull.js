// ============================================================
// Tabatha — Bootstrap Org Registry Pull (Phase B: multi-profile sync)
//
// Runs once per install (gated by _orgRegistryBootstrappedAt in
// chrome.storage.local) AFTER successful sign-in. Pulls every
// tabatha.{operations,initiatives,clients,projects,tasks_registry} row
// for the user's profile_id and merges into local tabathaOrg.
//
// Merge rule: server's local-id (operation_id, client_id, etc.) becomes
// canonical. If a local entry shares a name with a server row, the local
// entry is re-keyed to the server's id and all dependent FKs are
// rewritten via the id-rewrite map. Pure-local entries push up on the
// next regular sync.
//
// Idempotent. Clearing _orgRegistryBootstrappedAt re-runs it (useful for
// the "Re-pull org registry" button in Settings).
// ============================================================

import { getStorage, setStorage } from './storageService.js';

const REGISTRY_KEYS = ['operations', 'initiatives', 'clients', 'projects', 'tasks'];

// (local key)            ↔ (server table)     ↔ (server's local-id column)
const TABLE_FOR = {
  operations: 'operations',
  initiatives: 'initiatives',
  clients: 'clients',
  projects: 'projects',
  tasks: 'tasks_registry'
};
const ID_COL_FOR = {
  operations: 'operation_id',
  initiatives: 'initiative_id',
  clients: 'client_id',
  projects: 'project_id',
  tasks: 'task_id'
};

function normName(s) {
  return String(s || '').toLowerCase().trim();
}

// Rebuild a local map entry from a server row. Returns a shape compatible
// with the existing tabathaOrg.{operations,initiatives,...} maps (see
// syncService.buildOrgRows for the inverse mapping). We rely on the
// metadata column we stored on push — if not present, reconstruct minimal.
function serverRowToLocal(kind, row) {
  const base = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? { ...row.metadata }
    : {};
  base.id = row[ID_COL_FOR[kind]];
  base.name = base.name || row.name || '';
  base.archived = !!row.archived;
  if (row.created_at) base.createdAt = row.created_at;
  if (row.archived_at) base.archivedAt = row.archived_at;
  if (kind === 'initiatives' && row.operation_id) base.operationId = row.operation_id;
  if (kind === 'clients' && row.initiative_id) base.initiativeId = row.initiative_id;
  if (kind === 'projects') {
    if (row.client_id) base.clientId = row.client_id;
  }
  if (kind === 'tasks') {
    if (row.project_id) base.projectId = row.project_id;
    if (row.client_id) base.clientId = row.client_id;
    if (row.description) base.description = row.description;
    if (row.status) base.status = row.status;
    if (row.funnel_stage) base.funnelStage = row.funnel_stage;
    if (Array.isArray(row.linked_intents)) base.linkedIntents = row.linked_intents;
    if (row.completed_at) base.completedAt = row.completed_at;
  }
  return base;
}

async function fetchKind(supabase, profileId, kind) {
  const table = TABLE_FOR[kind];
  const { data, error } = await supabase
    .schema('tabatha')
    .from(table)
    .select('*')
    .eq('profile_id', profileId);
  if (error) throw new Error(`pull ${table} failed: ${error.message || error.code || JSON.stringify(error)}`);
  return Array.isArray(data) ? data : [];
}

// Apply the rewrite map to dependent FKs across the local registry.
function applyRewrites(local, rewrite) {
  for (const init of Object.values(local.initiatives || {})) {
    if (init.operationId && rewrite.operations[init.operationId]) {
      init.operationId = rewrite.operations[init.operationId];
    }
  }
  for (const cli of Object.values(local.clients || {})) {
    if (cli.initiativeId && rewrite.initiatives[cli.initiativeId]) {
      cli.initiativeId = rewrite.initiatives[cli.initiativeId];
    }
  }
  for (const proj of Object.values(local.projects || {})) {
    if (proj.clientId && rewrite.clients[proj.clientId]) {
      proj.clientId = rewrite.clients[proj.clientId];
    }
  }
  for (const task of Object.values(local.tasks || {})) {
    if (task.projectId && rewrite.projects[task.projectId]) {
      task.projectId = rewrite.projects[task.projectId];
    }
    if (task.clientId && rewrite.clients[task.clientId]) {
      task.clientId = rewrite.clients[task.clientId];
    }
  }
}

function emptyRegistry() {
  return { operations: {}, initiatives: {}, clients: {}, projects: {}, tasks: {} };
}

// Public: pull + merge + persist. Returns a summary the caller can log.
// Throws on transport errors so syncService can record a diagnostic. Idempotency
// is the caller's responsibility (check _orgRegistryBootstrappedAt).
export async function bootstrapOrgRegistry({ supabase, profileId }) {
  if (!supabase || !profileId) {
    throw new Error('bootstrapOrgRegistry requires supabase + profileId');
  }

  // 1. Load local
  const { tabathaOrg: existing } = await getStorage('tabathaOrg');
  const local = existing && typeof existing === 'object'
    ? { ...emptyRegistry(), ...existing }
    : emptyRegistry();
  for (const k of REGISTRY_KEYS) {
    if (!local[k] || typeof local[k] !== 'object' || Array.isArray(local[k])) local[k] = {};
  }

  // 2. Fetch server rows in dependency order
  const server = {};
  for (const kind of REGISTRY_KEYS) {
    server[kind] = await fetchKind(supabase, profileId, kind);
  }

  // 3. Merge
  const rewrite = { operations: {}, initiatives: {}, clients: {}, projects: {}, tasks: {} };
  const summary = { merged: 0, adoptedFromServer: 0, renamedLocal: 0 };

  for (const kind of REGISTRY_KEYS) {
    // Build local name index (case-insensitive)
    const nameIdx = new Map();
    for (const [id, item] of Object.entries(local[kind])) {
      const n = normName(item?.name);
      if (n && !nameIdx.has(n)) nameIdx.set(n, id);
    }

    for (const row of server[kind]) {
      const sid = row[ID_COL_FOR[kind]];
      if (!sid) continue;

      // Already aligned by id — skip.
      if (local[kind][sid]) {
        summary.merged += 1;
        continue;
      }

      const n = normName(row.name);
      const localMatch = n ? nameIdx.get(n) : null;

      if (localMatch && localMatch !== sid) {
        // Re-key local entry under server id; preserve any local-only fields
        // not present on server row.
        const oldEntry = local[kind][localMatch];
        const merged = { ...oldEntry, ...serverRowToLocal(kind, row) };
        delete local[kind][localMatch];
        local[kind][sid] = merged;
        rewrite[kind][localMatch] = sid;
        nameIdx.set(n, sid);
        summary.renamedLocal += 1;
      } else {
        // Pure server insert
        local[kind][sid] = serverRowToLocal(kind, row);
        if (n) nameIdx.set(n, sid);
        summary.adoptedFromServer += 1;
      }
    }
  }

  // 4. Apply rewrites to dependent FKs
  applyRewrites(local, rewrite);

  // 5. Persist + watermark
  await setStorage({
    tabathaOrg: local,
    _orgRegistryBootstrappedAt: new Date().toISOString()
  });

  return summary;
}

export async function isBootstrapNeeded() {
  const { _orgRegistryBootstrappedAt } = await getStorage('_orgRegistryBootstrappedAt');
  return !_orgRegistryBootstrappedAt;
}

export async function clearBootstrapWatermark() {
  await chrome.storage.local.remove('_orgRegistryBootstrappedAt');
}
