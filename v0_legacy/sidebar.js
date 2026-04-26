// Tabatha — Sidebar Logic (sidebar.js)

// ============================================================
// STATE & CACHE
// ============================================================
const state = {
  tabs: {},
  groups: {},
  subGroups: {},
  savedGroups: {}, // NEW: Closed groups
  categories: {},
  timeTracking: {},
  closedContexts: [],
  selectedTabIds: new Set(),
  currentPanel: 'tabs',
  currentView: 'list', // 'list' or 'context'
  sortBy: 'lastActive', // lastActive, activeTime, openTime, title, priority
  sortDir: 'desc', // 'asc' or 'desc'
  filterCategory: 'all',
  expandedContexts: new Set() // Track expanded context accordions
};

const elements = {
  navTabs: document.querySelectorAll('.nav-tab'),
  panels: document.querySelectorAll('.panel'),
  tabList: document.getElementById('tab-list'),
  contextList: document.getElementById('context-list'), // NEW
  groupsList: document.getElementById('groups-list'),
  savedGroupsList: document.getElementById('saved-groups-list'), // NEW
  currentFocus: document.getElementById('current-focus'),
  statTabCount: document.getElementById('stat-tab-count'),
  statActiveTime: document.getElementById('stat-active-time'),
  statGroups: document.getElementById('stat-groups'),
  btnExport: document.getElementById('btn-export'),
  btnSettings: document.getElementById('btn-settings'),
  btnSelectAll: document.getElementById('btn-select-all'),
  btnBulkClose: document.getElementById('btn-bulk-close'),
  btnCreateGroup: document.getElementById('btn-create-group'),
  btnCreateSubGroup: document.getElementById('btn-create-subgroup'),
  sortSelect: document.getElementById('tab-sort'),
  btnSortDir: document.getElementById('btn-sort-dir'), // NEW
  btnViewToggle: document.getElementById('btn-view-toggle'), // NEW
  filterCategorySelect: document.getElementById('tab-filter-category'),
  modalPurpose: document.getElementById('modal-purpose'),
  modalCloseConfirm: document.getElementById('modal-close-confirm'),
  modalOffChrome: document.getElementById('modal-off-chrome'),
  modalSettings: document.getElementById('modal-settings'),
  modalBulkClose: document.getElementById('modal-bulk-close')
};

// ============================================================
// INITIALIZATION
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupEventListeners();
  setupMessageListeners();
  setupTimers(); // NEW
  
  // Initial data fetch
  await refreshAllData();
  
  // Periodic refresh for time tracking
  setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_TIME_TRACKING' }, (response) => {
      if (response && response.timeTracking) {
        state.timeTracking = response.timeTracking;
        updateStats();
        // Force refresh tab times if visible (and not user interacting?)
        if (state.currentPanel === 'tabs' && state.currentView === 'list') renderTabs(false);
      }
    });
  }, 5000);
});

async function refreshAllData() {
  const [tabsRes, catsRes, groupsRes, trackedRes, savedRes] = await Promise.all([
    sendMessage('GET_ALL_TABS'),
    sendMessage('GET_CATEGORIES'),
    sendMessage('GET_SUB_GROUPS'),
    sendMessage('GET_TIME_TRACKING'),
    sendMessage('GET_SAVED_GROUPS') // NEW: Needed backend handler
  ]);
  
  state.tabs = tabsRes.tabs || {};
  state.categories = catsRes.categories || {};
  state.subGroups = groupsRes.subGroups || {};
  state.timeTracking = trackedRes.timeTracking || {};
  state.savedGroups = savedRes?.savedGroups || {};
  
  populateFilterCategories();
  renderAll();
}

async function sendMessage(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      resolve(response || {});
    });
  });
}

function populateFilterCategories() {
  const sel = elements.filterCategorySelect;
  const current = state.filterCategory;
  sel.innerHTML = '<option value="all">All Categories</option>';

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
  if (state.currentView === 'list') {
      elements.tabList.style.display = 'flex';
      elements.contextList.style.display = 'none';
      renderTabs(true);
  } else {
      elements.tabList.style.display = 'none';
      elements.contextList.style.display = 'block';
      renderContexts();
  }
  
  renderGroups();
  renderSavedGroups(); // NEW
  updateStats();
  updateDashboard();
}

function renderTabs(fullRender = true) {
  const list = elements.tabList;
  if (fullRender) list.innerHTML = '';
  // else list.innerHTML = ''; // MVP: Always redraw for now

  // 1. Filter (Same logic)
  const tabIds = Object.keys(state.tabs).map(Number).filter(tabId => {
      const tab = state.tabs[tabId];
      if (!tab) return false;
      
      const searchInput = document.getElementById('tab-search');
      const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
      if (searchTerm && !tab.title.toLowerCase().includes(searchTerm) && !tab.url.includes(searchTerm)) {
          return false;
      }
      if (state.filterCategory !== 'all' && tab.category !== state.filterCategory) {
          return false;
      }
      return true;
  });
  
  // 2. Sort (Updated with Dir)
  tabIds.sort((a, b) => {
    const tabA = state.tabs[a];
    const tabB = state.tabs[b];
    let comparison = 0;
    
    switch (state.sortBy) {
        case 'activeTime': comparison = (tabA.activeTime || 0) - (tabB.activeTime || 0); break;
        case 'openTime': 
            const durA = Date.now() - new Date(tabA.openedAt).getTime();
            const durB = Date.now() - new Date(tabB.openedAt).getTime();
            comparison = durA - durB; 
            break;
        case 'title': comparison = tabA.title.localeCompare(tabB.title); break;
        case 'priority': 
             const pMap = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
             comparison = pMap[tabA.priority || 'none'] - pMap[tabB.priority || 'none'];
             break;
        case 'lastActive': 
        default:
            comparison = new Date(tabA.lastActive) - new Date(tabB.lastActive);
            break;
    }
    
    return state.sortDir === 'asc' ? comparison : -comparison;
  });

  if (tabIds.length === 0 && fullRender) {
      list.innerHTML = '<div class="empty-state">No tabs found matching filters.</div>';
      return;
  }
  
  if (!fullRender) return; // Skip DOM updates if not full render for now

  tabIds.forEach(tabId => {
    const tab = state.tabs[tabId];
    // ... (Same rendering logic, simplified for brevity) ...
    // Using helper to render single tab item to avoid duplication between renderTabs and renderContexts?
    // For now, duplicate or keep simple.
    list.appendChild(createTabElement(tabId, tab));
  });
}

function createTabElement(tabId, tab) {
    const priorityColor = getPriorityColor(tab.priority);
    const isSelected = state.selectedTabIds.has(tabId);
    const catIcon = state.categories[tab.category]?.icon || '❓';
    const openDuration = Date.now() - new Date(tab.openedAt).getTime();
    const displayTitle = tab.customTitle || tab.title;
    
    const el = document.createElement('div');
    el.className = `tab-item ${isSelected ? 'selected' : ''} ${tab.locked ? 'locked' : ''}`;
    el.innerHTML = `
      <input type="checkbox" class="tab-select-checkbox" ${isSelected ? 'checked' : ''} data-id="${tabId}">
      <div class="tab-priority-indicator" style="background-color: ${priorityColor}"></div>
      <div class="tab-content" data-id="${tabId}">
        <div class="tab-title" title="${displayTitle}" contenteditable="false">${displayTitle}</div>
        <div class="tab-meta">
          <span>${catIcon}</span>
          <span>${tab.context || 'No context'}</span>
          <div class="tab-time-chips">
             <span class="time-chip active">⚡ ${formatTime(tab.activeTime || 0)}</span>
             <span class="time-chip open">🕒 ${formatTime(openDuration)}</span>
          </div>
        </div>
      </div>
      <div class="tab-actions">
          <button class="icon-btn tab-rename-btn" title="Rename" data-id="${tabId}">✎</button>
          <button class="icon-btn tab-edit-btn" title="Edit Context" data-id="${tabId}">✏️</button>
          <button class="icon-btn tab-close-btn" title="Close Tab" data-id="${tabId}">✕</button>
      </div>
    `;
    
    // Listeners
    el.querySelector('.tab-content').onclick = (e) => {
        if (e.target.isContentEditable) return;
        activateTab(tabId);
    };
    
    // Rename Logic
    const titleEl = el.querySelector('.tab-title');
    el.querySelector('.tab-rename-btn').onclick = (e) => {
        e.stopPropagation();
        titleEl.contentEditable = true;
        titleEl.focus();
        
        // Select all text
        const range = document.createRange();
        range.selectNodeContents(titleEl);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    };
    
    titleEl.onblur = () => {
        titleEl.contentEditable = false;
        const currentTitle = tab.customTitle || tab.title;
        if (titleEl.textContent !== currentTitle) {
            sendMessage('UPDATE_TAB_TITLE', { tabId, title: titleEl.textContent }); 
        }
    };
    titleEl.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            titleEl.blur();
        }
    };
    
    // Other buttons...
    el.querySelector('.tab-edit-btn').onclick = (e) => {
        e.stopPropagation();
        sendMessage('GET_TAB', { tabId }).then(res => { if (res.tab) showPurposePrompt(tabId, res.tab); });
    };
    el.querySelector('.tab-close-btn').onclick = (e) => {
        e.stopPropagation();
        requestClose(tabId);
    };
    el.querySelector('.tab-select-checkbox').onchange = (e) => {
        e.stopPropagation();
        toggleSelection(tabId, e.target.checked);
    };
    
    return el;
}

function renderContexts() {
    const list = elements.contextList;
    list.innerHTML = '';
    
    // Group tabs by context
    const grouped = {};
    Object.values(state.tabs).forEach(tab => {
        const ctx = tab.context || 'Uncontextualized';
        if (!grouped[ctx]) grouped[ctx] = [];
        grouped[ctx].push(tab);
    });
    
    // Sort contexts by active time of content? Or name?
    const contexts = Object.keys(grouped).sort();
    
    contexts.forEach(ctx => {
        const tabs = grouped[ctx];
        const isExpanded = state.expandedContexts.has(ctx);
        const id = `ctx-${Date.now()}-${Math.random()}`; // Simple ID
        
        const el = document.createElement('div');
        el.className = `context-group ${isExpanded ? 'expanded' : ''}`;
        el.innerHTML = `
            <div class="context-header" data-ctx="${ctx}">
                <span>${ctx}</span>
                <span class="context-count">${tabs.length} tabs</span>
            </div>
            <div class="context-body"></div>
        `;
        
        const body = el.querySelector('.context-body');
        if (isExpanded) {
            tabs.forEach(tab => {
                 // We need tabId to find regular tab... 
                 // Wait, state.tabs iterates values, we need key.
                 // Let's refactor loop above to store pair.
                 // OR just lookup ID by reference (slow) or modify object iteration.
                 // Let's just fix the loop:
            });
        }
        
        el.querySelector('.context-header').onclick = () => {
            if (state.expandedContexts.has(ctx)) state.expandedContexts.delete(ctx);
            else state.expandedContexts.add(ctx);
            renderContexts(); // Re-render to show children
        };
        
        list.appendChild(el);
    });
    
    // Fix: Redoing the loop to capture IDs
    const contextMap = {};
    for (const [id, tab] of Object.entries(state.tabs)) {
        const ctx = tab.context || 'Uncontextualized';
        if (!contextMap[ctx]) contextMap[ctx] = [];
        contextMap[ctx].push({ id: parseInt(id), tab });
    }
    
    // Clear and redraw properly
    list.innerHTML = '';
    Object.keys(contextMap).sort().forEach(ctx => {
        const items = contextMap[ctx];
        const isExpanded = state.expandedContexts.has(ctx);
        
        const el = document.createElement('div');
        el.className = `context-group ${isExpanded ? 'expanded' : ''}`;
        el.innerHTML = `
            <div class="context-header">
                <span>${ctx}</span>
                <span class="context-count">${items.length} tabs</span>
            </div>
            <div class="context-body"></div>
        `;
        
        el.querySelector('.context-header').onclick = () => {
             if (state.expandedContexts.has(ctx)) state.expandedContexts.delete(ctx);
             else state.expandedContexts.add(ctx);
             renderContexts();
        };

        if (isExpanded) {
            const body = el.querySelector('.context-body');
            items.forEach(({id, tab}) => {
                body.appendChild(createTabElement(id, tab));
            });
        }
        
        list.appendChild(el);
    });
}

function renderSavedGroups() {
    const list = elements.savedGroupsList;
    list.innerHTML = '';
    // Mockup for now until backend support
    // const saved = state.savedGroups... 
    list.innerHTML = '<div class="empty-state">No saved groups. (Feature coming pending backend update)</div>';
}

function renderGroups() {
  const list = elements.groupsList;
  list.innerHTML = '';
  
  if (Object.keys(state.subGroups).length === 0) {
    list.innerHTML = '<div class="empty-state">No active sub-groups.</div>';
    return;
  }
  
  for (const [id, group] of Object.entries(state.subGroups)) {
    const el = document.createElement('div');
    el.className = 'group-item';
    el.innerHTML = `
      <div class="group-header">
        <span class="group-name">${group.name}</span>
        <span class="group-count">${group.chromeGroupIds.length} chrome groups</span>
      </div>
    `;
    list.appendChild(el);
  }
}

function setupTimers() {
    const btnStart = document.getElementById('btn-pomo-start');
    const btnBreak = document.getElementById('btn-pomo-break');
    if (btnStart) btnStart.onclick = () => sendMessage('START_POMODORO', { minutes: 25 });
    if (btnBreak) btnBreak.onclick = () => sendMessage('START_POMODORO', { minutes: 5 });
}


function updateStats() {
  const count = Object.keys(state.tabs).length;
  elements.statTabCount.textContent = count;
  
  const totalTime = Object.values(state.timeTracking.byTab || {}).reduce((a, b) => a + b, 0);
  elements.statActiveTime.textContent = formatTime(totalTime);
  
  elements.statGroups.textContent = Object.keys(state.subGroups).length + Object.keys(state.groups || {}).length; 
}

function updateDashboard() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && state.tabs[tabs[0].id]) {
        const tabData = state.tabs[tabs[0].id];
        elements.currentFocus.textContent = tabData.context || tabData.title;
        const priorityColor = getPriorityColor(tabData.priority);
        elements.currentFocus.style.color = priorityColor;
    }
  });
}

function renderClosedContexts() {
    // Placeholder - would render from state.closedContexts
}

// ============================================================
// ACTIONS
// ============================================================
async function activateTab(tabId) {
  await sendMessage('FOCUS_TAB', { tabId });
}

async function requestClose(tabId) {
  const res = await sendMessage('REQUEST_CLOSE', { tabId });
  if (res.needsConfirmation) {
    showCloseConfirmation(res.tabData, tabId);
  } else {
      // Optimistic remove?
      // const tabEl = document.querySelector(`.tab-content[data-id="${tabId}"]`)?.closest('.tab-item');
      // if (tabEl) tabEl.remove();
  }
}

function toggleSelection(tabId, selected) {
  if (tabId === null) {
      // Toggle handled by renderer
  } else {
      if (selected) state.selectedTabIds.add(tabId);
      else state.selectedTabIds.delete(tabId);
  }
  
  elements.btnBulkClose.disabled = state.selectedTabIds.size === 0;
  elements.btnBulkClose.textContent = `✕ (${state.selectedTabIds.size})`;
}

async function bulkClose() {
  if (state.selectedTabIds.size === 0) return;
  showBulkCloseModal();
}

async function createGroup() {
    const name = prompt("Enter new Group Name:");
    if (!name) return;
    
    let tabIds = Array.from(state.selectedTabIds);
    if (tabIds.length === 0) {
        const [active] = await chrome.tabs.query({active: true, currentWindow: true});
        if (active) tabIds = [active.id];
    }
    
    if (tabIds.length > 0) {
        await sendMessage('CREATE_GROUP', { tabIds, name, priority: 'none' });
        state.selectedTabIds.clear(); 
        refreshAllData();
    } else {
        alert("Select at least one tab to group.");
    }
}

async function createSubGroup() {
    const name = prompt("Enter new Project/Sub-Group Name:");
    if (!name) return;
    
    await sendMessage('CREATE_SUB_GROUP', { name });
    refreshAllData();
}

// ============================================================
// MODALS
// ============================================================
function showPurposePrompt(tabId, tabData) {
  elements.modalPurpose.style.display = 'flex';
  document.getElementById('purpose-tab-title').textContent = tabData.title;
  
  document.getElementById('purpose-context').value = tabData.context || '';
  document.getElementById('purpose-intent').value = tabData.intent || '';
  document.getElementById('purpose-priority').value = tabData.priority || 'none';
  
  const catSelect = document.getElementById('purpose-category');
  catSelect.innerHTML = '';
  for (const [id, cat] of Object.entries(state.categories)) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${cat.icon} ${cat.name}`;
    if (id === tabData.category) opt.selected = true;
    catSelect.appendChild(opt);
  }
  
  document.getElementById('purpose-save').onclick = async () => {
    const context = document.getElementById('purpose-context').value;
    const intent = document.getElementById('purpose-intent').value;
    const priority = document.getElementById('purpose-priority').value;
    const category = document.getElementById('purpose-category').value;
    
    await sendMessage('UPDATE_TAB', { 
      tabId, 
      updates: { context, intent, priority, category } 
    });
    
    elements.modalPurpose.style.display = 'none';
    refreshAllData(); 
  };
  
  document.getElementById('purpose-skip').onclick = () => {
    elements.modalPurpose.style.display = 'none';
  };
}

function showCloseConfirmation(tabData, tabId) {
    elements.modalCloseConfirm.style.display = 'flex';
    document.getElementById('close-confirm-title').textContent = tabData.title;
    
    document.getElementById('close-confirm').onclick = async () => {
        await sendMessage('REQUEST_CLOSE', { tabId });
        elements.modalCloseConfirm.style.display = 'none';
        refreshAllData();
    };
    
    document.getElementById('close-cancel').onclick = () => {
        sendMessage('CANCEL_CLOSE', { tabId });
        elements.modalCloseConfirm.style.display = 'none';
    };
}

function showBulkCloseModal() {
    elements.modalBulkClose.style.display = 'flex';
    document.getElementById('bulk-close-count').textContent = `${state.selectedTabIds.size} tabs selected`;
    
    document.getElementById('bulk-close-confirm').onclick = async () => {
        const context = document.getElementById('bulk-close-context').value;
        const intent = document.getElementById('bulk-close-intent').value;
        const tabIds = Array.from(state.selectedTabIds);
        
        await sendMessage('BULK_CLOSE', { tabIds, context, intent });
        
        state.selectedTabIds.clear();
        toggleSelection(null, false);
        refreshAllData();
        elements.modalBulkClose.style.display = 'none';
    };
    
    document.getElementById('bulk-close-cancel').onclick = () => {
         elements.modalBulkClose.style.display = 'none';
    };
}

// ============================================================
// LISTENERS
// ============================================================
function setupEventListeners() {
  document.getElementById('tab-search').addEventListener('input', () => renderTabs(true));
  
  // Sort & Filter
  elements.sortSelect.addEventListener('change', (e) => {
      state.sortBy = e.target.value;
      renderAll();
  });
  
  if (elements.btnSortDir) {
      elements.btnSortDir.onclick = () => {
          state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
          elements.btnSortDir.textContent = state.sortDir === 'asc' ? '⬆️' : '⬇️';
          renderAll();
      };
  }
  
  if (elements.btnViewToggle) {
      elements.btnViewToggle.onclick = () => {
          state.currentView = state.currentView === 'list' ? 'context' : 'list';
          // Update icon?
          renderAll();
      };
  }
  
  elements.filterCategorySelect.addEventListener('change', (e) => {
      state.filterCategory = e.target.value;
      renderAll();
  });
  
  elements.btnExport.onclick = () => sendMessage('EXPORT_MARKDOWN');
  elements.btnSettings.onclick = () => elements.modalSettings.style.display = 'flex';
  document.getElementById('settings-cancel').onclick = () => elements.modalSettings.style.display = 'none';
  
  elements.btnSelectAll.onclick = () => {
      const allIds = Object.keys(state.tabs).map(Number);
      // Only select visible tabs?
      // For now select all keys in state
      allIds.forEach(id => state.selectedTabIds.add(id));
      renderTabs(true);
      
      elements.btnBulkClose.disabled = false;
      elements.btnBulkClose.textContent = `✕ (${state.selectedTabIds.size})`;
  };
  
  elements.btnBulkClose.onclick = bulkClose;
  
  if (elements.btnCreateGroup) elements.btnCreateGroup.onclick = createGroup;
  if (elements.btnCreateSubGroup) elements.btnCreateSubGroup.onclick = createSubGroup;
  
  // Welcome Back Modal
  const btnOffChromeSave = document.getElementById('off-chrome-save');
  if (btnOffChromeSave) btnOffChromeSave.onclick = saveOffChromeContext;
  
  const btnOffChromeSkip = document.getElementById('off-chrome-skip');
  if (btnOffChromeSkip) btnOffChromeSkip.onclick = () => elements.modalOffChrome.style.display = 'none';
}

function setupNavigation() {
  elements.navTabs.forEach(tab => {
    tab.onclick = () => {
      elements.navTabs.forEach(t => t.classList.remove('active'));
      elements.panels.forEach(p => p.classList.remove('active'));
      
      tab.classList.add('active');
      const panelId = `panel-${tab.dataset.panel}`;
      document.getElementById(panelId).classList.add('active');
      state.currentPanel = tab.dataset.panel;
    };
  });
}

function setupMessageListeners() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'TAB_CREATED' || message.type === 'TAB_REMOVED' || message.type === 'TAB_UPDATED') {
      refreshAllData();
    }
    
    if (message.type === 'PROMPT_PURPOSE') {
        sendMessage('GET_TAB', { tabId: message.tabId }).then(res => {
            if (res.tab) showPurposePrompt(message.tabId, res.tab);
        });
    }
    
    if (message.type === 'OFF_CHROME_RETURN') {
        document.getElementById('off-chrome-duration').textContent = `You were away for ${formatTime(message.idleDurationMs)}`;
        elements.modalOffChrome.style.display = 'flex';
        
        // Setup one-time listener for this instance, or ensure the button has a permanent listener
        // Best to use a permanent listener in setupEventListeners, but we need the data.
        // Let's rely on the permanent listener using input values.
    }
    
    if (message.type === 'CONTEXT_REMINDER' || message.type === 'INTENT_REINFORCEMENT') {
        showToast(message.type === 'CONTEXT_REMINDER' ? 'Context Needed' : 'Stay Focused!');
    }
  });
}

function saveOffChromeContext() {
    const context = document.getElementById('off-chrome-context').value;
    if (!context) return;
    
    // We just log it? Or add it to a specific log?
    // For now, let's just toast and close, maybe log to console or a 'Session Log' in future
    showToast(`Logged: ${context}`);
    elements.modalOffChrome.style.display = 'none';
    document.getElementById('off-chrome-context').value = '';
}


// ============================================================
// HELPERS
// ============================================================
function getPriorityColor(level) {
  const colors = {
    critical: '#ff4d4d',
    high: '#ff9100',
    medium: '#ffd600',
    low: '#00e676',
    none: '#5f6368'
  };
  return colors[level] || colors.none;
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
}

function showToast(text) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = text;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
