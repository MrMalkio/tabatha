// Tabatha — Service Worker (background.js)
// Core orchestrator for tab tracking, context/intent, priority, locking, 
// groups, categories, time tracking, and markdown export.

// ============================================================
// CONSTANTS & DEFAULTS
// ============================================================

const DEFAULT_SETTINGS = {
  globalTimerMinutes: 15,
  idleThresholdMinutes: 5,
  exportPath: 'Tabatha',
  autoExportEnabled: false,
  autoExportIntervalMinutes: 60
};

const PRIORITY_LEVELS = {
  critical: { label: '🔴 Critical', color: 'red', order: 0 },
  high:     { label: '🟠 High',     color: 'orange', order: 1 },
  medium:   { label: '🟡 Medium',   color: 'yellow', order: 2 },
  low:      { label: '🟢 Low',      color: 'green', order: 3 },
  none:     { label: '⚪ None',     color: 'grey', order: 4 }
};

const BUILT_IN_CATEGORIES = {
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

// ============================================================
// STORAGE HELPERS
// ============================================================

async function getStorage(keys) {
  return chrome.storage.local.get(keys);
}

async function setStorage(data) {
  return chrome.storage.local.set(data);
}

async function getSettings() {
  const { settings } = await getStorage('settings');
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function getTabData() {
  const { tabs } = await getStorage('tabs');
  return tabs || {};
}

async function setTabData(tabs) {
  return setStorage({ tabs });
}

async function getSubGroups() {
  const { subGroups } = await getStorage('subGroups');
  return subGroups || {};
}

async function getCategories() {
  const { categories } = await getStorage('categories');
  return { ...BUILT_IN_CATEGORIES, ...categories };
}

async function getClosedContexts() {
  const { closedContexts } = await getStorage('closedContexts');
  return closedContexts || [];
}

async function getSessions() {
  const { sessions } = await getStorage('sessions');
  return sessions || [];
}

async function getTimeTracking() {
  const { timeTracking } = await getStorage('timeTracking');
  return timeTracking || { byTab: {}, byGroup: {}, bySubGroup: {}, byCategory: {}, byProject: {} };
}

// ============================================================
// TAB CATEGORY DETECTION
// ============================================================

function detectCategory(url, audible, categories) {
  if (!url) return 'unknown';
  
  for (const [catId, cat] of Object.entries(categories)) {
    if (catId === 'unknown' || catId === 'work') continue;
    if (!cat.rules?.autoDetect) continue;
    
    for (const pattern of cat.urlPatterns || []) {
      const regex = patternToRegex(pattern);
      if (regex && regex.test(url)) return catId;
    }
  }
  
  // Fallback: if tab is audible and matches video URLs, classify as media
  if (audible && url.match(/youtube\.com\/watch/)) return 'media';
  
  return 'unknown';
}

function patternToRegex(pattern) {
  try {
    const escaped = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '.*');
    return new RegExp('^' + escaped + '$');
  } catch {
    return null;
  }
}

// ============================================================
// TAB LIFECYCLE TRACKING
// ============================================================

chrome.tabs.onCreated.addListener(async (tab) => {
  const tabs = await getTabData();
  const categories = await getCategories();
  const settings = await getSettings();
  
  const isFromOpener = !!tab.openerTabId;
  let inheritedContext = null;
  let inheritedIntent = null;
  let inheritedSubGroupId = null;
  let parentCategory = null;
  
  // If opened from a parent tab, inherit context
  if (isFromOpener && tabs[tab.openerTabId]) {
    const parent = tabs[tab.openerTabId];
    inheritedContext = parent.context;
    inheritedIntent = parent.intent;
    inheritedSubGroupId = parent.subGroupId;
    parentCategory = parent.category;
  }
  
  const detectedCategory = detectCategory(tab.url || tab.pendingUrl || '', false, categories);
  
  tabs[tab.id] = {
    url: tab.url || tab.pendingUrl || '',
    title: tab.title || 'New Tab',
    openedAt: new Date().toISOString(),
    lastActive: new Date().toISOString(),
    activeTime: 0,
    context: inheritedContext,
    intent: inheritedIntent,
    priority: 'none',
    locked: false,
    urlLocked: false,
    urlLockScope: null,
    groupId: tab.groupId !== chrome.tabGroups?.TAB_GROUP_ID_NONE ? tab.groupId : null,
    subGroupId: inheritedSubGroupId,
    category: parentCategory || detectedCategory,
    parentTabId: tab.openerTabId || null,
    timerOverrideMinutes: null,
    ignored: false,
    persistent: false
  };
  
  await setTabData(tabs);
  
  // Set context timer
  const timerMinutes = settings.globalTimerMinutes;
  if (timerMinutes > 0) {
    chrome.alarms.create(`context-timer-${tab.id}`, { delayInMinutes: timerMinutes });
  }
  
  // If this is a scratch-opened tab (no opener, no inherited context), notify sidebar to prompt
  if (!isFromOpener && detectedCategory === 'unknown') {
    broadcastMessage({ type: 'PROMPT_PURPOSE', tabId: tab.id });
  }
  
  broadcastMessage({ type: 'TAB_CREATED', tabId: tab.id, tabData: tabs[tab.id] });
});

chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  const tabs = await getTabData();
  const tabData = tabs[tabId];
  
  if (tabData) {
    // Save to closed contexts if it had context
    if (tabData.context || tabData.intent) {
      const closedContexts = await getClosedContexts();
      closedContexts.unshift({
        url: tabData.url,
        title: tabData.title,
        context: tabData.context,
        intent: tabData.intent,
        priority: tabData.priority,
        closedAt: new Date().toISOString(),
        activeTime: tabData.activeTime,
        groupName: null, // Will be resolved from group data
        subGroupId: tabData.subGroupId,
        category: tabData.category
      });
      // Keep last 500 closed contexts
      await setStorage({ closedContexts: closedContexts.slice(0, 500) });
    }
    
    delete tabs[tabId];
    await setTabData(tabs);
  }
  
  // Clear alarm
  chrome.alarms.clear(`context-timer-${tabId}`);
  
  broadcastMessage({ type: 'TAB_REMOVED', tabId });
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const tabs = await getTabData();
  if (!tabs[tabId]) return;
  
  if (changeInfo.url) {
    tabs[tabId].url = changeInfo.url;
    // Re-detect category on URL change
    const categories = await getCategories();
    const newCat = detectCategory(changeInfo.url, tab.audible, categories);
    if (tabs[tabId].category === 'unknown') {
      tabs[tabId].category = newCat;
    }
  }
  if (changeInfo.title) tabs[tabId].title = changeInfo.title;
  if (changeInfo.audible !== undefined) {
    const categories = await getCategories();
    const detected = detectCategory(tabs[tabId].url, changeInfo.audible, categories);
    if (detected !== 'unknown' && tabs[tabId].category === 'unknown') {
      tabs[tabId].category = detected;
    }
  }
  
  await setTabData(tabs);
  broadcastMessage({ type: 'TAB_UPDATED', tabId, tabData: tabs[tabId] });
});

// ============================================================
// TIME TRACKING
// ============================================================

let activeTabId = null;
let activeTabStart = null;

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const now = Date.now();
  
  // Record time on previous active tab
  if (activeTabId !== null && activeTabStart !== null) {
    await recordActiveTime(activeTabId, now - activeTabStart);
  }
  
  activeTabId = activeInfo.tabId;
  activeTabStart = now;
  
  const tabs = await getTabData();
  if (tabs[activeTabId]) {
    tabs[activeTabId].lastActive = new Date().toISOString();
    await setTabData(tabs);
  }
  
  broadcastMessage({ type: 'TAB_ACTIVATED', tabId: activeTabId });
});

async function recordActiveTime(tabId, durationMs) {
  if (durationMs < 0 || durationMs > 3600000) return; // Sanity: max 1 hour chunk
  
  const tabs = await getTabData();
  if (tabs[tabId]) {
    tabs[tabId].activeTime = (tabs[tabId].activeTime || 0) + durationMs;
    await setTabData(tabs);
  }
  
  // Update aggregated time tracking
  const timeTracking = await getTimeTracking();
  const tabData = tabs[tabId];
  
  if (tabData) {
    timeTracking.byTab[tabId] = (timeTracking.byTab[tabId] || 0) + durationMs;
    
    if (tabData.groupId) {
      timeTracking.byGroup[tabData.groupId] = (timeTracking.byGroup[tabData.groupId] || 0) + durationMs;
    }
    if (tabData.subGroupId) {
      timeTracking.bySubGroup[tabData.subGroupId] = (timeTracking.bySubGroup[tabData.subGroupId] || 0) + durationMs;
    }
    if (tabData.category) {
      timeTracking.byCategory[tabData.category] = (timeTracking.byCategory[tabData.category] || 0) + durationMs;
    }
  }
  
  await setStorage({ timeTracking });
}

// ============================================================
// IDLE / OFF-CHROME CONTEXT
// ============================================================

let userIdleSince = null;

chrome.idle.onStateChanged.addListener(async (newState) => {
  if (newState === 'idle' || newState === 'locked') {
    // User left Chrome
    if (activeTabId !== null && activeTabStart !== null) {
      await recordActiveTime(activeTabId, Date.now() - activeTabStart);
      activeTabStart = null;
    }
    userIdleSince = new Date().toISOString();
  } else if (newState === 'active') {
    // User returned
    activeTabStart = Date.now();
    
    if (userIdleSince) {
      const idleDuration = Date.now() - new Date(userIdleSince).getTime();
      const settings = await getSettings();
      
      if (idleDuration > settings.idleThresholdMinutes * 60 * 1000) {
        broadcastMessage({
          type: 'OFF_CHROME_RETURN',
          idleSince: userIdleSince,
          idleDurationMs: idleDuration
        });

        
        // Notify user to welcome them back (clicking opens sidebar)
        chrome.notifications.create('welcome-back', {
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Welcome Back!',
            message: `You were away for ${Math.round(idleDuration / 60000)}m. Click to log your offline context.`,
            requireInteraction: true
        });
      }
      userIdleSince = null;
    }
  }
});

chrome.notifications.onClicked.addListener((notificationId) => {
    if (notificationId === 'welcome-back') {
        // Open sidebar
        chrome.sidePanel.setOptions({ enabled: true });
        chrome.sidePanel.open({ windowId: activeTabId ? undefined : chrome.windows.WINDOW_ID_CURRENT })
            .catch(() => { 
                // Fallback if open() fails (needs user gesture - notification click counts but sometimes tricky)
                // Actually sidePanel.open() is only available in Chrome 114+ and needs user gesture. 
                // Notification click IS a user gesture.
            });
    }
});

// Set idle detection interval
chrome.idle.setDetectionInterval(60); // 1 minute granularity

// ============================================================
// CONTEXT TIMER / ALARMS
// ============================================================

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name.startsWith('context-timer-')) {
    const tabId = parseInt(alarm.name.replace('context-timer-', ''));
    const tabs = await getTabData();
    const tabData = tabs[tabId];
    
    if (tabData && !tabData.ignored && !tabData.context) {
      // Tab has been open for threshold without context — prompt
      broadcastMessage({
        type: 'CONTEXT_REMINDER',
        tabId,
        tabData
      });
      
      // Also show a notification
      chrome.notifications.create(`context-${tabId}`, {
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Tabatha — Context Needed',
        message: `"${tabData.title}" has been open for a while. What are you working on?`
      });
    } else if (tabData && tabData.context) {
      // Tab has context — send reinforcement reminder
      const settings = await getSettings();
      const timerMinutes = tabData.timerOverrideMinutes || settings.globalTimerMinutes;
      
      broadcastMessage({
        type: 'INTENT_REINFORCEMENT',
        tabId,
        tabData
      });
      
      // Re-arm timer
      chrome.alarms.create(`context-timer-${tabId}`, { delayInMinutes: timerMinutes });
    }
  }
  
  if (alarm.name === 'auto-export') {
    await exportMarkdown();
  }
  
  if (alarm.name === 'session-snapshot') {
    await saveSessionSnapshot();
  }
  
  if (alarm.name === 'pomodoro-timer') {
      // Notify user
      chrome.notifications.create('pomodoro-done', {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: 'Tabatha — Timer Complete!',
          message: 'Time is up! Take a break or refocus.',
          requireInteraction: true
      });
      broadcastMessage({ type: 'POMODORO_COMPLETE' });
  }
});

// ============================================================
// URL LOCK — NAVIGATION INTERCEPTION
// ============================================================

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only care about main frame
  if (details.frameId !== 0) return;
  
  const tabs = await getTabData();
  const tabData = tabs[details.tabId];
  
  if (!tabData || !tabData.urlLocked) return;
  
  const currentBase = getUrlBase(tabData.urlLockScope || tabData.url);
  const newBase = getUrlBase(details.url);
  
  if (currentBase && newBase && currentBase !== newBase) {
    // URL is changing on a locked tab — block and open in new tab
    try {
      // We can't truly cancel in MV3 webNavigation, so we'll navigate back
      // and open the new URL in a new tab
      chrome.tabs.update(details.tabId, { url: tabData.urlLockScope || tabData.url });
      
      const newTab = await chrome.tabs.create({
        url: details.url,
        openerTabId: details.tabId,
        active: true
      });
      
      // Prompt for purpose of new tab
      setTimeout(() => {
        broadcastMessage({
          type: 'PROMPT_PURPOSE',
          tabId: newTab.id,
          reason: 'url_lock_redirect',
          fromTabId: details.tabId,
          fromContext: tabData.context
        });
      }, 500);
    } catch (e) {
      console.error('Tabatha: URL lock interception error', e);
    }
  }
});

function getUrlBase(url) {
  try {
    const u = new URL(url);
    return u.origin + u.pathname;
  } catch {
    return null;
  }
}

// ============================================================
// TAB LOCKING — CLOSE PROTECTION
// ============================================================

// We can't directly prevent tab close in MV3, so we use a different approach:
// When a locked tab is about to close, we show a warning in the sidebar.
// The actual multi-step close is enforced through the sidebar UI.
// The service worker tracks pending close confirmations.

const pendingCloseConfirmations = new Map();

async function requestTabClose(tabId) {
  const tabs = await getTabData();
  const tabData = tabs[tabId];
  
  if (!tabData) {
    await chrome.tabs.remove(tabId);
    return { closed: true };
  }
  
  if (tabData.locked) {
    if (pendingCloseConfirmations.has(tabId)) {
      // Second confirmation — actually close
      pendingCloseConfirmations.delete(tabId);
      await chrome.tabs.remove(tabId);
      return { closed: true };
    } else {
      // First attempt — request confirmation
      pendingCloseConfirmations.set(tabId, Date.now());
      return { closed: false, needsConfirmation: true, tabData };
    }
  }
  
  await chrome.tabs.remove(tabId);
  return { closed: true };
}

// ============================================================
// CHROME TAB GROUP INTEGRATION
// ============================================================

async function createOrUpdateGroup(tabIds, groupName, priority) {
  const color = PRIORITY_LEVELS[priority]?.color || 'grey';
  
  const groupId = await chrome.tabs.group({ tabIds });
  await chrome.tabGroups.update(groupId, {
    title: groupName,
    color,
    collapsed: false
  });
  
  // Update tab data with group ID
  const tabs = await getTabData();
  for (const tabId of tabIds) {
    if (tabs[tabId]) {
      tabs[tabId].groupId = groupId;
    }
  }
  await setTabData(tabs);
  
  return groupId;
}

// ============================================================
// SUB-GROUPS (Tabatha hierarchy beyond Chrome flat groups)
// ============================================================

async function createSubGroup(name, chromeGroupIds = [], projectId = null, settings = {}) {
  const subGroups = await getSubGroups();
  const id = `sg_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  
  subGroups[id] = {
    name,
    projectId,
    chromeGroupIds,
    settings: {
      timersEnabled: true,
      autoContext: true,
      lockingEnabled: true,
      ...settings
    }
  };
  
  await setStorage({ subGroups });
  return id;
}

// ============================================================
// CUSTOM CATEGORIES
// ============================================================

async function createCategory(id, categoryData) {
  const categories = await getCategories();
  categories[id] = {
    builtIn: false,
    ...categoryData
  };
  await setStorage({ categories });
  return categories;
}

async function cloneCategory(sourceId, newId, overrides = {}) {
  const categories = await getCategories();
  const source = categories[sourceId];
  if (!source) return null;
  
  const cloned = {
    ...JSON.parse(JSON.stringify(source)),
    builtIn: false,
    clonedFrom: sourceId,
    name: overrides.name || `${source.name} (Copy)`,
    ...overrides
  };
  
  categories[newId] = cloned;
  await setStorage({ categories });
  return categories;
}

// ============================================================
// BULK OPERATIONS
// ============================================================

async function bulkCloseTabs(tabIds, sharedContext, sharedIntent) {
  const tabs = await getTabData();
  const closedContexts = await getClosedContexts();
  
  for (const tabId of tabIds) {
    const tabData = tabs[tabId];
    if (tabData) {
      closedContexts.unshift({
        url: tabData.url,
        title: tabData.title,
        context: sharedContext || tabData.context,
        intent: sharedIntent || tabData.intent,
        priority: tabData.priority,
        closedAt: new Date().toISOString(),
        activeTime: tabData.activeTime,
        groupName: null,
        subGroupId: tabData.subGroupId,
        category: tabData.category
      });
    }
  }
  
  await setStorage({ closedContexts: closedContexts.slice(0, 500) });
  
  // Remove non-locked tabs, collect locked ones for confirmation
  const lockedTabs = [];
  const closableTabs = [];
  
  for (const tabId of tabIds) {
    if (tabs[tabId]?.locked) {
      lockedTabs.push(tabId);
    } else {
      closableTabs.push(tabId);
    }
  }
  
  if (closableTabs.length > 0) {
    await chrome.tabs.remove(closableTabs);
  }
  
  return { closed: closableTabs, needsConfirmation: lockedTabs };
}

// ============================================================
// "RETURN TO FLOW" — SESSION RECALL
// ============================================================

async function getFlowRecallData() {
  const closedContexts = await getClosedContexts();
  const subGroups = await getSubGroups();
  
  // Group closed contexts by sub-group or context
  const flows = {};
  for (const ctx of closedContexts) {
    const key = ctx.subGroupId || ctx.context || 'ungrouped';
    if (!flows[key]) {
      flows[key] = {
        context: ctx.context,
        intent: ctx.intent,
        subGroupId: ctx.subGroupId,
        subGroupName: ctx.subGroupId ? subGroups[ctx.subGroupId]?.name : null,
        tabs: []
      };
    }
    flows[key].tabs.push(ctx);
  }
  
  return flows;
}

async function reopenFlow(flowKey, newSessionIntent) {
  const flows = await getFlowRecallData();
  const flow = flows[flowKey];
  if (!flow) return;
  
  const tabIds = [];
  for (const ctx of flow.tabs) {
    if (ctx.url) {
      const tab = await chrome.tabs.create({ url: ctx.url, active: false });
      tabIds.push(tab.id);
      
      // Restore context on the new tab
      const tabs = await getTabData();
      if (tabs[tab.id]) {
        tabs[tab.id].context = ctx.context;
        tabs[tab.id].intent = newSessionIntent || ctx.intent;
        tabs[tab.id].priority = ctx.priority;
        tabs[tab.id].category = ctx.category;
        await setTabData(tabs);
      }
    }
  }
  
  return tabIds;
}

// ============================================================
// SESSION SNAPSHOTS
// ============================================================

async function saveSessionSnapshot() {
  const tabs = await getTabData();
  const sessions = await getSessions();
  
  const snapshot = {
    snapshotAt: new Date().toISOString(),
    tabCount: Object.keys(tabs).length,
    tabs: { ...tabs }
  };
  
  // Keep last 50 snapshots
  sessions.unshift(snapshot);
  await setStorage({ sessions: sessions.slice(0, 50) });
}

// Save a snapshot every 5 minutes
chrome.alarms.create('session-snapshot', { periodInMinutes: 5 });

// ============================================================
// MARKDOWN EXPORT
// ============================================================

async function exportMarkdown() {
  const tabs = await getTabData();
  const subGroups = await getSubGroups();
  const categories = await getCategories();
  const closedContexts = await getClosedContexts();
  const timeTracking = await getTimeTracking();
  const settings = await getSettings();
  
  let md = `# Tabatha Context — ${new Date().toLocaleString()}\n\n`;
  md += `> Auto-generated by Tabatha. Designed for AI agent consumption.\n\n`;
  
  // Active tabs by group
  md += `## Active Tabs (${Object.keys(tabs).length})\n\n`;
  
  const grouped = {};
  for (const [tabId, tab] of Object.entries(tabs)) {
    const key = tab.subGroupId || tab.groupId || 'ungrouped';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({ tabId, ...tab });
  }
  
  for (const [groupKey, groupTabs] of Object.entries(grouped)) {
    const groupName = subGroups[groupKey]?.name || `Group ${groupKey}`;
    md += `### ${groupKey === 'ungrouped' ? 'Ungrouped' : groupName}\n\n`;
    
    for (const tab of groupTabs) {
      const priority = PRIORITY_LEVELS[tab.priority]?.label || '⚪ None';
      const catIcon = categories[tab.category]?.icon || '❓';
      const time = formatDuration(tab.activeTime || 0);
      const locked = tab.locked ? '🔒' : '';
      const urlLocked = tab.urlLocked ? '🔗' : '';
      
      md += `- ${priority} ${catIcon} ${locked}${urlLocked} **${tab.title}**\n`;
      md += `  - URL: ${tab.url}\n`;
      if (tab.context) md += `  - Context: ${tab.context}\n`;
      if (tab.intent) md += `  - Intent: ${tab.intent}\n`;
      md += `  - Active time: ${time}\n`;
      md += `  - Opened: ${tab.openedAt}\n\n`;
    }
  }
  
  // Closed contexts
  if (closedContexts.length > 0) {
    md += `## Recently Closed Contexts\n\n`;
    for (const ctx of closedContexts.slice(0, 20)) {
      md += `- **${ctx.title}** (${ctx.priority})\n`;
      if (ctx.context) md += `  - Context: ${ctx.context}\n`;
      md += `  - URL: ${ctx.url}\n`;
      md += `  - Closed: ${ctx.closedAt}\n\n`;
    }
  }
  
  // Time summary
  md += `## Time Summary\n\n`;
  md += `| Category | Time |\n|----------|------|\n`;
  for (const [cat, ms] of Object.entries(timeTracking.byCategory)) {
    const catName = categories[cat]?.name || cat;
    md += `| ${catName} | ${formatDuration(ms)} |\n`;
  }
  md += `\n`;
  
  // Download the file
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  
  chrome.downloads.download({
    url,
    filename: `${settings.exportPath}/context.md`,
    saveAs: false,
    conflictAction: 'overwrite'
  });
  
  return md;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

// ============================================================
// MESSAGE ROUTING
// ============================================================

function broadcastMessage(message) {
  chrome.runtime.sendMessage(message).catch(() => {
    // No listeners — sidebar not open, that's fine
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // Async response
});

async function handleMessage(message, sender) {
  switch (message.type) {
    // --- Tab Data ---
    case 'GET_ALL_TABS':
      return { tabs: await getTabData() };
    
    case 'GET_TAB':
      const allTabs = await getTabData();
      return { tab: allTabs[message.tabId] };
    
    case 'UPDATE_TAB': {
      const tabs = await getTabData();
      if (tabs[message.tabId]) {
        Object.assign(tabs[message.tabId], message.updates);
        await setTabData(tabs);
        broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
      }
      return { success: true };
    }
    
    case 'BATCH_UPDATE_CONTEXT': {
      const tabs = await getTabData();
      for (const { tabId, context, intent } of message.updates) {
        if (tabs[tabId]) {
          tabs[tabId].context = context;
          tabs[tabId].intent = intent;
        }
      }
      await setTabData(tabs);
      broadcastMessage({ type: 'TABS_BATCH_UPDATED' });
      return { success: true };
    }
    
    // --- Priority ---
    case 'SET_PRIORITY': {
      const tabs = await getTabData();
      if (tabs[message.tabId]) {
        tabs[message.tabId].priority = message.priority;
        await setTabData(tabs);
        
        // Update Chrome tab group color if in a group
        if (tabs[message.tabId].groupId) {
          try {
            const color = PRIORITY_LEVELS[message.priority]?.color || 'grey';
            await chrome.tabGroups.update(tabs[message.tabId].groupId, { color });
          } catch (e) { /* group may not exist */ }
        }
        
        broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
      }
      return { success: true };
    }
    
    // --- Locking ---
    case 'TOGGLE_LOCK': {
      const tabs = await getTabData();
      if (tabs[message.tabId]) {
        tabs[message.tabId].locked = !tabs[message.tabId].locked;
        await setTabData(tabs);
        broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
      }
      return { success: true };
    }
    
    case 'UPDATE_TAB_TITLE': {
        const tabs = await getTabData();
        if (tabs[message.tabId]) {
            tabs[message.tabId].customTitle = message.title;
            await setTabData(tabs);
            broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
        }
        return { success: true };
    }
    
    case 'TOGGLE_URL_LOCK': {
      const tabs = await getTabData();
      if (tabs[message.tabId]) {
        tabs[message.tabId].urlLocked = !tabs[message.tabId].urlLocked;
        if (tabs[message.tabId].urlLocked) {
          tabs[message.tabId].urlLockScope = tabs[message.tabId].url;
        } else {
          tabs[message.tabId].urlLockScope = null;
        }
        await setTabData(tabs);
        
        // Inject/remove content script
        if (tabs[message.tabId].urlLocked) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId: message.tabId },
              files: ['url-lock.js']
            });
          } catch (e) { console.error('Could not inject url-lock script', e); }
        }
        
        broadcastMessage({ type: 'TAB_UPDATED', tabId: message.tabId, tabData: tabs[message.tabId] });
      }
      return { success: true };
    }
    
    // --- Close ---
    case 'REQUEST_CLOSE':
      return await requestTabClose(message.tabId);
    
    case 'CANCEL_CLOSE':
      pendingCloseConfirmations.delete(message.tabId);
      return { success: true };
    
    // --- Bulk ---
    case 'BULK_CLOSE':
      return await bulkCloseTabs(message.tabIds, message.context, message.intent);
    
    // --- Groups ---
    case 'GET_SAVED_GROUPS':
      // Stub for Phase 1.5
      return { savedGroups: {} }; 

    case 'CREATE_GROUP': {
      const groupId = await createOrUpdateGroup(message.tabIds, message.name, message.priority);
      return { groupId };
    }
    
    case 'CREATE_SUB_GROUP': {
      const id = await createSubGroup(message.name);
      return { id };
    }
    
    case 'GET_SUB_GROUPS':
      return { subGroups: await getSubGroups() };
    
    // --- Categories ---
    case 'GET_CATEGORIES':
      return { categories: await getCategories() };
    
    case 'CREATE_CATEGORY':
      return { categories: await createCategory(message.id, message.data) };
    
    case 'CLONE_CATEGORY':
      return { categories: await cloneCategory(message.sourceId, message.newId, message.overrides) };
    
    // --- Flow Recall ---
    case 'GET_FLOW_RECALL':
      return { flows: await getFlowRecallData() };
    
    case 'REOPEN_FLOW':
      return { tabIds: await reopenFlow(message.flowKey, message.newIntent) };

    // --- Closed Contexts ---
    case 'GET_CLOSED_CONTEXTS':
      return { closedContexts: await getClosedContexts() };
    
    // --- Time Tracking ---
    case 'GET_TIME_TRACKING':
      return { timeTracking: await getTimeTracking() };
      
    case 'START_POMODORO':
        chrome.alarms.create('pomodoro-timer', { delayInMinutes: message.minutes });
        broadcastMessage({ type: 'POMODORO_STARTED', minutes: message.minutes });
        return { success: true };
    
    // --- Sessions ---
    case 'GET_SESSIONS':
      return { sessions: await getSessions() };
    
    case 'GET_LATEST_SESSION':
      const sessions = await getSessions();
      return { session: sessions[0] || null };
    
    // --- Settings ---
    case 'GET_SETTINGS':
      return { settings: await getSettings() };
    
    case 'UPDATE_SETTINGS': {
      const settings = await getSettings();
      Object.assign(settings, message.settings);
      await setStorage({ settings });
      
      // Update idle detection interval
      if (message.settings.idleThresholdMinutes) {
        chrome.idle.setDetectionInterval(message.settings.idleThresholdMinutes * 60);
      }
      
      // Setup or clear auto-export
      if (settings.autoExportEnabled) {
        chrome.alarms.create('auto-export', { periodInMinutes: settings.autoExportIntervalMinutes });
      } else {
        chrome.alarms.clear('auto-export');
      }
      
      return { settings };
    }
    
    // --- Export ---
    case 'EXPORT_MARKDOWN':
      const md = await exportMarkdown();
      return { success: true, content: md };
    
    // --- Focus Tab ---
    case 'FOCUS_TAB':
      try {
        const tab = await chrome.tabs.get(message.tabId);
        await chrome.windows.update(tab.windowId, { focused: true });
        await chrome.tabs.update(message.tabId, { active: true });
      } catch (e) { /* tab may not exist */ }
      return { success: true };
    
    default:
      return { error: 'Unknown message type' };
  }
}

// ============================================================
// EXTENSION INSTALL / STARTUP
// ============================================================

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Initialize storage with defaults
    await setStorage({
      tabs: {},
      subGroups: {},
      categories: BUILT_IN_CATEGORIES,
      closedContexts: [],
      sessions: [],
      timeTracking: { byTab: {}, byGroup: {}, bySubGroup: {}, byCategory: {}, byProject: {} },
      settings: DEFAULT_SETTINGS
    });
    
    // Open side panel behavior
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.runtime.onStartup.addListener(async () => {
  // Set side panel behavior
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  
  // Sync existing tabs into storage
  const existingTabs = await chrome.tabs.query({});
  const tabs = await getTabData();
  const categories = await getCategories();
  
  for (const tab of existingTabs) {
    if (!tabs[tab.id]) {
      tabs[tab.id] = {
        url: tab.url || '',
        title: tab.title || 'Tab',
        openedAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
        activeTime: 0,
        context: null,
        intent: null,
        priority: 'none',
        locked: false,
        urlLocked: false,
        urlLockScope: null,
        groupId: tab.groupId !== chrome.tabGroups?.TAB_GROUP_ID_NONE ? tab.groupId : null,
        subGroupId: null,
        category: detectCategory(tab.url || '', tab.audible, categories),
        parentTabId: null,
        timerOverrideMinutes: null,
        ignored: false,
        persistent: false
      };
    }
  }
  
  // Clean up tabs that no longer exist
  const existingTabIds = new Set(existingTabs.map(t => t.id));
  for (const tabId of Object.keys(tabs)) {
    if (!existingTabIds.has(parseInt(tabId))) {
      delete tabs[tabId];
    }
  }
  
  await setTabData(tabs);
});

// ============================================================
// NOTIFICATION CLICK HANDLER
// ============================================================

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId.startsWith('context-')) {
    const tabId = parseInt(notificationId.replace('context-', ''));
    try {
      const tab = await chrome.tabs.get(tabId);
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
    } catch (e) { /* tab may not exist */ }
    
    // Signal sidebar to open context form for this tab
    broadcastMessage({ type: 'PROMPT_PURPOSE', tabId });
  }
});
