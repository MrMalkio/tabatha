// ============================================================
// TABATHA — HOME DASHBOARD (New Tab Override)
// Minimalist, intent-first design
// ============================================================

let state = {
  tabs: {},
  categories: {},
  subGroups: {},
  timeTracking: {},
  savedGroups: {},
  selectedTabIds: new Set(),
  currentPanel: 'time',
  currentView: 'list',
  filterCategory: 'all',
  sortBy: 'lastActive',
  sortDesc: true,
  searchTerm: '',
  sessionGoal: '',
};

let elements = {};

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  elements = {
    navTabs: document.querySelectorAll('.nav-tab'),
    panels: document.querySelectorAll('.panel'),
    tabList: document.getElementById('tab-list'),
    contextList: document.getElementById('context-list'),
    groupsList: document.getElementById('groups-list'),
    savedGroupsList: document.getElementById('saved-groups-list'),
    threadsGrid: document.getElementById('threads-grid'),
    statTabCount: document.getElementById('stat-tab-count'),
    statActiveTime: document.getElementById('stat-active-time'),
    btnSelectAll: document.getElementById('btn-select-all'),
    btnBulkClose: document.getElementById('btn-bulk-close'),
    btnCreateGroup: document.getElementById('btn-create-group'),
    btnCreateSubGroup: document.getElementById('btn-create-subgroup'),
    sortSelect: document.getElementById('tab-sort'),
    btnSortDir: document.getElementById('btn-sort-dir'),
    btnViewToggle: document.getElementById('btn-view-toggle'),
    filterCategorySelect: document.getElementById('tab-filter-category'),
    toastContainer: document.getElementById('toast-container'),
    sessionIntent: document.getElementById('session-intent'),
    startSession: document.getElementById('start-session'),
    quickAccess: document.getElementById('quick-access-container'),
    greeting: document.getElementById('greeting'),
    timeTotalToday: document.getElementById('time-total-today'),
    timeTabCount: document.getElementById('time-tab-count'),
    timeBreakdown: document.getElementById('time-breakdown'),
  };

  setupNavigation();
  setupEventListeners();
  setupMessageListeners();
  setupTimers();
  setupQuickAccess();
  setupGreeting();

  await refreshAllData();

  setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_TIME_TRACKING' }, (response) => {
      if (response && response.timeTracking) {
        state.timeTracking = response.timeTracking;
        updateStats();
        updateTimePanel();
        if (state.currentPanel === 'tabs' && state.currentView === 'list') renderTabs(false);
      }
    });
  }, 5000);
});

// ============================================================
// DATA LAYER
// ============================================================
async function sendMessage(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      resolve(response || {});
    });
  });
}

async function refreshAllData() {
  const [tabsRes, catsRes, groupsRes, trackedRes, savedRes] = await Promise.all([
    sendMessage('GET_ALL_TABS'),
    sendMessage('GET_CATEGORIES'),
    sendMessage('GET_SUB_GROUPS'),
    sendMessage('GET_TIME_TRACKING'),
    sendMessage('GET_SAVED_GROUPS')
  ]);

  state.tabs = tabsRes.tabs || {};
  state.categories = catsRes.categories || {};
  state.subGroups = groupsRes.subGroups || {};
  state.timeTracking = trackedRes.timeTracking || {};
  state.savedGroups = savedRes?.savedGroups || {};

  populateFilterCategories();
  renderAll();
}

function populateFilterCategories() {
  const sel = elements.filterCategorySelect;
  if (!sel) return;
  const current = state.filterCategory;
  sel.innerHTML = '<option value="all">All</option>';
  Object.entries(state.categories).forEach(([id, cat]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${cat.icon} ${cat.name}`;
    if (id === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

// ============================================================
// RENDERING
// ============================================================
function renderAll() {
  renderTabs();
  renderContexts();
  renderGroups();
  renderSavedGroups();
  updateStats();
  updateTimePanel();
  renderRestore();
}

function renderTabs(fullRebuild = true) {
  if (state.currentView !== 'list') return;
  const container = elements.tabList;
  if (!container) return;

  let tabIds = Object.keys(state.tabs);

  // Filter
  if (state.filterCategory !== 'all') {
    tabIds = tabIds.filter(id => state.tabs[id].category === state.filterCategory);
  }
  if (state.searchTerm) {
    const term = state.searchTerm.toLowerCase();
    tabIds = tabIds.filter(id => {
      const t = state.tabs[id];
      return (t.title || '').toLowerCase().includes(term) ||
             (t.url || '').toLowerCase().includes(term) ||
             (t.context || '').toLowerCase().includes(term);
    });
  }

  // Sort
  tabIds = sortTabIds(tabIds);

  if (fullRebuild) {
    container.innerHTML = '';
    if (tabIds.length === 0) {
      container.innerHTML = '<div class="empty-state">No tabs match your filters.</div>';
      return;
    }
    tabIds.forEach(id => container.appendChild(createTabElement(id)));
  } else {
    // Partial update — just refresh time chips
    tabIds.forEach(id => {
      const el = container.querySelector(`[data-tab-id="${id}"]`);
      if (el) updateTimeChips(el, id);
    });
  }
}

function sortTabIds(tabIds) {
  return tabIds.sort((a, b) => {
    const ta = state.tabs[a];
    const tb = state.tabs[b];
    let diff = 0;
    switch (state.sortBy) {
      case 'activeTime':
        diff = ((state.timeTracking.byTab || {})[a] || 0) - ((state.timeTracking.byTab || {})[b] || 0);
        break;
      case 'openTime':
        diff = (ta.openedAt || 0) - (tb.openedAt || 0);
        break;
      case 'title':
        diff = (ta.title || '').localeCompare(tb.title || '');
        break;
      case 'priority':
        const pOrder = { critical: 0, high: 1, medium: 2, low: 3, none: 4 };
        diff = (pOrder[ta.priority] || 4) - (pOrder[tb.priority] || 4);
        break;
      default: // lastActive
        diff = (ta.lastActive || 0) - (tb.lastActive || 0);
    }
    return state.sortDesc ? -diff : diff;
  });
}

function createTabElement(tabId) {
  const tab = state.tabs[tabId];
  const el = document.createElement('div');
  el.className = 'tab-item' + (tab.locked ? ' locked' : '') + (state.selectedTabIds.has(tabId) ? ' selected' : '');
  el.dataset.tabId = tabId;

  const activeTime = (state.timeTracking.byTab || {})[tabId] || 0;
  const openDuration = tab.openedAt ? Date.now() - tab.openedAt : 0;
  const cat = state.categories[tab.category] || { icon: '📄', name: tab.category || 'Other' };

  el.innerHTML = `
    <input type="checkbox" class="tab-select-checkbox" ${state.selectedTabIds.has(tabId) ? 'checked' : ''}>
    <div class="tab-priority-indicator" style="background:${getPriorityColor(tab.priority)}"></div>
    <div class="tab-content">
      <div class="tab-title" title="${tab.url || ''}">${tab.title || 'Untitled'}</div>
      <div class="tab-meta">
        <span>${cat.icon}</span>
        <span>${tab.context || 'No context'}</span>
        ${tab.locked ? '<span>🔒</span>' : ''}
        ${tab.urlLocked ? '<span>🔗</span>' : ''}
      </div>
    </div>
    <div class="tab-time-chips">
      <span class="time-chip active" data-chip="active">${formatTime(activeTime)}</span>
      <span class="time-chip" data-chip="open">${formatTime(openDuration)}</span>
    </div>
    <div class="tab-actions">
      <button class="icon-btn" data-action="focus" title="Switch to tab">↗</button>
      <button class="icon-btn" data-action="lock" title="${tab.locked ? 'Unlock' : 'Lock'}">${tab.locked ? '🔓' : '🔒'}</button>
      <button class="icon-btn" data-action="edit" title="Edit">✎</button>
      <button class="icon-btn" data-action="close" title="Close">✕</button>
    </div>
  `;

  // Event delegation
  el.querySelector('.tab-select-checkbox').onchange = () => toggleSelection(tabId);

  el.querySelectorAll('.icon-btn').forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === 'focus') {
        sendMessage('FOCUS_TAB', { tabId: parseInt(tabId) });
      } else if (action === 'close') {
        sendMessage('REQUEST_CLOSE', { tabId: parseInt(tabId) });
      } else if (action === 'lock') {
        await sendMessage('TOGGLE_LOCK', { tabId: parseInt(tabId) });
        await refreshAllData();
      } else if (action === 'edit') {
        const titleEl = el.querySelector('.tab-title');
        titleEl.contentEditable = 'true';
        titleEl.focus();
        titleEl.onblur = async () => {
          titleEl.contentEditable = 'false';
          const newTitle = titleEl.textContent.trim();
          if (newTitle && newTitle !== tab.title) {
            await sendMessage('UPDATE_TAB_TITLE', { tabId: parseInt(tabId), title: newTitle });
            await refreshAllData();
          }
        };
      }
    };
  });

  el.onclick = (e) => {
    if (e.target.closest('.tab-actions') || e.target.classList.contains('tab-select-checkbox')) return;
    sendMessage('FOCUS_TAB', { tabId: parseInt(tabId) });
  };

  return el;
}

function updateTimeChips(el, tabId) {
  const activeTime = (state.timeTracking.byTab || {})[tabId] || 0;
  const tab = state.tabs[tabId];
  const openDuration = tab && tab.openedAt ? Date.now() - tab.openedAt : 0;
  const activeChip = el.querySelector('[data-chip="active"]');
  const openChip = el.querySelector('[data-chip="open"]');
  if (activeChip) activeChip.textContent = formatTime(activeTime);
  if (openChip) openChip.textContent = formatTime(openDuration);
}

function renderContexts() {
  const container = elements.contextList;
  if (!container) return;
  container.innerHTML = '';

  const contextMap = {};
  Object.entries(state.tabs).forEach(([id, tab]) => {
    const ctx = tab.context || 'No Context';
    if (!contextMap[ctx]) contextMap[ctx] = [];
    contextMap[ctx].push(id);
  });

  Object.entries(contextMap).forEach(([ctx, ids]) => {
    const group = document.createElement('div');
    group.className = 'context-group';
    group.innerHTML = `
      <div class="context-header">
        <span>${ctx}</span>
        <span class="context-count">${ids.length}</span>
      </div>
      <div class="context-body"></div>
    `;
    group.querySelector('.context-header').onclick = () => group.classList.toggle('expanded');
    const body = group.querySelector('.context-body');
    ids.forEach(id => body.appendChild(createTabElement(id)));
    container.appendChild(group);
  });
}

function renderGroups() {
  const container = elements.groupsList;
  if (!container) return;
  container.innerHTML = '';

  const groups = state.subGroups;
  if (!groups || Object.keys(groups).length === 0) {
    container.innerHTML = '<div class="empty-state">No projects yet.</div>';
    return;
  }

  Object.entries(groups).forEach(([id, group]) => {
    const el = document.createElement('div');
    el.className = 'group-item';
    el.innerHTML = `<span class="group-name">${group.name || id}</span> <span class="group-count">${(group.tabIds || []).length} tabs</span>`;
    container.appendChild(el);
  });
}

function renderSavedGroups() {
  if (elements.savedGroupsList) {
    elements.savedGroupsList.innerHTML = '<div class="empty-state">No saved groups.</div>';
  }
}

function updateStats() {
  const count = Object.keys(state.tabs).length;
  if (elements.statTabCount) elements.statTabCount.textContent = count;
  const totalTime = Object.values(state.timeTracking.byTab || {}).reduce((a, b) => a + b, 0);
  if (elements.statActiveTime) elements.statActiveTime.textContent = formatTime(totalTime);
}

function updateTimePanel() {
  const totalTime = Object.values(state.timeTracking.byTab || {}).reduce((a, b) => a + b, 0);
  if (elements.timeTotalToday) elements.timeTotalToday.textContent = formatTime(totalTime);
  if (elements.timeTabCount) elements.timeTabCount.textContent = Object.keys(state.tabs).length;

  const sessionsList = document.getElementById('active-sessions-list');
  if (sessionsList) {
    if (state.sessionGoal) {
      sessionsList.innerHTML = `<div class="group-item" style="border-left: 3px solid var(--accent)">
        <span class="group-name">Current Focus</span> 
        <span class="group-count" style="color:var(--text)">${state.sessionGoal}</span>
      </div>`;
    } else {
      sessionsList.innerHTML = '<div class="empty-state">No specific focus set.</div>';
    }
  }

  // Category breakdown
  if (elements.timeBreakdown) {
    const byCategory = {};
    Object.entries(state.tabs).forEach(([id, tab]) => {
      const cat = tab.category || 'unknown';
      const time = (state.timeTracking.byTab || {})[id] || 0;
      byCategory[cat] = (byCategory[cat] || 0) + time;
    });

    const sorted = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    elements.timeBreakdown.innerHTML = sorted.map(([cat, time]) => {
      const catInfo = state.categories[cat] || { icon: '📄', name: cat };
      return `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border);font-size:12px;">
        <span>${catInfo.icon} ${catInfo.name}</span>
        <span style="color:var(--accent)">${formatTime(time)}</span>
      </div>`;
    }).join('');
  }
}

function renderRestore() {
  chrome.runtime.sendMessage({ type: 'GET_LATEST_SESSION' }, (response) => {
    if (!response || !response.session) return;
    const section = document.getElementById('restore-section');
    if (section) {
      // Only show if there's a real session to restore — keep it hidden for now
    }
  });
}

// ============================================================
// HELPERS
// ============================================================
function formatTime(ms) {
  if (!ms || ms < 1000) return '0s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function getPriorityColor(priority) {
  const colors = { critical: '#ff4455', high: '#ff8844', medium: '#ffaa33', low: '#44aaff', none: 'transparent' };
  return colors[priority] || 'transparent';
}

function toggleSelection(tabId) {
  if (state.selectedTabIds.has(tabId)) {
    state.selectedTabIds.delete(tabId);
  } else {
    state.selectedTabIds.add(tabId);
  }
  if (elements.btnBulkClose) elements.btnBulkClose.disabled = state.selectedTabIds.size === 0;
  const tabEl = elements.tabList.querySelector(`[data-tab-id="${tabId}"]`);
  if (tabEl) tabEl.classList.toggle('selected', state.selectedTabIds.has(tabId));
}

function toast(msg) {
  if (!elements.toastContainer) return;
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  elements.toastContainer.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ============================================================
// INTENT ENFORCEMENT
// ============================================================
function requireIntent() {
  if (state.sessionGoal) return true;
  const input = elements.sessionIntent;
  if (!input) return true;
  const val = input.value.trim();
  if (val) {
    state.sessionGoal = val;
    return true;
  }
  // Shake and highlight
  const wrap = input.closest('.intent-wrap');
  if (wrap) {
    wrap.classList.add('intent-required', 'shake');
    input.focus();
    setTimeout(() => wrap.classList.remove('shake', 'intent-required'), 600);
  }
  return false;
}

// ============================================================
// SETUP
// ============================================================
function setupNavigation() {
  elements.navTabs.forEach(tab => {
    tab.onclick = () => {
      const target = tab.dataset.panel;
      elements.navTabs.forEach(t => t.classList.remove('active'));
      elements.panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = document.getElementById(`panel-${target}`);
      if (panel) panel.classList.add('active');
      state.currentPanel = target;

      if (target === 'tabs') {
        elements.tabList.style.display = state.currentView === 'list' ? '' : 'none';
        elements.contextList.style.display = state.currentView === 'context' ? '' : 'none';
      }
    };
  });
}

function setupEventListeners() {
  // Session intent
  if (elements.startSession) {
    elements.startSession.onclick = () => {
      const val = elements.sessionIntent.value.trim();
      if (val) {
        state.sessionGoal = val;
        toast(`Focus set: ${val}`);
      } else {
        requireIntent();
      }
    };
  }

  if (elements.sessionIntent) {
    elements.sessionIntent.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        elements.startSession.click();
      }
    });
  }

  // Search
  const searchInput = document.getElementById('tab-search');
  if (searchInput) {
    searchInput.oninput = () => {
      state.searchTerm = searchInput.value;
      renderTabs();
    };
  }

  // Sort
  if (elements.sortSelect) {
    elements.sortSelect.onchange = () => {
      state.sortBy = elements.sortSelect.value;
      renderTabs();
    };
  }
  if (elements.btnSortDir) {
    elements.btnSortDir.onclick = () => {
      state.sortDesc = !state.sortDesc;
      elements.btnSortDir.textContent = state.sortDesc ? '↓' : '↑';
      renderTabs();
    };
  }

  // Filter
  if (elements.filterCategorySelect) {
    elements.filterCategorySelect.onchange = () => {
      state.filterCategory = elements.filterCategorySelect.value;
      renderTabs();
    };
  }

  // View toggle
  if (elements.btnViewToggle) {
    elements.btnViewToggle.onclick = () => {
      state.currentView = state.currentView === 'list' ? 'context' : 'list';
      elements.tabList.style.display = state.currentView === 'list' ? '' : 'none';
      elements.contextList.style.display = state.currentView === 'context' ? '' : 'none';
      if (state.currentView === 'context') renderContexts();
      else renderTabs();
    };
  }

  // Select All
  if (elements.btnSelectAll) {
    elements.btnSelectAll.onclick = () => {
      const allIds = Object.keys(state.tabs);
      if (state.selectedTabIds.size === allIds.length) {
        state.selectedTabIds.clear();
      } else {
        allIds.forEach(id => state.selectedTabIds.add(id));
      }
      if (elements.btnBulkClose) elements.btnBulkClose.disabled = state.selectedTabIds.size === 0;
      renderTabs();
    };
  }

  // Bulk close
  if (elements.btnBulkClose) {
    elements.btnBulkClose.onclick = async () => {
      if (state.selectedTabIds.size === 0) return;
      const tabIds = [...state.selectedTabIds].map(Number);
      await sendMessage('BULK_CLOSE', { tabIds, context: state.sessionGoal || '', intent: '' });
      state.selectedTabIds.clear();
      elements.btnBulkClose.disabled = true;
      await refreshAllData();
    };
  }

  // Create group
  if (elements.btnCreateGroup) {
    elements.btnCreateGroup.onclick = async () => {
      if (state.selectedTabIds.size === 0) return toast('Select tabs first');
      const name = prompt('Group name:');
      if (!name) return;
      const tabIds = [...state.selectedTabIds].map(Number);
      await sendMessage('CREATE_GROUP', { tabIds, name, priority: 'none' });
      state.selectedTabIds.clear();
      await refreshAllData();
    };
  }

  // Create sub-group
  if (elements.btnCreateSubGroup) {
    elements.btnCreateSubGroup.onclick = async () => {
      const name = prompt('Project name:');
      if (!name) return;
      await sendMessage('CREATE_SUB_GROUP', { name });
      await refreshAllData();
    };
  }
}

function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TABS_UPDATED' || message.type === 'TAB_CREATED' || message.type === 'TAB_REMOVED') {
      refreshAllData();
    }
    if (message.type === 'ENTER_SLEEP') {
      showSleepOverlay(message);
    }
  });
}

function setupTimers() {
  const btnStart = document.getElementById('btn-pomo-start');
  const btnBreak = document.getElementById('btn-pomo-break');
  if (btnStart) btnStart.onclick = () => sendMessage('START_POMODORO', { minutes: 25 });
  if (btnBreak) btnBreak.onclick = () => sendMessage('START_POMODORO', { minutes: 5 });
}

function setupQuickAccess() {
  const container = elements.quickAccess;
  if (!container) return;

  chrome.topSites.get((sites) => {
    container.innerHTML = '';
    (sites || []).slice(0, 8).forEach(site => {
      const a = document.createElement('a');
      a.className = 'quick-link';
      a.href = site.url;
      a.title = site.title;
      const favicon = `https://www.google.com/s2/favicons?domain=${new URL(site.url).hostname}&sz=32`;
      a.innerHTML = `<img src="${favicon}" alt=""><span>${site.title.length > 18 ? site.title.slice(0, 18) + '…' : site.title}</span>`;

      a.onclick = (e) => {
        e.preventDefault();
        if (!requireIntent()) return;
        chrome.tabs.update({ url: site.url });
      };

      container.appendChild(a);
    });
  });
}

function setupGreeting() {
  if (!elements.greeting) return;
  const hour = new Date().getHours();
  let greeting;
  if (hour < 12) greeting = 'morning';
  else if (hour < 17) greeting = 'afternoon';
  else greeting = 'evening';
  elements.greeting.textContent = `Good ${greeting}`;
}

// ============================================================
// SLEEP MODE
// ============================================================
function showSleepOverlay(data) {
  const existing = document.querySelector('.sleep-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'sleep-overlay';
  overlay.innerHTML = `
    <div style="text-align:center;">
      <h1 style="font-size:48px;margin-bottom:12px;">🌙</h1>
      <h2 style="font-size:20px;font-weight:500;">Taking a break</h2>
      <p style="color:var(--text-muted);margin:8px 0 24px;">${data.message || 'Step away from the screen'}</p>
      <button style="padding:10px 24px;background:var(--accent);color:#000;border:none;border-radius:6px;font-size:14px;cursor:pointer;" onclick="this.closest('.sleep-overlay').remove()">I'm Back</button>
    </div>
  `;
  document.body.appendChild(overlay);
}
