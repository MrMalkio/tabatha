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
/**
 * Sync forensics S5 / bug #5 — the single, monotonic definition of "when did
 * this install's clock last change state".
 *
 * The old rule was `breakStartedAt || clockedInAt`. Because `clock.js` nulls
 * `breakStartedAt` when a break ends, ending a break made the published
 * timestamp jump BACKWARDS to the shift start:
 *
 *     09:00 clock in     -> publishes 09:00
 *     10:00 break start  -> publishes 10:00
 *     10:30 break end    -> publishes 09:00   <-- regression
 *
 * A sibling row still reading `on_break` at 10:00 was then strictly newer AND
 * described a different state, so `shouldAdoptClock` returned true and the
 * install that had just resumed was pulled back onto break — silently, and
 * stickily, because it then converged there.
 *
 * Taking the MAX over every event timestamp makes the value monotonic by
 * construction: each of the four events stamps a fresh `now`, so the max can
 * only ever move forward. Adding a fifth event later cannot break it.
 */
export function lastClockEventAt(clockSession) {
  const candidates = [
    clockSession?.clockedInAt,
    clockSession?.breakStartedAt,
    clockSession?.breakEndedAt,
    clockSession?.clockedOutAt
  ];
  let bestIso = null;
  let bestMs = -Infinity;
  for (const iso of candidates) {
    if (!iso) continue;
    const ms = new Date(iso).getTime();
    if (Number.isFinite(ms) && ms > bestMs) {
      bestMs = ms;
      bestIso = iso;
    }
  }
  return bestIso;
}

export function deriveLocalClockEvent(clockSession) {
  if (clockSession?.active) {
    return {
      clock_state: clockSession.onBreak ? 'on_break' : 'clocked_in',
      clocked_in_at: clockSession.clockedInAt || null,
      on_break_since: clockSession.onBreak ? (clockSession.breakStartedAt || null) : null,
      last_clock_event_at: lastClockEventAt(clockSession)
    };
  }
  if (clockSession?.clockedOutAt) {
    return {
      clock_state: 'clocked_out',
      clocked_in_at: null,
      on_break_since: null,
      last_clock_event_at: lastClockEventAt(clockSession)
    };
  }
  return { clock_state: null, clocked_in_at: null, on_break_since: null, last_clock_event_at: null };
}

export function clockEventMs(evt) {
  const t = evt?.last_clock_event_at ? new Date(evt.last_clock_event_at).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

/**
 * Sync forensics S7 / bug #7 — how stale a device's heartbeat may be before
 * its clock state stops being a candidate for adoption.
 *
 * The ingest path had NO freshness cutoff at all: `pullClockCandidates` never
 * even selected `last_heartbeat_at`, and `pickLatestClockCandidate` filtered
 * only on `clock_state` being truthy. So a device that died months ago while
 * `clocked_in` stayed a candidate forever — and beat a freshly-started
 * install automatically, because an install with no local session scores
 * `clockEventMs` = 0.
 *
 * WHY 90 MINUTES
 *
 * Measured heartbeat ages across every status row on the profile (read-only
 * Mgmt API, 2026-07-25) — note the empty band in the middle:
 *
 *      0.2 min   clocked_in, online   <- genuinely live
 *      0.3 min   clocked_in, online   <- genuinely live
 *    ----------- 370-minute gap with nothing in it -----------
 *    370.9 min   clocked_in, online   <- corpse still claiming a shift
 *    371.8 min   clocked_in, online   <- corpse still claiming a shift
 *    786.3 min   (no clock state)     <- "Deskview on OD", §S7
 *   6515.3 min   clocked_out          <- 4.5 days dead
 *
 * The two populations are separated by more than six hours of empty space, so
 * the cutoff only has to land inside that band. 90 min sits ~300x above the
 * live devices and ~4x below the nearest corpse.
 *
 * It is deliberately LENIENT rather than tight, because the two error
 * directions are not symmetric:
 *   - Too tight is the dangerous one. The extension heartbeat is a plain
 *     `setInterval` with no `chrome.alarms` backing (awarenessService.js), so
 *     an MV3 service worker evicted while the browser is still open stops
 *     heartbeating even though the user is genuinely working. A tight cutoff
 *     would make a second install ignore that real, ongoing shift.
 *   - Too loose merely means a device that has been silent for over an hour
 *     can still vouch for a shift — which, for a user who stepped away, is
 *     the correct answer anyway.
 * This is why we do NOT reuse `OFFLINE_THRESHOLD_MS` (5 min): that threshold
 * governs the awareness UI, where being wrong is cosmetic. Here being wrong
 * rewrites the user's clock state, so it gets its own, looser number.
 *
 * A device inside the horizon but stale is still subject to the existing
 * strict-newer + state-differs guards in `shouldAdoptClock`.
 */
export const CLOCK_CANDIDATE_MAX_STALENESS_MS = 90 * 60 * 1000; // 90 min

/**
 * True if a status row's heartbeat is recent enough for its clock state to be
 * trusted. A row with NO heartbeat at all is rejected: we cannot show it is
 * alive, and the whole point of the horizon is to require positive evidence
 * of liveness rather than assume it.
 */
export function isFreshClockCandidate(row, now = Date.now(), maxStalenessMs = CLOCK_CANDIDATE_MAX_STALENESS_MS) {
  // Koda P2: `clocked_out` is exempt. The horizon exists to stop a corpse
  // FABRICATING a shift; a stale clock-out can only ever END one, which is
  // both safe and the conservative direction. Worse, filtering it out
  // recreates the ghost-stint class this fleet already fought (a device that
  // clocked out while another install never learned about it, leaving an open
  // stint accruing forever). Freshness gates claims of being ON shift only.
  if (row?.clock_state === 'clocked_out') return true;

  const hb = row?.last_heartbeat_at ? new Date(row.last_heartbeat_at).getTime() : NaN;
  if (!Number.isFinite(hb)) return false;
  return (now - hb) <= maxStalenessMs;
}

// Pick the account-wide latest clock-event candidate (self excluded by the
// caller before this is invoked) from a list of browser_profile_status rows.
// S7/#7: candidates must now also be demonstrably alive — see the horizon
// rationale on CLOCK_CANDIDATE_MAX_STALENESS_MS above.
export function pickLatestClockCandidate(candidates, now = Date.now(), maxStalenessMs = CLOCK_CANDIDATE_MAX_STALENESS_MS) {
  const withMs = (candidates || [])
    .filter(c => c && c.clock_state)
    .filter(c => isFreshClockCandidate(c, now, maxStalenessMs))
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
