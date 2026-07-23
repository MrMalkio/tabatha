// Tabatha — Intent-Popup (Gatekeeper)
// Injected at document_start to intercept browsing flow
// Formal name: Intent-Popup (InPop)

(async () => {
  // Security fix wave (2026-07-21 audit, NOW #1) — HTML-escaping helper.
  // Duplicated (not imported) on purpose: gatekeeper.js and inbar.js are each
  // built as a standalone classic (non-module) content script per manifest.json
  // content_scripts — Rollup only inlines a shared module when it's referenced
  // by a single entry point; importing this from 2+ content-script entries makes
  // it a separate chunk file with a real `import` statement in the output, which
  // Chrome cannot resolve for a classic script (verified empirically during this
  // fix — see docs/audits/2026-07-21-SYNTHESIS.md item 1). Canonical copy +
  // unit test live at src/utils/escapeHtml.js; keep both in sync if this changes.
  //
  // Moved INSIDE the IIFE in 6.7.68 (Koda adversarial review of TR-03, P2-C):
  // a top-level `const escapeHtml` would throw a parse-time SyntaxError if
  // this classic script is re-injected into an already-loaded document (e.g.
  // notificationService.js's openPopup re-injection path) — re-declaring a
  // top-level `const` is a syntax error, and a syntax error means the WHOLE
  // FILE fails to parse before even the double-injection guard below runs,
  // silently defeating that guard. Scoped inside the IIFE, a re-injection
  // just re-declares a function-scoped const on a fresh call, which is safe.
  // (Swept the rest of this file for the same hazard: no other top-level
  // const/let/class exists outside this IIFE.)
  const escapeHtml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // Guard against double-injection (e.g. this content script re-running on
  // the same document for any reason) — never stack two overlays.
  if (document.getElementById('tabatha-gatekeeper-host')) return;

  // 6.7.68 (Koda adversarial review of TR-03, P1-A): fast LOCAL pre-check,
  // read directly via chrome.storage.local — NOT a chrome.runtime.sendMessage
  // round-trip to the service worker — so a gatekeeper-disabled user gets a
  // decision before we ever create DOM, no service-worker wake required.
  // Mirrors tabService.js's checkContextNeeded(), which reads the exact same
  // `settings.gatekeeperEnabled` key via getStorage('settings') (itself just
  // chrome.storage.local.get('settings')). If we can positively confirm the
  // flag is off, bail with zero placeholder, zero flash. If the read throws,
  // or the key/flag is missing (e.g. this install has no settings written
  // yet), fail TOWARD gating and fall through — that ambiguity is exactly
  // why TR-03 exists (an un-gated flash is the failure this whole file is
  // for), and the indeterminate-window pointerEvents fix immediately below
  // makes fail-toward-gating cheap: it dims but never blocks a click until
  // the background positively confirms gating is needed.
  try {
    const { settings: localSettings } = await chrome.storage.local.get('settings');
    if (localSettings && localSettings.gatekeeperEnabled === false) return;
  } catch (e) { /* unreadable — fail toward gating, continue below */ }

  // TR-03 fix (2026-07-23): synchronous dimming placeholder, created and
  // attached BEFORE any await below. document_start guarantees
  // document.documentElement exists (body may not yet) so we attach there.
  // This closes the race where page content could paint while
  // CHECK_CONTEXT_NEEDED / GET_FOCUS_ENGINE / the storage.local round-trips
  // below are in flight — without this, a fast page could render a frame or
  // more of un-gated content before the intent gate appeared, defeating
  // "set intent before browsing."
  //
  // The SAME host + shadow root is reused (not replaced) once the full gate
  // is ready — see step 4 below — so the fast-resolve path is a content swap
  // inside an already-dim backdrop, not a placeholder->form flicker.
  const host = document.createElement('div');
  host.id = 'tabatha-gatekeeper-host';
  Object.assign(host.style, {
    position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
    zIndex: '2147483647',
    backgroundColor: 'rgba(0,0,0,0.35)',
    backdropFilter: 'blur(2px)',
    transition: 'background-color 0.12s ease-out, backdrop-filter 0.12s ease-out',
    // 6.7.68 (P1-A): dim-only during the indeterminate window between "we
    // don't yet know if gating is needed" and CHECK_CONTEXT_NEEDED's
    // response. Clicks must still reach the page here — we have NOT yet had
    // background confirmation that gating actually applies to this tab (a
    // disabled-but-locally-unconfirmed, or genuinely un-gated, tab must not
    // have its clicks swallowed). Flipped to 'auto' only once `needed: true`
    // comes back below — that's the real "promote toward the gate" point.
    pointerEvents: 'none'
  });
  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);

  // Becomes true once the full gate form is appended into `shadow`. Used to
  // decide whether a bail-out / error path should tear down the bare
  // placeholder (gate never materialized) or leave the real gate alone.
  let gateShown = false;
  const teardownPlaceholder = () => {
    if (!gateShown && host.isConnected) host.remove();
  };

  // 6.7.68 (P1-B): hard timeout wrapper for the background round-trips
  // below. Precedent: waitForBody()'s 3s safety timeout further down in this
  // file. Before this fix, a stalled/unresponsive service worker left the
  // `await chrome.runtime.sendMessage(...)` calls pending forever — the
  // surrounding try/catch only ever caught a *rejection*, never a hang, so
  // the placeholder (with pointerEvents now 'auto' once confirmed needed)
  // stayed attached over the page INDEFINITELY. That's strictly worse than
  // pre-TR-03 behavior, where a hang just meant "no gate appears" (page
  // stayed usable). withTimeout() turns a hang into a rejection after
  // ~2.5s so the existing catch blocks can tear the placeholder down and
  // quietly abort, restoring the old "usable page" failure mode.
  const withTimeout = (promise, ms = 2500) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Tabatha gatekeeper: background did not respond within ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });

  try {
  // 1. Check if we need to intercept
  let response;
  try {
    response = await withTimeout(chrome.runtime.sendMessage({ type: 'CHECK_CONTEXT_NEEDED' }));
  } catch (e) { teardownPlaceholder(); return; } // Extension context invalidated, or SW stall/timeout
  if (!response || !response.needed) { teardownPlaceholder(); return; }

  // Confirmed: gating IS needed for this tab. Only now do we start blocking
  // clicks — everything from here forward is "promoting toward the real
  // gate" per the P1-A fix above.
  host.style.pointerEvents = 'auto';

  // Capture inherited context for pre-filling the form
  const inheritedContext = response.inheritedContext || '';
  const inheritedIntent = response.inheritedIntent || '';
  const contextSource = response.contextSource || null;

  // 2. Gather data: focus items, recent intents, settings
  let focusItems = [];
  let recentIntents = [];
  let persistentIntents = [];
  let inheritCount = 3;
  let strictMode = true;
  let blurStrength = 10;

  try {
    // 6.7.68 (P1-B): same withTimeout wrapper as CHECK_CONTEXT_NEEDED above —
    // a stalled service worker must not hang this await. Unlike
    // CHECK_CONTEXT_NEEDED, a timeout/rejection here is non-fatal to the
    // gate itself (caught below, focusItems just stays empty) — the point is
    // only to guarantee this step can never be the thing that hangs the
    // whole IIFE and leaves the (now-blocking) placeholder stuck.
    const feRes = await withTimeout(chrome.runtime.sendMessage({ type: 'GET_FOCUS_ENGINE' }));
    if (feRes?.focusEngine?.items) {
      focusItems = Object.values(feRes.focusEngine.items)
        .filter(i => i.focusState === 'active' || i.focusState === 'paused')
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
  } catch (e) { /* no focus items, or SW stall/timeout — proceed without them */ }

  try {
    const stored = await chrome.storage.local.get(['intentHistory', 'intentPresets', 'settings']);
    inheritCount = stored.settings?.inheritItemCount || 3;
    strictMode = stored.settings?.inpopStrictMode !== false; // default true
    blurStrength = stored.settings?.inpopBlurStrength ?? 10;

    // Build recent from history (unique by context, today only, max 5)
    if (stored.intentHistory) {
      const today = new Date().toDateString();
      const seen = new Set();
      const activeLabels = new Set(focusItems.map(f => f.label.toLowerCase()));
      for (const entry of stored.intentHistory) {
        const context = entry.context ?? entry.newContext;
        if (context && new Date(entry.timestamp).toDateString() === today && !seen.has(context.toLowerCase()) && !activeLabels.has(context.toLowerCase())) {
          seen.add(context.toLowerCase());
          recentIntents.push(context);
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

  // 3. Wait for body to exist (document_start may fire before body)
  const waitForBody = () => new Promise(resolve => {
    if (document.body) return resolve();
    const obs = new MutationObserver(() => {
      if (document.body) { obs.disconnect(); resolve(); }
    });
    obs.observe(document.documentElement, { childList: true });
    // Safety timeout
    setTimeout(() => { obs.disconnect(); resolve(); }, 3000);
  });
  await waitForBody();
  if (!document.body) { teardownPlaceholder(); return; } // Still no body — abort

  // 4. Promote the placeholder into the full Shadow DOM Overlay. Reuse the
  // SAME `host` + `shadow` created synchronously above — do not create a new
  // host/shadow here — so there is no gap where the placeholder is removed
  // and the full gate hasn't yet appeared (which would flash raw page).
  Object.assign(host.style, {
    backgroundColor: `rgba(0,0,0,${strictMode ? 0.85 : 0.6})`,
    backdropFilter: `blur(${blurStrength}px)`,
    pointerEvents: strictMode ? 'auto' : 'auto'
  });
  if (strictMode) document.body.style.overflow = 'hidden';

  // 5. Styles
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
    .mode-badge { display: inline-block; font-size: 9px; padding: 1px 6px; border-radius: 3px; margin-left: 6px; font-weight: 600; }
    .mode-strict { background: #ff6b6b22; color: #ff6b6b; }
    .mode-relaxed { background: #66bb6a22; color: #66bb6a; }

    /* C11a — "Who's working?" segmented control (human default / agent) */
    .who-working { display: flex; gap: 4px; margin-bottom: 12px; background: #222; border: 1px solid #333; border-radius: 8px; padding: 3px; }
    .who-opt { flex: 1; padding: 7px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; cursor: pointer; text-align: center; color: #888; background: transparent; border: 1px solid transparent; transition: background 0.15s, color 0.15s, border-color 0.15s; margin: 0; }
    .who-opt:active { transform: none; }
    .who-opt.human.selected { background: #00e5ff18; color: #00e5ff; border-color: #00e5ff44; }
    .who-opt.agent.selected { background: #7c4dff22; color: #b388ff; border-color: #7c4dff66; }

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
    .btn-dismiss { background: transparent; color: #66bb6a; border: 1px solid #66bb6a44; grid-column: span 2; font-size: 11px; padding: 7px; }

    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary:hover { background: #444; }
    .btn-danger:hover { background: #4a2626; }
    .btn-later:hover { background: #2a3f5c; }
    .btn-nevermind:hover { color: #66bb6a; border-color: #66bb6a; }
    .btn-dismiss:hover { background: #66bb6a11; }

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
      white-space: normal;
      max-width: 250px;
      pointer-events: none;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      border: 1px solid #333;
      animation: tipFade 0.15s ease-out;
    }
    @keyframes tipFade { from { opacity: 0; transform: translateX(-50%) translateY(4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  `;
  shadow.appendChild(style);

  // 6. Build HTML
  const container = document.createElement('div');
  container.className = 'container';

  let activeHTML = '';
  if (focusItems.length > 0) {
    activeHTML = `<div class="preset-list">${focusItems.map(item => `
      <div class="preset-item active-item" data-inherit-id="${escapeHtml(item.id)}" data-tip="Click to inherit this focus. Or type above first to nest a sub-intent under it.">
        <span style="font-size:13px">${item.focusState === 'active' ? '🎯' : '⏸'}</span>
        <span class="label">${escapeHtml(item.label)}</span>
        <span class="badge">${escapeHtml(item.funnelStage || 'focus')}</span>
      </div>
    `).join('')}</div>`;
  }

  let recentHTML = '';
  if (recentIntents.length > 0) {
    recentHTML = `<div class="section-label">Recent</div><div class="preset-list">${recentIntents.map(label => `
      <div class="preset-item recent-item" data-preset="${escapeHtml(label)}" data-tip="Click to reuse this intent">
        <span class="label">${escapeHtml(label)}</span>
      </div>
    `).join('')}</div>`;
  }

  let commonHTML = '';
  if (persistentIntents.length > 0) {
    commonHTML = `<div class="section-label">Common</div><div class="preset-list">${persistentIntents.map(label => `
      <div class="preset-item common-item" data-preset="${escapeHtml(label)}" data-tip="Persistent intent — click to reuse">
        <span class="label">${escapeHtml(label)}</span>
      </div>
    `).join('')}</div>`;
  }

  const modeBadge = strictMode
    ? '<span class="mode-badge mode-strict">Strict</span>'
    : '<span class="mode-badge mode-relaxed">Relaxed</span>';

  const dismissBtn = !strictMode
    ? '<button class="btn-dismiss" id="dismiss" data-tip="Continue without setting intent — page will be accessible but untracked">Dismiss — browse without intent</button>'
    : '';

  container.innerHTML = `
    <h1>Why are you here?${modeBadge}</h1>
    <p class="subtitle" data-tip="Tabatha helps you browse with intention">Define your intent to proceed.</p>
    ${contextSource === 'inherited' ? `<div style="font-size:10px;color:#888;margin-bottom:6px;text-align:left;">Inherited from parent tab — confirm or change:</div>` : ''}

    <div class="who-working" id="who-working">
      <button class="who-opt human selected" data-who="human" data-tip="You are doing this work — tracked as human time">🧑 I'm working</button>
      <button class="who-opt agent" data-who="agent" data-tip="An AI agent is driving this tab — time recorded as agent-driven">🤖 Agent</button>
    </div>

    <input type="text" id="context" placeholder="What are you working on?" value="${escapeHtml(inheritedContext)}" autofocus data-tip="Type a new intent, or skip and click a preset below">

    ${activeHTML}
    ${recentHTML}
    ${commonHTML}

    <div class="actions">
      <button class="btn-primary" id="continue" data-tip="Set intent and proceed to the site">Continue</button>
      <button class="btn-secondary" id="side-quest" data-tip="Quick detour — Tabatha will remind you when time is up">⚔️ Side Quest</button>
      <button class="btn-danger" id="sugar-box" data-tip="Save this site for later as a reward — tab will close">🍬 Sugar Box</button>
      <button class="btn-secondary" id="park" data-tip="Save tab to Parked list — tab will close">🅿️ Park</button>
      <button class="btn-later" id="later" data-tip="Save this intent for future action — tab will close">🔖 Later</button>
      <button class="btn-nevermind" id="nevermind" data-tip="Close tab — logs a focus win!">🚫 Nevermind</button>
      ${dismissBtn}
      <div class="actions-subtext">Any button proceeds — each classifies your decision differently</div>
    </div>

    <a class="skip-link" id="skip-domain" data-tip="Stop showing this prompt on ${location.hostname}">Skip intent for this domain</a>
  `;
  shadow.appendChild(container);
  gateShown = true; // full gate is live — teardownPlaceholder() must no-op from here on

  // 7. Logic
  const ctxInput = shadow.getElementById('context');

  // C11a — "Who's working?" segmented control. Default 'human' (no span). When
  // 'agent' is selected, submitting the intent also opens a tab-scoped
  // controller span so the whole intent's time is attributed agent-driven.
  let whoWorking = 'human';
  shadow.querySelectorAll('.who-opt').forEach(btn => {
    btn.onclick = () => {
      whoWorking = btn.getAttribute('data-who');
      shadow.querySelectorAll('.who-opt').forEach(b => b.classList.toggle('selected', b === btn));
      if (ctxInput) ctxInput.focus();
    };
  });
  const maybeStartAgentSession = async () => {
    if (whoWorking !== 'agent') return;
    try {
      const tab = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' });
      await chrome.runtime.sendMessage({
        type: 'START_AGENT_SESSION',
        scope: 'tab',
        tabId: tab?.tabId ?? null,
        agentName: 'manual',
        source: 'manual'
      });
    } catch (e) { /* best-effort — never block the intent */ }
  };

  const closeOverlay = () => {
    host.remove();
    if (document.body) document.body.style.overflow = '';
  };

  const logAction = (action, extra = {}) =>
    chrome.runtime.sendMessage({
      type: 'LOG_INTENT_ACTION', action,
      url: window.location.href, domain: location.hostname,
      ...extra
    }).catch(() => {});

  const handlePresetClick = async (presetLabel, focusId = null) => {
    const typed = ctxInput.value.trim();
    // If user typed something AND clicked a preset, the typed text is the tab's context
    // and the preset becomes the parent focus (not concatenated)
    const context = typed || presetLabel;

    await chrome.runtime.sendMessage({
      type: 'SET_TAB_CONTEXT', context,
      category: 'work', intent: focusId ? 'inherited_from_focus' : 'preset'
    }).catch(() => {});

    if (focusId) {
      await chrome.runtime.sendMessage({ type: 'ASSOCIATE_TAB_WITH_FOCUS', focusId }).catch(() => {});
    } else if (typed && typed.toLowerCase() !== presetLabel.toLowerCase()) {
      // User typed a new intent and clicked a recent/common preset as context group
      // Set the preset as the parent context for this tab
      await chrome.runtime.sendMessage({
        type: 'SET_TAB_CONTEXT', context: typed,
        category: 'work', intent: 'child_of_preset',
        parentContext: presetLabel
      }).catch(() => {});
    }
    await maybeStartAgentSession();
    await logAction(focusId ? 'inherit' : 'continue', { context, focusId, parentContext: typed ? presetLabel : null });
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
    await chrome.runtime.sendMessage({ type: 'SET_TAB_CONTEXT', context, category: 'work', intent: 'user_defined' }).catch(() => {});
    await maybeStartAgentSession();
    await logAction('continue', { context });
    closeOverlay();
  };

  // Side Quest
  shadow.getElementById('side-quest').onclick = async () => {
    const context = ctxInput.value.trim() || 'Side Quest';
    await chrome.runtime.sendMessage({ type: 'START_SIDE_QUEST', context, minutes: 5 }).catch(() => {});
    await logAction('side_quest', { context });
    closeOverlay();
  };

  // Sugar Box
  shadow.getElementById('sugar-box').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'ADD_TO_SUGAR_BOX', url: window.location.href, title: document.title }).catch(() => {});
    await logAction('sugar_box');
    closeOverlay();
    try {
      const tab = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' });
      if (tab?.tabId) await chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: tab.tabId });
    } catch (e) { window.close(); }
  };

  // Park
  shadow.getElementById('park').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'PARK_TAB', url: window.location.href, title: document.title }).catch(() => {});
    await logAction('park');
    closeOverlay();
    try {
      const tab = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' });
      if (tab?.tabId) await chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: tab.tabId });
    } catch (e) { window.close(); }
  };

  // Later
  shadow.getElementById('later').onclick = async () => {
    const context = ctxInput.value.trim() || document.title;
    await chrome.runtime.sendMessage({ type: 'PARK_TAB', url: window.location.href, title: document.title, context }).catch(() => {});
    await logAction('later', { context });
    closeOverlay();
    try {
      const tab = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' });
      if (tab?.tabId) await chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: tab.tabId });
    } catch (e) { window.close(); }
  };

  // Nevermind
  shadow.getElementById('nevermind').onclick = async () => {
    await logAction('nevermind');
    try {
      const tab = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' });
      if (tab?.tabId) await chrome.runtime.sendMessage({ type: 'CLOSE_TAB', tabId: tab.tabId });
    } catch (e) { window.close(); }
  };

  // Dismiss (non-strict only)
  const dismissBtn_ = shadow.getElementById('dismiss');
  if (dismissBtn_) {
    dismissBtn_.onclick = async () => {
      await logAction('dismiss');
      closeOverlay();
    };
  }

  // Skip domain
  shadow.getElementById('skip-domain').onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'SKIP_DOMAIN', domain: location.hostname }).catch(() => {});
    await logAction('skip_domain');
    closeOverlay();
  };

  // Inherit clicks
  shadow.querySelectorAll('[data-inherit-id]').forEach(el => {
    el.onclick = () => handlePresetClick(el.querySelector('.label').textContent, el.getAttribute('data-inherit-id'));
  });

  // Preset clicks
  shadow.querySelectorAll('[data-preset]').forEach(el => {
    el.onclick = () => handlePresetClick(el.getAttribute('data-preset'));
  });

  // Enter key
  ctxInput.onkeydown = (e) => { if (e.key === 'Enter') shadow.getElementById('continue').click(); };
  } catch (err) {
    // TR-03 safety net: if anything above throws before the full gate is
    // appended, never leave the dimming placeholder stuck over the page.
    teardownPlaceholder();
    if (!gateShown && document.body) document.body.style.overflow = '';
    console.error('[Tabatha] gatekeeper failed to render intent gate:', err);
  }
})();
