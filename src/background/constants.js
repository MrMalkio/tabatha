// Tabatha background constants and defaults.

export const DEFAULT_SETTINGS = {
  globalTimerMinutes: 15,
  idleThresholdMinutes: 5,
  exportPath: 'Tabatha',
  autoExportEnabled: false,
  autoExportIntervalMinutes: 60
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
