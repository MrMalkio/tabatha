// Feature #222 — Device Management. Pure-function tests for
// src/utils/deviceGrouping.js (ported from the Sidecar's DevicesCard.tsx
// grouping/visibility rules, migration 045 / fix-wave 2026-07-20/21).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  relTime,
  surfaceLabel,
  deriveName,
  isDefaultVisible,
  groupKey,
  groupRows,
  visibleDeviceRows,
  deviceKindOf,
  DEVICE_KINDS,
} from '../src/utils/deviceGrouping.js';

const NOW = new Date('2026-07-21T12:00:00.000Z').getTime();

function row(overrides = {}) {
  return {
    id: 'row-1',
    browser: 'chrome',
    profile_name: 'Default',
    display_name: null,
    classification: 'professional',
    extension_installed: true,
    last_seen_at: new Date(NOW).toISOString(),
    paused: false,
    revoked_at: null,
    local_id: null,
    machine_id: null,
    device_settings: null,
    ...overrides,
  };
}

// ── relTime ──
test('relTime: null → never seen', () => {
  assert.equal(relTime(null), 'never seen');
});
test('relTime: minutes/hours/days buckets', () => {
  assert.equal(relTime(new Date(NOW - 30_000).toISOString(), NOW), 'just now');
  assert.equal(relTime(new Date(NOW - 5 * 60000).toISOString(), NOW), '5m ago');
  assert.equal(relTime(new Date(NOW - 3 * 3600000).toISOString(), NOW), '3h ago');
  assert.equal(relTime(new Date(NOW - 2 * 86400000).toISOString(), NOW), '2d ago');
});

// ── surfaceLabel ──
test('surfaceLabel: extension installs show "Chrome extension · <browser>"', () => {
  assert.equal(surfaceLabel(row({ extension_installed: true, browser: 'chrome' })), 'Chrome extension · chrome');
});
test('surfaceLabel: Sidecar surfaces strip the mobile_/tabatha_ prefix', () => {
  assert.equal(surfaceLabel(row({ extension_installed: false, browser: 'tabatha_web' })), 'Sidecar · web');
  assert.equal(surfaceLabel(row({ extension_installed: false, browser: 'mobile_ios' })), 'Sidecar · ios');
});
test('surfaceLabel: unknown surface falls back to the raw browser field', () => {
  assert.equal(surfaceLabel(row({ extension_installed: false, browser: 'firefox' })), 'firefox');
});

// ── deriveName ──
test('deriveName: prefers display_name when set', () => {
  assert.equal(deriveName(row({ display_name: 'My Laptop' })), 'My Laptop');
});
test('deriveName: falls back to surface + profile name + id hint', () => {
  const name = deriveName(row({ display_name: null, profile_name: 'Work', id: 'abcd1234' }));
  assert.ok(name.includes('Chrome extension · chrome'));
  assert.ok(name.includes('Work'));
  assert.ok(name.endsWith('#ABCD'));
});
test('deriveName: generic "Default" profile name is not appended', () => {
  const name = deriveName(row({ display_name: null, profile_name: 'Default', id: 'abcd1234' }));
  assert.ok(!name.includes('Default'));
});

// ── isDefaultVisible ──
test('isDefaultVisible: this device is always visible', () => {
  assert.equal(isDefaultVisible(row({ id: 'self', last_seen_at: null }), 'self', NOW), true);
});
test('isDefaultVisible: named devices are always visible', () => {
  assert.equal(isDefaultVisible(row({ display_name: 'TV', last_seen_at: null }), 'other', NOW), true);
});
test('isDefaultVisible: recently-seen (<=30d) devices are visible', () => {
  const recent = row({ last_seen_at: new Date(NOW - 10 * 86400000).toISOString() });
  assert.equal(isDefaultVisible(recent, 'other', NOW), true);
});
test('isDefaultVisible: stale unnamed devices are hidden by default', () => {
  const stale = row({ display_name: null, last_seen_at: new Date(NOW - 45 * 86400000).toISOString() });
  assert.equal(isDefaultVisible(stale, 'other', NOW), false);
});
test('isDefaultVisible: never-seen unnamed devices are hidden by default', () => {
  const neverSeen = row({ display_name: null, last_seen_at: null });
  assert.equal(isDefaultVisible(neverSeen, 'other', NOW), false);
});

// ── groupKey / groupRows ──
test('groupKey: machine_id wins when present', () => {
  assert.equal(groupKey(row({ machine_id: 'mach-1', local_id: 'loc-1' })), 'm:mach-1');
});
test('groupKey: falls back to browser+local_id prefix', () => {
  assert.equal(groupKey(row({ machine_id: null, local_id: '0123456789abcdefXXXX', browser: 'chrome' })), 'l:chrome:0123456789abcdef');
});
test('groupKey: falls back to the row id when nothing correlates', () => {
  assert.equal(groupKey(row({ machine_id: null, local_id: null, id: 'row-9' })), 'id:row-9');
});

test('groupRows: dedupes by groupKey, keeping the first (most-recent) row', () => {
  const rows = [
    row({ id: 'r1', machine_id: 'm1', last_seen_at: new Date(NOW).toISOString() }),
    row({ id: 'r2', machine_id: 'm1', last_seen_at: new Date(NOW - 60000).toISOString() }),
    row({ id: 'r3', machine_id: 'm2' }),
  ];
  const grouped = groupRows(rows);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].id, 'r1');
  assert.equal(grouped[1].id, 'r3');
});
test('groupRows: empty/undefined input returns []', () => {
  assert.deepEqual(groupRows(undefined), []);
  assert.deepEqual(groupRows([]), []);
});

// ── visibleDeviceRows ──
test('visibleDeviceRows: default view groups + filters; hiddenCount counts what showAll would add', () => {
  const rows = [
    row({ id: 'self', machine_id: null, local_id: null, last_seen_at: new Date(NOW).toISOString() }),
    row({ id: 'stale-dupe-1', machine_id: 'dupe', last_seen_at: new Date(NOW - 90 * 86400000).toISOString(), display_name: null }),
    row({ id: 'stale-dupe-2', machine_id: 'dupe', last_seen_at: new Date(NOW - 91 * 86400000).toISOString(), display_name: null }),
  ];
  const { visible, hiddenCount, groupedCount } = visibleDeviceRows(rows, 'self', { showAll: false, now: NOW });
  assert.equal(groupedCount, 2); // self + one representative of the 'dupe' machine group
  assert.equal(visible.length, 1); // only self passes isDefaultVisible (both dupes are stale+unnamed)
  assert.equal(hiddenCount, rows.length - 1);
});
test('visibleDeviceRows: showAll bypasses both grouping and the visibility filter', () => {
  const rows = [
    row({ id: 'a', machine_id: 'dupe' }),
    row({ id: 'b', machine_id: 'dupe' }),
  ];
  const { visible } = visibleDeviceRows(rows, 'self', { showAll: true, now: NOW });
  assert.equal(visible.length, 2);
});

// ── deviceKindOf ──
test('deviceKindOf: defaults to "phone" when unset (backward compatibility)', () => {
  assert.equal(deviceKindOf(row({ device_settings: null })), 'phone');
  assert.equal(deviceKindOf(row({ device_settings: {} })), 'phone');
});
test('deviceKindOf: reads device_settings.kind', () => {
  assert.equal(deviceKindOf(row({ device_settings: { kind: 'tablet' } })), 'tablet');
});

test('DEVICE_KINDS: five kinds, unique values', () => {
  assert.equal(DEVICE_KINDS.length, 5);
  assert.equal(new Set(DEVICE_KINDS.map((k) => k.value)).size, 5);
});
