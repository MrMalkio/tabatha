// Cold-start / SW-restart identity race regression.
//
// awarenessService keeps activeProfileId/activeBrowserProfileId as module
// state, populated by startAwareness(). Before that completes (fresh SW
// spin-up, or a restart mid-startAwareness), LIST_LIVE_STINTS and friends
// used to hard-guard on `!activeProfileId` and silently no-op — producing
// ghost cards in the Live Stints panel and a missed abandoned-stint check
// on auto-clock-in. resolveActiveIdentity() closes that gap by falling back
// to a direct auth/profile lookup (the same one startAwareness performs)
// whenever module state isn't populated yet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';
import { createSupabaseFake } from '../testutils/supabaseFake.js';

const PROFILE = 'profile-cold-1';
const AUTH = 'auth-user-cold-1';
const SELF = 'bp-self-cold';
const OTHER = 'bp-other-cold';

function isoAgo(min) { return new Date(Date.now() - min * 60000).toISOString(); }

test('LIST_LIVE_STINTS resolves identity via fallback when activeProfileId is unset', async () => {
  installChromeMock({ store: { _browserProfile: { localId: 'l1', supabaseId: SELF, classification: 'professional' } } });
  const sb = createSupabaseFake({
    session: { user: { id: AUTH } },
    selects: {
      profiles: [{ id: PROFILE }],
      browser_profile_status: [
        { browser_profile_id: SELF, profile_id: PROFILE, online: true, clock_state: 'clocked_in', last_heartbeat_at: isoAgo(0) },
        { browser_profile_id: OTHER, profile_id: PROFILE, online: true, clock_state: 'clocked_in', last_heartbeat_at: isoAgo(1) }
      ],
      browser_profiles: [
        { id: SELF, browser: 'chrome', profile_name: 'Desk', classification: 'professional', machine_id: null },
        { id: OTHER, browser: 'chrome', profile_name: 'Laptop', classification: 'professional', machine_id: null }
      ]
    }
  });

  const awareness = await import('../src/background/services/awarenessService.js');
  awareness.configureAwarenessService({ supabase: sb });
  // Deliberately do NOT call __setActiveForTest / startAwareness — this
  // simulates a message arriving before startAwareness() has resolved.

  const res = await awareness.handleMessage('LIST_LIVE_STINTS', {});
  assert.equal(res.selfBrowserProfileId, SELF, 'fallback should resolve selfId from install identity');
  assert.equal(res.installs.length, 2, 'fallback should resolve profileId and list both installs');
  assert.ok(res.installs.some(i => i.browser_profile_id === OTHER));
});

test('LIST_LIVE_STINTS returns empty installs when there is no session (no false fallback)', async () => {
  installChromeMock({ store: {} });
  const sb = createSupabaseFake({ session: null, selects: {} });

  const awareness = await import('../src/background/services/awarenessService.js');
  awareness.configureAwarenessService({ supabase: sb });

  const res = await awareness.handleMessage('LIST_LIVE_STINTS', {});
  assert.deepEqual(res.installs, []);
});

test('GET_OTHER_QUEUE resolves identity via fallback when activeProfileId is unset', async () => {
  installChromeMock({ store: { _browserProfile: { localId: 'l2', supabaseId: SELF, classification: 'professional' } } });
  const sb = createSupabaseFake({
    session: { user: { id: AUTH } },
    selects: {
      profiles: [{ id: PROFILE }],
      focus_items: [
        { client_id: 'a1', label: 'other device item', focus_state: 'paused', priority: 1, timer_minutes: 25, browser_profile_id: OTHER, created_at: isoAgo(5) },
        { client_id: 's1', label: 'self item', focus_state: 'active', priority: 1, browser_profile_id: SELF, created_at: isoAgo(1) }
      ],
      browser_profiles: [
        { id: OTHER, browser: 'chrome', profile_name: 'Laptop', classification: 'professional', machine_id: null }
      ]
    }
  });

  const awareness = await import('../src/background/services/awarenessService.js');
  awareness.configureAwarenessService({ supabase: sb });

  const res = await awareness.handleMessage('GET_OTHER_QUEUE', {});
  assert.equal(res.selfBrowserProfileId, SELF);
  assert.equal(res.devices.length, 1);
  assert.equal(res.devices[0].browser_profile_id, OTHER);
});

test('CLOCK_OUT_INSTALL / DISMISS_INSTALL / CLEAR_ALL_OFFLINE resolve identity via fallback instead of returning not_ready', async () => {
  installChromeMock({ store: { _browserProfile: { localId: 'l3', supabaseId: SELF, classification: 'professional' } } });
  const sb = createSupabaseFake({
    session: { user: { id: AUTH } },
    selects: {
      profiles: [{ id: PROFILE }, { default_org_id: null, default_team_id: null }],
      browser_profile_status: [
        { browser_profile_id: SELF, profile_id: PROFILE, online: true, clock_state: 'clocked_in', last_heartbeat_at: isoAgo(0) },
        {
          browser_profile_id: OTHER, profile_id: PROFILE, online: false, clock_state: 'clocked_in',
          clocked_in_at: isoAgo(120), last_heartbeat_at: isoAgo(10), classification: 'professional'
        }
      ],
      browser_profiles: [
        { id: SELF, browser: 'chrome', profile_name: 'Desk', classification: 'professional', machine_id: null },
        { id: OTHER, browser: 'chrome', profile_name: 'Laptop', classification: 'professional', machine_id: null }
      ]
    }
  });

  const awareness = await import('../src/background/services/awarenessService.js');
  awareness.configureAwarenessService({ supabase: sb });

  const dismissRes = await awareness.handleMessage('DISMISS_INSTALL', { browser_profile_id: OTHER });
  // Whatever the outcome (dismissed / reconstructed by clockOut path), the
  // point under test is that identity resolution succeeded rather than
  // short-circuiting to 'not_ready'.
  assert.notEqual(dismissRes?.error, 'not_ready');

  const clearRes = await awareness.handleMessage('CLEAR_ALL_OFFLINE', {});
  assert.notEqual(clearRes?.error, 'not_ready');
  assert.equal(clearRes.success, true);
});

test('getOwnAbandonedStints resolves identity via fallback when activeProfileId is unset', async () => {
  installChromeMock({ store: { _browserProfile: { localId: 'l4', supabaseId: SELF, classification: 'professional' } } });
  const sb = createSupabaseFake({
    session: { user: { id: AUTH } },
    selects: {
      profiles: [{ id: PROFILE }],
      browser_profile_status: [
        { browser_profile_id: SELF, profile_id: PROFILE, online: true, clock_state: 'clocked_in', last_heartbeat_at: isoAgo(0) },
        {
          browser_profile_id: OTHER, profile_id: PROFILE, online: false, clock_state: 'clocked_in',
          last_heartbeat_at: isoAgo(30), classification: 'professional'
        }
      ],
      browser_profiles: [
        { id: SELF, browser: 'chrome', profile_name: 'Desk', classification: 'professional', machine_id: null },
        { id: OTHER, browser: 'chrome', profile_name: 'Laptop', classification: 'professional', machine_id: null }
      ]
    }
  });

  const awareness = await import('../src/background/services/awarenessService.js');
  awareness.configureAwarenessService({ supabase: sb });

  const abandoned = await awareness.getOwnAbandonedStints();
  assert.equal(abandoned.length, 1, 'should find the stale professional-classed sibling install');
  assert.equal(abandoned[0].browser_profile_id, OTHER);
});

test('getOwnAbandonedStints returns [] when there is no session', async () => {
  installChromeMock({ store: {} });
  const sb = createSupabaseFake({ session: null, selects: {} });

  const awareness = await import('../src/background/services/awarenessService.js');
  awareness.configureAwarenessService({ supabase: sb });

  const abandoned = await awareness.getOwnAbandonedStints();
  assert.deepEqual(abandoned, []);
});
