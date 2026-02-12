// Tabatha — Sidebar Logic (sidebar.js)

// ============================================================
// STATE & CACHE
// ============================================================
const state = {
  tabs: {},
  groups: {},
  subGroups: {},
  categories: {},
  timeTracking: {},
  closedContexts: [],
  selectedTabIds: new Set(),
  currentPanel: 'tabs',
  sortBy: 'lastActive', // lastActive, activeTime, openTime, title, priority
  filterCategory: 'all'
};

const elements = {
  navTabs: document.querySelectorAll('.nav-tab'),
  panels: document.querySelectorAll('.panel'),
  tabList: document.getElementById('tab-list'),
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
  
  // Initial data fetch
  await refreshAllData();
  
  // Periodic refresh for time tracking
  setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_TIME_TRACKING' }, (response) => {
      if (response && response.timeTracking) {
        state.timeTracking = response.timeTracking;
        updateStats();
        // Force refresh tab times if visible (and not user interacting?)
        // To avoid jitter, maybe only update times if sort is time-based?
        if (state.currentPanel === 'tabs') renderTabs(false); 
      }
    });
  }, 5000);
});

async function refreshAllData() {
  const [tabsRes, catsRes, groupsRes, trackedRes] = await Promise.all([
    sendMessage('GET_ALL_TABS'),
    sendMessage('GET_CATEGORIES'),
    sendMessage('GET_SUB_GROUPS'),
    sendMessage('GET_TIME_TRACKING')
  ]);
  
  state.tabs = tabsRes.tabs || {};
  state.categories = catsRes.categories || {};
  state.subGroups = groupsRes.subGroups || {};
  state.timeTracking = trackedRes.timeTracking || {};
  
  populateFilterCategories();
  renderAll();
}

function populateFilterCategories() {
  const select = elements.filterCategorySelect;
  const current = select.value;
  select.innerHTML = '<option value="all">All Cats</option>';
  
  for (const [id, cat] of Object.entries(state.categories)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${cat.icon} ${cat.name}`;
      select.appendChild(opt);
  }
  select.value = current;
}

function sendMessage(type, payload = {}) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ type, ...payload }, resolve);
  });
}

// ============================================================
// RENDERING
// ============================================================
function renderAll() {
  renderTabs(true);
  renderGroups();
  updateStats();
  updateDashboard();
  renderClosedContexts();
}

function renderTabs(fullRender = true) {
  const list = elements.tabList;

  if (fullRender) list.innerHTML = '';
  else list.innerHTML = ''; // MVP: Always redraw for now to keep it simple

  // 1. Filter
  const tabIds = Object.keys(state.tabs).map(Number).filter(tabId => {
      const tab = state.tabs[tabId];
      if (!tab) return false;
      
      // Search term
      const searchInput = document.getElementById('tab-search');
      const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
      if (searchTerm && !tab.title.toLowerCase().includes(searchTerm) && !tab.url.includes(searchTerm)) {
          return false;
      }
      
      // Category filter
      if (state.filterCategory !== 'all' && tab.category !== state.filterCategory) {
          return false;
      }
      
      return true;
  });
  
  // 2. Sort
  tabIds.sort((a, b) => {
    const tabA = state.tabs[a];
    const tabB = state.tabs[b];
    
    switch (state.sortBy) {
        case 'activeTime': // Descending
            return (tabB.activeTime || 0) - (tabA.activeTime || 0);
        case 'openTime': // Descending
            const durationA = Date.now() - new Date(tabA.openedAt).getTime();
            const durationB = Date.now() - new Date(tabB.openedAt).getTime();
            return durationB - durationA;
        case 'title': // Ascending
            return tabA.title.localeCompare(tabB.title);
        case 'priority': // Critical > High > etc
             const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
             return priorityOrder[tabB.priority || 'none'] - priorityOrder[tabA.priority || 'none'];
        case 'lastActive': // Descending
        default:
            return new Date(tabB.lastActive) - new Date(tabA.lastActive);
    }
  });
  
  // 3. Render
  if (tabIds.length === 0) {
      list.innerHTML = '<div class="empty-state">No tabs found matching filters.</div>';
      return;
  }

  tabIds.forEach(tabId => {
    const tab = state.tabs[tabId];
    
    const priorityColor = getPriorityColor(tab.priority);
    const isSelected = state.selectedTabIds.has(tabId);
    const catIcon = state.categories[tab.category]?.icon || '❓';
    
    const openDuration = Date.now() - new Date(tab.openedAt).getTime();
    
    const el = document.createElement('div');
    el.className = `tab-item ${isSelected ? 'selected' : ''} ${tab.locked ? 'locked' : ''} ${tab.urlLocked ? 'url-locked' : ''}`;
    el.innerHTML = `
      <input type="checkbox" class="tab-select-checkbox" ${isSelected ? 'checked' : ''} data-id="${tabId}">
      <div class="tab-priority-indicator" style="background-color: ${priorityColor}"></div>
      <div class="tab-content" data-id="${tabId}">
        <div class="tab-title" title="${tab.title}">${tab.title}</div>
        <div class="tab-meta">
          <span>${catIcon}</span>
          <span>${tab.context || 'No context'}</span>
          <div class="tab-time-chips">
             <span class="time-chip active" title="Active Focus Time">⚡ ${formatTime(tab.activeTime || 0)}</span>
             <span class="time-chip open" title="Total Time Open">🕒 ${formatTime(openDuration)}</span>
          </div>
          <div class="tab-icons">
             ${tab.locked ? '<span>🔒</span>' : ''}
             ${tab.urlLocked ? '<span>🔗</span>' : ''}
          </div>
        </div>
      </div>
      <div class="tab-actions">
          <button class="icon-btn tab-edit-btn" title="Edit Context" data-id="${tabId}">✏️</button>
          <button class="icon-btn tab-close-btn" title="Close Tab" data-id="${tabId}">✕</button>
      </div>
    `;
    
    // Event listeners
    el.querySelector('.tab-content').onclick = () => activateTab(tabId);
    
    el.querySelector('.tab-edit-btn').onclick = (e) => {
        e.stopPropagation();
        // Fetch fresh tab data
        sendMessage('GET_TAB', { tabId }).then(res => {
            if (res.tab) showPurposePrompt(tabId, res.tab);
        });
    };

    el.querySelector('.tab-close-btn').onclick = (e) => {
      e.stopPropagation();
      requestClose(tabId);
    };
    
    el.querySelector('.tab-select-checkbox').onchange = (e) => {
      e.stopPropagation();
      toggleSelection(tabId, e.target.checked);
    };
    
    list.appendChild(el);
  });
}

function renderGroups() {
  const list = document.getElementById('groups-list');
  list.innerHTML = '';
  
  if (Object.keys(state.subGroups).length === 0) {
    list.innerHTML = '<div class="empty-state">No sub-groups created yet.</div>';
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
      renderTabs(true);
  });
  
  elements.filterCategorySelect.addEventListener('change', (e) => {
      state.filterCategory = e.target.value;
      renderTabs(true);
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
    }
    
    if (message.type === 'CONTEXT_REMINDER' || message.type === 'INTENT_REINFORCEMENT') {
        showToast(message.type === 'CONTEXT_REMINDER' ? 'Context Needed' : 'Stay Focused!');
    }
  });
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
