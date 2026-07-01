// FIX-10 — cross-device intent queue read path.
// Machine A's synced focus_items rows must be visible, read-only, on Machine B:
//   - grouped per OTHER device (browser_profile_id), self excluded
//   - completed items excluded (it's a live QUEUE, not history)
//   - ordered by priority (nulls last) then recency
//   - capped per device with a `truncated` flag
//   - remote items missing a priority surface as null (UI shows "P—")
// Covers the pure shaper AND the GET_OTHER_QUEUE background handler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';
import { createSupabaseFake } from '../testutils/supabaseFake.js';

const PROFILE = 'profile-123';
const AUTH = 'auth-user-1';
const SELF = 'bp-self';   // Machine B (this install)
const A = 'bp-machine-a'; // Machine A (the other device)

function isoAgo(min) { return new Date(Date.now() - min * 60000).toISOString(); }

test('shapeOtherQueues groups by other device, drops self + completed, sorts, caps', async () => {
  const { shapeOtherQueues } = await import('../src/background/services/awarenessService.js');

  const focusRows = [
    // self install — must be excluded
    { client_id: 's1', label: 'my own', focus_state: 'active', priority: 1, browser_profile_id: SELF, created_at: isoAgo(1) },
    // machine A — mixed
    { client_id: 'a1', label: 'low prio', focus_state: 'paused', priority: 8, browser_profile_id: A, created_at: isoAgo(50) },
    { client_id: 'a2', label: 'crit', focus_state: 'active', priority: 1, browser_profile_id: A, created_at: isoAgo(40) },
    { client_id: 'a3', label: 'done', focus_state: 'completed', priority: 2, browser_profile_id: A, created_at: isoAgo(30) },
    { client_id: 'a4', label: 'no prio newer', focus_state: 'paused', priority: null, browser_profile_id: A, created_at: isoAgo(5) },
    { client_id: 'a5', label: 'no prio older', focus_state: 'paused', priority: null, browser_profile_id: A, created_at: isoAgo(90) },
  ];
  const meta = [{ id: A, browser: 'chrome', profile_name: 'Work', classification: 'professional', machine_id: 'mac-a' }];

  const devices = shapeOtherQueues(focusRows, meta, SELF, 3);

  assert.equal(devices.length, 1, 'only Machine A should appear (self excluded)');
  const d = devices[0];
  assert.equal(d.browser_profile_id, A);
  assert.equal(d.profile_name, 'Work');
  assert.equal(d.machine_id, 'mac-a');
  assert.equal(d.count, 4, 'completed item excluded from count (a1,a2,a4,a5)');
  assert.equal(d.truncated, true, 'capped at 3 of 4');
  assert.equal(d.items.length, 3);

  // Order: crit(P1) first, low(P8) next, then nulls by recency (a4 newer than a5).
  assert.deepEqual(d.items.map(i => i.client_id), ['a2', 'a1', 'a4']);
  assert.equal(d.items[0].priority, 1);
  assert.equal(d.items[2].priority, null, 'missing priority surfaces as null');
  assert.ok(!d.items.some(i => i.focus_state === 'completed'), 'no completed items leak in');
});

test('shapeOtherQueues returns [] when the only rows belong to self', async () => {
  const { shapeOtherQueues } = await import('../src/background/services/awarenessService.js');
  const rows = [{ client_id: 's1', label: 'x', focus_state: 'active', browser_profile_id: SELF }];
  assert.deepEqual(shapeOtherQueues(rows, [], SELF), []);
});

test('GET_OTHER_QUEUE handler shapes other-device rows read-only', async () => {
  installChromeMock({ store: {} });
  const sb = createSupabaseFake({
    session: { user: { id: AUTH } },
    selects: {
      profiles: [{ id: PROFILE }],
      focus_items: [
        { client_id: 'a1', label: 'ship FIX-10', focus_state: 'paused', priority: 2, timer_minutes: 25, browser_profile_id: A, created_at: isoAgo(10) },
        { client_id: 's1', label: 'local only', focus_state: 'active', priority: 1, browser_profile_id: SELF, created_at: isoAgo(2) },
      ],
      browser_profiles: [{ id: A, browser: 'chrome', profile_name: 'Laptop', classification: 'work', machine_id: 'mac-a' }],
    },
  });

  const awareness = await import('../src/background/services/awarenessService.js');
  awareness.configureAwarenessService({ supabase: sb });
  // Prime the module's active identity via the same path startAwareness uses.
  await awareness.__setActiveForTest?.({ profileId: PROFILE, browserProfileId: SELF });

  const res = await awareness.handleMessage('GET_OTHER_QUEUE', {});
  assert.equal(res.selfBrowserProfileId, SELF);
  assert.equal(res.devices.length, 1, 'only the other device (Machine A) is returned');
  const d = res.devices[0];
  assert.equal(d.browser_profile_id, A);
  assert.equal(d.profile_name, 'Laptop');
  assert.equal(d.items.length, 1);
  assert.equal(d.items[0].client_id, 'a1');
  assert.equal(d.items[0].priority, 2);
  assert.equal(d.items[0].timer_minutes, 25);
});
