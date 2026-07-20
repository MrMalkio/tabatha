// resolveContextViewSettings precedence — pure helper unit tests
// (node:test, no new deps). Same mirror convention as the other tests/*
// files: sidecar/src/lib/contextViewSettings.ts has no RN/supabase imports
// of its own, but this repo's plain `node --test` has no TS loader, so the
// function is mirrored here verbatim.
//
//   DEFAULT_CONTEXT_VIEW_SETTINGS / resolveContextViewSettings
//     <- sidecar/src/lib/contextViewSettings.ts (verbatim copies)
//
// If the source changes, update the mirror + re-run this file.
//
// Device management (migration 045) adds a 4th, highest-precedence layer:
// device > contextView > legacy sidecar > defaults. These tests cover that
// new layer specifically; the pre-existing three-layer precedence (Epic 9)
// is exercised incidentally by the same fixtures.

import test from 'node:test';
import assert from 'node:assert/strict';

// ── mirror: sidecar/src/lib/contextViewSettings.ts ─────────────────────
const DEFAULT_CONTEXT_VIEW_SETTINGS = {
  showDayCountdown: true,
  showUpNext: true,
  showTimeline: true,
  showCheckpoints: true,
  dayResetHour: 0,
  focusAwayImmediate: false,
  layout: 'v2',
};

function resolveContextViewSettings(settings, deviceSettings) {
  const cv = settings?.contextView || {};
  const legacySidecar = settings?.sidecar || {};
  const device = deviceSettings || {};
  return {
    ...DEFAULT_CONTEXT_VIEW_SETTINGS,
    dayResetHour: legacySidecar.dayResetHour ?? DEFAULT_CONTEXT_VIEW_SETTINGS.dayResetHour,
    focusAwayImmediate:
      legacySidecar.focusAwayImmediate ?? DEFAULT_CONTEXT_VIEW_SETTINGS.focusAwayImmediate,
    showCheckpoints: legacySidecar.showCheckpoints ?? DEFAULT_CONTEXT_VIEW_SETTINGS.showCheckpoints,
    ...cv,
    ...device,
  };
}
// ── end mirror ──────────────────────────────────────────────────────────

test('resolveContextViewSettings with no settings and no deviceSettings returns defaults', () => {
  assert.deepEqual(resolveContextViewSettings(null, null), DEFAULT_CONTEXT_VIEW_SETTINGS);
  assert.deepEqual(resolveContextViewSettings(undefined, undefined), DEFAULT_CONTEXT_VIEW_SETTINGS);
});

test('resolveContextViewSettings omitting deviceSettings entirely behaves exactly as before migration 045', () => {
  const settings = { sidecar: { dayResetHour: 4 }, contextView: { showTimeline: false } };
  assert.deepEqual(resolveContextViewSettings(settings), {
    ...DEFAULT_CONTEXT_VIEW_SETTINGS,
    dayResetHour: 4,
    showTimeline: false,
  });
});

test('deviceSettings overrides contextView for the same key', () => {
  const settings = { contextView: { showTimeline: false } };
  const deviceSettings = { showTimeline: true };
  const out = resolveContextViewSettings(settings, deviceSettings);
  assert.equal(out.showTimeline, true);
});

test('deviceSettings overrides legacy sidecar.* values too', () => {
  const settings = { sidecar: { dayResetHour: 4, focusAwayImmediate: true } };
  const deviceSettings = { dayResetHour: 9 };
  const out = resolveContextViewSettings(settings, deviceSettings);
  assert.equal(out.dayResetHour, 9);
  // Untouched-by-device field still comes through from legacy sidecar.
  assert.equal(out.focusAwayImmediate, true);
});

test('an empty device_settings object ({}) changes nothing — the v1 default for every device', () => {
  const settings = { contextView: { showUpNext: false, dayResetHour: 6 } };
  const withEmptyDevice = resolveContextViewSettings(settings, {});
  const withNoDevice = resolveContextViewSettings(settings);
  assert.deepEqual(withEmptyDevice, withNoDevice);
});

test('deviceSettings can partially override — untouched keys still fall through the full chain', () => {
  const settings = { sidecar: { dayResetHour: 2 }, contextView: { showCheckpoints: false } };
  const deviceSettings = { showDayCountdown: false };
  const out = resolveContextViewSettings(settings, deviceSettings);
  assert.equal(out.showDayCountdown, false); // from device
  assert.equal(out.showCheckpoints, false); // from contextView (untouched by device)
  assert.equal(out.dayResetHour, 2); // from legacy sidecar (untouched by device/contextView)
  assert.equal(out.showUpNext, true); // default (untouched by anything)
});

test('full precedence chain: device > contextView > legacy sidecar > defaults, all on the same key', () => {
  // dayResetHour set at every layer — device should win.
  const settings = { sidecar: { dayResetHour: 1 }, contextView: { dayResetHour: 2 } };
  assert.equal(resolveContextViewSettings(settings, { dayResetHour: 3 }).dayResetHour, 3);
  // Remove device layer — contextView should win over legacy sidecar.
  assert.equal(resolveContextViewSettings(settings, null).dayResetHour, 2);
  // Remove contextView too — legacy sidecar should win over the default.
  assert.equal(resolveContextViewSettings({ sidecar: { dayResetHour: 1 } }, null).dayResetHour, 1);
  // Nothing set anywhere — default.
  assert.equal(resolveContextViewSettings(null, null).dayResetHour, 0);
});
