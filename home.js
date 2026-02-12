// Tabatha Home Page Logic (home.js)

document.addEventListener('DOMContentLoaded', async () => {
  const intentInput = document.getElementById('session-intent');
  const startBtn = document.getElementById('start-session');
  const threadsGrid = document.getElementById('threads-grid');
  
  // Greeting based on time
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = `${greeting}!`;

  // Fetch last session data
  chrome.runtime.sendMessage({ type: 'GET_LATEST_SESSION' }, (response) => {
    renderThreads(response.session);
  });

  // Start Session
  startBtn.onclick = () => {
    const intent = intentInput.value.trim();
    if (intent) {
      // In a real app we'd broadcast this new intent to start tabs with
      chrome.runtime.sendMessage({ 
        type: 'start_session', 
        intent 
      });
    }
    
    // For now, just close the home tab (which acts as a new tab override)
    // or redirect to a default "dashboard" view if we had one.
    // In this MVP, we let the user restore tabs or start searching.
    // Ideally we might open the first restored tab.
  };

  function renderThreads(session) {
    threadsGrid.innerHTML = '';
    
    if (!session || !session.tabs) {
      threadsGrid.innerHTML = '<div class="loading-spinner">No previous session found. Start fresh!</div>';
      return;
    }

    // Group tabs from the snapshot
    const groups = {};
    Object.values(session.tabs).forEach(tab => {
      const key = tab.subGroupId || tab.groupId || 'ungrouped';
      if (!groups[key]) {
        groups[key] = {
          id: key,
          name: tab.subGroupId ? 'Sub-Group' : (key === 'ungrouped' ? 'Ungrouped Tabs' : `Group ${key}`),
          tabs: [],
          priority: 'none',
          context: tab.context
        };
      }
      groups[key].tabs.push(tab);
      // Bubble up priority/context
      if (tab.priority === 'critical') groups[key].priority = 'critical';
      if (!groups[key].context && tab.context) groups[key].context = tab.context;
    });

    Object.values(groups).forEach(group => {
      const el = document.createElement('div');
      el.className = `thread-card ${group.priority === 'critical' ? 'critical' : ''}`;
      el.innerHTML = `
        <div class="thread-header">
          <span class="thread-title">${group.name}</span>
          <span class="thread-count">${group.tabs.length} tabs</span>
        </div>
        <div class="thread-context">
          ${group.context || 'No specific context recorded for this thread.'}
        </div>
        <div class="thread-footer">
          <span>${group.priority !== 'none' ? group.priority.toUpperCase() : ''}</span>
          <button class="secondary-btn small restore-btn" data-id="${group.id}">Restore</button>
        </div>
      `;
      
      el.querySelector('.restore-btn').onclick = (e) => {
        e.stopPropagation();
        restoreGroup(group);
      };
      
      threadsGrid.appendChild(el);
    });
  }

  function restoreGroup(group) {
    group.tabs.forEach(tab => {
      chrome.tabs.create({ url: tab.url, active: false });
    });
  }
});
