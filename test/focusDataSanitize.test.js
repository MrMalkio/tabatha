// Bug repro + fix verification — InPop gatekeeper rendering "[object Object]"
// for the intent input value, every paused-focus row's label, and every row's
// funnel-stage badge (Malkio's live 6.7.56 install).
//
// Root cause: legacy/historical writes (pre-dating the current writer set,
// which has been audited and only ever assigns strings) left some installs'
// chrome.storage.local with object-valued label/funnelStage (on focusEngine
// items) and context (on tabs) fields. gatekeeper.js's escapeHtml() faithfully
// renders whatever it's given — String(obj) is the literal text
// "[object Object]" — so the corrupted data leaks straight into the UI.
// escapeHtml() itself is proven correct in test/escapeHtml.test.js; this file
// proves the DATA reaching it was the problem, and that the sanitizer heals
// it on the very next engine read, with no reinstall and no data loss.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';
import {
  coerceStringField,
  sanitizeFocusItem,
  sanitizeFocusEngine,
  sanitizeTabContext,
  sanitizeTabsMap,
  sanitizeIntentHistoryEntry,
  sanitizeIntentHistory,
  sanitizeIntentPreset,
  sanitizeIntentPresets,
} from '../src/utils/focusDataSanitize.js';
import { escapeHtml } from '../src/utils/escapeHtml.js';

// ── Pure helpers ──────────────────────────────────────────────

test('coerceStringField: strings and nullish values pass through unchanged', () => {
  assert.equal(coerceStringField('Ship the thing', 'fallback'), 'Ship the thing');
  assert.equal(coerceStringField(null, 'fallback'), null);
  assert.equal(coerceStringField(undefined, 'fallback'), undefined);
});

test('coerceStringField: unwraps a {label:"..."} shaped object', () => {
  assert.equal(coerceStringField({ label: 'Recovered label' }, 'fallback'), 'Recovered label');
});

test('coerceStringField: unwraps {text|value|name} shaped objects', () => {
  assert.equal(coerceStringField({ text: 'from text' }, 'fallback'), 'from text');
  assert.equal(coerceStringField({ value: 'from value' }, 'fallback'), 'from value');
  assert.equal(coerceStringField({ name: 'from name' }, 'fallback'), 'from name');
});

test('coerceStringField: unusable object (no inner string) falls back', () => {
  assert.equal(coerceStringField({}, 'Untitled focus'), 'Untitled focus');
  assert.equal(coerceStringField({ foo: 'bar' }, 'Untitled focus'), 'Untitled focus');
  assert.equal(coerceStringField([1, 2, 3], null), null);
});

test('sanitizeFocusItem: REPRO — an object-valued label/funnelStage is exactly what produces "[object Object]" through escapeHtml today', () => {
  const corrupted = { id: 'f_1', label: { label: 'Ship it' }, funnelStage: {} };
  // Prove the symptom: rendering the RAW corrupted item is exactly the bug.
  assert.equal(String(corrupted.label), '[object Object]');
  assert.equal(escapeHtml(corrupted.label), '[object Object]');
  assert.equal(escapeHtml(corrupted.funnelStage || 'focus'), '[object Object]'); // truthy object — fallback never fires

  // Prove the fix: sanitizing first yields a clean string that escapeHtml
  // renders faithfully (as designed).
  const { item, healed } = sanitizeFocusItem(corrupted);
  assert.equal(healed, true);
  assert.equal(item.label, 'Ship it');
  assert.equal(item.funnelStage, 'unsorted');
  assert.equal(escapeHtml(item.label), 'Ship it');
  assert.equal(escapeHtml(item.funnelStage || 'focus'), 'unsorted');
});

test('sanitizeFocusItem: clean item is left untouched (healed:false, same values)', () => {
  const clean = { id: 'f_2', label: 'Write the report', funnelStage: 'focus', context: null };
  const { item, healed } = sanitizeFocusItem(clean);
  assert.equal(healed, false);
  assert.equal(item.label, 'Write the report');
  assert.equal(item.funnelStage, 'focus');
});

test('sanitizeFocusItem: idempotent — sanitizing a healed item again is a no-op', () => {
  const corrupted = { id: 'f_3', label: { value: 'Round two' }, funnelStage: { bogus: true } };
  const once = sanitizeFocusItem(corrupted).item;
  const twice = sanitizeFocusItem(once);
  assert.equal(twice.healed, false);
  assert.equal(twice.item.label, 'Round two');
  assert.equal(twice.item.funnelStage, 'unsorted');
});

test('sanitizeFocusItem: object-valued tab-context field on the item is coerced to a string or null', () => {
  const corrupted = { id: 'f_4', label: 'ok', funnelStage: 'focus', context: { text: 'inherited intent' } };
  const { item, healed } = sanitizeFocusItem(corrupted);
  assert.equal(healed, true);
  assert.equal(item.context, 'inherited intent');
});

test('sanitizeFocusItem: object-valued tag entries are coerced, string/number/bool tags untouched', () => {
  const corrupted = {
    id: 'f_5',
    label: 'ok',
    funnelStage: 'focus',
    tags: { realm: 'work', task: { label: 'Task 42' }, _elapsedMs: 5000, _backburner: true },
  };
  const { item, healed } = sanitizeFocusItem(corrupted);
  assert.equal(healed, true);
  assert.equal(item.tags.realm, 'work');
  assert.equal(item.tags.task, 'Task 42');
  assert.equal(item.tags._elapsedMs, 5000);
  assert.equal(item.tags._backburner, true);
});

test('sanitizeFocusEngine: heals only the corrupted items in a mixed engine, preserves everything else', () => {
  const engine = {
    activeFocusId: 'f_clean',
    items: {
      f_clean: { id: 'f_clean', label: 'Fine', funnelStage: 'focus' },
      f_bad: { id: 'f_bad', label: { label: 'Recovered' }, funnelStage: {} },
    },
    history: [{ id: 'h_1' }],
  };
  const { engine: next, healed, healedIds } = sanitizeFocusEngine(engine);
  assert.equal(healed, true);
  assert.deepEqual(healedIds, ['f_bad']);
  assert.equal(next.items.f_clean.label, 'Fine'); // untouched
  assert.equal(next.items.f_bad.label, 'Recovered');
  assert.equal(next.items.f_bad.funnelStage, 'unsorted');
  assert.equal(next.activeFocusId, 'f_clean');
  assert.equal(next.history.length, 1);
});

test('sanitizeFocusEngine: fully-clean engine reports healed:false', () => {
  const engine = { activeFocusId: null, items: { f_1: { id: 'f_1', label: 'Clean', funnelStage: 'focus' } }, history: [] };
  const { healed, healedIds } = sanitizeFocusEngine(engine);
  assert.equal(healed, false);
  assert.equal(healedIds.length, 0);
});

// ── Tab context (the InPop's "inherited context" input value) ──

test('sanitizeTabContext: REPRO — an object-valued tab context is exactly what produces "[object Object]" in the InPop input value', () => {
  const corruptedContext = { text: 'Writing the proposal' };
  assert.equal(String(corruptedContext), '[object Object]');
  assert.equal(escapeHtml(corruptedContext), '[object Object]');

  const clean = sanitizeTabContext(corruptedContext);
  assert.equal(clean, 'Writing the proposal');
  assert.equal(escapeHtml(clean), 'Writing the proposal');
});

test('sanitizeTabContext: strings and null pass through; unusable object falls back to null', () => {
  assert.equal(sanitizeTabContext('Writing docs'), 'Writing docs');
  assert.equal(sanitizeTabContext(null), null);
  assert.equal(sanitizeTabContext(undefined), undefined);
  assert.equal(sanitizeTabContext({}), null);
});

test('sanitizeTabsMap: heals context across a map of tabs, propagation scenario (parent -> inherited child)', () => {
  const tabs = {
    '1': { url: 'a', context: { label: 'Legacy corrupted parent' }, intent: 'x' },
    // A tab that inherited the SAME bad object reference from its parent
    // (handleTabCreated copies parent.context by reference) — must heal too.
    '2': { url: 'b', context: { label: 'Legacy corrupted parent' }, intent: 'x' },
    '3': { url: 'c', context: 'Already fine', intent: 'y' },
  };
  const { tabs: next, healed, healedIds } = sanitizeTabsMap(tabs);
  assert.equal(healed, true);
  assert.deepEqual(healedIds.sort(), ['1', '2']);
  assert.equal(next['1'].context, 'Legacy corrupted parent');
  assert.equal(next['2'].context, 'Legacy corrupted parent');
  assert.equal(next['3'].context, 'Already fine'); // untouched
});

// ── Integration: the REAL getFocusEngine() must self-heal on read ──

async function freshFocusService() {
  return import('../src/background/services/focusService.js?b=' + Math.random());
}

test('focusService.getFocusEngine(): self-heals corrupted storage on read and persists the repair (no reinstall needed)', async () => {
  const chrome = installChromeMock({
    store: {
      focusEngine: {
        activeFocusId: 'f_bad',
        items: {
          f_bad: {
            id: 'f_bad',
            label: { label: 'Ship the thing' }, // legacy-corrupted
            funnelStage: {},                    // legacy-corrupted
            focusState: 'active',
            createdAt: new Date().toISOString(),
          },
        },
        history: [],
      },
    },
  });
  globalThis.chrome = chrome;

  const { getFocusEngine } = await freshFocusService();
  const engine = await getFocusEngine();

  // The exact fields the InPop gatekeeper renders must now be clean strings.
  assert.equal(typeof engine.items.f_bad.label, 'string');
  assert.equal(engine.items.f_bad.label, 'Ship the thing');
  assert.equal(engine.items.f_bad.funnelStage, 'unsorted');
  assert.equal(escapeHtml(engine.items.f_bad.label), 'Ship the thing');

  // Self-heal must be durable: it wrote the repair back to storage, so the
  // NEXT read (e.g. from the gatekeeper's own GET_FOCUS_ENGINE round trip)
  // sees clean data too, without needing a reinstall.
  const persisted = chrome._storage.focusEngine;
  assert.equal(persisted.items.f_bad.label, 'Ship the thing');
  assert.equal(persisted.items.f_bad.funnelStage, 'unsorted');

  // No data lost: the item's other fields survive untouched.
  assert.equal(persisted.items.f_bad.focusState, 'active');
  assert.equal(persisted.activeFocusId, 'f_bad');
});

test('focusService.getFocusEngine(): a clean engine round-trips with no extra write (idempotent, doesn\'t thrash storage)', async () => {
  const cleanEngine = {
    activeFocusId: 'f_1',
    items: { f_1: { id: 'f_1', label: 'Already clean', funnelStage: 'focus', focusState: 'active' } },
    history: [],
  };
  const chrome = installChromeMock({ store: { focusEngine: JSON.parse(JSON.stringify(cleanEngine)) } });
  globalThis.chrome = chrome;

  const { getFocusEngine } = await freshFocusService();
  const engine = await getFocusEngine();
  assert.equal(engine.items.f_1.label, 'Already clean');
  assert.deepEqual(chrome._storage.focusEngine.items.f_1, cleanEngine.items.f_1);
});

// ── 6.7.76 (gatekeeper-sanitize-gap) — intentHistory / intentPresets ──
//
// gatekeeper.js's direct `chrome.storage.local.get(['intentHistory',
// 'intentPresets', 'settings'])` (~line 160) bypassed every sanitize-on-read
// path the above tests already prove for focusEngine/tabs — intentHistory
// and intentPresets are a wholly separate chrome.storage.local key. An
// agent observed "[object Object]" through exactly this path in a live
// gate (docs/audits/2026-07-24-live-extension-e2e.md, Round 2 — Wren).

test('sanitizeIntentHistoryEntry: REPRO — an object-valued context is exactly what produces "[object Object]" through escapeHtml today', () => {
  const corrupted = { action: 'change', context: { label: 'Ship it' }, timestamp: new Date().toISOString() };
  // Prove the symptom: rendering the RAW corrupted entry is exactly the bug
  // (this is what gatekeeper.js's "recent from history" build would have
  // pushed straight into `recentIntents`, then into an escapeHtml()'d
  // preset row).
  assert.equal(String(corrupted.context), '[object Object]');
  assert.equal(escapeHtml(corrupted.context), '[object Object]');

  // Prove the fix: sanitizing first yields a clean string that escapeHtml
  // renders faithfully as text, never "[object Object]".
  const { entry, healed } = sanitizeIntentHistoryEntry(corrupted);
  assert.equal(healed, true);
  assert.equal(typeof entry.context, 'string');
  assert.equal(entry.context, 'Ship it');
  assert.equal(escapeHtml(entry.context), 'Ship it');
});

test('sanitizeIntentHistoryEntry: heals context/oldContext/newContext/oldIntent/newIntent independently', () => {
  const corrupted = {
    action: 'change',
    context: { text: 'A' },
    oldContext: { value: 'B' },
    newContext: { name: 'C' },
    oldIntent: { label: 'D' },
    newIntent: {}, // no usable inner string -> falls back to null
  };
  const { entry, healed } = sanitizeIntentHistoryEntry(corrupted);
  assert.equal(healed, true);
  assert.equal(entry.context, 'A');
  assert.equal(entry.oldContext, 'B');
  assert.equal(entry.newContext, 'C');
  assert.equal(entry.oldIntent, 'D');
  assert.equal(entry.newIntent, null);
});

test('sanitizeIntentHistoryEntry: clean entry is left untouched (healed:false, same reference)', () => {
  const clean = { action: 'continue', context: 'Writing docs', timestamp: new Date().toISOString() };
  const { entry, healed } = sanitizeIntentHistoryEntry(clean);
  assert.equal(healed, false);
  assert.equal(entry, clean); // same reference — no unnecessary copy
});

test('sanitizeIntentHistoryEntry: non-object / nullish entries pass through safely', () => {
  assert.deepEqual(sanitizeIntentHistoryEntry(null), { entry: null, healed: false });
  assert.deepEqual(sanitizeIntentHistoryEntry(undefined), { entry: undefined, healed: false });
});

test('sanitizeIntentHistory: heals only the corrupted entries in a mixed array, preserves order and clean entries', () => {
  const history = [
    { action: 'continue', context: 'Fine already' },
    { action: 'change', newContext: { label: 'Recovered' } },
    { action: 'nevermind', context: null },
  ];
  const { history: next, healed } = sanitizeIntentHistory(history);
  assert.equal(healed, true);
  assert.equal(next.length, 3);
  assert.equal(next[0].context, 'Fine already');
  assert.equal(next[1].newContext, 'Recovered');
  assert.equal(next[2].context, null);
});

test('sanitizeIntentHistory: fully-clean array reports healed:false with the SAME reference (no thrash)', () => {
  const history = [{ action: 'continue', context: 'Clean' }];
  const { history: next, healed } = sanitizeIntentHistory(history);
  assert.equal(healed, false);
  assert.equal(next, history);
});

test('sanitizeIntentHistory: non-array input passes through unchanged', () => {
  assert.deepEqual(sanitizeIntentHistory(null), { history: null, healed: false });
  assert.deepEqual(sanitizeIntentHistory(undefined), { history: undefined, healed: false });
});

test('sanitizeIntentHistory: idempotent — sanitizing a healed history again is a no-op', () => {
  const corrupted = [{ action: 'change', context: { value: 'Round two' } }];
  const once = sanitizeIntentHistory(corrupted).history;
  const twice = sanitizeIntentHistory(once);
  assert.equal(twice.healed, false);
  assert.equal(twice.history[0].context, 'Round two');
});

test('sanitizeIntentPreset: REPRO — an object-valued label is exactly what produces "[object Object]" for a persistent InPop preset', () => {
  const corrupted = { label: { label: 'Deep Work' } };
  assert.equal(String(corrupted.label), '[object Object]');
  assert.equal(escapeHtml(corrupted.label), '[object Object]');

  const { preset, healed } = sanitizeIntentPreset(corrupted);
  assert.equal(healed, true);
  assert.equal(preset.label, 'Deep Work');
  assert.equal(escapeHtml(preset.label), 'Deep Work');
});

test('sanitizeIntentPreset: unusable object falls back to "Untitled preset"; clean preset untouched', () => {
  const { preset: healedPreset, healed: h1 } = sanitizeIntentPreset({ label: {} });
  assert.equal(h1, true);
  assert.equal(healedPreset.label, 'Untitled preset');

  const clean = { label: 'Deep Work' };
  const { preset, healed } = sanitizeIntentPreset(clean);
  assert.equal(healed, false);
  assert.equal(preset, clean);
});

test('sanitizeIntentPresets: heals persistent presets in place, preserves clean ones and non-array shapes safely', () => {
  const presets = {
    persistent: [
      { label: 'Fine already' },
      { label: { text: 'Recovered preset' } },
    ],
  };
  const { presets: next, healed } = sanitizeIntentPresets(presets);
  assert.equal(healed, true);
  assert.equal(next.persistent[0].label, 'Fine already');
  assert.equal(next.persistent[1].label, 'Recovered preset');
});

test('sanitizeIntentPresets: fully-clean store reports healed:false with the SAME reference; missing/malformed `persistent` is a no-op', () => {
  const presets = { persistent: [{ label: 'Clean' }] };
  const { presets: next, healed } = sanitizeIntentPresets(presets);
  assert.equal(healed, false);
  assert.equal(next, presets);

  assert.deepEqual(sanitizeIntentPresets({}), { presets: {}, healed: false });
  assert.deepEqual(sanitizeIntentPresets(null), { presets: null, healed: false });
  assert.deepEqual(sanitizeIntentPresets(undefined), { presets: undefined, healed: false });
});
