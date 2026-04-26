// Tabatha — Gatekeeper Overlay
// Injected at document_start to intercept browsing flow

(async () => {
  // 1. Check if we need to intercept
  // We ask background: "Does this tab have a parent context?"
  // If no parent context AND no current context AND tab is new -> Intercept
  
  const response = await chrome.runtime.sendMessage({ type: 'CHECK_CONTEXT_NEEDED' });
  if (!response || !response.needed) return;

  // 2. Create Shadow DOM Overlay
  const host = document.createElement('div');
  host.id = 'tabatha-gatekeeper-host';
  host.style.position = 'fixed';
  host.style.top = '0';
  host.style.left = '0';
  host.style.width = '100vw';
  host.style.height = '100vh';
  host.style.zIndex = '2147483647'; // Max z-index
  host.style.backgroundColor = 'rgba(0,0,0,0.85)';
  host.style.backdropFilter = 'blur(10px)';
  
  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);
  
  // 3. Prevent scrolling on body
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
      padding: 40px;
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      width: 400px;
      text-align: center;
      border: 1px solid #333;
    }
    h1 { margin: 0 0 10px; font-size: 24px; font-weight: 600; }
    p { color: #888; margin-bottom: 30px; }
    
    input, select {
      width: 100%;
      padding: 12px;
      margin-bottom: 20px;
      background: #333;
      border: 1px solid #444;
      color: white;
      border-radius: 8px;
      font-size: 14px;
      box-sizing: border-box;
    }
    
    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 20px;
    }
    
    button {
      padding: 12px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: transform 0.1s, opacity 0.2s;
    }
    button:active { transform: scale(0.98); }
    
    .btn-primary { background: #fff; color: #000; grid-column: span 2; }
    .btn-secondary { background: #333; color: #fff; border: 1px solid #444; }
    .btn-danger { background: #3c1f1f; color: #ff6b6b; border: 1px solid #5c2b2b; }
    
    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary:hover { background: #444; }
    .btn-danger:hover { background: #4a2626; }
  `;
  shadow.appendChild(style);
  
  // 5. DOM Structure
  const container = document.createElement('div');
  container.className = 'container';
  container.innerHTML = `
    <h1>What are you down for?</h1>
    <p>Define your intent to proceed.</p>
    
    <input type="text" id="context" placeholder="Context (e.g. Work, Research)" autofocus>
    <select id="category">
       <option value="work">💼 Work</option>
       <option value="learning">🎓 Learning</option>
       <option value="entertainment">🎮 Entertainment</option>
       <option value="media">🎵 Media</option>
       <option value="unknown" selected>❓ Uncategorized</option>
    </select>
    
    <div class="actions">
      <button class="btn-primary" id="continue">Continue</button>
      <button class="btn-secondary" id="side-quest">⚔️ Side Quest (5m)</button>
      <button class="btn-danger" id="sugar-box">🍬 Sugar Box</button>
      <button class="btn-secondary" id="park">🅿️ Park</button>
    </div>
  `;
  shadow.appendChild(container);
  
  // 6. Logic
  const ctxInput = shadow.getElementById('context');
  const catInput = shadow.getElementById('category');
  
  const closeOverlay = () => {
    host.remove();
    document.body.style.overflow = '';
  };
  
  shadow.getElementById('continue').onclick = async () => {
    const context = ctxInput.value;
    const category = catInput.value;
    if (!context) {
        ctxInput.style.borderColor = 'red';
        return;
    }
    await chrome.runtime.sendMessage({ 
        type: 'SET_TAB_CONTEXT', 
        context, 
        category,
        intent: 'user_defined' 
    });
    closeOverlay();
  };
  
  shadow.getElementById('side-quest').onclick = async () => {
    const context = ctxInput.value || 'Side Quest';
    await chrome.runtime.sendMessage({ 
        type: 'START_SIDE_QUEST',
        context,
        minutes: 5 
    });
    closeOverlay();
  };
  
  shadow.getElementById('sugar-box').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'ADD_TO_SUGAR_BOX', url: window.location.href, title: document.title });
    // Tab will close via background
  };
  
  shadow.getElementById('park').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'PARK_TAB', url: window.location.href, title: document.title });
    // Tab will close via background
  };
  
  // Handle Enter key
  ctxInput.onkeydown = (e) => {
    if (e.key === 'Enter') shadow.getElementById('continue').click();
  };
  
})();
