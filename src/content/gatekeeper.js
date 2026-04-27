// Tabatha — Intent-Popup (Gatekeeper)
// Injected at document_start to intercept browsing flow
// Formal name: Intent-Popup (InPop)

(async () => {
  // 1. Check if we need to intercept
  const response = await chrome.runtime.sendMessage({ type: 'CHECK_CONTEXT_NEEDED' });
  if (!response || !response.needed) return;

  // 2. Gather data: focus items, recent intents, settings
  let focusItems = [];
  let recentIntents = [];
  let persistentIntents = [];
  let inheritCount = 3;

  try {
    const feRes = await chrome.runtime.sendMessage({ type: 'GET_FOCUS_ENGINE' });
    if (feRes?.focusEngine?.items) {
      focusItems = Object.values(feRes.focusEngine.items)
        .filter(i => i.focusState === 'active' || i.focusState === 'paused')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
  } catch (e) { /* no focus items */ }

  try {
    const stored = await chrome.storage.local.get(['intentHistory', 'intentPresets', 'settings']);
    inheritCount = stored.settings?.inheritItemCount || 3;

    // Build recent from history (unique by context, today only, max 5)
    if (stored.intentHistory) {
      const today = new Date().toDateString();
      const seen = new Set();
      // Also track active focus labels to deduplicate
      const activeLabels = new Set(focusItems.map(f => f.label.toLowerCase()));
      for (const entry of stored.intentHistory) {
        if (entry.context && new Date(entry.timestamp).toDateString() === today && !seen.has(entry.context.toLowerCase()) && !activeLabels.has(entry.context.toLowerCase())) {
          seen.add(entry.context.toLowerCase());
          recentIntents.push(entry.context);
          if (recentIntents.length >= 5) break;
        }
      }
    }
    // Persistent presets
    if (stored.intentPresets?.persistent) {
      const activeLabels = new Set(focusItems.map(f => f.label.toLowerCase()));
      const recentLabels = new Set(recentIntents.map(r => r.toLowerCase()));
      persistentIntents = stored.intentPresets.persistent
        .filter(p => !activeLabels.has(p.label.toLowerCase()) && !recentLabels.has(p.label.toLowerCase()))
        .map(p => p.label);
    }
  } catch (e) { /* ignore */ }

  focusItems = focusItems.slice(0, inheritCount);

  // 3. Create Shadow DOM Overlay
  const host = document.createElement('div');
  host.id = 'tabatha-gatekeeper-host';
  Object.assign(host.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    zIndex: '2147483647', backgroundColor: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)'
  });

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
    * { box-sizing: border-box; }
    .container {
      background: #1a1a1a;
      padding: 28px 32px;
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      width: 400px;
      text-align: center;
      border: 1px solid #333;
    }
    h1 { margin: 0 0 4px; font-size: 20px; font-weight: 700; letter-spacing: 0.02em; }
    .subtitle { color: #888; margin: 0 0 18px; font-size: 12px; }

    input, select {
      width: 100%;
      padding: 9px 12px;
      margin-bottom: 10px;
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
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #555;
      text-align: left;
      margin: 10px 0 5px;
      font-weight: 600;
    }

    .preset-list { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }

    .preset-item {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 10px; background: #252525; border: 1px solid #333;
      border-radius: 6px; cursor: pointer; text-align: left;
      color: #ccc; transition: border-color 0.15s, background 0.15s;
    }
    .preset-item:hover { border-color: #00e5ff; background: #2a2a2a; }
    .preset-item .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .preset-item .badge { font-size: 8px; background: #333; padding: 1px 5px; border-radius: 3px; color: #888; }

    /* Size variants */
    .preset-item.active-item { font-size: 12px; padding: 8px 10px; }
    .preset-item.recent-item { font-size: 11px; padding: 5px 9px; color: #aaa; }
    .preset-item.common-item { font-size: 10px; padding: 4px 8px; color: #888; background: #222; border-color: #2a2a2a; }
    .preset-item.common-item:hover { border-color: #555; }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 14px;
    }

    button {
      padding: 9px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      transition: transform 0.1s, opacity 0.2s;
    }
    button:active { transform: scale(0.98); }

    .btn-primary { background: #fff; color: #000; grid-column: span 2; }
    .btn-secondary { background: #333; color: #fff; border: 1px solid #444; }
    .btn-danger { background: #3c1f1f; color: #ff6b6b; border: 1px solid #5c2b2b; }
    .btn-later { background: #1f2f3c; color: #6bb3ff; border: 1px solid #2b3f5c; }
    .btn-nevermind { background: transparent; color: #888; border: 1px solid #444; grid-column: span 2; }

    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary:hover { background: #444; }
    .btn-danger:hover { background: #4a2626; }
    .btn-later:hover { background: #2a3f5c; }
    .btn-nevermind:hover { color: #66bb6a; border-color: #66bb6a; }

    .actions-subtext {
      grid-column: span 2;
      font-size: 9px;
      color: #555;
      text-align: center;
      margin-top: 2px;
    }

    .skip-link {
      display: block;
      margin-top: 14px;
      font-size: 10px;
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
      max-width: 250px;
      white-space: normal;
      pointer-events: none;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      border: 1px solid #333;
      animation: tipFade 0.15s ease-out;
    }
    @keyframes tipFade { from { opacity: 0; transform: translateX(-50%) translateY(4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  `;
  shadow.appendChild(style);

  // 5. Build HTML
  const container = document.createElement('div');
  container.className = 'container';

  // Active focus items
  let activeHTML = '';
  if (focusItems.length > 0) {
    activeHTML = `<div class="preset-list">${focusItems.map(item => `
      <div class="preset-item active-item" data-inherit-id="${item.id}" data-tip="Click to inherit this focus. Or type above first to nest a sub-intent under it.">
        <span style="font-size:13px">${item.focusState === 'active' ? '🎯' : '⏸'}</span>
        <span class="label">${item.label}</span>
        <span class="badge">${item.funnelStage || 'focus'}</span>
      </div>
    `).join('')}</div>`;
  }

  // Recent intents
  let recentHTML = '';
  if (recentIntents.length > 0) {
    recentHTML = `<div class="section-label">Recent</div><div class="preset-list">${recentIntents.map(label => `
      <div class="preset-item recent-item" data-preset="${label}" data-tip="Click to reuse this intent, or type above first to nest under it">
        <span class="label">${label}</span>
      </div>
    `).join('')}</div>`;
  }

  // Persistent / common intents
  let commonHTML = '';
  if (persistentIntents.length > 0) {
    commonHTML = `<div class="section-label">Common</div><div class="preset-list">${persistentIntents.map(label => `
      <div class="preset-item common-item" data-preset="${label}" data-tip="Persistent intent — click to reuse">
        <span class="label">${label}</span>
      </div>
    `).join('')}</div>`;
  }

  container.innerHTML = `
    <h1>Why are you here?</h1>
    <p class="subtitle" data-tip="Tabatha helps you browse with intention">Define your intent to proceed.</p>

    <input type="text" id="context" placeholder="What are you working on?" autofocus data-tip="Type a new intent, or skip and click a preset below">

    ${activeHTML}
    ${recentHTML}
    ${commonHTML}

    <div class="actions">
      <button class="btn-primary" id="continue" data-tip="Set intent and proceed to the site">Continue</button>
      <button class="btn-secondary" id="side-quest" data-tip="Quick detour — Tabatha will remind you when time is up">⚔️ Side Quest</button>
      <button class="btn-danger" id="sugar-box" data-tip="Save this site for later as a reward — tab will close">🍬 Sugar Box</button>
      <button class="btn-secondary" id="park" data-tip="Save tab to Parked list — tab will close, find in Settings">🅿️ Park</button>
      <button class="btn-later" id="later" data-tip="Save this intent for future action — tab will close">🔖 Later</button>
      <button class="btn-nevermind" id="nevermind" data-tip="Close tab — logs a focus win! You chose not to proceed.">🚫 Nevermind</button>
      <div class="actions-subtext">Any button proceeds — each classifies your decision differently</div>
    </div>

    <a class="skip-link" id="skip-domain" data-tip="Stop showing this prompt on ${location.hostname}">Skip intent for this domain</a>
  `;
  shadow.appendChild(container);

  // 6. Logic
  const ctxInput = shadow.getElementById('context');

  const closeOverlay = () => {
    host.remove();
    document.body.style.overflow = '';
  };

  const logAction = (action, extra = {}) =>
    chrome.runtime.sendMessage({
      type: 'LOG_INTENT_ACTION', action,
      url: window.location.href, domain: location.hostname,
      ...extra
    });

  // Helper: process preset click (handles threading if text is in input)
  const handlePresetClick = async (presetLabel, focusId = null) => {
    const typed = ctxInput.value.trim();
    let context = presetLabel;

    if (typed) {
      // Threading: typed text becomes sub-intent under the clicked preset
      context = `${presetLabel} — ${typed}`;
    }

    await chrome.runtime.sendMessage({
      type: 'SET_TAB_CONTEXT',
      context,
      category: 'work',
      intent: focusId ? 'inherited_from_focus' : 'preset'
    });

    if (focusId) {
      await chrome.runtime.sendMessage({ type: 'ASSOCIATE_TAB_WITH_FOCUS', focusId });
    }

    await logAction(focusId ? 'inherit' : 'continue', { context, focusId });
    closeOverlay();
  };

  // Continue
  shadow.getElementById('continue').onclick = async () => {
    const context = ctxInput.value.trim();
    if (!context) {
      ctxInput.style.borderColor = '#ff6b6b';
      ctxInput.placeholder = 'Please describe your intent...';
      return;
    }
    await chrome.runtime.sendMessage({
      type: 'SET_TAB_CONTEXT', context,
      category: 'work', intent: 'user_defined'
    });
    await logAction('continue', { context });
    closeOverlay();
  };

  // Side Quest
  shadow.getElementById('side-quest').onclick = async () => {
    const context = ctxInput.value.trim() || 'Side Quest';
    await chrome.runtime.sendMessage({ type: 'START_SIDE_QUEST', context, minutes: 5 });
    await logAction('side_quest', { context });
    closeOverlay();
  };

  // Sugar Box
  shadow.getElementById('sugar-box').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'ADD_TO_SUGAR_BOX', url: window.location.href, title: document.title });
    await logAction('sugar_box');
  };

  // Park
  shadow.getElementById('park').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'PARK_TAB', url: window.location.href, title: document.title });
    await logAction('park');
  };

  // Later
  shadow.getElementById('later').onclick = async () => {
    const context = ctxInput.value.trim() || document.title;
    await chrome.runtime.sendMessage({ type: 'PARK_TAB', url: window.location.href, title: document.title, context });
    await logAction('later', { context });
  };

  // Nevermind
  shadow.getElementById('nevermind').onclick = async () => {
    await logAction('nevermind');
    try {
      const tab = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' });
      if (tab?.tabId) await chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: tab.tabId });
    } catch (e) { window.close(); }
  };

  // Skip domain
  shadow.getElementById('skip-domain').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'SKIP_DOMAIN', domain: location.hostname });
    await logAction('skip_domain');
    closeOverlay();
  };

  // Active focus items (inherit)
  shadow.querySelectorAll('[data-inherit-id]').forEach(el => {
    el.onclick = () => handlePresetClick(
      el.querySelector('.label').textContent,
      el.getAttribute('data-inherit-id')
    );
  });

  // Recent + common presets
  shadow.querySelectorAll('[data-preset]').forEach(el => {
    el.onclick = () => handlePresetClick(el.getAttribute('data-preset'));
  });

  // Enter key
  ctxInput.onkeydown = (e) => {
    if (e.key === 'Enter') shadow.getElementById('continue').click();
  };

})();
