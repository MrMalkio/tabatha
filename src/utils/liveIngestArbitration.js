// ============================================================
// Tabatha — Live Ingest Arbitration (feat/ext-live-ingest, v6.7.45)
//
// Pure, side-effect-free helpers backing the extension's continuous
// cross-surface ingest loop (focusIngestService.js). Kept separate from the
// service so the comparator/reconcile rules can be unit tested without a
// chrome.* or supabase mock.
//
// ── Focus arbitration ──
// Account-wide "current focus" = whichever ACTIVE row (any source: this
// install, another install, or the Sidecar) has the latest tags._startedAt.
// The Sidecar already encodes "current active run began at" as tags._startedAt
// (sidecar/src/data/focus.ts, back-dated across pauses so it doubles as an
// elapsed-time anchor); the extension mirrors the same convention on push
// (see syncService.buildFocusRows) so both surfaces compare apples-to-apples.
//
// ── Clock arbitration ──
// Account-wide "current shift" = whichever tabatha.browser_profile_status row
// (any install, including the phone) has the latest last_clock_event_at.
// Mirrors the focus rule exactly, one axis over.
//
// Non-ping-pong invariant (both axes): adoption NEVER stamps a fresh "now"
// timestamp — it carries the remote's own timestamp into the local mirror.
// The next local push therefore reproduces the identical timestamp it just
// read, so no install ever observes a "newer" event caused by another
// install's adoption of its own event. See focusIngestService.js / the
// commit message for the traced proof.
// ============================================================

import { coerceStringField } from './focusDataSanitize.js';

export function isSidecarSourced(tags) {
  return !!tags && tags._src === 'sidecar';
}

// Generic: given a list of { id, ms } candidates, returns the one with the
// strictly greatest ms (ties keep the first-seen candidate — deterministic,
// never a source of oscillation). Returns null for an empty list.
export function pickLatestByTime(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  let best = null;
  for (const c of candidates) {
    if (!c || !Number.isFinite(c.ms)) continue;
    if (!best || c.ms > best.ms) best = c;
  }
  return best;
}

// ── Focus ──────────────────────────────────────────────────────

// "Effective start" for a REMOTE focus_items row (as pulled from Supabase):
// tags._startedAt when present (both Sidecar- and extension-authored rows
// carry it), else the row's created_at.
export function focusRowStartedAtMs(row) {
  const iso = row?.tags?._startedAt || row?.created_at;
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

// "Effective start" for a LOCAL engine item (extension's own shape). Prefers
// an already-ingested tags._startedAt (set by reconcileKnownFocusRow below),
// else falls back to the extension's native fields: lastResumedAt (the
// current active run's start) when active, else startedAt, else createdAt.
export function localItemStartedAtMs(item) {
  const iso = item?.tags?._startedAt || item?.lastResumedAt || item?.startedAt || item?.createdAt;
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

// Pick the account-wide latest-active candidate from a mixed list of
// { id, ms } entries (local items + freshly-ingested/reconciled remote rows,
// all pre-filtered to focusState/focus_state === 'active').
export function pickLatestActive(candidates) {
  return pickLatestByTime(candidates);
}

// Should the extension adopt `latest` as its new local current focus?
// False when there's no candidate, it's already current, or it isn't
// STRICTLY newer than what's currently current (strict > prevents ties from
// flapping ownership back and forth every ingest cycle).
export function shouldAdoptFocus({ currentId, currentMs, latestId, latestMs }) {
  if (!latestId || latestId === currentId) return false;
  const curMs = Number.isFinite(currentMs) ? currentMs : -Infinity;
  return Number.isFinite(latestMs) && latestMs > curMs;
}

// Reconcile ONE known local item against a pulled server row.
//
// Winner matrix:
//   sidecar-sourced row (tags._src === 'sidecar') → CLOUD wins: focus_state,
//     label, timer_minutes, and the tracked tag keys all overwrite local.
//   extension-sourced row (no _src tag — authored by this or another
//     extension install) → LOCAL wins: no fields are touched here. The one
//     exception described by the design ("except focus_state pause caused by
//     a remote switch") is intentionally NOT handled here — it is applied by
//     the arbitration step afterward (adoptRemoteActive / pauseItem act on
//     the engine directly, independent of this reconcile pass), so an
//     extension-sourced item can still end up paused post-reconcile.
//
// `row` carries a SUBSET of columns depending on which query produced it (the
// new-row query has label/timer_minutes/created_at; the light-sweep query has
// only focus_state/tags) — only fields actually present on `row` are applied.
export function reconcileKnownFocusRow({ localItem, row }) {
  if (!localItem || !row) return { item: localItem, changed: false };
  if (!isSidecarSourced(row.tags)) return { item: localItem, changed: false };

  let changed = false;
  const next = { ...localItem };

  if (row.focus_state !== undefined && row.focus_state !== localItem.focusState) {
    next.focusState = row.focus_state;
    changed = true;
  }
  if (row.label !== undefined) {
    // Defensive coercion (2026-07-23 InPop "[object Object]" fix): row.label
    // is a Supabase text column and is never actually object-shaped in
    // practice, but this is the inbound boundary from a cloud row applying
    // straight onto a local item, so it gets the same defense as
    // dataRehydrate's serverFocusToLocal(). Falls back to the local item's
    // existing label (never 'Untitled focus') so an unusable inbound value
    // can't clobber a perfectly good local label.
    const coercedLabel = coerceStringField(row.label, localItem.label);
    if (coercedLabel !== localItem.label) {
      next.label = coercedLabel;
      changed = true;
    }
  }
  if (row.timer_minutes !== undefined) {
    const tm = Number(row.timer_minutes);
    if (Number.isFinite(tm) && tm !== localItem.timerMinutes) {
      next.timerMinutes = tm;
      changed = true;
    }
  }

  const rowTags = row.tags || {};
  const trackedTagKeys = ['_parent', '_backburner', '_snoozeUntil', '_startedAt', '_elapsedMs', '_src', '_off'];
  const nextTags = { ...(localItem.tags || {}) };
  for (const key of trackedTagKeys) {
    if (rowTags[key] !== undefined && rowTags[key] !== nextTags[key]) {
      nextTags[key] = rowTags[key];
      changed = true;
    }
  }
  if (changed) next.tags = nextTags;

  // Mirror the Sidecar's tag-encoded concepts into the extension's dedicated
  // fields, exactly like dataRehydrate's serverFocusToLocal does.
  if (rowTags._parent && rowTags._parent !== localItem.parentFocusId) {
    next.parentFocusId = rowTags._parent;
    changed = true;
  }
  if (rowTags._backburner !== undefined && !!rowTags._backburner !== !!localItem.backburnered) {
    next.backburnered = !!rowTags._backburner;
    changed = true;
  }

  return { item: changed ? next : localItem, changed };
}

// ── Clock ──────────────────────────────────────────────────────

// Pure re-derivation of the clock "event" view of a local clockSession,
// mirroring awarenessService.buildStatusPayload's clock block exactly (kept
// in sync deliberately — both read the same three clockSession fields the
// same way) so local-vs-remote comparisons are apples-to-apples.
export function deriveLocalClockEvent(clockSession) {
  if (clockSession?.active) {
    return {
      clock_state: clockSession.onBreak ? 'on_break' : 'clocked_in',
      clocked_in_at: clockSession.clockedInAt || null,
      on_break_since: clockSession.onBreak ? (clockSession.breakStartedAt || null) : null,
      last_clock_event_at: clockSession.onBreak
        ? (clockSession.breakStartedAt || clockSession.clockedInAt || null)
        : (clockSession.clockedInAt || null)
    };
  }
  if (clockSession?.clockedOutAt) {
    return {
      clock_state: 'clocked_out',
      clocked_in_at: null,
      on_break_since: null,
      last_clock_event_at: clockSession.clockedOutAt
    };
  }
  return { clock_state: null, clocked_in_at: null, on_break_since: null, last_clock_event_at: null };
}

export function clockEventMs(evt) {
  const t = evt?.last_clock_event_at ? new Date(evt.last_clock_event_at).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

// Pick the account-wide latest clock-event candidate (self excluded by the
// caller before this is invoked) from a list of browser_profile_status rows.
export function pickLatestClockCandidate(candidates) {
  const withMs = (candidates || [])
    .filter(c => c && c.clock_state)
    .map(c => ({ ...c, ms: clockEventMs(c) }));
  return pickLatestByTime(withMs);
}

// Should the extension adopt `remote` as its local clock state? Requires the
// remote event to be STRICTLY newer AND to actually describe a different
// state than what's already local (skips a no-op write/broadcast when the
// remote row is simply an echo of what we already know, e.g. our own row
// read back, or a heartbeat-only refresh of an unrelated field).
export function shouldAdoptClock({ local, remote }) {
  if (!remote || !remote.clock_state) return false;
  const localMs = clockEventMs(local);
  const remoteMs = remote.ms ?? clockEventMs(remote);
  if (!(remoteMs > localMs)) return false;
  const localEvt = local || {};
  return (
    remote.clock_state !== localEvt.clock_state ||
    remote.clocked_in_at !== localEvt.clocked_in_at ||
    remote.on_break_since !== localEvt.on_break_since
  );
}
