// ============================================================
// Tabatha — Cloud Write Service (background = single auth owner)
//
// The service worker's Supabase client is the ONE auth-capable client that
// never wedges (it registers no onAuthStateChange listener, so its auth-js
// init lock always releases). Every page-context cloud MUTATION is routed here
// via typed runtime messages so pages never block on their own auth state or
// race a UI timeout against the network.
//
// Two delivery modes:
//   1. Outbox (queue, never race) — profile-name writes enqueue with an
//      idempotency key, get an immediate optimistic ack, and flush with
//      exponential backoff. Survives SW restarts (persisted to chrome.storage)
//      and page reloads. Latest-wins dedupe per key.
//   2. Direct RPC — org / invite operations that must return a server result
//      (org_id, token, …) run inline here. They still bypass the page-context
//      deadlock because they execute against the background client.
//
// Also the token/auth-state source for page-context data clients:
//   GET_ACCESS_TOKEN  → current user JWT (page dataClient uses accessToken)
//   GET_AUTH_STATE    → { session } summary (useAuth init, no page getSession)
// ============================================================

import { getStorage, setStorage } from './storageService.js';
import { applyInviteDefaults } from '../../services/orgAttribution.js';
import {
  normalizeOutbox,
  enqueue,
  dueOps,
  markSuccess,
  markFailure,
  nextWakeAt,
  size
} from '../../utils/cloudOutbox.js';

export const CLOUD_OUTBOX_ALARM = 'cloud-outbox-flush';
const OUTBOX_STORAGE_KEY = '_cloudOutbox';
const MAX_DIAGNOSTIC_ROWS = 20;

let deps = {};
let flushing = false;

export function configureCloudWriteService(injected = {}) {
  deps = { ...deps, ...injected };
}

// ── diagnostics (shared ledger with syncService / useAuth) ──────────
async function recordDiagnostic(kind, detail) {
  try {
    const { _syncDiagnostics } = await getStorage('_syncDiagnostics');
    const rows = Array.isArray(_syncDiagnostics) ? _syncDiagnostics : [];
    rows.unshift({
      kind,
      detail: typeof detail === 'string' ? detail : (detail?.message || JSON.stringify(detail)),
      at: new Date().toISOString()
    });
    await setStorage({ _syncDiagnostics: rows.slice(0, MAX_DIAGNOSTIC_ROWS) });
  } catch { /* best-effort */ }
}

async function getSession() {
  const supabase = deps.supabase;
  if (!supabase) return null;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    return session || null;
  } catch {
    return null;
  }
}

// ── outbox persistence ──────────────────────────────────────────────
async function loadOutbox() {
  const { [OUTBOX_STORAGE_KEY]: raw } = await getStorage(OUTBOX_STORAGE_KEY);
  return normalizeOutbox(raw);
}

async function saveOutbox(outbox) {
  await setStorage({ [OUTBOX_STORAGE_KEY]: normalizeOutbox(outbox) });
}

// Keep a retry alarm alive exactly while ops remain queued.
async function reconcileFlushAlarm(outbox) {
  try {
    if (size(outbox) > 0) {
      chrome.alarms.create(CLOUD_OUTBOX_ALARM, { periodInMinutes: 1 });
    } else {
      chrome.alarms.clear(CLOUD_OUTBOX_ALARM);
    }
  } catch { /* alarms unavailable in tests */ }
}

// ── op executors ────────────────────────────────────────────────────
// Each executor performs the actual Supabase write and throws on any failure
// (transport error, RLS 0-row, …) so the outbox can back off + retry.
async function execProfileName(supabase, payload) {
  const { displayName, profileId, authUserId } = payload || {};
  if (!displayName || !(profileId || authUserId)) {
    throw new Error('profile_name op missing displayName + identity');
  }
  const base = supabase
    .schema('tabatha')
    .from('profiles')
    .update({ display_name: displayName, updated_at: new Date().toISOString() });
  const scoped = profileId ? base.eq('id', profileId) : base.eq('auth_user_id', authUserId);
  const { data, error } = await scoped.select();
  if (error) throw error;
  if (!Array.isArray(data) || data.length === 0) {
    // No error but 0 rows → stale JWT / RLS. Transient after re-auth, so let
    // the outbox retry; it gives up (and diagnoses) after maxAttempts.
    throw new Error('profile update changed 0 rows (session may be stale)');
  }
  return data[0];
}

const EXECUTORS = {
  cloud_profile_name: execProfileName
};

export function hasExecutor(type) {
  return Object.prototype.hasOwnProperty.call(EXECUTORS, type);
}

// ── flush ───────────────────────────────────────────────────────────
export async function flushCloudOutbox() {
  if (flushing) return { flushed: 0, remaining: undefined, skipped: 'in_flight' };
  const supabase = deps.supabase;
  if (!supabase) return { flushed: 0, skipped: 'no_client' };

  flushing = true;
  let flushed = 0;
  try {
    let outbox = await loadOutbox();
    if (size(outbox) === 0) return { flushed: 0, remaining: 0 };

    const session = await getSession();
    if (!session) {
      // Not signed in yet — leave everything queued for the next sign-in.
      await reconcileFlushAlarm(outbox);
      return { flushed: 0, skipped: 'signed_out', remaining: size(outbox) };
    }

    const now = Date.now();
    const due = dueOps(outbox, now);
    for (const op of due) {
      const executor = EXECUTORS[op.type];
      if (!executor) {
        // Unknown op type (e.g. queued by a newer build) — drop it so it can't
        // wedge the queue, and leave a breadcrumb.
        outbox = markSuccess(outbox, op.id);
        await saveOutbox(outbox);
        await recordDiagnostic('cloud_outbox_unknown_type', `Dropped queued op of unknown type '${op.type}'.`);
        continue;
      }
      try {
        await executor(supabase, op.payload);
        outbox = markSuccess(outbox, op.id);
        // Persist immediately (before the next op / any SW teardown) so a
        // succeeded op can never be re-executed on the next flush. This is the
        // outbox's at-most-once-per-success contract; keep it robust even for a
        // future non-idempotent executor.
        await saveOutbox(outbox);
        flushed += 1;
      } catch (err) {
        const res = markFailure(outbox, op.id, { now: Date.now(), error: err });
        outbox = res.outbox;
        await saveOutbox(outbox);
        if (res.gaveUp) {
          await recordDiagnostic('cloud_outbox_gave_up',
            `Gave up on ${op.type} after ${res.op?.attempts} attempts: ${res.op?.lastError}`);
        }
      }
    }

    await reconcileFlushAlarm(outbox);
    return { flushed, remaining: size(outbox), nextWakeAt: nextWakeAt(outbox) };
  } catch (err) {
    await recordDiagnostic('cloud_outbox_flush_threw', err);
    return { flushed, error: err?.message || String(err) };
  } finally {
    flushing = false;
  }
}

// Alarm entrypoint (routed by alarmService).
export async function runOutboxFlushAlarm() {
  return flushCloudOutbox();
}

// ── direct RPC / query helpers ──────────────────────────────────────
async function requireSessionFor(what) {
  const session = await getSession();
  if (!session) throw new Error(`Must be signed in to ${what}.`);
  return session;
}

async function rpc(name, params) {
  const { data, error } = await deps.supabase.schema('tabatha').rpc(name, params);
  if (error) throw error;
  return data;
}

// ── message router ──────────────────────────────────────────────────
export async function handleMessage(type, message = {}) {
  switch (type) {
    // ── token / auth-state source for page-context data clients ──
    case 'GET_ACCESS_TOKEN': {
      const session = await getSession();
      return { token: session?.access_token || null, expiresAt: session?.expires_at || null };
    }
    case 'GET_AUTH_STATE': {
      const session = await getSession();
      return {
        session: session
          ? { user: { id: session.user?.id, email: session.user?.email }, expires_at: session.expires_at }
          : null
      };
    }

    // ── first-login profile auto-provision (mutation → background) ──
    case 'ENSURE_PROFILE': {
      try {
        const session = await requireSessionFor('load your profile');
        const supabase = deps.supabase;
        const authUserId = session.user.id;
        const existing = await supabase
          .schema('tabatha')
          .from('profiles')
          .select('id, auth_user_id, display_name, avatar_url, default_org_id, default_team_id, created_at')
          .eq('auth_user_id', authUserId)
          .maybeSingle();
        if (existing.data) return { ok: true, profile: existing.data };

        const meta = session.user.user_metadata || {};
        const displayName = meta.full_name || meta.name || session.user.email?.split('@')[0] || 'Tabatha User';
        const { data: created, error: insErr } = await supabase
          .schema('tabatha')
          .from('profiles')
          .insert({ auth_user_id: authUserId, display_name: displayName, avatar_url: meta.avatar_url || null })
          .select()
          .single();
        if (insErr) {
          await recordDiagnostic('profile_insert_failed', insErr);
          return { ok: false, error: insErr.message };
        }
        return { ok: true, profile: created };
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      }
    }

    // ── display name (queue, never race) ──
    case 'UPDATE_PROFILE_NAME': {
      const displayName = (message.displayName || '').trim();
      const profileId = message.profileId || null;
      const authUserId = message.authUserId || null;
      if (!displayName || !(profileId || authUserId)) {
        return { ok: false, error: 'Missing display name or identity' };
      }
      const key = `cloud_profile_name:${profileId || authUserId}`;
      const outbox = await loadOutbox();
      const { outbox: next } = enqueue(outbox, {
        type: 'cloud_profile_name',
        key,
        payload: { displayName, profileId, authUserId },
        now: Date.now()
      });
      await saveOutbox(next);
      // Fire-and-forget flush; the ack returns immediately (optimistic).
      flushCloudOutbox().catch(() => {});
      return { ok: true, success: true, queued: true, displayName };
    }

    // ── org / invite (direct RPC — server result required) ──
    case 'CREATE_ORGANIZATION': {
      try {
        await requireSessionFor('create an organization');
        const data = await rpc('create_organization', { p_name: message.name });
        deps.triggerSync?.();
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      }
    }
    case 'REDEEM_INVITE_TOKEN': {
      try {
        await requireSessionFor('redeem a token');
        const data = await rpc('redeem_invite_token', { p_token: message.token });
        // Client defense-in-depth (mirrors migration 018): if the redeem
        // succeeded but the profile still lacks an org default, stamp it so the
        // next sync attributes rows correctly. No-ops once the default is set.
        if (data?.success) {
          try {
            const session = await getSession();
            const prof = await deps.supabase
              .schema('tabatha')
              .from('profiles')
              .select('id, default_org_id, default_team_id')
              .eq('auth_user_id', session.user.id)
              .maybeSingle();
            if (prof.data) {
              await applyInviteDefaults({ supabase: deps.supabase, profile: prof.data, result: data });
            }
          } catch { /* server function is authoritative */ }
        }
        deps.triggerSync?.();
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      }
    }
    case 'CREATE_INVITE_TOKEN': {
      try {
        await requireSessionFor('mint a token');
        const data = await rpc('create_invite_token', {
          p_org_id: message.orgId,
          p_team_id: message.teamId ?? null,
          p_role: message.role || 'user',
          p_expires_in_hours: message.expiresInHours ?? 168
        });
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      }
    }
    // ── Epic 9: Context View customization settings (direct RPC — server
    // result required so the UI can trust the returned merged value rather
    // than re-deriving it client-side). Runs the SECURITY DEFINER RPC
    // tabatha.update_profile_settings (migration 038), which does an atomic
    // server-side jsonb_set merge per top-level settings key, closing the
    // cross-surface race a client-side read-modify-write would have with the
    // Sidecar's own settings writers (see docs/superpowers/specs/
    // 2026-07-18-epic9-cv-customization-design.md §1). ──
    case 'UPDATE_PROFILE_SETTINGS': {
      try {
        await requireSessionFor('update your settings');
        const profileId = message.profileId || null;
        const patch = message.patch;
        if (!profileId || !patch || typeof patch !== 'object') {
          return { ok: false, error: 'Missing profileId or patch' };
        }
        const data = await rpc('update_profile_settings', {
          p_profile_id: profileId,
          p_patch: patch,
        });
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      }
    }
    case 'DELETE_INVITE_TOKEN': {
      try {
        await requireSessionFor('revoke a token');
        const { error } = await deps.supabase
          .schema('tabatha')
          .from('invite_tokens')
          .delete()
          .eq('id', message.id);
        if (error) throw error;
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err?.message || String(err) };
      }
    }

    // ── auto-sync on sign-in (page notifies the SW) ──
    case 'AUTH_STATE_CHANGED': {
      if (message.hasSession) {
        deps.triggerSync?.();
        flushCloudOutbox().catch(() => {});
      }
      return { ok: true };
    }
    case 'FLUSH_CLOUD_OUTBOX': {
      const res = await flushCloudOutbox();
      return { ok: true, ...res };
    }

    default:
      return undefined;
  }
}
