// ════════════════════════════════════════════
// Tabatha — Background Constants
// Single source of truth for default state shapes consumed across
// background.js, services, and the bootstrap layer.
// ════════════════════════════════════════════

export const DEFAULT_SETTINGS = {
  globalTimerMinutes: 15,
  idleThresholdMinutes: 5,
  exportPath: 'Tabatha',
  autoExportEnabled: false,
  autoExportIntervalMinutes: 60,
  // ── Follow-through Support (Plan 025) ──
  welcomeBackMinIdleMinutes: 5,
  welcomeBackShowAfterBreak: true,
  checkpointNotesEnabled: true,
  checkpointIntervalFraction: 0.33,
  checkpointStaleMinutes: 30,
  checkpointAutoPostAsana: false,
  // ── Intelligent Focus Lifecycle (Plan 036) ──
  // Phase 1 — Smart Idle Engine
  idleConfirmationEnabled: true,          // prompt before auto-pausing on idle (false = legacy hard-pause)
  companionIdleGraceMinutes: 5,           // how recent desktop-companion activity must be to suppress idle
  meetingDomains: [
    'meet.google.com', 'zoom.us', 'teams.microsoft.com', 'teams.live.com',
    'webex.com', 'app.webex.com', 'whereby.com', 'around.co'
  ],
  meetingIdleGraceMinutes: 60,            // max meeting duration suppressed before idle can fire anyway
  autoResumeOnReturn: true,               // auto-resume the paused focus when the user returns from idle
  // Phase 1 — Auto clock-in (#187)
  autoClockInEnabled: false,              // master toggle for auto clock-in
  autoClockInTrigger: 'chrome_open',      // 'chrome_open' | 'os_unlock'
  // Phase 2 — Auto-Focus heuristic engine
  autoFocusEnabled: true,                 // master enable for heuristic focus suggestions
  autoFocusConfidence: 'high',            // minimum confidence to surface: 'explicit' | 'high' | 'medium'
  // Phase 3 — Drift detection
  driftDetectionEnabled: true,
  driftThresholdMinutes: 3,               // time on unrelated tabs before prompting
  driftSnoozeMinutes: 5,                  // "just checking" snooze duration
  storage: {
    snapshotIntervalMinutes: 30,
    snapshotCap: 20,
    logsCap: 500,
    closedContextsCap: 500,
    intentHistoryCap: 500,
    focusHistoryCap: 200,
    parkedTabsCap: 200,
    parkedTabsWarnAt: 180,
    sugarBoxCap: 500,
    pendingTimeLogsCap: 5000,
    pendingTimeLogsWarnAt: 4000,
    archivedTasksColdAfterDays: 90
  }
};

export const PRIORITY_LEVELS = {
  critical: { label: '🔴 Critical', color: 'red', order: 0 },
  high:     { label: '🟠 High',     color: 'orange', order: 1 },
  medium:   { label: '🟡 Medium',   color: 'yellow', order: 2 },
  low:      { label: '🟢 Low',      color: 'green', order: 3 },
  none:     { label: '⚪ None',     color: 'grey', order: 4 }
};

export const BUILT_IN_CATEGORIES = {
  work:      { name: 'Work',      icon: '💼', builtIn: true, persistent: false, urlPatterns: [], rules: { autoDetect: false, promptOnOpen: false, trackTime: true, timerEnabled: true } },
  media:     { name: 'Media',     icon: '🎵', builtIn: true, persistent: false, urlPatterns: ['*://music.youtube.com/*', '*://open.spotify.com/*', '*://soundcloud.com/*', '*://podcasts.google.com/*', '*://podcasts.apple.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: false } },
  meeting:   { name: 'Meeting',   icon: '📹', builtIn: true, persistent: false, urlPatterns: ['*://meet.google.com/*', '*://zoom.us/*', '*://teams.microsoft.com/*', '*://app.webex.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: false } },
  reference: { name: 'Reference', icon: '📚', builtIn: true, persistent: false, urlPatterns: [], rules: { autoDetect: false, promptOnOpen: false, trackTime: true, timerEnabled: true } },
  messaging: { name: 'Messaging', icon: '💬', builtIn: true, persistent: true,  urlPatterns: ['*://web.whatsapp.com/*', '*://discord.com/*', '*://slack.com/*', '*://telegram.org/*', '*://messages.google.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: false } },
  email:     { name: 'Email',     icon: '📧', builtIn: true, persistent: true,  urlPatterns: ['*://mail.google.com/*', '*://outlook.live.com/*', '*://outlook.office365.com/*', '*://mail.yahoo.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: false } },
  learning:  { name: 'Learning',  icon: '🎓', builtIn: true, persistent: false, urlPatterns: ['*://udemy.com/*', '*://coursera.org/*', '*://edx.org/*', '*://stackoverflow.com/*', '*://github.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: true } },
  entertainment: { name: 'Entertainment', icon: '🎮', builtIn: true, persistent: false, urlPatterns: ['*://twitch.tv/*', '*://netflix.com/*', '*://hulu.com/*', '*://steamcommunity.com/*'], rules: { autoDetect: true, promptOnOpen: false, trackTime: true, timerEnabled: false } },
  unknown:   { name: 'Unknown',   icon: '❓', builtIn: true, persistent: false, urlPatterns: [], rules: { autoDetect: false, promptOnOpen: true, trackTime: true, timerEnabled: true } }
};

export const DEFAULT_FOCUS_ENGINE = {
  activeFocusId: null,
  items: {},
  history: []
};

// Shared task / focus funnel ordering. `roadblocked` is positioned between
// todo (2) and focus (3) so backward-motion checks treat resuming from
// roadblocked → focus as forward progress.
export const STAGE_ORDER = {
  unsorted: 0,
  backlog: 1,
  todo: 2,
  focus: 3,
  addressing: 4,
  resolved: 5,
  roadblocked: 2.5
};

export const RETENTION_ALARM = 'tabatha-data-retention';
export const DEFAULT_RETENTION_DAYS = 90;

export const COMPANION_WS_URL = 'ws://localhost:9147';
export const COMPANION_HEARTBEAT_MS = 30000;
export const COMPANION_RECONNECT_BASE_MS = 5000;
export const COMPANION_RECONNECT_MAX_MS = 30000;

// ── Checkpoint Progress Notes (Plan 025) ──
export const PROGRESS_VALUES = {
  none: 0,
  stuck: 0,
  little: 1,
  lot: 3,
  almost_done: 4
};

export const POPUP_TYPES = {
  FTE: 'FTE',
  WBP: 'WBP',
  COMBO: 'COMBO',
  CHECKPOINT: 'CHECKPOINT'
};
