// ============================================================
// test/preview-harness/fixtures.js
//
// Canned data for the dev-server chrome.* shim (see chromeShim.js).
// This is NOT real product data — it exists to give components enough
// shape to render past their loading/empty branches so layout, grouping,
// and empty-state logic can be visually inspected outside a real Chrome
// extension context (chrome-extension:// pages can't be automated by our
// browser tooling; localhost:5173 can).
//
// Keep shapes honest to what the source actually reads (see the field
// comments in src/utils/deviceGrouping.js and src/hooks/useChromeStorage.js)
// rather than guessing — a fixture that doesn't match the real shape will
// hide bugs instead of surfacing them.
// ============================================================

const now = Date.now();
const iso = (msAgo = 0) => new Date(now - msAgo).toISOString();

export const FIXTURE_FOCUS_ITEMS = {
  'focus-1': {
    id: 'focus-1',
    label: 'Q3 pricing deck',
    context: 'TGC',
    tags: ['deck', 'pricing'],
    startedAt: iso(45 * 60 * 1000),
    funnelStage: 'in-progress',
    subIntents: [
      { id: 'sub-1', label: 'Competitor slide', done: true },
      { id: 'sub-2', label: 'Pricing table', done: false }
    ],
    priority: 'P2'
  },
  'focus-2': {
    id: 'focus-2',
    label: 'Anasa review',
    context: 'Anasa',
    tags: ['review'],
    startedAt: iso(10 * 60 * 1000),
    funnelStage: 'in-progress',
    priority: 'P1'
  }
};

export const FIXTURE_FOCUS_ENGINE = {
  items: FIXTURE_FOCUS_ITEMS,
  activeId: 'focus-2',
  history: [
    { id: 'focus-0', label: 'Morning standup notes', completedAt: iso(3 * 60 * 60 * 1000) }
  ],
  backburner: [
    { id: 'focus-back-1', label: 'Follow up with Reggie re: invite', parkedAt: iso(6 * 60 * 60 * 1000) }
  ]
};

export const FIXTURE_TASKS = [
  { id: 'task-1', name: 'Draft pricing one-pager', status: 'open', funnelStage: 'doing', createdAt: iso(2 * 60 * 60 * 1000) },
  { id: 'task-2', name: 'Ping Asana re: PAT scope', status: 'open', funnelStage: 'todo', createdAt: iso(5 * 60 * 60 * 1000) },
  { id: 'task-3', name: 'Ship v0.2.0 changelog', status: 'done', funnelStage: 'done', completedAt: iso(24 * 60 * 60 * 1000) }
];

// Device rows deliberately include duplicate-ish entries to exercise
// src/utils/deviceGrouping.js grouping (by machine_id / local_id) + the
// "show all" visibility cutoff + a revoked row that should stay listed
// but show "Signed out" rather than being hidden.
export const FIXTURE_DEVICE_ROWS = [
  {
    id: 'dev-self',
    browser: 'chrome',
    profile_name: 'Default',
    display_name: 'This laptop',
    classification: 'primary',
    extension_installed: true,
    last_seen_at: iso(60 * 1000),
    paused: false,
    revoked_at: null,
    local_id: 'local-abc123',
    machine_id: 'machine-desktop-1'
  },
  // Duplicate row for the SAME physical machine (same machine_id, different
  // local_id) — should collapse to one group under groupKey `m:machine-desktop-1`.
  {
    id: 'dev-self-dupe',
    browser: 'chrome',
    profile_name: 'Default',
    display_name: null,
    classification: 'primary',
    extension_installed: true,
    last_seen_at: iso(5 * 60 * 1000),
    paused: false,
    revoked_at: null,
    local_id: 'local-abc999',
    machine_id: 'machine-desktop-1'
  },
  {
    id: 'dev-phone',
    browser: 'mobile_ios',
    profile_name: 'iPhone',
    display_name: "Malkio's iPhone",
    classification: 'phone',
    extension_installed: false,
    last_seen_at: iso(20 * 60 * 1000),
    paused: false,
    revoked_at: null,
    local_id: 'local-phone-1',
    machine_id: 'machine-phone-1'
  },
  // Stale + unnamed + no machine_id match → should be hidden by default,
  // only surfaced by "Show all".
  {
    id: 'dev-stale',
    browser: 'firefox',
    profile_name: 'default-release',
    display_name: null,
    classification: null,
    extension_installed: true,
    last_seen_at: iso(60 * 24 * 60 * 60 * 1000), // 60 days ago
    paused: false,
    revoked_at: null,
    local_id: 'local-stale-1',
    machine_id: 'machine-stale-1'
  },
  // Revoked row — must remain in the list (not hidden) per DevicesPanel
  // logic, with the Sign-out button showing "Signed out ✓".
  {
    id: 'dev-revoked',
    browser: 'chrome',
    profile_name: 'Work',
    display_name: 'Old work laptop',
    classification: 'desktop',
    extension_installed: true,
    last_seen_at: iso(10 * 24 * 60 * 60 * 1000),
    paused: false,
    revoked_at: iso(9 * 24 * 60 * 60 * 1000),
    local_id: 'local-revoked-1',
    machine_id: 'machine-revoked-1'
  }
];

// One org member for GET_OTHER_QUEUE / team-activity style surfaces.
export const FIXTURE_OTHER_PROFILES = [
  {
    browser_profile_id: 'org-member-1',
    display_name: 'Kael',
    devices: [
      { id: 'kael-dev-1', browser: 'chrome', last_seen_at: iso(2 * 60 * 1000), extension_installed: true }
    ],
    active_focus: { label: 'Fleet coordination', started_at: iso(30 * 60 * 1000) }
  }
];

export const FIXTURE_CLOCK_SESSION = {
  active: true,
  onBreak: false,
  breakStartedAt: null,
  // NOTE: field names are `start`/`end` (ISO strings), matching
  // src/background/services/clockService.js:347-350 and the consumer at
  // src/home/index.jsx:1834 — NOT `startedAt`/`endedAt`. An earlier draft of
  // this fixture used the wrong field names and produced a `NaN:NaN:NaN`
  // clock readout; that was a fixture bug, not a product bug (see the
  // 2026-07-24 Wren harness audit entry for the full story).
  breaks: [
    { start: iso(3 * 60 * 60 * 1000), end: iso(2.75 * 60 * 60 * 1000) }
  ],
  clockedInAt: iso(4 * 60 * 60 * 1000),
  clockedOutAt: null
};

export const FIXTURE_CLOCK_HISTORY = [
  { clockedInAt: iso(28 * 60 * 60 * 1000), clockedOutAt: iso(20 * 60 * 60 * 1000) },
  { clockedInAt: iso(52 * 60 * 60 * 1000), clockedOutAt: iso(44 * 60 * 60 * 1000) }
];

// Deliberately empty — this is the fixture that exercises audit finding H7
// (UnifiedTimeline / "Context Activity" allegedly blank when
// companionRecentSessions is empty). See chromeShim `FIXTURE_MODE` toggle
// for a second variant with sessions populated.
export const FIXTURE_COMPANION_SESSIONS_EMPTY = [];

export const FIXTURE_COMPANION_SESSIONS_POPULATED = [
  {
    started_at: iso(90 * 60 * 1000),
    ended_at: iso(60 * 60 * 1000),
    duration_ms: 30 * 60 * 1000,
    category: 'coding',
    app_display_name: 'VS Code',
    window_title: 'tabatha — index.jsx',
    matched_focus_id: 'focus-1'
  }
];

export const FIXTURE_SETTINGS = {
  userName: 'Malkio',
  profileLabel: 'Primary',
  voice: { enabled: false },
  activityDayStartTime: '06:00',
  activityMinDurationSec: 60,
  hiddenActivityRanges: [],
  asanaWidgetEnabled: true,
  asanaWidgetUrl: '',
  checkpointAutoPostAsana: false
};

export const FIXTURE_INSTALL_IDENTITY = {
  supabaseId: 'dev-self',
  local_id: 'local-abc123',
  machine_id: 'machine-desktop-1'
};

export const FIXTURE_AUTH_STATE = {
  session: {
    user: { id: 'dev-user-1', email: 'preview-harness@example.invalid' }
  }
};

export const FIXTURE_LIVE_STINTS = {
  installs: [
    { id: 'dev-self', display_name: 'This laptop', clocked_in_at: iso(4 * 60 * 60 * 1000), is_self: true }
  ],
  selfBrowserProfileId: 'dev-self'
};
