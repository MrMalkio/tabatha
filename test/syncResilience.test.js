// fix/sync-resilience — client↔DB schema-skew degradation tests.
// INCIDENT (v6.5.0): the client wrote focus_items.priority before migration
// 021 was applied. PostgREST rejected every focus_items upsert with PGRST204
// ("Could not find the 'priority' column of 'focus_items' in the schema
// cache") → sync_completed_with_errors forever, sync permanently "stale".
//
// The fix: on a missing-column error, retry the block once with the offending
// column stripped from every row, emit a `<table>_degraded_missing_column`
// diagnostic naming the column, and count the sync as SUCCESS (not
// sync_completed_with_errors). Capped at 2 distinct columns per block per
// run; non-column errors keep the original failure path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';
import { createSupabaseFake } from '../testutils/supabaseFake.js';

const PROFILE = 'profile-123';
const AUTH = 'auth-user-1';

function isoAgo(min) { return new Date(Date.now() - min * 60000).toISOString(); }

function pgrst204(column, table) {
  return {
    code: 'PGRST204',
    message: `Could not find the '${column}' column of '${table}' in the schema cache`
  };
}

// One focus item so buildFocusRows emits a row that carries a `priority` key
// (it always does — null or numeric).
const FOCUS_ENGINE = {
  items: {
    'f-1': { id: 'f-1', label: 'Ship sync fix', priority: 2, tags: {}, createdAt: isoAgo(90) }
  },
  history: []
};

async function setupSync({ store = {} } = {}) {
  const chrome = installChromeMock({
    store: {
      // Skip bootstrap-pull + rehydrate phases so tests only exercise pushes.
      _orgRegistryBootstrappedAt: isoAgo(600),
      _dataRehydratedAt: { [PROFILE]: isoAgo(600) },
      ...store
    }
  });
  const sb = createSupabaseFake({
    session: { user: { id: AUTH } },
    selects: {
      profiles: [{ id: PROFILE, default_org_id: null, default_team_id: null }],
      browser_profiles: [{ id: 'bp-1' }],
      operations: [], initiatives: [], clients: [], projects: [], tasks_registry: [],
      calendars: [], calendar_events: [],
    },
  });
  const sync = await import('../src/background/services/syncService.js');
  sync.configureSyncService({ supabase: sb });
  return { chrome, sb, sync };
}

function diagnostics(chrome) {
  return chrome._storage._syncDiagnostics || [];
}

function diagnosticKinds(chrome) {
  return diagnostics(chrome).map(d => d.kind);
}

// ── The incident scenario: PGRST204 missing column → degraded retry ──

test('focus_items PGRST204 missing column: retries without the column and completes the sync', async () => {
  const { chrome, sb, sync } = await setupSync({ store: { focusEngine: FOCUS_ENGINE } });

  // Fail any focus_items upsert whose rows still carry `priority`.
  sb.setError('upsert', 'focus_items', (state) =>
    state.rows.some(r => 'priority' in r) ? pgrst204('priority', 'focus_items') : null
  );

  await sync.syncToSupabase();

  const attempts = sb.recorded.upserts.filter(u => u.table === 'focus_items');
  assert.equal(attempts.length, 2, 'expected first attempt + one retry');
  assert.ok(attempts[0].error, 'first attempt must have failed');
  assert.ok(attempts[0].rows.every(r => 'priority' in r), 'first attempt carried priority');
  assert.ok(!attempts[1].error, 'retry must have succeeded');
  assert.ok(attempts[1].rows.every(r => !('priority' in r)), 'retry must strip priority from every row');
  // Other columns survive the strip.
  assert.equal(attempts[1].rows[0].client_id, 'f-1');
  assert.equal(attempts[1].rows[0].label, 'Ship sync fix');

  const kinds = diagnosticKinds(chrome);
  assert.ok(kinds.includes('focus_items_degraded_missing_column'), 'degraded diagnostic must be emitted');
  assert.ok(!kinds.includes('focus_items_upsert_failed'), 'block must NOT be flagged as failed');
  assert.ok(!kinds.includes('sync_completed_with_errors'), 'degraded sync counts as completed');

  const degraded = diagnostics(chrome).find(d => d.kind === 'focus_items_degraded_missing_column');
  assert.match(degraded.detail, /'priority'/, 'diagnostic must name the missing column');
  assert.match(degraded.detail, /migration/i, 'diagnostic must point at a missing migration');

  assert.ok(chrome._storage._lastSyncSuccess, 'degraded-but-successful sync records success');
});

test('degraded detection also works from the message alone (no PGRST204 code)', async () => {
  const { chrome, sb, sync } = await setupSync({ store: { focusEngine: FOCUS_ENGINE } });

  sb.setError('upsert', 'focus_items', (state) =>
    state.rows.some(r => 'priority' in r)
      ? { message: "Could not find the 'priority' column of 'focus_items' in the schema cache" }
      : null
  );

  await sync.syncToSupabase();

  assert.ok(diagnosticKinds(chrome).includes('focus_items_degraded_missing_column'));
  assert.ok(!diagnosticKinds(chrome).includes('sync_completed_with_errors'));
  assert.ok(chrome._storage._lastSyncSuccess);
});

// ── Non-column errors keep the original failure path ──

test('non-column upsert error still fails the block and the sync', async () => {
  const { chrome, sb, sync } = await setupSync({ store: { focusEngine: FOCUS_ENGINE } });

  sb.setError('upsert', 'focus_items', { code: '42501', message: 'permission denied for table focus_items' });

  await sync.syncToSupabase();

  const attempts = sb.recorded.upserts.filter(u => u.table === 'focus_items');
  assert.equal(attempts.length, 1, 'no retry for a non-column error');

  const kinds = diagnosticKinds(chrome);
  assert.ok(kinds.includes('focus_items_upsert_failed'), 'original failure diagnostic preserved');
  assert.ok(kinds.includes('sync_completed_with_errors'), 'sync still flagged with errors');
  assert.ok(!kinds.includes('focus_items_degraded_missing_column'));
  assert.ok(!chrome._storage._lastSyncSuccess, 'failed sync must not record success');
});

// ── Cap: at most 2 distinct stripped columns per block per run ──

test('strips at most 2 distinct columns, then falls through to the error path', async () => {
  const { chrome, sb, sync } = await setupSync({ store: { focusEngine: FOCUS_ENGINE } });

  // Pathological DB: every attempt reports the next still-present column.
  sb.setError('upsert', 'focus_items', (state) => {
    for (const column of ['priority', 'tags', 'label']) {
      if (state.rows.some(r => column in r)) return pgrst204(column, 'focus_items');
    }
    return null;
  });

  await sync.syncToSupabase();

  const attempts = sb.recorded.upserts.filter(u => u.table === 'focus_items');
  assert.equal(attempts.length, 3, 'initial attempt + 2 capped retries, then stop');

  const kinds = diagnosticKinds(chrome);
  assert.ok(kinds.includes('focus_items_upsert_failed'), 'cap exceeded → original failure path');
  assert.ok(kinds.includes('sync_completed_with_errors'));
  assert.ok(!kinds.includes('focus_items_degraded_missing_column'), 'no degraded diagnostic when the block ultimately failed');
  assert.ok(!chrome._storage._lastSyncSuccess);
});

// ── Generic: the intent_history INSERT block degrades the same way ──

test('intent_history missing-column error degrades instead of failing', async () => {
  const intentHistory = [{ action: 'change', context: 'writing', domain: 'example.com', timestamp: isoAgo(30) }];
  const { chrome, sb, sync } = await setupSync({ store: { intentHistory } });

  sb.setError('insert', 'intent_history', (state) =>
    state.rows.some(r => 'domain' in r) ? pgrst204('domain', 'intent_history') : null
  );

  await sync.syncToSupabase();

  const attempts = sb.recorded.inserts.filter(i => i.table === 'intent_history');
  assert.equal(attempts.length, 2);
  assert.ok(attempts[1].rows.every(r => !('domain' in r)), 'retry must strip domain');

  const kinds = diagnosticKinds(chrome);
  assert.ok(kinds.includes('intent_history_degraded_missing_column'));
  assert.ok(!kinds.includes('intent_history_insert_failed'));
  assert.ok(!kinds.includes('sync_completed_with_errors'));
  assert.ok(chrome._storage._lastSyncSuccess);
  assert.ok(chrome._storage.lastIntentSync, 'watermark still advances on degraded success');
});

// ── Unit: missingColumnFromError parsing ──

test('missingColumnFromError extracts the column from PGRST204 errors only', async () => {
  const { missingColumnFromError } = await import('../src/background/services/syncService.js');

  assert.equal(missingColumnFromError(pgrst204('priority', 'focus_items')), 'priority');
  assert.equal(
    missingColumnFromError({ message: "Could not find the 'machine_id' column of 'browser_profiles' in the schema cache" }),
    'machine_id'
  );
  // PGRST204 code but unparseable message → cannot strip safely → null.
  assert.equal(missingColumnFromError({ code: 'PGRST204', message: 'schema cache lookup failed' }), null);
  assert.equal(missingColumnFromError({ code: '42501', message: 'permission denied' }), null);
  assert.equal(missingColumnFromError(null), null);
  assert.equal(missingColumnFromError({}), null);
});
