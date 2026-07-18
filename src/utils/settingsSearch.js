// NB-08 — Settings fuzzy search.
// Pure module: the fuzzy matcher extracted from CommandPalette (behavior
// unchanged — CommandPalette now imports these), token-AND scoring for
// multi-word queries, and the hand-curated settings search index.
//
// Every entry id in SETTINGS_SEARCH_INDEX corresponds 1:1 to a
// data-search-id="..." anchor in src/settings/**/*.jsx (enforced by
// test/settingsSearch.test.js).

/**
 * Loose fuzzy match — substring, or in-order character subsequence.
 * Extracted verbatim from CommandPalette.
 */
export function fuzzyMatch(text, q) {
  if (!q) return true;
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  if (lower.includes(qLower)) return true;
  let qi = 0;
  for (let i = 0; i < lower.length && qi < qLower.length; i++) {
    if (lower[i] === qLower[qi]) qi++;
  }
  return qi === qLower.length;
}

/**
 * Rank a match: exact > prefix > substring > subsequence.
 * Extracted verbatim from CommandPalette.
 */
export function fuzzyScore(text, q) {
  if (!q) return 0;
  const lower = text.toLowerCase();
  const qLower = q.toLowerCase();
  if (lower === qLower) return 100;
  if (lower.startsWith(qLower)) return 90;
  if (lower.includes(qLower)) return 70;
  return 30;
}

/** Split a query into whitespace-separated tokens. */
export function tokenize(query) {
  return String(query || '').split(/\s+/).filter(Boolean);
}

/**
 * Token-AND match for multi-word queries: EVERY token must fuzzy-match the
 * text. Single-token queries behave exactly like fuzzyMatch.
 */
export function tokenAndMatch(text, query) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  return tokens.every(t => fuzzyMatch(text, t));
}

/**
 * Token-AND score: 0 unless every token matches; otherwise the mean of the
 * per-token fuzzyScores (so "desktop retention" ranks a row containing both
 * words above one that only subsequence-matches).
 */
export function tokenAndScore(text, query) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;
  let total = 0;
  for (const t of tokens) {
    if (!fuzzyMatch(text, t)) return 0;
    total += fuzzyScore(text, t);
  }
  return total / tokens.length;
}

/**
 * Score one index entry against a query. Each token must match SOMEWHERE in
 * the entry (label or any keyword — token-AND across the entry, token-OR
 * across its haystacks). Label matches outrank keyword matches slightly.
 * Returns 0 when any token misses everywhere.
 */
export function scoreIndexEntry(entry, query) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return 0;
  const keywords = entry.keywords || [];
  let total = 0;
  for (const t of tokens) {
    let best = 0;
    if (fuzzyMatch(entry.label, t)) best = fuzzyScore(entry.label, t) + 5; // label bonus
    for (const k of keywords) {
      if (fuzzyMatch(k, t)) best = Math.max(best, fuzzyScore(k, t));
    }
    if (best === 0) return 0; // AND semantics
    total += best;
  }
  let score = total / tokens.length;
  // Phrase bonus: a multi-word query that matches the label as one phrase
  // ("break reminder" → "Break reminder (min)") outranks entries that only
  // collect the tokens across scattered keywords.
  if (tokens.length > 1) {
    const phrase = tokens.join(' ');
    if (fuzzyMatch(entry.label, phrase)) {
      score = Math.max(score, fuzzyScore(entry.label, phrase) + 15);
    }
  }
  return score;
}

/**
 * Rank the settings index against a query. Returns up to `limit` entries,
 * best first. Empty/blank query returns [].
 */
export function searchSettings(query, index = SETTINGS_SEARCH_INDEX, limit = 10) {
  const q = String(query || '').trim();
  if (!q) return [];
  const scored = [];
  for (const entry of index) {
    const score = scoreIndexEntry(entry, q);
    if (score > 0) scored.push({ entry, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.entry);
}

/** Human label for a section id (from the index's own section entries). */
export function sectionLabelFor(sectionId) {
  const entry = SETTINGS_SEARCH_INDEX.find(e => e.id === `section-${sectionId}`);
  return entry ? entry.label : sectionId;
}

// ─────────────────────────────────────────────────────────────────────────
// Hand-curated index. `id` maps to a data-search-id anchor in the settings
// page; `section` is the SECTIONS registry id passed to setActiveSection.
// ─────────────────────────────────────────────────────────────────────────
export const SETTINGS_SEARCH_INDEX = [
  // ── Sections ──
  { id: 'section-appearance', section: 'appearance', label: 'Appearance', keywords: ['theme', 'look', 'colors', 'profile', 'toolbar'] },
  { id: 'section-clock', section: 'clock', label: 'FlipClock', keywords: ['clock', 'countdown', 'time display', 'flip'] },
  { id: 'section-focus', section: 'focus', label: 'Focus Engine', keywords: ['focus', 'timer', 'funnel', 'stages'] },
  { id: 'section-lifecycle', section: 'lifecycle', label: 'Focus Lifecycle', keywords: ['idle', 'auto-pause', 'drift', 'suggestions', 'auto focus'] },
  { id: 'section-intent', section: 'intent', label: 'Intent-Popup', keywords: ['gatekeeper', 'inpop', 'inbar', 'overlay', 'intent bar'] },
  { id: 'section-urlrules', section: 'urlrules', label: 'URL Rules', keywords: ['url', 'rules', 'domain groups', 'auto apply', 'intent changelog'] },
  { id: 'section-blocked', section: 'blocked', label: 'Blocked Sites', keywords: ['block', 'blocklist', 'blockgate', 'distraction', 'gate'] },
  { id: 'section-time', section: 'time', label: 'Time Tracking', keywords: ['tracking', 'idle', 'retention', 'timer'] },
  { id: 'section-export', section: 'export', label: 'Export & Agents', keywords: ['export', 'markdown', 'backup', 'download', 'agents'] },
  { id: 'section-workclock', section: 'workclock', label: 'Work Clock', keywords: ['clock in', 'clock out', 'shift', 'break', 'reminder'] },
  { id: 'section-followthrough', section: 'followthrough', label: 'Follow-through', keywords: ['checkpoint', 'welcome back', 'popup', 'progress notes'] },
  { id: 'section-tags', section: 'tags', label: 'Tags & Associations', keywords: ['tags', 'realm', 'client', 'project', 'association'] },
  { id: 'section-parked', section: 'parked', label: 'Parked Tabs', keywords: ['parked', 'saved tabs', 'later', 'park'] },
  { id: 'section-sugarbox', section: 'sugarbox', label: 'Sugar Box', keywords: ['rewards', 'distraction', 'treats', 'saved for later'] },
  { id: 'section-stats', section: 'stats', label: 'Stats & History', keywords: ['statistics', 'history', 'decisions', 'intent popup stats'] },
  { id: 'section-sync', section: 'sync', label: 'Sync & Account', keywords: ['account', 'login', 'sign in', 'cloud', 'supabase', 'organization', 'team', 'invite', 'token'] },
  { id: 'section-privacy', section: 'privacy', label: 'Privacy & Capture', keywords: ['privacy', 'screenshot', 'keystroke', 'capture', 'incognito'] },
  { id: 'section-webhooks', section: 'webhooks', label: 'Webhooks', keywords: ['webhook', 'zapier', 'make', 'events', 'endpoint'] },
  { id: 'section-desktop', section: 'desktop', label: 'Desktop Activity', keywords: ['companion', 'desktop', 'activity', 'timeline', 'switches'] },
  { id: 'section-integrations', section: 'integrations', label: 'Integrations', keywords: ['asana', 'supabase', 'companion', 'external', 'services'] },
  { id: 'section-developer', section: 'developer', label: 'Developer', keywords: ['debug', 'logs', 'developer', 'diagnostics'] },
  { id: 'section-about', section: 'about', label: 'About', keywords: ['version', 'changelog', 'about', 'flux'] },

  // ── Appearance ──
  { id: 'appearance-theme', section: 'appearance', label: 'Theme', keywords: ['theme', 'dark mode', 'color scheme', 'appearance', 'pop art', 'midnight'] },
  { id: 'appearance-toolbar-click', section: 'appearance', label: 'Toolbar Icon Click', keywords: ['toolbar', 'icon', 'side panel', 'popup', 'click action'] },
  { id: 'appearance-install-id', section: 'appearance', label: 'Install ID', keywords: ['install', 'identifier', 'browser profile', 'debugging'] },
  { id: 'appearance-profile-name', section: 'appearance', label: 'Profile Name', keywords: ['profile', 'machine name', 'browser profile', 'install name'] },
  { id: 'appearance-classification', section: 'appearance', label: 'Classification', keywords: ['classification', 'personal', 'business', 'professional', 'work', 'realm'] },
  { id: 'appearance-user-name', section: 'appearance', label: 'Your Name', keywords: ['name', 'greeting', 'user'] },
  { id: 'appearance-intent-bridge', section: 'appearance', label: 'Auto-Queue Mode', keywords: ['intent bridge', 'auto queue', 'dedup', 'focus queue'] },

  // ── FlipClock ──
  { id: 'clock-show-clock', section: 'clock', label: 'Show Clock', keywords: ['clock', 'display', 'homepage'] },
  { id: 'clock-show-countdown', section: 'clock', label: 'Show Countdown', keywords: ['countdown', 'timer', 'display'] },
  { id: 'clock-time-format', section: 'clock', label: 'Time Format', keywords: ['12 hour', '24 hour', 'format', 'am pm'] },
  { id: 'clock-show-seconds', section: 'clock', label: 'Show Seconds', keywords: ['seconds', 'clock'] },
  { id: 'clock-scale', section: 'clock', label: 'Clock Scale', keywords: ['size', 'scale', 'zoom'] },
  { id: 'clock-text-color', section: 'clock', label: 'Clock Text Color', keywords: ['color', 'digits', 'font'] },
  { id: 'clock-countdown-mode', section: 'clock', label: 'Countdown Mode', keywords: ['end of day', 'custom time', 'target', 'countdown'] },

  // ── Focus Engine ──
  { id: 'focus-default-timer', section: 'focus', label: 'Default Timer (minutes)', keywords: ['focus timer', 'duration', 'minutes', 'default'] },
  { id: 'focus-auto-associate', section: 'focus', label: 'Auto-associate tabs', keywords: ['associate', 'tabs', 'auto assign', 'inherit'] },
  { id: 'focus-drift-notification', section: 'focus', label: 'Drift notification', keywords: ['drift', 'notification', 'stray', 'reminder'] },

  // ── Focus Lifecycle ──
  { id: 'lifecycle-auto-pause', section: 'lifecycle', label: 'Auto-pause on idle', keywords: ['idle', 'pause', 'auto pause', 'away'] },
  { id: 'lifecycle-idle-threshold', section: 'lifecycle', label: 'Idle threshold (minutes)', keywords: ['idle', 'threshold', 'minutes'] },
  { id: 'lifecycle-companion-grace', section: 'lifecycle', label: 'Companion grace (minutes)', keywords: ['companion', 'grace', 'idle suppression', 'desktop'] },
  { id: 'lifecycle-auto-resume', section: 'lifecycle', label: 'Auto-resume on return', keywords: ['resume', 'return', 'unpause'] },
  { id: 'lifecycle-meeting-grace', section: 'lifecycle', label: 'Meeting grace (minutes)', keywords: ['meeting', 'video call', 'zoom', 'grace'] },
  { id: 'lifecycle-meeting-domains', section: 'lifecycle', label: 'Meeting domains', keywords: ['meeting', 'zoom', 'google meet', 'teams', 'video call', 'suppress idle'] },
  { id: 'lifecycle-auto-focus', section: 'lifecycle', label: 'Auto-focus suggestions', keywords: ['suggestions', 'auto focus', 'chips', 'suggest'] },
  { id: 'lifecycle-suggestion-confidence', section: 'lifecycle', label: 'Suggestion confidence', keywords: ['confidence', 'suggestions', 'explicit', 'high', 'medium'] },
  { id: 'lifecycle-drift-detection', section: 'lifecycle', label: 'Drift detection', keywords: ['drift', 'off task', 'detection', 'snooze'] },
  { id: 'lifecycle-auto-clock-in', section: 'lifecycle', label: 'Auto clock-in', keywords: ['clock in', 'automatic', 'os unlock', 'chrome open', 'trigger'] },

  // ── Intent-Popup ──
  { id: 'intent-gatekeeper-enabled', section: 'intent', label: 'Enable Gatekeeper overlay', keywords: ['gatekeeper', 'overlay', 'popup', 'inpop', 'intent prompt'] },
  { id: 'intent-side-quest', section: 'intent', label: 'Side Quest default (min)', keywords: ['side quest', 'duration', 'minutes'] },
  { id: 'intent-inherit-count', section: 'intent', label: 'Inherit items shown', keywords: ['inherit', 'recent intents', 'count'] },
  { id: 'intent-strict-mode', section: 'intent', label: 'Strict mode', keywords: ['strict', 'blur', 'block page', 'enforce'] },
  { id: 'intent-blur-strength', section: 'intent', label: 'Background blur strength', keywords: ['blur', 'background', 'gatekeeper'] },
  { id: 'intent-inbar-enabled', section: 'intent', label: 'Show Intent Bar on pages', keywords: ['inbar', 'intent bar', 'status bar', 'nub'] },
  { id: 'intent-inbar-position', section: 'intent', label: 'Intent Bar position', keywords: ['position', 'top', 'bottom', 'inbar'] },
  { id: 'intent-skipped-domains', section: 'intent', label: 'Skipped Domains', keywords: ['skip', 'domains', 'no prompt'] },
  { id: 'intent-presets', section: 'intent', label: 'Persistent Presets', keywords: ['presets', 'pinned intents', 'common', 'persistent'] },
  { id: 'intent-recent-count', section: 'intent', label: 'Recent intents shown', keywords: ['recent', 'shortcuts', 'history count'] },

  // ── Blocked Sites ──
  { id: 'blocked-add-site', section: 'blocked', label: 'Add blocked site', keywords: ['block', 'add domain', 'wildcard', 'blockgate'] },
  { id: 'blocked-list', section: 'blocked', label: 'Currently Blocked', keywords: ['blocked sites', 'unblock', 'list'] },

  // ── Time Tracking ──
  { id: 'time-idle-threshold', section: 'time', label: 'Idle threshold (minutes)', keywords: ['idle', 'tracking', 'threshold'] },
  { id: 'time-context-timer', section: 'time', label: 'Context timer (minutes)', keywords: ['context', 'timer', 'tracking'] },
  { id: 'time-retention', section: 'time', label: 'Desktop data retention (days)', keywords: ['retention', 'prune', 'delete', 'days', 'tracking', 'auto delete'] },

  // ── Export & Agents ──
  { id: 'export-manual', section: 'export', label: 'Export markdown now', keywords: ['markdown', 'download', 'export', 'snapshot'] },
  { id: 'export-backup', section: 'export', label: 'Backup all data (JSON)', keywords: ['backup', 'json', 'snapshot', 'restore', 'upgrade'] },
  { id: 'export-auto', section: 'export', label: 'Auto-export', keywords: ['automatic', 'export', 'alarm', 'scheduled'] },
  { id: 'export-interval', section: 'export', label: 'Export interval (min)', keywords: ['interval', 'schedule', 'export'] },
  { id: 'export-path', section: 'export', label: 'Export path', keywords: ['path', 'folder', 'downloads', 'location'] },

  // ── Work Clock ──
  { id: 'workclock-auto-clockin', section: 'workclock', label: 'Auto clock-in on launch', keywords: ['clock in', 'automatic', 'launch', 'browsing'] },
  { id: 'workclock-break-reminder', section: 'workclock', label: 'Break reminder (min)', keywords: ['break', 'reminder', 'notification', 'rest'] },
  { id: 'workclock-history', section: 'workclock', label: 'Save clock history', keywords: ['history', 'sessions', 'log', 'shifts'] },

  // ── Follow-through ──
  { id: 'followthrough-welcomeback-idle', section: 'followthrough', label: 'Welcome Back min idle (minutes)', keywords: ['welcome back', 'idle', 'popup'] },
  { id: 'followthrough-welcomeback-break', section: 'followthrough', label: 'Show after auto-break', keywords: ['welcome back', 'break', 'popup', 'interruptions'] },
  { id: 'followthrough-checkpoint-enabled', section: 'followthrough', label: 'Enable checkpoint prompts', keywords: ['checkpoint', 'notes', 'prompts', 'reminder', 'progress'] },
  { id: 'followthrough-checkpoint-interval', section: 'followthrough', label: 'Checkpoint prompt interval', keywords: ['checkpoint', 'interval', 'fraction'] },
  { id: 'followthrough-checkpoint-stale', section: 'followthrough', label: 'Staleness threshold (min)', keywords: ['stale', 'checkpoint', 'threshold', 'inbar indicator'] },
  { id: 'followthrough-asana-cpn', section: 'followthrough', label: 'Auto-post CPNs to Asana', keywords: ['asana', 'checkpoint', 'comments', 'auto post'] },

  // ── Sync & Account ──
  { id: 'sync-signin', section: 'sync', label: 'Sign in', keywords: ['login', 'sign in', 'google', 'magic link', 'register', 'password', 'email', 'account'] },
  { id: 'sync-status', section: 'sync', label: 'Sync Status', keywords: ['sync now', 'diagnostics', 'last sync', 'repull', 'registry'] },
  { id: 'sync-organizations', section: 'sync', label: 'Organizations', keywords: ['org', 'create organization', 'owner', 'company'] },
  { id: 'sync-teams', section: 'sync', label: 'Teams', keywords: ['team', 'members', 'team activity'] },
  { id: 'sync-invite-token', section: 'sync', label: 'Join via Invite Token', keywords: ['invite', 'token', 'join', 'redeem', 'organization'] },
  { id: 'sync-signout', section: 'sync', label: 'Sign Out', keywords: ['logout', 'sign out', 'force reset', 'auth'] },

  // ── Privacy & Capture ──
  { id: 'privacy-screenshot', section: 'privacy', label: 'Screenshot capture', keywords: ['screenshot', 'capture', 'privacy'] },
  { id: 'privacy-keystrokes', section: 'privacy', label: 'Keystroke analytics', keywords: ['keystroke', 'typing', 'analytics', 'privacy'] },

  // ── Webhooks ──
  { id: 'webhooks-enabled', section: 'webhooks', label: 'Enable Webhooks', keywords: ['webhook', 'enable', 'notifications'] },
  { id: 'webhooks-url', section: 'webhooks', label: 'Webhook URL', keywords: ['url', 'endpoint', 'zapier', 'make'] },
  { id: 'webhooks-secret', section: 'webhooks', label: 'Webhook Secret', keywords: ['secret', 'signature', 'verification', 'token'] },
  { id: 'webhooks-events', section: 'webhooks', label: 'Webhook events & intervals', keywords: ['events', 'intervals', 'real-time', 'batch'] },

  // ── Desktop Activity ──
  { id: 'desktop-day-start', section: 'desktop', label: 'Day start time', keywords: ['day start', 'timeline', 'overnight', 'activity bar'] },
  { id: 'desktop-min-duration', section: 'desktop', label: 'Minimum switch duration', keywords: ['minimum', 'duration', 'filter', 'switches', 'noise'] },
  { id: 'desktop-today-data', section: 'desktop', label: "Today's data cleanup", keywords: ['trim', 'delete range', 'hide range', 'clear', 'activity'] },

  // ── Integrations ──
  { id: 'integrations-asana', section: 'integrations', label: 'Asana integration', keywords: ['asana', 'widget', 'time entries', 'project management'] },
  { id: 'integrations-supabase', section: 'integrations', label: 'Cloud Sync', keywords: ['supabase', 'cloud', 'sync', 'account', 'connected'] },
  { id: 'integrations-companion', section: 'integrations', label: 'Desktop Companion', keywords: ['companion', 'desktop', 'tracker', 'apps'] },

  // ── Developer ──
  { id: 'developer-debug-mode', section: 'developer', label: 'Debug Mode', keywords: ['debug', 'diagnostic', 'developer'] },
  { id: 'developer-event-log', section: 'developer', label: 'Event Log', keywords: ['logs', 'errors', 'console', 'events'] },

  // ── About ──
  { id: 'about-version', section: 'about', label: 'Version', keywords: ['version', 'build', 'release'] },
  { id: 'about-changelog', section: 'about', label: 'Changelog', keywords: ['changelog', "what's new", 'releases', 'history'] },
];
