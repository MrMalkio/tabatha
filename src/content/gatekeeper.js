// Tabatha — Intent-Popup (Gatekeeper)
// Injected at document_start to intercept browsing flow
// Formal name: Intent-Popup (InPop)

(async () => {
  // 1. Check if we need to intercept
  const response = await chrome.runtime.sendMessage({ type: 'CHECK_CONTEXT_NEEDED' });
  if (!response || !response.needed) return;

  // 2. Get active focus items for inherit option
  let focusItems = [];
  try {
    const feRes = await chrome.runtime.sendMessage({ type: 'GET_FOCUS_ENGINE' });
    if (feRes?.focusEngine?.items) {
      const items = Object.values(feRes.focusEngine.items);
      focusItems = items
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 3); // Top 3 most recent (configurable later)
    }
  } catch (e) { /* no focus items */ }

  // 3. Create Shadow DOM Overlay
  const host = document.createElement('div');
  host.id = 'tabatha-gatekeeper-host';
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '100vw';
  host.style.height = '100vh';
  host.style.zIndex = '2147483647';
  host.style.backgroundColor = 'rgba(0,0,0,0.85)';
  host.style.backdropFilter = 'blur(10px)';
  
  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);
  document.body.style.overflow = 'hidden';

  // 4. Styles
  const style = document.createElement('style');
  style.textContent = `
    :host {
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .container {
      background: #1a1a1a;
      padding: 32px 36px;
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      width: 420px;
      text-align: center;
      border: 1px solid #333;
      position: relative;
    }
    h1 { margin: 0 0 6px; font-size: 22px; font-weight: 700; letter-spacing: 0.02em; }
    .subtitle { color: #888; margin: 0 0 24px; font-size: 13px; }
    
    input, select {
      width: 100%;
      padding: 10px 12px;
      margin-bottom: 14px;
      background: #333;
      border: 1px solid #444;
      color: white;
      border-radius: 8px;
      font-size: 13px;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, select:focus { border-color: #00e5ff; }
    
    .section-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.12em;
      color: #666;
      text-align: left;
      margin-bottom: 8px;
      font-weight: 600;
    }
    
    .inherit-list {
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .inherit-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      background: #252525;
      border: 1px solid #333;
      border-radius: 8px;
      cursor: pointer;
      text-align: left;
      font-size: 12px;
      color: #ccc;
      transition: border-color 0.15s, background 0.15s;
    }
    .inherit-item:hover { border-color: #00e5ff; background: #2a2a2a; }
    .inherit-item .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .inherit-item .badge { font-size: 9px; background: #333; padding: 2px 6px; border-radius: 4px; color: #888; }
    
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 16px;
    }
    
    button {
      padding: 10px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 13px;
      transition: transform 0.1s, opacity 0.2s;
      position: relative;
    }
    button:active { transform: scale(0.98); }
    
    .btn-primary { background: #fff; color: #000; grid-column: span 2; }
    .btn-secondary { background: #333; color: #fff; border: 1px solid #444; }
    .btn-danger { background: #3c1f1f; color: #ff6b6b; border: 1px solid #5c2b2b; }
    .btn-nevermind { background: transparent; color: #888; border: 1px solid #444; grid-column: span 2; margin-top: 4px; }
    
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary:hover { background: #444; }
    .btn-danger:hover { background: #4a2626; }
    .btn-nevermind:hover { color: #66bb6a; border-color: #66bb6a; }
    
    .skip-link {
      display: block;
      margin-top: 16px;
      font-size: 11px;
      color: #555;
      text-decoration: none;
      cursor: pointer;
      transition: color 0.15s;
    }
    .skip-link:hover { color: #888; text-decoration: underline; }
    
    /* Tooltip */
    [data-tip] { position: relative; }
    [data-tip]:hover::after {
      content: attr(data-tip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: #111;
      color: #ddd;
      font-size: 10px;
      font-weight: 400;
      padding: 4px 8px;
      border-radius: 4px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      border: 1px solid #333;
      animation: tipFade 0.15s ease-out;
    }
    @keyframes tipFade { from { opacity: 0; transform: translateX(-50%) translateY(4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  `;
  shadow.appendChild(style);

  // 5. DOM Structure
  const container = document.createElement('div');
  container.className = 'container';
  
  // Build inherit items HTML
  let inheritHTML = '';
  if (focusItems.length > 0) {
    inheritHTML = `
      <div class="section-label">Inherit from active focus</div>
      <div class="inherit-list">
        ${focusItems.map((item, i) => `
          <div class="inherit-item" data-inherit-id="${item.id}" data-tip="Inherit context from this focus item — tab will be associated with it">
            <span style="font-size: 14px;">${item.focusState === 'active' ? '🎯' : '⏸'}</span>
            <span class="label">${item.label}</span>
            <span class="badge">${item.funnelStage || 'focus'}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  container.innerHTML = `
    <h1>Why are you here?</h1>
    <p class="subtitle" data-tip="Tabatha helps you browse with intention">Define your intent to proceed.</p>
    
    ${inheritHTML}
    
    <div class="section-label">Or define a new intent</div>
    <input type="text" id="context" placeholder="What are you working on? (e.g. Research, Debugging)" autofocus data-tip="Describe your intent — this becomes the tab's context">
    <select id="category" data-tip="Category helps Tabatha track time by type">
       <option value="work">💼 Work</option>
       <option value="learning">🎓 Learning</option>
       <option value="entertainment">🎮 Entertainment</option>
       <option value="media">🎵 Media</option>
       <option value="unknown" selected>❓ Uncategorized</option>
    </select>
    
    <div class="actions">
      <button class="btn-primary" id="continue" data-tip="Set intent and proceed to the site">Continue</button>
      <button class="btn-secondary" id="side-quest" data-tip="Quick 5-minute detour — Tabatha will remind you when time is up">⚔️ Side Quest (5m)</button>
      <button class="btn-danger" id="sugar-box" data-tip="Save this site for later as a reward — tab will close">🍬 Sugar Box</button>
      <button class="btn-secondary" id="park" data-tip="Save this tab to your Parked list for later — tab will close, find it in Settings > Parked Tabs">🅿️ Park</button>
      <button class="btn-nevermind" id="nevermind" data-tip="Close this tab — Tabatha logs that you chose not to proceed (focus win!)">🚫 Nevermind</button>
    </div>
    
    <a class="skip-link" id="skip-domain" data-tip="Stop showing this prompt on ${location.hostname} — you can re-enable it in Settings">Skip intent for this domain</a>
  `;
  shadow.appendChild(container);

  // 6. Logic
  const ctxInput = shadow.getElementById('context');
  const catInput = shadow.getElementById('category');
  
  const closeOverlay = () => {
    host.remove();
    document.body.style.overflow = '';
  };
  
  // Continue button
  shadow.getElementById('continue').onclick = async () => {
    const context = ctxInput.value;
    const category = catInput.value;
    if (!context) {
      ctxInput.style.borderColor = '#ff6b6b';
      ctxInput.placeholder = 'Please describe your intent...';
      return;
    }
    await chrome.runtime.sendMessage({ 
      type: 'SET_TAB_CONTEXT', 
      context, 
      category,
      intent: 'user_defined' 
    });
    // Log to intent history
    await chrome.runtime.sendMessage({
      type: 'LOG_INTENT_ACTION',
      action: 'continue',
      context,
      category,
      url: window.location.href,
      domain: location.hostname
    });
    closeOverlay();
  };
  
  // Side Quest
  shadow.getElementById('side-quest').onclick = async () => {
    const context = ctxInput.value || 'Side Quest';
    await chrome.runtime.sendMessage({ 
      type: 'START_SIDE_QUEST',
      context,
      minutes: 5 
    });
    await chrome.runtime.sendMessage({
      type: 'LOG_INTENT_ACTION',
      action: 'side_quest',
      context,
      url: window.location.href,
      domain: location.hostname
    });
    closeOverlay();
  };
  
  // Sugar Box
  shadow.getElementById('sugar-box').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'ADD_TO_SUGAR_BOX', url: window.location.href, title: document.title });
    await chrome.runtime.sendMessage({
      type: 'LOG_INTENT_ACTION',
      action: 'sugar_box',
      url: window.location.href,
      domain: location.hostname
    });
    // Tab will close via background
  };
  
  // Park
  shadow.getElementById('park').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'PARK_TAB', url: window.location.href, title: document.title });
    await chrome.runtime.sendMessage({
      type: 'LOG_INTENT_ACTION',
      action: 'park',
      url: window.location.href,
      domain: location.hostname
    });
    // Tab will close via background
  };
  
  // Nevermind — user chose not to proceed (focus win!)
  shadow.getElementById('nevermind').onclick = async () => {
    await chrome.runtime.sendMessage({
      type: 'LOG_INTENT_ACTION',
      action: 'nevermind',
      url: window.location.href,
      domain: location.hostname
    });
    // Close the tab entirely
    try {
      const tab = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' });
      if (tab?.tabId) await chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: tab.tabId });
    } catch (e) {
      window.close();
    }
  };
  
  // Skip intent for this domain
  shadow.getElementById('skip-domain').onclick = async () => {
    await chrome.runtime.sendMessage({
      type: 'SKIP_DOMAIN',
      domain: location.hostname
    });
    await chrome.runtime.sendMessage({
      type: 'LOG_INTENT_ACTION',
      action: 'skip_domain',
      url: window.location.href,
      domain: location.hostname
    });
    closeOverlay();
  };
  
  // Inherit from focus items
  const inheritItems = shadow.querySelectorAll('.inherit-item');
  inheritItems.forEach(el => {
    el.onclick = async () => {
      const focusId = el.getAttribute('data-inherit-id');
      const label = el.querySelector('.label').textContent;
      await chrome.runtime.sendMessage({
        type: 'SET_TAB_CONTEXT',
        context: label,
        category: 'work',
        intent: 'inherited_from_focus'
      });
      // Associate this tab with the focus item
      await chrome.runtime.sendMessage({
        type: 'ASSOCIATE_TAB_WITH_FOCUS',
        focusId,
        tabId: null // background will use sender.tab.id
      });
      await chrome.runtime.sendMessage({
        type: 'LOG_INTENT_ACTION',
        action: 'inherit',
        context: label,
        focusId,
        url: window.location.href,
        domain: location.hostname
      });
      closeOverlay();
    };
  });
  
  // Handle Enter key
  ctxInput.onkeydown = (e) => {
    if (e.key === 'Enter') shadow.getElementById('continue').click();
  };
  
})();
