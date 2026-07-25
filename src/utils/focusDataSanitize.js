// ============================================================
// Tabatha — Focus Data Sanitize (2026-07-23 InPop "[object Object]" fix)
//
// Root cause: legacy/historical writes (pre-dating the current writer set,
// which has been audited to only ever assign strings — see
// docs/audits or the accompanying commit message for the full sweep) left
// some installs' chrome.storage.local with OBJECT-valued label/funnelStage
// fields on focusEngine items, and object-valued context on tabs/tags. Every
// current shipping writer assigns plain strings; nothing currently produces
// this corruption. But nothing previously SANITIZED an already-corrupted
// value either, so it survives indefinitely: reconcileKnownFocusRow
// (liveIngestArbitration.js) returns the local item completely untouched
// whenever the pulled row isn't Sidecar-sourced, and dataRehydrate's
// newest-wins merge only overwrites a local entry when the cloud row's ref
// time is >= the local one — neither path ever coerces an existing bad value
// back to a string.
//
// gatekeeper.js's escapeHtml() faithfully renders whatever it's given —
// String(anObject) is the literal text "[object Object]" (see
// test/escapeHtml.test.js's coercion test) — so the corrupted data leaked
// straight into the InPop: the "inherited context" input value, every
// paused-focus row's label, and every row's funnel-stage badge.
//
// These are PURE helpers (no chrome/supabase/DOM dependency) so the
// self-healing rule can be unit tested in isolation. Wired into:
//   - focusService.js getFocusEngine()      (every focus-engine read)
//   - storageService.js getFocusEngine()    (dataRehydrate's raw accessor)
//   - storageService.js getTabData()        (every tabs-map read)
//   - dataRehydrate.js serverFocusToLocal()  (defensive inbound-mapper coercion)
//   - liveIngestArbitration.js reconcileKnownFocusRow() (defensive coercion of
//     the incoming Sidecar row before it's applied to the local item)
// so a single install self-heals on its very next read — no reinstall, no
// data loss — and re-corruption can't sneak back in through any inbound path.
// ============================================================

const INNER_STRING_KEYS = ['label', 'text', 'value', 'name'];

/**
 * Coerce a possibly-corrupted (object-valued) field back to a plain string.
 *   - A string passes through unchanged.
 *   - null/undefined pass through unchanged — callers apply their own
 *     default via `??`/`||` exactly as the rest of the codebase already
 *     does; this function never papers over a legitimately-empty field.
 *   - An object is "unwrapped": if it carries a usable inner string under
 *     one of label/text/value/name, that string wins; otherwise `fallback`.
 *   - Arrays are treated as unusable objects (fallback).
 *   - Any other non-string primitive (number, boolean) is String()-coerced —
 *     never expected in practice, but never worse than the pre-fix
 *     escapeHtml behavior.
 *
 * @param {*} value
 * @param {string|null} fallback
 * @returns {string|null|undefined}
 */
export function coerceStringField(value, fallback) {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return fallback;
  if (typeof value === 'object') {
    for (const key of INNER_STRING_KEYS) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key];
    }
    return fallback;
  }
  return String(value);
}

function isCorruptObject(value) {
  return typeof value === 'object' && value !== null;
}

/**
 * Sanitize one focus-engine item. Returns a NEW object when anything needed
 * healing; returns the SAME reference untouched when the item was already
 * clean (so callers can cheaply short-circuit on `healed === false`).
 *
 * @param {object} item
 * @returns {{ item: object, healed: boolean }}
 */
export function sanitizeFocusItem(item) {
  if (!item || typeof item !== 'object') return { item, healed: false };

  let healed = false;
  let next = item;
  const ensureCopy = () => { if (next === item) next = { ...item }; };

  if (isCorruptObject(item.label)) {
    ensureCopy();
    next.label = coerceStringField(item.label, 'Untitled focus');
    healed = true;
  }
  if (isCorruptObject(item.funnelStage)) {
    ensureCopy();
    next.funnelStage = coerceStringField(item.funnelStage, 'unsorted');
    healed = true;
  }
  if (isCorruptObject(item.context)) {
    ensureCopy();
    next.context = coerceStringField(item.context, null);
    healed = true;
  }

  if (item.tags && typeof item.tags === 'object') {
    let tagsHealed = false;
    let nextTags = item.tags;
    for (const [key, val] of Object.entries(item.tags)) {
      // Koda review of 6.7.74 (P1): `_elapsedClamp` is a LEGITIMATE structured
      // tag — the audit trail written when the elapsed clamp refuses an
      // implausible value ({ at, requestedMs, appliedMs, reason, ceilingMs },
      // see src/utils/elapsedClamp.js). It has no label/text/value/name key, so
      // `coerceStringField` returned null and the sanitizer silently destroyed
      // it on the very next `getFocusEngine()` read — before it could ever be
      // pushed. That made the clamp's "never silent" guarantee false in
      // practice. Exempt by name; it is written only by the clamp.
      if (key === '_elapsedClamp') continue;
      if (isCorruptObject(val)) {
        if (nextTags === item.tags) nextTags = { ...item.tags };
        // Tag values are free-form strings/numbers/booleans in every current
        // writer (task/realm/client/project ids, _parent, _startedAt,
        // _elapsedMs, _backburner, _src, _off) — an object here is the same
        // class of legacy corruption as label/funnelStage.
        nextTags[key] = coerceStringField(val, null);
        tagsHealed = true;
      }
    }
    if (tagsHealed) {
      ensureCopy();
      next.tags = nextTags;
      healed = true;
    }
  }

  return { item: next, healed };
}

/**
 * Sanitize every item in a focus engine's `items` map. Returns the SAME
 * engine reference when nothing needed healing (idempotent — a second pass
 * over already-clean data is a true no-op, so callers can skip a redundant
 * storage write), or a NEW engine object with the repaired items otherwise.
 *
 * @param {object} engine  { activeFocusId, items: {...}, history: [...] }
 * @returns {{ engine: object, healed: boolean, healedIds: string[] }}
 */
export function sanitizeFocusEngine(engine) {
  if (!engine || typeof engine !== 'object' || !engine.items) {
    return { engine, healed: false, healedIds: [] };
  }

  const healedIds = [];
  let nextItems = engine.items;

  for (const [id, item] of Object.entries(engine.items)) {
    const { item: nextItem, healed } = sanitizeFocusItem(item);
    if (healed) {
      if (nextItems === engine.items) nextItems = { ...engine.items };
      nextItems[id] = nextItem;
      healedIds.push(id);
    }
  }

  if (healedIds.length === 0) return { engine, healed: false, healedIds: [] };

  return { engine: { ...engine, items: nextItems }, healed: true, healedIds };
}

/**
 * Sanitize a tab's `context` field (the InPop's "inherited context" input
 * value comes straight from this, via CHECK_CONTEXT_NEEDED's
 * `inheritedContext: tabData.context || null`). Same corruption class as
 * focus items — propagated forward via handleTabCreated's parent -> child
 * `inheritedContext = parent.context` copy, so a single corrupted ancestor
 * tab can spread to every tab opened from it even though no current writer
 * ever assigns an object in the first place.
 *
 * @param {*} context
 * @returns {string|null|undefined}
 */
export function sanitizeTabContext(context) {
  return coerceStringField(context, null);
}

/**
 * Sanitize every tab's `context` field in a tabs map. Returns the SAME
 * reference when nothing needed healing.
 *
 * @param {object} tabs  keyed by tabId
 * @returns {{ tabs: object, healed: boolean, healedIds: string[] }}
 */
export function sanitizeTabsMap(tabs) {
  if (!tabs || typeof tabs !== 'object') return { tabs, healed: false, healedIds: [] };

  const healedIds = [];
  let nextTabs = tabs;

  for (const [id, tab] of Object.entries(tabs)) {
    if (!tab || !isCorruptObject(tab.context)) continue;
    if (nextTabs === tabs) nextTabs = { ...tabs };
    nextTabs[id] = { ...tab, context: sanitizeTabContext(tab.context) };
    healedIds.push(id);
  }

  if (healedIds.length === 0) return { tabs, healed: false, healedIds: [] };

  return { tabs: nextTabs, healed: true, healedIds };
}

// ------------------------------------------------------------------
// 6.7.76 (gatekeeper-sanitize-gap) — intentHistory / intentPresets
//
// Same corruption class as sanitizeFocusItem's label/funnelStage/context:
// legacy writes could leave these object-valued, and NOTHING before this
// fix ever sanitized them on read — intentHistory/intentPresets are a
// wholly separate chrome.storage.local key from the focusEngine/tabs store
// the 6.7.69 wiring covered (focusService.getFocusEngine(),
// storageService.getFocusEngine()/getTabData(), dataRehydrate,
// liveIngestArbitration). gatekeeper.js's direct
// `chrome.storage.local.get(['intentHistory', 'intentPresets', ...])`
// (line ~160) walked right past all of that, so an install already healed
// by 6.7.69 for its focus items could still hand the InPop an
// object-valued `entry.context`/`p.label` here — the exact "[object
// Object]" symptom seen again live 2026-07-25 (see
// docs/audits/2026-07-24-live-extension-e2e.md, Round 2 — Wren).
//
// intentHistory entries (see tabService.js/tabTrackingService.js/
// bootstrap.js writers): { action, context, oldContext, newContext,
// oldIntent, newIntent, timestamp, url, focusId }. `context`/`oldContext`/
// `newContext` are the free-text intent labels a user typed into InPop;
// `oldIntent`/`newIntent` get the same treatment for symmetry (every
// current writer only ever assigns null or a plain string there too, but
// nothing stops a legacy write from being an object).
//
// intentPresets is `{ persistent: [{ label, ... }] }` — pinned InPop
// presets (settings/index.jsx's "Persistent Presets" section, read raw by
// gatekeeper.js at the same call site). No current writer populates
// `persistent` at all (dead feature path), which is exactly how corrupted
// legacy data survives indefinitely with no fresh writes to dilute it.
// ------------------------------------------------------------------

const INTENT_HISTORY_STRING_FIELDS = ['context', 'oldContext', 'newContext', 'oldIntent', 'newIntent'];

/**
 * Sanitize one intentHistory entry's label-ish fields. Returns the SAME
 * reference when the entry was already clean.
 *
 * @param {object} entry
 * @returns {{ entry: object, healed: boolean }}
 */
export function sanitizeIntentHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return { entry, healed: false };

  let healed = false;
  let next = entry;

  for (const key of INTENT_HISTORY_STRING_FIELDS) {
    if (isCorruptObject(entry[key])) {
      if (next === entry) next = { ...entry };
      next[key] = coerceStringField(entry[key], null);
      healed = true;
    }
  }

  return { entry: next, healed };
}

/**
 * Sanitize an entire intentHistory array. Returns the SAME array reference
 * when nothing needed healing (idempotent — safe to call on every read).
 *
 * @param {Array} history
 * @returns {{ history: Array, healed: boolean }}
 */
export function sanitizeIntentHistory(history) {
  if (!Array.isArray(history)) return { history, healed: false };

  let healedAny = false;
  const next = history.map((entry) => {
    const { entry: nextEntry, healed } = sanitizeIntentHistoryEntry(entry);
    if (healed) healedAny = true;
    return nextEntry;
  });

  if (!healedAny) return { history, healed: false };
  return { history: next, healed: true };
}

/**
 * Sanitize one intentPreset ({ label, ... }). Same treatment as
 * sanitizeFocusItem's label field.
 *
 * @param {object} preset
 * @returns {{ preset: object, healed: boolean }}
 */
export function sanitizeIntentPreset(preset) {
  if (!preset || typeof preset !== 'object' || !isCorruptObject(preset.label)) {
    return { preset, healed: false };
  }
  return {
    preset: { ...preset, label: coerceStringField(preset.label, 'Untitled preset') },
    healed: true,
  };
}

/**
 * Sanitize the intentPresets store ({ persistent: [...] }). Returns the
 * SAME reference when nothing needed healing, or when `persistent` isn't
 * an array (nothing to walk — callers should treat this as "unchanged").
 *
 * @param {object} presets
 * @returns {{ presets: object, healed: boolean }}
 */
export function sanitizeIntentPresets(presets) {
  if (!presets || typeof presets !== 'object' || !Array.isArray(presets.persistent)) {
    return { presets, healed: false };
  }

  let healedAny = false;
  const nextPersistent = presets.persistent.map((preset) => {
    const { preset: nextPreset, healed } = sanitizeIntentPreset(preset);
    if (healed) healedAny = true;
    return nextPreset;
  });

  if (!healedAny) return { presets, healed: false };
  return { presets: { ...presets, persistent: nextPersistent }, healed: true };
}
