// Tabatha — Intent Bar (InBar)
// Non-intrusive bottom/top bar showing current intent, task, and timers
// Collapses to a persistent nub toggle when dismissed
// Supports inline note-taking for current focus/task/intent
// Supports pause + sticky note overlay for "where I left off" context
//
// Cortex C9 voice output (Plan 042 T2/T5): when voice.output is enabled, the
// focus-timer-expired and drift overlays are announced by Tabby's voice first
// (tone → mic hold-off window → spoken line), and the classic overlay is
// delayed until after. Default OFF — with voice disabled the overlays behave
// exactly as before. voiceOutput.js (and its voiceDecision.js dep) are imported
// ONLY here among content-script entries, so rollup inlines them into inbar.js.

import { tabbyAnnounce } from '../services/voiceOutput.js';

// Security fix wave (2026-07-21 audit, NOW #1) — HTML-escaping helper.
// Duplicated (not imported) on purpose: gatekeeper.js and inbar.js are each
// built as a standalone classic (non-module) content script per manifest.json
// content_scripts — Rollup only inlines a shared module when it's referenced
// by a single entry point; importing this from 2+ content-script entries makes
// it a separate chunk file with a real `import` statement in the output, which
// Chrome cannot resolve for a classic script (verified empirically during this
// fix — see docs/audits/2026-07-21-SYNTHESIS.md item 1). Canonical copy +
// unit test live at src/utils/escapeHtml.js; keep both in sync if this changes.
const escapeHtml = (str) => {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

(async () => {
  // 1. Get current tab's context and active focus
  let tabContext, activeFocus, settings, currentNote = '', allFocusItems = [], activeFocusId = null, isTabLinked = false, windowCount = 0;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_INBAR_DATA' });
    if (!res || !res.show) return;
    tabContext = res.tabContext;
    activeFocus = res.activeFocus;
    settings = res.settings || {};
    allFocusItems = res.allFocusItems || [];
    activeFocusId = res.activeFocusId || null;
    isTabLinked = !!res.isTabLinked;
    windowCount = res.windowCount || 0;
    // Fetch saved note
    const noteRes = await chrome.runtime.sendMessage({ type: 'GET_INBAR_NOTES' });
    currentNote = noteRes?.note || '';
  } catch (e) { return; }

  // Config
  const position = settings.inbarPosition || 'bottom';
  const BAR_HEIGHT = 26;
  const NUB_SIZE = 20;
  const NOTES_HEIGHT = 120;

  // 2. Wait for body
  if (!document.body) {
    await new Promise(resolve => {
      const obs = new MutationObserver(() => {
        if (document.body) { obs.disconnect(); resolve(); }
      });
      obs.observe(document.documentElement, { childList: true });
      setTimeout(() => { obs.disconnect(); resolve(); }, 3000);
    });
  }
  if (!document.body) return;

  // State
  let isCollapsed = false;
  let isNotesOpen = false;
  let isPaused = false;
  let isPausePromptOpen = false;
  let pauseNote = '';
  let pausedAt = null;

  // Restore pause state from storage (this tab or URL-matching paused tab)
  let matchedPauseFromUrl = false;
  try {
    const tabId = (await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' }))?.tabId;
    if (tabId) {
      const stored = await chrome.storage.local.get('pausedIntents');
      const pausedIntents = stored.pausedIntents || {};
      const pauseData = pausedIntents[tabId];
      if (pauseData) {
        isPaused = true;
        pauseNote = pauseData.note || '';
        pausedAt = pauseData.pausedAt;
      } else {
        // Check if any OTHER paused tab has the same URL (duplicated/navigated tab)
        const currentUrl = window.location.href.split('#')[0]; // strip fragment
        for (const [pid, pdata] of Object.entries(pausedIntents)) {
          if (pid !== String(tabId) && pdata.url && pdata.url.split('#')[0] === currentUrl && pdata.note) {
            isPaused = true;
            pauseNote = pdata.note || '';
            pausedAt = pdata.pausedAt;
            matchedPauseFromUrl = true;
            break;
          }
        }
      }
    }
  } catch (e) { /* no stored pause state */ }

  // C11a: agent-driven session state. The 🤖 toggle controls a machine-scoped
  // controller span; while any machine/window span is open the bar shows a
  // violet "🤖 AGENT" badge so the human always knows an agent is driving.
  let agentActive = false;
  let agentSessionId = null;
  try {
    const ar = await chrome.runtime.sendMessage({ type: 'LIST_AGENT_SESSIONS' });
    const openSpans = (ar?.open || []).filter(s => s.scope === 'machine' || s.scope === 'window');
    if (openSpans.length) {
      agentActive = true;
      agentSessionId = (openSpans.find(s => s.scope === 'machine') || openSpans[openSpans.length - 1]).id;
    }
  } catch (e) { /* no agent session service / not signed in */ }
  const barClass = () => `bar${isPaused ? ' paused' : ''}${agentActive ? ' agent-mode' : ''}`;

  // 3. Create host container — uses position:fixed but pushes page via margin
  const host = document.createElement('div');
  host.id = 'tabatha-inbar-host';
  Object.assign(host.style, {
    position: 'fixed',
    [position]: '0',
    left: '0',
    width: '100vw',
    height: `${BAR_HEIGHT}px`,
    zIndex: '2147483646',
    pointerEvents: 'none',
    transition: 'height 0.2s ease'
  });
  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);

  // ─── CRITICAL: Prevent host page from stealing keyboard events ───
  // Without this, keystrokes in InBar inputs propagate to the host page
  // and get intercepted by page JS (e.g. Gmail single-key shortcuts,
  // Google Docs focus management, etc.)
  ['keydown', 'keyup', 'keypress'].forEach(eventType => {
    host.addEventListener(eventType, (e) => {
      e.stopPropagation();
    }, true); // capture phase — catches before page JS sees it
  });

  // 4. Push page content
  // Plain body margin only reflows document flow — it does nothing for the host
  // page's own position:fixed headers/footers (very common on SPA shells), and can
  // be beaten by the page's own !important margin/height resets. Setting a transform
  // on <body> makes body the containing block for its fixed descendants, so they move
  // down/up with the pushed content instead of staying pinned under the bar; the
  // !important priority keeps our margin from being overridden by page styles.
  const pushPage = (h) => {
    document.body.style.setProperty('transition', 'margin 0.2s ease', 'important');
    if (h > 0) document.body.style.setProperty('transform', 'translateZ(0)', 'important');
    else document.body.style.removeProperty('transform');
    if (position === 'bottom') {
      document.body.style.setProperty('margin-bottom', `${h}px`, 'important');
    } else {
      document.body.style.setProperty('margin-top', `${h}px`, 'important');
    }
  };
  pushPage(BAR_HEIGHT);

  // 5. Styles
  let tabIntent = tabContext?.context || tabContext?.intent || null;
  let focusLabel = activeFocus?.label || null;
  let intentLabel = tabIntent || focusLabel || null;
  let hasFocus = !!activeFocus;
  let hasContext = !!intentLabel;

  const style = document.createElement('style');
  style.textContent = `
    * { box-sizing: border-box; }
    :host {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 11px;
      color: #ccc;
    }

    /* === FULL BAR === */
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: ${BAR_HEIGHT}px;
      background: #0d0d0d;
      border-${position === 'bottom' ? 'top' : 'bottom'}: 1px solid rgba(255,255,255,0.08);
      padding: 0 10px;
      gap: 8px;
      user-select: none;
      pointer-events: auto;
      backdrop-filter: blur(12px);
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    .bar.hidden { transform: translateY(${position === 'bottom' ? '100%' : '-100%'}); opacity: 0; pointer-events: none; }

    .left, .right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .center { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; }
    .intent-label { font-weight: 500; color: #eee; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; cursor: pointer; transition: color 0.15s; }
    .intent-label:hover { color: #66bb6a; text-decoration: underline; }
    .focus-label-left { font-size: 10px; font-weight: 600; color: #00e5ff; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-label { font-size: 10px; color: #777; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stale-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ffa726; margin-left: 4px; animation: stale-pulse 1.5s ease-in-out infinite; vertical-align: middle; }
    @keyframes stale-pulse { 0%,100% { opacity: 0.4; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
    .timer { font-variant-numeric: tabular-nums; font-size: 10px; font-weight: 600; letter-spacing: 0.3px; }
    .timer-up { color: #00e5ff; }
    .timer-down { color: #ff6b6b; }
    .timer-task { color: #66bb6a; }
    .divider { width: 1px; height: 10px; background: rgba(255,255,255,0.12); flex-shrink: 0; }
    .badge { font-size: 7px; padding: 1px 4px; border-radius: 3px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-focus { background: #00e5ff18; color: #00e5ff; border: 1px solid #00e5ff33; }
    .badge-no-intent { background: #ff6b6b12; color: #ff6b6b; border: 1px solid #ff6b6b33; cursor: pointer; padding: 2px 8px; font-size: 9px; }
    .badge-no-intent:hover { background: #ff6b6b22; }
    /* C11a agent-mode (violet — distinct from cyan focus / red no-intent / amber pause) */
    .badge-agent { background: #7c4dff1f; color: #b388ff; border: 1px solid #7c4dff55; padding: 2px 8px; font-size: 9px; }
    .bar.agent-mode { border-color: rgba(124,77,255,0.4); box-shadow: inset 0 0 0 1px rgba(124,77,255,0.14); }
    .bar-btn.agent-btn { color: #888; }
    .bar-btn.agent-btn:hover { color: #b388ff; background: rgba(124,77,255,0.12); }
    .bar-btn.agent-btn.is-agent { color: #b388ff; }
    .nub.is-agent { color: #b388ff; border-color: #7c4dff66; }
    .nub.is-agent:hover { box-shadow: 0 0 8px rgba(124,77,255,0.35); }

    .bar-btn {
      background: none; border: none; color: #555; font-size: 11px;
      cursor: pointer; padding: 2px 4px; line-height: 1; border-radius: 3px;
      transition: color 0.15s, background 0.15s;
    }
    .bar-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }
    .bar-btn.note-btn { color: ${currentNote ? '#ffc107' : '#555'}; }
    .bar-btn.note-btn:hover { color: #ffd54f; }

    /* === NUB (collapsed toggle) === */
    .nub {
      position: fixed;
      ${position}: 6px;
      right: 12px;
      width: ${NUB_SIZE}px;
      height: ${NUB_SIZE}px;
      border-radius: 50%;
      background: #1a1a1a;
      border: 1px solid rgba(255,255,255,0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      font-size: 9px;
      color: #00e5ff;
      transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease;
      opacity: 0;
      transform: scale(0.6);
      z-index: 2147483647;
      box-shadow: 0 1px 6px rgba(0,0,0,0.5);
    }
    .nub.visible { opacity: 1; transform: scale(1); }
    .nub:hover { background: #222; box-shadow: 0 0 8px rgba(0,229,255,0.3); border-color: #00e5ff44; }
    .nub.has-note { color: #ffc107; border-color: #ffc10744; }
    .nub.has-note:hover { box-shadow: 0 0 8px rgba(255,193,7,0.3); }

    /* === NOTES PANEL === */
    .notes-panel {
      position: absolute;
      ${position === 'bottom' ? 'bottom' : 'top'}: ${BAR_HEIGHT}px;
      right: 0;
      width: 320px;
      height: 0;
      overflow: hidden;
      background: #141414;
      border: 1px solid rgba(255,255,255,0.1);
      border-${position === 'bottom' ? 'top-left' : 'bottom-left'}-radius: 8px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
      transition: height 0.2s ease;
      pointer-events: auto;
    }
    .notes-panel.open { height: ${NOTES_HEIGHT}px; }
    .notes-inner {
      padding: 8px 10px;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .notes-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .notes-header span { color: #ffc107; }
    .notes-textarea {
      flex: 1;
      background: #0a0a0a;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 4px;
      color: #ddd;
      font-family: inherit;
      font-size: 11px;
      padding: 6px 8px;
      resize: none;
      outline: none;
      line-height: 1.4;
    }
    .notes-textarea:focus { border-color: #00e5ff44; }
    .notes-textarea::placeholder { color: #444; }
    .notes-saved {
      font-size: 9px;
      color: #66bb6a;
      text-align: right;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .notes-saved.show { opacity: 1; }

    /* === PAUSE FEATURE === */
    .bar-btn.pause-btn { color: #888; }
    .bar-btn.pause-btn:hover { color: #ffc107; background: rgba(255,193,7,0.1); }
    .bar-btn.pause-btn.is-paused { color: #66bb6a; }
    .bar-btn.pause-btn.is-paused:hover { color: #81c784; background: rgba(102,187,106,0.1); }
    .bar.paused { background: linear-gradient(90deg, #1a1400 0%, #0d0d0d 40%); border-color: rgba(255,193,7,0.15); }
    .pause-label { font-size: 10px; color: #ffc107; font-weight: 600; display: flex; align-items: center; gap: 4px; }
    .pause-label .note-preview { color: #bbb; font-weight: 400; font-style: italic; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .resume-btn-inline { background: #66bb6a22; color: #66bb6a; border: 1px solid #66bb6a44; border-radius: 4px; padding: 2px 8px; font-size: 10px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    .resume-btn-inline:hover { background: #66bb6a33; border-color: #66bb6a66; }

    /* Pause mini-prompt */
    .pause-prompt { position: absolute; ${position === 'bottom' ? 'bottom' : 'top'}: ${BAR_HEIGHT}px; right: 40px; width: 300px; background: #1a1a0a; border: 1px solid rgba(255,193,7,0.2); border-radius: 8px; box-shadow: 0 -4px 20px rgba(0,0,0,0.5); padding: 10px 12px; pointer-events: auto; transform: scaleY(0); transform-origin: ${position === 'bottom' ? 'bottom' : 'top'}; transition: transform 0.2s ease; }
    .pause-prompt.open { transform: scaleY(1); }
    .pause-prompt-title { font-size: 10px; font-weight: 700; color: #ffc107; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .pause-prompt-input { width: 100%; background: #0d0d00; border: 1px solid rgba(255,193,7,0.15); border-radius: 4px; color: #ddd; font-family: inherit; font-size: 11px; padding: 6px 8px; resize: none; outline: none; height: 48px; line-height: 1.4; }
    .pause-prompt-input:focus { border-color: #ffc10744; }
    .pause-prompt-input::placeholder { color: #555; }
    .pause-prompt-actions { display: flex; gap: 6px; margin-top: 6px; justify-content: flex-end; }
    .pause-prompt-btn { padding: 4px 12px; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; }
    .pause-confirm { background: #ffc107; color: #000; }
    .pause-confirm:hover { background: #ffd54f; }
    .pause-cancel { background: #333; color: #aaa; }
    .pause-cancel:hover { background: #444; }


    /* Backburner Alert Notification Card */

    .backburner-alert-card {
      position: fixed;
      top: 24px;
      right: 24px;
      width: 320px;
      background: rgba(21, 9, 11, 0.95);
      border: 1px solid #ff5252;
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(255, 82, 82, 0.35);
      padding: 12px 14px;
      pointer-events: auto;
      backdrop-filter: blur(12px);
      z-index: 2147483647;
      animation: alertSlideIn 0.3s ease-out;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .backburner-alert-card.hidden { display: none; }
    @keyframes alertSlideIn {
      from { transform: translateX(120%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .backburner-alert-card-title {
      font-weight: 700;
      color: #ff5252;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .backburner-alert-card-focus {
      font-size: 12px;
      font-weight: 600;
      color: #eee;
    }
    .backburner-alert-card-reason {
      font-size: 10px;
      color: #aaa;
      font-style: italic;
      background: rgba(255, 82, 82, 0.05);
      padding: 6px 8px;
      border-left: 2px solid #ff525255;
      border-radius: 2px;
    }
    .backburner-alert-card-actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
    .backburner-alert-card-btn {
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
    }
    .backburner-alert-switch { background: #ff5252; color: #fff; }
    .backburner-alert-switch:hover { background: #ff7b7b; }
    .backburner-alert-snooze { background: #333; color: #eee; }
    .backburner-alert-snooze:hover { background: #444; }
    .backburner-alert-dismiss { background: none; color: #888; border: 1px solid rgba(255,255,255,0.1); }
    .backburner-alert-dismiss:hover { color: #eee; background: rgba(255,255,255,0.05); }

    /* Sticky note overlay */
    .sticky-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483645; display: flex; align-items: center; justify-content: center; }
    .sticky-overlay.hidden { display: none; }
    .sticky-note { pointer-events: auto; width: min(440px, 85vw); padding: 28px 32px 20px; background: linear-gradient(135deg, #fff9c4 0%, #fff59d 30%, #ffee58 100%); border-radius: 3px; box-shadow: 2px 4px 24px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15), inset 0 -2px 6px rgba(0,0,0,0.04); color: #3e2723; font-family: 'Segoe Script', 'Comic Sans MS', 'Patrick Hand', cursive; position: relative; cursor: default; transition: transform 0.3s ease; }
    .sticky-note::before { content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%); width: 60px; height: 16px; background: rgba(200,200,200,0.6); border-radius: 0 0 3px 3px; }
    .sticky-tape { position: absolute; top: -10px; left: 50%; transform: translateX(-50%) rotate(-1deg); width: 70px; height: 20px; background: rgba(255,255,255,0.5); border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .sticky-header { font-size: 11px; color: #795548; font-family: 'Segoe UI', system-ui, sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; }
    .sticky-time { font-size: 10px; color: #8d6e63; font-family: 'Segoe UI', system-ui, sans-serif; font-weight: 400; }
    .sticky-intent { font-size: 12px; color: #5d4037; font-family: 'Segoe UI', system-ui, sans-serif; margin-bottom: 10px; opacity: 0.8; }
    .sticky-body { font-size: 18px; line-height: 1.5; color: #3e2723; min-height: 40px; word-wrap: break-word; margin: 8px 0 16px; }
    .sticky-body:empty::after { content: '(no note)'; color: #a1887f; font-style: italic; }
    .sticky-actions { display: flex; gap: 8px; justify-content: center; }
    .sticky-resume { background: #43a047; color: #fff; border: none; padding: 8px 24px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: 'Segoe UI', system-ui, sans-serif; transition: all 0.15s; box-shadow: 0 2px 8px rgba(67,160,71,0.3); }
    .sticky-resume:hover { background: #388e3c; transform: translateY(-1px); box-shadow: 0 3px 12px rgba(67,160,71,0.4); }
    .sticky-edit { background: transparent; color: #795548; border: 1px solid #bcaaa4; padding: 6px 14px; border-radius: 6px; font-size: 11px; cursor: pointer; font-family: 'Segoe UI', system-ui, sans-serif; transition: all 0.15s; }
    .sticky-edit:hover { background: rgba(121,85,72,0.08); border-color: #8d6e63; }
    .nub.is-paused { color: #ffc107; border-color: #ffc10744; }
    .nub.is-paused:hover { box-shadow: 0 0 8px rgba(255,193,7,0.3); }

    /* === EDIT DROPDOWN === */
    .edit-dropdown {
      position: absolute;
      ${position === 'bottom' ? 'bottom' : 'top'}: ${BAR_HEIGHT}px;
      left: 50%;
      transform: translateX(-50%) scaleY(0);
      transform-origin: ${position === 'bottom' ? 'bottom' : 'top'};
      width: 320px;
      background: #141414;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
      pointer-events: auto;
      transition: transform 0.15s ease;
      z-index: 2147483647;
    }
    .edit-dropdown.open { transform: translateX(-50%) scaleY(1); }
    .edit-inner { padding: 10px 12px; }
    .edit-title { font-size: 10px; font-weight: 700; color: #00e5ff; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .edit-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .edit-input { flex: 1; background: #0d0d0d; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #eee; font-family: inherit; font-size: 11px; padding: 5px 8px; outline: none; }
    .edit-input:focus { border-color: #00e5ff44; }
    .edit-save { background: #00e5ff22; color: #00e5ff; border: 1px solid #00e5ff44; border-radius: 4px; padding: 4px 10px; font-size: 10px; font-weight: 600; cursor: pointer; }
    .edit-save:hover { background: #00e5ff33; }
    .edit-section { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin: 8px 0 4px; }
    .focus-item { padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; color: #ccc; transition: background 0.1s; display: flex; justify-content: space-between; align-items: center; }
    .focus-item:hover { background: rgba(255,255,255,0.06); }
    .focus-item.active { background: #00e5ff12; border-left: 2px solid #00e5ff; }
    .focus-state { font-size: 8px; padding: 1px 4px; border-radius: 3px; text-transform: uppercase; font-weight: 600; }
    .focus-state.active { background: #66bb6a22; color: #66bb6a; }
    .focus-state.paused { background: #ffa72622; color: #ffa726; }
    .focus-state.queued { background: #64b5f622; color: #64b5f6; }
    .new-focus-btn { width: 100%; background: none; border: 1px dashed rgba(255,255,255,0.15); border-radius: 4px; color: #888; padding: 5px; font-size: 10px; cursor: pointer; margin-top: 4px; }
    .new-focus-btn:hover { border-color: #00e5ff44; color: #00e5ff; }

    /* === BACKBURNER === */
    .bar-btn#backburner-btn { color: #888; }
    .bar-btn#backburner-btn:hover { color: #ff5252; background: rgba(255,82,82,0.1); }
    .backburner-prompt {
      position: absolute;
      ${position === 'bottom' ? 'bottom' : 'top'}: ${BAR_HEIGHT}px;
      right: 80px;
      width: 320px;
      background: #1a0a0d;
      border: 1px solid rgba(255,82,82,0.25);
      border-radius: 8px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.6);
      padding: 12px 14px;
      pointer-events: auto;
      transform: scaleY(0);
      transform-origin: ${position === 'bottom' ? 'bottom' : 'top'};
      transition: transform 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 2147483647;
    }
    .backburner-prompt.open { transform: scaleY(1); }
    .backburner-prompt-title { font-size: 10px; font-weight: 700; color: #ff5252; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .backburner-prompt-input { width: 100%; background: #0f0507; border: 1px solid rgba(255,82,82,0.2); border-radius: 4px; color: #eee; font-family: inherit; font-size: 11px; padding: 6px 8px; resize: none; outline: none; height: 38px; line-height: 1.4; box-sizing: border-box; }
    .backburner-prompt-input:focus { border-color: #ff5252aa; }
    .backburner-prompt-select { width: 100%; background: #0f0507; border: 1px solid rgba(255,82,82,0.2); border-radius: 4px; color: #eee; font-family: inherit; font-size: 11px; padding: 5px 8px; outline: none; box-sizing: border-box; }
    .backburner-prompt-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 4px; }
    .backburner-prompt-btn { padding: 4px 12px; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; }
    .backburner-confirm { background: #ff5252; color: #fff; }
    .backburner-confirm:hover { background: #ff7b7b; }
    .backburner-cancel { background: #333; color: #aaa; }
    .backburner-cancel:hover { background: #444; }

    @keyframes stickyDrop { from { opacity: 0; transform: rotate(var(--tilt)) translateY(-30px) scale(0.9); } to { opacity: 1; transform: rotate(var(--tilt)) translateY(0) scale(1); } }
  `;
  shadow.appendChild(style);

  // 6. Build bar content
  const bar = document.createElement('div');
  bar.className = barClass();

  let intentStartTime = tabContext?.startedAt ? new Date(tabContext.startedAt).getTime() : Date.now();
  let focusEndTime = activeFocus?.timerEndAt ? new Date(activeFocus.timerEndAt).getTime() : null;
  let taskTotalMs = activeFocus?.totalTimeMs || 0;

  const buildBarHTML = () => {
    if (isPaused) {
      const preview = pauseNote ? `"${escapeHtml(pauseNote.slice(0, 40))}${pauseNote.length > 40 ? '…' : ''}"` : '';
      return `
        <div class="left">
          <span style="font-size:10px;color:#ffc107;">⏸</span>
        </div>
        <div class="center">
          <span class="pause-label">⏸ PAUSED ${preview ? `<span class="note-preview">— ${preview}</span>` : ''}</span>
          <button class="resume-btn-inline" id="resume-inline">▶ Resume</button>
        </div>
        <div class="right">
          <button class="bar-btn pause-btn is-paused" id="pause-btn" title="Resume intent">▶</button>
          <button class="bar-btn note-btn" id="note-btn" title="Add note">📝</button>
          <button class="bar-btn" id="hide-bar" title="Collapse to nub">▾</button>
        </div>
      `;
    }
    return `
      <div class="left">
        ${hasContext || hasFocus ? `
          <span class="timer timer-up" id="intent-timer" title="Time on current intent">00:00</span>
          <span class="divider"></span>
          <span class="timer timer-task" id="task-timer" title="Total time on related task">00:00</span>
        ` : `
          <span style="font-size:10px;color:#555;">—</span>
        `}
        ${focusLabel
          ? `<span class="divider"></span><span class="badge badge-focus">🎯</span><span class="focus-label-left" title="Active focus: ${escapeHtml(focusLabel)}">${escapeHtml(focusLabel)}</span>${activeFocus?.lastCheckpointAt && (Date.now() - new Date(activeFocus.lastCheckpointAt).getTime()) > 30 * 60000 ? '<span class="stale-dot" title="Checkpoint overdue!"></span>' : (!activeFocus?.lastCheckpointAt && activeFocus?.startedAt && (Date.now() - new Date(activeFocus.startedAt).getTime()) > 30 * 60000 ? '<span class="stale-dot" title="No checkpoints yet"></span>' : '')}`
          : ''
        }
      </div>
      <div class="center">
        ${agentActive ? `<span class="badge badge-agent" title="An agent is driving — not you">🤖 AGENT</span>` : ''}
        ${tabIntent
          ? `${hasFocus ? `<span class="link-icon" title="${isTabLinked ? 'Tab linked to active focus' : 'Tab NOT linked to active focus'}" style="font-size:10px;margin-right:3px;opacity:${isTabLinked ? '1' : '0.5'};">${isTabLinked ? '🔗' : '⚡'}</span>` : ''}<span class="intent-label" id="intent-label-click" title="Click to mark complete: ${escapeHtml(tabIntent)}">${escapeHtml(tabIntent)}</span>`
          : `<span class="badge badge-no-intent" id="set-intent-btn" title="Click to set intent">No intent set</span>`
        }
      </div>
      <div class="right">
        ${activeFocus?.letMeCook ? `<span style="font-size:12px;margin-right:6px;" title="Let Me Cook Mode is active">🍳</span>` : ''}
        ${focusEndTime ? `<span class="timer timer-down" id="focus-countdown" title="Focus countdown">--:--</span>` : ''}
        <button class="bar-btn agent-btn${agentActive ? ' is-agent' : ''}" id="agent-btn" title="${agentActive ? 'Agent is driving — click to hand control back to you' : 'Mark this session as agent-driven'}">🤖</button>
        <button class="bar-btn" id="edit-btn" title="Edit intent / Assign to focus">✏️</button>
        <button class="bar-btn" id="checkpoint-btn" title="Checkpoint — log progress note" style="${activeFocus?.lastCheckpointAt && (Date.now() - new Date(activeFocus.lastCheckpointAt).getTime()) > 30 * 60000 ? 'color:#ffa726;' : ''}">📋</button>
        <button class="bar-btn" id="refresh-btn" title="Refresh InBar state">🔄</button>
        <button class="bar-btn" id="backburner-btn" title="Backburner — put focus aside while waiting for something" style="${activeFocus ? '' : 'display:none;'}">🔥</button>
        <button class="bar-btn pause-btn" id="pause-btn" title="Pause — leave a note about where you left off">⏸</button>
        <button class="bar-btn note-btn" id="note-btn" title="Add note">📝</button>
        <button class="bar-btn" id="hide-bar" title="Collapse to nub">▾</button>
      </div>
    `;
  };

  bar.innerHTML = buildBarHTML();
  shadow.appendChild(bar);

  // 7. Notes panel
  const notesPanel = document.createElement('div');
  notesPanel.className = 'notes-panel';
  notesPanel.innerHTML = `
    <div class="notes-inner">
      <div class="notes-header">
        <span>📝 Quick Note</span>
        <button class="bar-btn" id="close-notes" style="font-size:10px;">✕</button>
      </div>
      <textarea class="notes-textarea" id="note-text" placeholder="Jot a thought about this focus, task, or intent…">${escapeHtml(currentNote)}</textarea>
      <div class="notes-saved" id="note-saved">✓ Saved</div>
    </div>
  `;
  shadow.appendChild(notesPanel);

  // 7b. Edit dropdown panel
  const editDropdown = document.createElement('div');
  editDropdown.className = 'edit-dropdown';
  const buildFocusList = () => {
    // Filter out completed/resolved items — show only actionable focuses
    const actionable = (allFocusItems || []).filter(f =>
      f.focusState !== 'completed' && f.funnelStage !== 'resolved'
    );
    // Sort: active first, then paused, then the rest
    const sorted = actionable.sort((a, b) => {
      const order = { active: 0, paused: 1 };
      return (order[a.focusState] ?? 2) - (order[b.focusState] ?? 2);
    });
    const items = sorted.map(f => {
      const stage = f.funnelStage || 'unsorted';
      const stateIcon = f.focusState === 'active' ? '🎯' : f.focusState === 'paused' ? '⏸' : '📋';
      const isActive = f.id === activeFocusId;
      return `<div class="focus-item${isActive ? ' active' : ''}" data-focus-id="${escapeHtml(f.id)}">
        <span>${stateIcon} ${escapeHtml(f.label)}</span>
        <span class="focus-state queued">${escapeHtml(stage)}</span>
      </div>`;
    }).join('');
    return items || '<div style="font-size:10px;color:#555;padding:4px;">No focus items yet</div>';
  };
  editDropdown.innerHTML = `
    <div class="edit-inner">
      <div class="edit-title">✏️ Edit Intent</div>
      <div class="edit-row">
        <input class="edit-input" id="edit-intent-input" placeholder="Intent for this tab..." value="${escapeHtml(tabIntent || '')}">
        <button class="edit-save" id="edit-intent-save">Save</button>
      </div>
      <textarea class="edit-input" id="edit-intent-desc" placeholder="Description (optional)..." style="width:100%;min-height:36px;resize:vertical;margin-bottom:6px;font-size:10px;">${escapeHtml(tabContext?.description || '')}</textarea>
      <div class="edit-section">Assign to Focus</div>
      <div id="focus-list" style="max-height:180px;overflow-y:auto;">${buildFocusList()}</div>
      <button class="new-focus-btn" id="new-focus-btn">+ Create new focus from this tab</button>
    </div>
  `;
  shadow.appendChild(editDropdown);

  // 8. Nub (collapsed toggle)
  const nub = document.createElement('div');
  nub.className = `nub${currentNote ? ' has-note' : ''}${isPaused ? ' is-paused' : ''}${agentActive ? ' is-agent' : ''}`;
  nub.innerHTML = isPaused ? '⏸' : '◉';
  nub.title = isPaused ? 'Paused — click to expand InBar' : 'Show Tabatha InBar';
  shadow.appendChild(nub);

  // 8b. Pause mini-prompt
  const pausePrompt = document.createElement('div');
  pausePrompt.className = 'pause-prompt';
  pausePrompt.innerHTML = `
    <div class="pause-prompt-title">⏸ Where did you leave off?</div>
    <textarea class="pause-prompt-input" id="pause-input" placeholder="e.g. Was debugging line 234, check the race condition…"></textarea>
    <div class="pause-prompt-actions">
      <button class="pause-prompt-btn pause-cancel" id="pause-cancel">Cancel</button>
      <button class="pause-prompt-btn pause-confirm" id="pause-confirm">Pause</button>
    </div>
  `;
  shadow.appendChild(pausePrompt);

  // 8d. Backburner prompt
  const backburnerPrompt = document.createElement('div');
  backburnerPrompt.className = 'backburner-prompt';
  const getQueuedFocusListOptions = () => {
    const actionable = (allFocusItems || []).filter(f =>
      f.id !== activeFocusId && f.focusState !== 'completed' && f.funnelStage !== 'resolved'
    );
    let options = '<option value="">-- Switch to existing Focus --</option>';
    actionable.forEach(f => {
      options += `<option value="${escapeHtml(f.id)}">🎯 ${escapeHtml(f.label)}</option>`;
    });
    return options;
  };

  backburnerPrompt.innerHTML = `
    <div class="backburner-prompt-title">🔥 Backburner: "${escapeHtml(focusLabel || 'Current focus')}"</div>
    <div style="font-size: 9px; color: #888; margin-bottom: 2px;">Put this aside while waiting. We'll remind you to return.</div>
    <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px;">
      <span style="font-size: 10px; color: #aaa;">Duration:</span>
      <input type="number" id="backburner-duration" value="15" min="1" max="1440" style="width: 50px; background: #0f0507; border: 1px solid rgba(255,82,82,0.2); border-radius: 4px; color: #eee; font-size: 11px; padding: 3px 6px; text-align: center;">
      <span style="font-size: 10px; color: #aaa;">mins</span>
    </div>
    <textarea class="backburner-prompt-input" id="backburner-reason" placeholder="What are you waiting for? (e.g. test suite to pass)"></textarea>
    <div style="height: 1px; background: rgba(255,82,82,0.15); margin: 4px 0;"></div>
    <div style="font-size: 9px; color: #ff5252aa; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">What will you work on instead?</div>
    <select class="backburner-prompt-select" id="backburner-switch-select">${getQueuedFocusListOptions()}</select>
    <div style="font-size: 9px; color: #666; text-align: center; margin: 4px 0;">— OR CREATE NEW —</div>
    <input type="text" class="backburner-prompt-input" id="backburner-new-focus" placeholder="Create a new temporary focus..." style="height: 28px;">
    <div class="backburner-prompt-actions">
      <button class="backburner-prompt-btn backburner-cancel" id="backburner-cancel">Cancel</button>
      <button class="backburner-prompt-btn backburner-confirm" id="backburner-confirm">Backburner</button>
    </div>
  `;
  shadow.appendChild(backburnerPrompt);

  // 8c. Sticky note overlay
  const stickyTilt = (Math.random() * 6 - 3).toFixed(1); // -3° to +3°
  const stickyOverlay = document.createElement('div');
  stickyOverlay.className = `sticky-overlay${isPaused ? '' : ' hidden'}`;
  const fmtPauseTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };
  const buildStickyHTML = () => `
    <div class="sticky-note" style="--tilt: ${stickyTilt}deg; transform: rotate(${stickyTilt}deg); animation: stickyDrop 0.4s ease-out;">
      <div class="sticky-tape"></div>
      <div class="sticky-header">
        <span>📌 Paused</span>
        <span class="sticky-time">${pausedAt ? fmtPauseTime(pausedAt) : ''}</span>
      </div>
      <div class="sticky-intent">${escapeHtml(intentLabel || focusLabel || 'Current work')}</div>
      <div class="sticky-body" id="sticky-body-text">${escapeHtml(pauseNote || '')}</div>
      <div class="sticky-actions">
        <button class="sticky-edit" id="sticky-edit">✏️ Edit Note</button>
        ${matchedPauseFromUrl ? `<button class="sticky-resume" id="sticky-new-intent" style="background:#00e5ff;color:#000;">🆕 Start New Intent</button>` : ''}
        <button class="sticky-resume" id="sticky-resume">▶ Resume</button>
      </div>
    </div>
  `;
  stickyOverlay.innerHTML = buildStickyHTML();
  shadow.appendChild(stickyOverlay);

  // 8e. Backburner expired alert overlay
  const backburnerAlertCard = document.createElement('div');
  const expiredBackburnerItem = (allFocusItems || []).find(f => f.backburnered && f.backburnerExpired);
  backburnerAlertCard.className = `backburner-alert-card${expiredBackburnerItem ? '' : ' hidden'}`;
  
  const buildBackburnerAlertHTML = (item) => {
    if (!item) return '';
    return `
      <div class="backburner-alert-card-title">🔥 Backburner Expired</div>
      <div class="backburner-alert-card-focus">🎯 ${escapeHtml(item.label)}</div>
      ${item.backburnerReason ? `<div class="backburner-alert-card-reason">Waiting for: "${escapeHtml(item.backburnerReason)}"</div>` : ''}
      <div class="backburner-alert-card-actions">
        <button class="backburner-alert-card-btn backburner-alert-dismiss" id="backburner-alert-dismiss" data-focus-id="${escapeHtml(item.id)}">Dismiss</button>
        <button class="backburner-alert-card-btn backburner-alert-snooze" id="backburner-alert-snooze" data-focus-id="${escapeHtml(item.id)}">Snooze 10m</button>
        <button class="backburner-alert-card-btn backburner-alert-switch" id="backburner-alert-switch" data-focus-id="${escapeHtml(item.id)}">Resume Focus</button>
      </div>
    `;
  };
  backburnerAlertCard.innerHTML = buildBackburnerAlertHTML(expiredBackburnerItem);
  shadow.appendChild(backburnerAlertCard);

  // 9. Timer logic
  let intentTimerEl = shadow.getElementById('intent-timer');
  let taskTimerEl = shadow.getElementById('task-timer');
  let countdownEl = shadow.getElementById('focus-countdown');

  const fmt = (ms) => {
    const s = Math.floor(Math.abs(ms) / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const h = Math.floor(m / 60);
    const min = m % 60;
    if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
    return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const tick = () => {
    if (isCollapsed || isPaused) return;
    const now = Date.now();
    if (intentTimerEl) intentTimerEl.textContent = fmt(now - intentStartTime);
    if (taskTimerEl) taskTimerEl.textContent = fmt(taskTotalMs + (now - intentStartTime));
    if (countdownEl && focusEndTime) {
      const remaining = focusEndTime - now;
      countdownEl.textContent = remaining > 0 ? fmt(remaining) : '+' + fmt(Math.abs(remaining));
      countdownEl.style.color = remaining > 0 ? '#ff6b6b' : '#ff4444';
    }
  };

  tick();
  const interval = setInterval(tick, 1000);

  // === PAUSE / RESUME HELPERS ===

  const savePauseState = async (note) => {
    try {
      const tabId = (await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' }))?.tabId;
      if (!tabId) return;
      const stored = await chrome.storage.local.get('pausedIntents');
      const pausedIntents = stored.pausedIntents || {};
      pausedIntents[tabId] = {
        note,
        pausedAt: new Date().toISOString(),
        intentLabel: intentLabel || '',
        focusLabel: focusLabel || '',
        url: window.location.href, // Store URL for cross-tab pause note matching
      };
      await chrome.storage.local.set({ pausedIntents });
    } catch (e) { /* storage write failed */ }
  };

  const clearPauseState = async () => {
    try {
      const tabId = (await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' }))?.tabId;
      if (!tabId) return;
      const stored = await chrome.storage.local.get('pausedIntents');
      const pausedIntents = stored.pausedIntents || {};
      delete pausedIntents[tabId];
      await chrome.storage.local.set({ pausedIntents });
    } catch (e) { /* storage write failed */ }
  };

  // Re-render bar and rebind events after pause/resume
  const refreshBar = () => {
    bar.innerHTML = buildBarHTML();
    bar.className = barClass();
    nub.className = `nub${currentNote ? ' has-note' : ''}${isPaused ? ' is-paused' : ''}${agentActive ? ' is-agent' : ''}`;
    nub.innerHTML = isPaused ? '⏸' : '◉';
    nub.title = isPaused ? 'Paused — click to expand InBar' : 'Show Tabatha InBar';
    stickyOverlay.classList.toggle('hidden', !isPaused);
    if (isPaused) {
      stickyOverlay.innerHTML = buildStickyHTML();
    }

    // Update backburner alert card
    const expiredItem = (allFocusItems || []).find(f => f.backburnered && f.backburnerExpired);
    if (expiredItem) {
      backburnerAlertCard.innerHTML = buildBackburnerAlertHTML(expiredItem);
      backburnerAlertCard.classList.remove('hidden');
    } else {
      backburnerAlertCard.classList.add('hidden');
    }

    // Re-query timer elements (they only exist when not paused)
    intentTimerEl = shadow.getElementById('intent-timer');
    taskTimerEl = shadow.getElementById('task-timer');
    countdownEl = shadow.getElementById('focus-countdown');
    bindBarEvents();
  };

  const doPause = (note) => {
    isPaused = true;
    isPausePromptOpen = false;
    pauseNote = note;
    pausedAt = new Date().toISOString();
    pausePrompt.classList.remove('open');
    savePauseState(note);
    refreshBar();
  };

  const doResume = () => {
    isPaused = false;
    pauseNote = '';
    pausedAt = null;
    clearPauseState();
    // Resume the associated focus/intent in the background engine
    if (activeFocusId) {
      chrome.runtime.sendMessage({ type: 'RESUME_FOCUS', focusId: activeFocusId }).catch(() => {});
    }
    refreshBar();
  };

  // === EVENT BINDING (called on init and after refreshBar) ===

  const bindBarEvents = () => {
    // Collapse / Expand
    const hideBtn = shadow.getElementById('hide-bar');
    if (hideBtn) hideBtn.onclick = collapse;

    // Notes toggle
    const noteBtn = shadow.getElementById('note-btn');
    if (noteBtn) noteBtn.onclick = toggleNotes;

    // Set intent
    const setIntentBtn = shadow.getElementById('set-intent-btn');
    if (setIntentBtn) {
      setIntentBtn.onclick = () => {
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }).catch(() => {});
      };
    }

    // Pause button
    const pauseBtn = shadow.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.onclick = () => {
        if (isPaused) {
          doResume();
        } else {
          // Open pause prompt
          isPausePromptOpen = !isPausePromptOpen;
          pausePrompt.classList.toggle('open', isPausePromptOpen);
          if (isPausePromptOpen) {
            const input = shadow.getElementById('pause-input');
            if (input) input.focus();
          }
        }
      };
    }

    // C11a — Agent-driven toggle (machine-scoped controller span)
    const agentBtn = shadow.getElementById('agent-btn');
    if (agentBtn) {
      agentBtn.onclick = async () => {
        try {
          if (agentActive) {
            await chrome.runtime.sendMessage({ type: 'END_AGENT_SESSION', id: agentSessionId, scope: 'machine' });
            agentActive = false;
            agentSessionId = null;
          } else {
            const res = await chrome.runtime.sendMessage({ type: 'START_AGENT_SESSION', scope: 'machine', agentName: 'manual', source: 'manual' });
            if (res?.session) { agentActive = true; agentSessionId = res.session.id; }
          }
          if (!isPaused) {
            bar.innerHTML = buildBarHTML();
            intentTimerEl = shadow.getElementById('intent-timer');
            taskTimerEl = shadow.getElementById('task-timer');
            countdownEl = shadow.getElementById('focus-countdown');
          }
          bar.className = barClass();
          nub.className = `nub${currentNote ? ' has-note' : ''}${isPaused ? ' is-paused' : ''}${agentActive ? ' is-agent' : ''}`;
          bindBarEvents();
        } catch (e) { /* send failed */ }
      };
    }

    // Inline resume button (in paused bar)
    const resumeInline = shadow.getElementById('resume-inline');
    if (resumeInline) resumeInline.onclick = doResume;

    // Sticky note resume
    const stickyResume = shadow.getElementById('sticky-resume');
    if (stickyResume) stickyResume.onclick = doResume;

    // Sticky note "Start New Intent" (for URL-matched pause notes)
    const stickyNewIntent = shadow.getElementById('sticky-new-intent');
    if (stickyNewIntent) {
      stickyNewIntent.onclick = () => {
        // Clear pause state for THIS tab and open InPop
        isPaused = false;
        matchedPauseFromUrl = false;
        clearPauseState();
        refreshBar();
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }).catch(() => {});
      };
    }

    // Sticky note edit
    const stickyEdit = shadow.getElementById('sticky-edit');
    if (stickyEdit) {
      stickyEdit.onclick = () => {
        // Expand bar if collapsed, open pause prompt with current note for editing
        if (isCollapsed) expand();
        isPausePromptOpen = true;
        pausePrompt.classList.add('open');
        const input = shadow.getElementById('pause-input');
        if (input) { input.value = pauseNote; input.focus(); }
      };
    }

    // ── Edit dropdown ──
    const editBtn = shadow.getElementById('edit-btn');
    if (editBtn) {
      editBtn.onclick = () => {
        const isOpen = editDropdown.classList.contains('open');
        // Close other panels first
        notesPanel.classList.remove('open');
        pausePrompt.classList.remove('open');
        editDropdown.classList.toggle('open', !isOpen);
        if (!isOpen) {
          const inp = shadow.getElementById('edit-intent-input');
          if (inp) inp.focus();
        }
      };
    }

    // ── Checkpoint button — manually open CPN prompt ──
    const cpnBtn = shadow.getElementById('checkpoint-btn');
    if (cpnBtn && activeFocus) {
      cpnBtn.onclick = () => {
        _showCPNOverlay({
          focusId: activeFocus.id || activeFocusId,
          label: activeFocus.label || focusLabel,
          checkpointCount: (activeFocus.checkpoint || []).length,
          elapsedMs: activeFocus.liveElapsedMs || 0,
          triggeredBy: 'inbar_manual'
        });
      };
    }

    // ── Refresh button — manually re-fetch state ──
    const refreshBtn = shadow.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        try {
          const res = await chrome.runtime.sendMessage({ type: 'GET_INBAR_DATA' });
          if (!res) return;
          tabContext = res.tabContext;
          activeFocus = res.activeFocus;
          allFocusItems = res.allFocusItems || [];
          activeFocusId = res.activeFocusId || null;
          isTabLinked = !!res.isTabLinked;
          windowCount = res.windowCount || 0;
          tabIntent = tabContext?.context || tabContext?.intent || null;
          focusLabel = activeFocus?.label || null;
          intentLabel = tabIntent || focusLabel || null;
          hasFocus = !!activeFocus;
          hasContext = !!intentLabel;
          if (activeFocus) {
            focusEndTime = activeFocus.timerEndAt ? new Date(activeFocus.timerEndAt).getTime() : null;
            taskTotalMs = activeFocus.totalTimeMs || 0;
          }
          intentStartTime = tabContext?.startedAt ? new Date(tabContext.startedAt).getTime() : Date.now();
          if (!isPaused) {
            bar.innerHTML = buildBarHTML();
            intentTimerEl = shadow.getElementById('intent-timer');
            taskTimerEl = shadow.getElementById('task-timer');
            countdownEl = shadow.getElementById('focus-countdown');
          }
          const focusListEl = shadow.getElementById('focus-list');
          if (focusListEl) focusListEl.innerHTML = buildFocusList();

          // Update backburner alert card
          const expiredItem = (allFocusItems || []).find(f => f.backburnered && f.backburnerExpired);
          if (expiredItem) {
            backburnerAlertCard.innerHTML = buildBackburnerAlertHTML(expiredItem);
            backburnerAlertCard.classList.remove('hidden');
          } else {
            backburnerAlertCard.classList.add('hidden');
          }

          bindBarEvents();
        } catch (e) { /* refresh failed silently */ }
      };
    }

    // Save edited intent — updates local state + re-renders bar
    const editSaveBtn = shadow.getElementById('edit-intent-save');
    if (editSaveBtn) {
      editSaveBtn.onclick = async () => {
        const inp = shadow.getElementById('edit-intent-input');
        const descInp = shadow.getElementById('edit-intent-desc');
        const newIntent = inp?.value?.trim();
        const newDesc = descInp?.value?.trim() || '';
        if (!newIntent) return;
        try {
          await chrome.runtime.sendMessage({ type: 'SET_INTENT', payload: { intent: newIntent, description: newDesc } });
          // Update local state immediately so bar re-renders
          tabIntent = newIntent;
          intentLabel = newIntent;
          hasContext = true;
          editDropdown.classList.remove('open');
          // Re-render bar to show updated intent
          bar.innerHTML = buildBarHTML();
          intentTimerEl = shadow.getElementById('intent-timer');
          taskTimerEl = shadow.getElementById('task-timer');
          countdownEl = shadow.getElementById('focus-countdown');
          bindBarEvents();
        } catch (e) { /* send failed */ }
      };
    }

    // Click intent label to mark intent as complete/resolved for this tab
    const intentLabelClick = shadow.getElementById('intent-label-click');
    if (intentLabelClick) {
      intentLabelClick.onclick = async () => {
        if (!tabIntent) return;
        if (!confirm(`Mark intent "${tabIntent}" as resolved?`)) return;
        try {
          await chrome.runtime.sendMessage({ type: 'SET_INTENT', payload: { intent: `✅ ${tabIntent}`, resolved: true } });
          tabIntent = null;
          intentLabel = focusLabel || null;
          hasContext = !!intentLabel;
          bar.innerHTML = buildBarHTML();
          intentTimerEl = shadow.getElementById('intent-timer');
          taskTimerEl = shadow.getElementById('task-timer');
          countdownEl = shadow.getElementById('focus-countdown');
          bindBarEvents();
        } catch (e) { /* failed */ }
      };
    }

    // Focus list click — assign tab to a focus
    const focusList = shadow.getElementById('focus-list');
    if (focusList) {
      focusList.onclick = async (e) => {
        const item = e.target.closest('.focus-item');
        if (!item) return;
        const focusId = item.dataset.focusId;
        if (!focusId) return;
        try {
          // Switch to this focus — activates it and reassigns the intent
          await chrome.runtime.sendMessage({ type: 'SWITCH_FOCUS', focusId });
          editDropdown.classList.remove('open');
        } catch (e) { /* send failed */ }
      };
    }

    // New focus button
    const newFocusBtn = shadow.getElementById('new-focus-btn');
    if (newFocusBtn) {
      newFocusBtn.onclick = async () => {
        const inp = shadow.getElementById('edit-intent-input');
        const label = inp?.value?.trim() || intentLabel || 'New Focus';
        try {
          await chrome.runtime.sendMessage({ type: 'START_FOCUS', label, timerMinutes: 15 });
          editDropdown.classList.remove('open');
        } catch (e) { /* send failed */ }
      };
    }

    // ── Backburner ──
    const backburnerBtn = shadow.getElementById('backburner-btn');
    if (backburnerBtn) {
      backburnerBtn.onclick = () => {
        const isOpen = backburnerPrompt.classList.contains('open');
        // Close other panels first
        notesPanel.classList.remove('open');
        pausePrompt.classList.remove('open');
        editDropdown.classList.remove('open');
        backburnerPrompt.classList.toggle('open', !isOpen);
        if (!isOpen) {
          const reasonInp = shadow.getElementById('backburner-reason');
          if (reasonInp) reasonInp.focus();
        }
      };
    }

    const backburnerCancelBtn = shadow.getElementById('backburner-cancel');
    if (backburnerCancelBtn) {
      backburnerCancelBtn.onclick = () => {
        backburnerPrompt.classList.remove('open');
      };
    }

    const backburnerConfirmBtn = shadow.getElementById('backburner-confirm');
    if (backburnerConfirmBtn) {
      backburnerConfirmBtn.onclick = async () => {
        const duration = Number(shadow.getElementById('backburner-duration')?.value || 15);
        const reason = shadow.getElementById('backburner-reason')?.value?.trim() || '';
        const switchSelect = shadow.getElementById('backburner-switch-select');
        const switchToFocusId = switchSelect ? switchSelect.value : '';
        const createNewFocusLabel = shadow.getElementById('backburner-new-focus')?.value?.trim() || '';

        try {
          await chrome.runtime.sendMessage({
            type: 'BACKBURNER_FOCUS',
            focusId: activeFocusId,
            durationMinutes: duration,
            reason: reason,
            switchToFocusId: switchToFocusId,
            createNewFocusLabel: createNewFocusLabel
          });
          backburnerPrompt.classList.remove('open');
          // Trigger a refresh of InBar data immediately
          const refreshBtn = shadow.getElementById('refresh-btn');
          if (refreshBtn) refreshBtn.click();
        } catch (e) { /* send failed */ }
      };
    }

    // ── Backburner Alert Card Event Handlers ──
    const alertDismissBtn = shadow.getElementById('backburner-alert-dismiss');
    if (alertDismissBtn) {
      alertDismissBtn.onclick = async () => {
        const focusId = alertDismissBtn.dataset.focusId;
        try {
          await chrome.runtime.sendMessage({ type: 'DISMISS_BACKBURNER', focusId });
          backburnerAlertCard.classList.add('hidden');
          const refreshBtn = shadow.getElementById('refresh-btn');
          if (refreshBtn) refreshBtn.click();
        } catch (e) { /* failed */ }
      };
    }

    const alertSnoozeBtn = shadow.getElementById('backburner-alert-snooze');
    if (alertSnoozeBtn) {
      alertSnoozeBtn.onclick = async () => {
        const focusId = alertSnoozeBtn.dataset.focusId;
        try {
          await chrome.runtime.sendMessage({ type: 'SNOOZE_BACKBURNER', focusId });
          backburnerAlertCard.classList.add('hidden');
          const refreshBtn = shadow.getElementById('refresh-btn');
          if (refreshBtn) refreshBtn.click();
        } catch (e) { /* failed */ }
      };
    }

    const alertSwitchBtn = shadow.getElementById('backburner-alert-switch');
    if (alertSwitchBtn) {
      alertSwitchBtn.onclick = async () => {
        const focusId = alertSwitchBtn.dataset.focusId;
        try {
          await chrome.runtime.sendMessage({ type: 'RESUME_BACKBURNER', focusId });
          backburnerAlertCard.classList.add('hidden');
          const refreshBtn = shadow.getElementById('refresh-btn');
          if (refreshBtn) refreshBtn.click();
        } catch (e) { /* failed */ }
      };
    }
  };

  // 10. Collapse / Expand
  const collapse = () => {
    isCollapsed = true;
    isNotesOpen = false;
    isPausePromptOpen = false;
    bar.classList.add('hidden');
    notesPanel.classList.remove('open');
    pausePrompt.classList.remove('open');
    editDropdown.classList.remove('open');
    pushPage(0);
    host.style.height = '0';
    setTimeout(() => nub.classList.add('visible'), 150);
  };

  const expand = () => {
    isCollapsed = false;
    nub.classList.remove('visible');
    setTimeout(() => {
      bar.classList.remove('hidden');
      pushPage(BAR_HEIGHT);
      host.style.height = `${BAR_HEIGHT}px`;
    }, 100);
  };

  nub.onclick = expand;

  // 11. Notes toggle
  const noteTextarea = shadow.getElementById('note-text');
  const noteSaved = shadow.getElementById('note-saved');
  let saveTimeout;

  const toggleNotes = () => {
    isNotesOpen = !isNotesOpen;
    notesPanel.classList.toggle('open', isNotesOpen);
    const totalH = isNotesOpen ? BAR_HEIGHT + NOTES_HEIGHT : BAR_HEIGHT;
    pushPage(totalH);
    if (isNotesOpen) noteTextarea.focus();
  };

  shadow.getElementById('close-notes').onclick = toggleNotes;
  // Auto-save notes with debounce
  noteTextarea.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const text = noteTextarea.value;
      chrome.runtime.sendMessage({ type: 'SAVE_INBAR_NOTE', note: text }).then(() => {
        noteSaved.classList.add('show');
        nub.classList.toggle('has-note', !!text);
        const nb = shadow.getElementById('note-btn');
        if (nb) nb.style.color = text ? '#ffc107' : '#555';
        setTimeout(() => noteSaved.classList.remove('show'), 1500);
      }).catch(() => {});
    }, 600);
  });

  // 11b. Pause prompt confirm/cancel
  shadow.getElementById('pause-confirm').onclick = () => {
    const input = shadow.getElementById('pause-input');
    doPause(input?.value?.trim() || '');
  };
  shadow.getElementById('pause-cancel').onclick = () => {
    isPausePromptOpen = false;
    pausePrompt.classList.remove('open');
  };
  // Enter key in pause prompt
  shadow.getElementById('pause-input').onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      shadow.getElementById('pause-confirm').click();
    }
  };

  // Initial event binding
  bindBarEvents();

  // ════════════════════════════════════════════
  // Plan 025 — CPN Overlay Builder (IIFE scope)
  // ════════════════════════════════════════════
  const _cpnBtnStyle = (color) => `background:${color}22;color:${color};border:1px solid ${color}44;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;`;

  function _showCPNOverlay({ focusId, label, checkpointCount, elapsedMs, timerMinutes, triggeredBy }) {
    // Singleton guard
    const existing = document.getElementById('tabatha-popup-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'tabatha-popup-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;';
    const card = document.createElement('div');
    card.style.cssText = 'background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:24px;max-width:400px;width:90%;color:#eee;text-align:center;box-shadow:0 16px 40px rgba(0,0,0,0.4);';

    const elapsedStr = elapsedMs ? `${Math.floor(elapsedMs/60000)}:${String(Math.floor((elapsedMs%60000)/1000)).padStart(2,'0')}` : '--:--';
    const timerStr = timerMinutes ? `${timerMinutes}:00` : '--:--';
    card.innerHTML = `
      <div style="font-size:24px;margin-bottom:6px;">📋</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:4px;">Progress Check</div>
      <div style="font-size:12px;color:#aaa;margin-bottom:4px;">"${escapeHtml(label || 'Focus')}" · Elapsed: ${elapsedStr} · Timer: ${timerStr}</div>
      <div style="font-size:11px;color:#666;margin-bottom:10px;">Checkpoint #${(checkpointCount || 0) + 1}</div>
      <textarea id="cpn-text" placeholder="What have you accomplished since your last checkpoint?" style="width:100%;height:56px;background:#111;border:1px solid #444;border-radius:4px;color:#eee;font-size:12px;padding:8px;resize:none;box-sizing:border-box;margin-bottom:10px;"></textarea>
      <div style="font-size:10px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.08em;">Submit with progress level:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:10px;">
        <button data-level="none" style="${_cpnBtnStyle('#9e9e9e')}">😐 None</button>
        <button data-level="little" style="${_cpnBtnStyle('#29b6f6')}">📈 Little</button>
        <button data-level="lot" style="${_cpnBtnStyle('#66bb6a')}">🚀 A Lot</button>
        <button data-level="almost_done" style="${_cpnBtnStyle('#ffd54f')}">🏁 Almost Done</button>
        <button data-level="stuck" style="${_cpnBtnStyle('#ef5350')}">🚧 Stuck</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button id="cpn-snooze" style="${_cpnBtnStyle('#78909c')}font-size:11px;">⏰ Snooze 5 min</button>
        <button id="cpn-skip" style="${_cpnBtnStyle('#555')}font-size:11px;">Skip this time</button>
      </div>`;
    overlay.appendChild(card);
    document.documentElement.appendChild(overlay);

    // Progress level submit buttons
    card.querySelectorAll('[data-level]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = card.querySelector('#cpn-text')?.value || '';
        const level = btn.getAttribute('data-level');
        if (level === 'stuck' && !text.trim()) { card.querySelector('#cpn-text').style.borderColor = '#ef5350'; card.querySelector('#cpn-text').placeholder = 'Please describe what is blocking you...'; return; }
        await chrome.runtime.sendMessage({ type: 'SAVE_CHECKPOINT_NOTE', focusId, text, progressLevel: level, triggeredBy: triggeredBy || 'auto_prompt' });
        try { await chrome.runtime.sendMessage({ type: 'DISMISS_POPUP' }); } catch {}
        overlay.remove();
      });
    });
    card.querySelector('#cpn-snooze')?.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ type: 'SNOOZE_CHECKPOINT', focusId, snoozeMinutes: 5 });
      overlay.remove();
    });
    card.querySelector('#cpn-skip')?.addEventListener('click', () => { try { chrome.runtime.sendMessage({ type: 'DISMISS_POPUP' }); } catch {} overlay.remove(); });
  }

  // 13. Listen for updates — full hot-reload
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'FOCUS_ENGINE_UPDATED' || msg.type === 'TAB_UPDATED' || msg.type === 'INTENT_UPDATED' || msg.type === 'BACKBURNER_ALERT') {
      chrome.runtime.sendMessage({ type: 'GET_INBAR_DATA' }).then(res => {
        if (!res) return;
        // Update mutable state
        tabContext = res.tabContext;
        activeFocus = res.activeFocus;
        allFocusItems = res.allFocusItems || [];
        activeFocusId = res.activeFocusId || null;
        isTabLinked = !!res.isTabLinked;
        windowCount = res.windowCount || 0;
        tabIntent = tabContext?.context || tabContext?.intent || null;
        focusLabel = activeFocus?.label || null;
        intentLabel = tabIntent || focusLabel || null;
        hasFocus = !!activeFocus;
        hasContext = !!intentLabel;
        if (activeFocus) {
          focusEndTime = activeFocus.timerEndAt ? new Date(activeFocus.timerEndAt).getTime() : null;
          taskTotalMs = activeFocus.totalTimeMs || 0;
        }
        intentStartTime = tabContext?.startedAt ? new Date(tabContext.startedAt).getTime() : Date.now();
        // Re-render bar HTML
        if (!isPaused) {
          bar.innerHTML = buildBarHTML();
          intentTimerEl = shadow.getElementById('intent-timer');
          taskTimerEl = shadow.getElementById('task-timer');
          countdownEl = shadow.getElementById('focus-countdown');
        }
        // Update edit dropdown focus list
        const focusListEl = shadow.getElementById('focus-list');
        if (focusListEl) focusListEl.innerHTML = buildFocusList();
        
        // Update backburner alert card
        const expiredItem = (allFocusItems || []).find(f => f.backburnered && f.backburnerExpired);
        if (expiredItem) {
          backburnerAlertCard.innerHTML = buildBackburnerAlertHTML(expiredItem);
          backburnerAlertCard.classList.remove('hidden');
        } else {
          backburnerAlertCard.classList.add('hidden');
        }

        // Re-bind events
        bindBarEvents();
      }).catch(() => {});
    }

    // ════════════════════════════════════════════
    // Plan 025 — Popup Helper Utilities
    // ════════════════════════════════════════════
    const _popupBtnStyle = (color) => `background:${color}22;color:${color};border:1px solid ${color}44;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;`;
    const _dismissAndSend = async (overlay, type, payload) => {
      try { await chrome.runtime.sendMessage({ type: 'DISMISS_POPUP' }); } catch {}
      try { await chrome.runtime.sendMessage({ type, ...payload }); } catch {}
      overlay?.remove();
    };
    const _removeExistingOverlay = () => {
      document.getElementById('tabatha-popup-overlay')?.remove();
    };
    const _createOverlay = () => {
      _removeExistingOverlay();
      const o = document.createElement('div');
      o.id = 'tabatha-popup-overlay';
      Object.assign(o.style, { position:'fixed',top:'0',left:'0',width:'100vw',height:'100vh',background:'rgba(0,0,0,0.7)',zIndex:'2147483647',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'Segoe UI',system-ui,sans-serif" });
      o.onclick = (e) => { if (e.target === o) e.stopPropagation(); };
      return o;
    };
    const _createCard = () => {
      const c = document.createElement('div');
      Object.assign(c.style, { background:'#1a1a1a',border:'1px solid #333',borderRadius:'8px',padding:'24px 32px',maxWidth:'440px',width:'90vw',textAlign:'center',color:'#eee' });
      return c;
    };
    // Plan 036: non-blocking auto-focus suggestion chip. Auto-fades after 8s,
    // never steals focus or blocks the page (challenge-response Resolution 5).
    const _showAutoFocusChip = (msg) => {
      document.getElementById('tabatha-autofocus-chip')?.remove();
      const chip = document.createElement('div');
      chip.id = 'tabatha-autofocus-chip';
      Object.assign(chip.style, { position:'fixed',bottom:'16px',right:'16px',zIndex:'2147483646',background:'#1a1a1a',border:'1px solid #ab47bc66',borderRadius:'10px',padding:'10px 12px',maxWidth:'320px',boxShadow:'0 6px 24px rgba(0,0,0,0.4)',fontFamily:"'Segoe UI',system-ui,sans-serif",color:'#eee',display:'flex',alignItems:'center',gap:'10px',transition:'opacity 0.4s ease',opacity:'0' });
      chip.innerHTML = `<span style="font-size:16px;">⚡</span>
        <div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(msg.label || 'Set a focus?')}</div><div style="font-size:10px;color:#888;">Suggested focus</div></div>
        <button id="afc-accept" style="${_popupBtnStyle('#66bb6a')}padding:4px 10px;">Set</button>
        <button id="afc-dismiss" style="background:transparent;border:none;color:#888;font-size:14px;cursor:pointer;line-height:1;">✕</button>`;
      document.documentElement.appendChild(chip);
      requestAnimationFrame(() => { chip.style.opacity = '1'; });
      let fadeTimer = setTimeout(() => { chip.style.opacity = '0'; setTimeout(() => chip.remove(), 400); }, 20000);
      const clearFade = () => clearTimeout(fadeTimer);
      chip.addEventListener('mouseenter', clearFade);
      chip.querySelector('#afc-accept')?.addEventListener('click', async () => { clearFade(); try { await chrome.runtime.sendMessage({ type: 'ACCEPT_AUTO_FOCUS', label: msg.label }); } catch {} chip.remove(); });
      chip.querySelector('#afc-dismiss')?.addEventListener('click', async () => { clearFade(); try { await chrome.runtime.sendMessage({ type: 'DISMISS_AUTO_FOCUS', domain: msg.domain }); } catch {} chip.remove(); });
    };
    const _fmtIdleDuration = (ms) => {
      const totalSec = Math.floor((ms || 0) / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return m > 0 ? `${m}m ${s}s` : `${s}s`;
    };

    // ── C9 voice output gate (Plan 042 T2/T5) ──
    // Announce a would-be-modal event via Tabby's voice when voice.output is
    // enabled, else show the overlay immediately. Presence is proxied by this
    // tab actually being visible+focused; absent/unknown → decideSpeakOrModal
    // falls straight back to the modal, so no event is ever silently dropped.
    const _voiceOutputOn = () => !!(settings?.voice?.enabled && settings?.voice?.output?.enabled);
    const _presence = () => (document.visibilityState === 'visible' && document.hasFocus()) ? 'present' : 'unknown';
    const _maybeAnnounce = (modalType, context, { onProceedModal, onHoldOff = () => {} }) => {
      if (!_voiceOutputOn()) { onProceedModal(); return; }
      // Fire-and-forget: tabbyAnnounce always drives to some resolution and
      // never throws (tone → hold-off window → speak → show overlay anyway).
      try {
        tabbyAnnounce({
          modalType, context,
          voiceSettings: settings.voice,
          presence: _presence(),
          onProceedModal, onHoldOff
        });
      } catch { onProceedModal(); }
    };
    const _buildFTEActions = (card, overlay, focusId) => {
      card.querySelector('#fte-extend-custom')?.addEventListener('click', () => {
        const val = Number(card.querySelector('#fte-snooze-custom-val')?.value || 5);
        _dismissAndSend(overlay, 'EXTEND_FOCUS_TIMER', { focusId, extraMinutes: val });
      });
      card.querySelector('#fte-cook')?.addEventListener('click', () => _dismissAndSend(overlay, 'LET_ME_COOK', { focusId }));
      card.querySelector('#fte-switch')?.addEventListener('click', async () => {
        try {
          const res = await chrome.runtime.sendMessage({ type: 'GET_FOCUS_ENGINE' });
          const items = Object.values(res?.focusEngine?.items || {}).filter(i => i.id !== focusId && i.focusState === 'paused');
          const list = card.querySelector('#fte-switch-list');
          if (list) { list.innerHTML = items.length ? items.map(i => `<button data-fid="${escapeHtml(i.id)}" style="${_popupBtnStyle('#29b6f6')}margin:2px;">${escapeHtml(i.label)}</button>`).join('') : '<span style="color:#666;font-size:11px;">No other focuses queued.</span>'; list.style.display = 'flex'; list.style.flexWrap = 'wrap'; list.style.gap = '4px'; list.style.justifyContent = 'center'; list.style.marginTop = '6px'; items.forEach(i => list.querySelector(`[data-fid="${i.id}"]`)?.addEventListener('click', () => _dismissAndSend(overlay, 'SWITCH_FOCUS', { focusId: i.id }))); }
        } catch {}
      });
      card.querySelector('#fte-pause')?.addEventListener('click', () => _dismissAndSend(overlay, 'PAUSE_FOCUS', { focusId }));
      card.querySelector('#fte-break')?.addEventListener('click', () => _dismissAndSend(overlay, 'TOGGLE_BREAK', {}));
      card.querySelector('#fte-done')?.addEventListener('click', () => _dismissAndSend(overlay, 'COMPLETE_FOCUS', { focusId }));
      card.querySelector('#fte-note')?.addEventListener('click', () => {
        const noteArea = card.querySelector('#fte-note-area');
        if (noteArea) noteArea.style.display = noteArea.style.display === 'none' ? 'block' : 'none';
      });
      card.querySelector('#fte-note-save')?.addEventListener('click', async () => {
        const text = card.querySelector('#fte-note-input')?.value || '';
        if (text.trim()) await chrome.runtime.sendMessage({ type: 'SAVE_CHECKPOINT_NOTE', focusId, text, triggeredBy: 'inbar', progressLevel: 'lot' });
        const noteArea = card.querySelector('#fte-note-area');
        if (noteArea) noteArea.style.display = 'none';
      });
    };
    const _fteButtonsHTML = () => `
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px;align-items:center;">
        <div style="display:flex;align-items:center;gap:4px;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:6px;border:1px solid #444;height:32px;box-sizing:border-box;">
          <input type="number" id="fte-snooze-custom-val" value="5" min="1" max="180" style="width:32px;background:#111;color:#eee;border:1px solid #555;border-radius:4px;font-size:11px;text-align:center;padding:2px 0;border:none;">
          <button id="fte-extend-custom" style="background:#00e5ff22;color:#00e5ff;border:1px solid #00e5ff44;border-radius:4px;padding:2px 6px;font-size:11px;font-weight:600;cursor:pointer;">⏱️ Snooze</button>
        </div>
        <button id="fte-cook" style="${_popupBtnStyle('#ffd54f')}">🍳 Let Me Cook</button>
        <button id="fte-switch" style="${_popupBtnStyle('#29b6f6')}">🔄 Switch</button>
        <button id="fte-pause" style="${_popupBtnStyle('#ffa726')}">⏸ Pause</button>
        <button id="fte-break" style="${_popupBtnStyle('#ce93d8')}">☕ Break</button>
        <button id="fte-done" style="${_popupBtnStyle('#66bb6a')}">✅ Complete</button>
        <button id="fte-note" style="${_popupBtnStyle('#78909c')}">📝 Note</button>
      </div>
      <div id="fte-switch-list"></div>
      <div id="fte-note-area" style="display:none;margin-top:10px;">
        <textarea id="fte-note-input" placeholder="Quick note..." style="width:100%;height:48px;background:#111;border:1px solid #444;border-radius:4px;color:#eee;font-size:12px;padding:6px;resize:none;box-sizing:border-box;"></textarea>
        <button id="fte-note-save" style="${_popupBtnStyle('#78909c')}margin-top:4px;">💾 Save Note</button>
      </div>`;

    // ── Timer Expired — 6-CTA overlay (singleton) ──
    if (msg.type === 'FOCUS_TIMER_EXPIRED') {
      if (document.getElementById('tabatha-popup-overlay')) return; // singleton
      const showFteOverlay = () => {
        if (document.getElementById('tabatha-popup-overlay')) return; // singleton (may have opened during the voice window)
        const overlay = _createOverlay();
        const card = _createCard();
        card.innerHTML = `
          <div style="font-size:32px;margin-bottom:8px;">⏰</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Focus Timer Expired</div>
          <div style="font-size:13px;color:#aaa;margin-bottom:4px;">"${escapeHtml(msg.label)}" — Your allotted ${msg.timerMinutes}m is up.</div>
          ${_fteButtonsHTML()}`;
        overlay.appendChild(card);
        document.documentElement.appendChild(overlay);
        _buildFTEActions(card, overlay, msg.focusId);
      };
      // Voice: "hold off" → snooze the timer 5m (mirrors the FTE snooze CTA).
      _maybeAnnounce('focus-timer-expired', { focusLabel: msg.label, timerMinutes: msg.timerMinutes }, {
        onProceedModal: showFteOverlay,
        onHoldOff: () => {
          try { chrome.runtime.sendMessage({ type: 'DISMISS_POPUP' }); } catch {}
          try { chrome.runtime.sendMessage({ type: 'EXTEND_FOCUS_TIMER', focusId: msg.focusId, extraMinutes: 5 }); } catch {}
        }
      });
    }

    // ── Welcome Back — resume prompt (singleton) ──
    if (msg.type === 'WELCOME_BACK' && msg.pausedFocusId) {
      if (document.getElementById('tabatha-popup-overlay')) return;
      const overlay = _createOverlay();
      const card = _createCard();
      card.innerHTML = `
        <div style="font-size:28px;margin-bottom:8px;">👋</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Welcome Back!</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:6px;">You were away for ${_fmtIdleDuration(msg.idleDurationMs)}.</div>
        <div style="font-size:13px;color:#ccc;margin-bottom:16px;">Pick up where you left off?<br><strong style="color:#ff9800;">"${escapeHtml(msg.pausedFocusLabel)}"</strong></div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="wb-resume" style="${_popupBtnStyle('#ab47bc')}">⚡ Resume Focus</button>
          <button id="wb-dismiss" style="${_popupBtnStyle('#888')}">Not now</button>
        </div>`;
      overlay.appendChild(card);
      document.documentElement.appendChild(overlay);
      card.querySelector('#wb-resume').addEventListener('click', () => _dismissAndSend(overlay, 'RESUME_FOCUS', { focusId: msg.pausedFocusId }));
      card.querySelector('#wb-dismiss').addEventListener('click', () => { try { chrome.runtime.sendMessage({ type: 'DISMISS_POPUP' }); } catch {} overlay.remove(); });
    }

    // ── Combo Popup — FTE + WBP merged (singleton) ──
    if (msg.type === 'FOCUS_RETURN_COMBO') {
      _removeExistingOverlay();
      const overlay = _createOverlay();
      const card = _createCard();
      card.innerHTML = `
        <div style="font-size:28px;margin-bottom:8px;">👋⏰</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Welcome Back!</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:6px;">You were away for ${_fmtIdleDuration(msg.idleDurationMs)}.</div>
        <div style="font-size:13px;color:#ccc;margin-bottom:12px;">The time you gave yourself for <strong style="color:#ff9800;">"${escapeHtml(msg.focusLabel)}"</strong> expired while you were away, how would you like to proceed?</div>
        ${_fteButtonsHTML()}
        <div style="margin-top:10px;">
          <button id="combo-resume" style="${_popupBtnStyle('#ab47bc')}">⚡ Resume Focus</button>
        </div>`;
      overlay.appendChild(card);
      document.documentElement.appendChild(overlay);
      _buildFTEActions(card, overlay, msg.focusId);
      card.querySelector('#combo-resume')?.addEventListener('click', () => _dismissAndSend(overlay, 'RESUME_FOCUS', { focusId: msg.focusId }));
    }

    // ── Checkpoint Progress Note Prompt (singleton) ──
    if (msg.type === 'CHECKPOINT_PROMPT') {
      _showCPNOverlay({
        focusId: msg.focusId,
        label: msg.label || msg.focusLabel,
        checkpointCount: msg.checkpointCount,
        elapsedMs: msg.elapsedMs,
        timerMinutes: msg.timerMinutes,
        triggeredBy: 'auto_prompt'
      });
    }

    // ── Backburner Alert — check-in overlay (singleton) ──
    if (msg.type === 'BACKBURNER_ALERT') {
      if (document.getElementById('tabatha-popup-overlay')) return; // singleton
      const overlay = _createOverlay();
      const card = _createCard();
      const elapsed = msg.backburneredAt ? Math.floor((Date.now() - new Date(msg.backburneredAt).getTime()) / 60000) : '?';
      card.innerHTML = `
        <div style="font-size:32px;margin-bottom:8px;">🔥</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;color:#ff9800;">Backburner Check-in</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:4px;">"<strong style="color:#ff9800;">${escapeHtml(msg.label || 'Backburnered Focus')}</strong>" has been on the backburner for ${elapsed}m.</div>
        <div style="font-size:12px;color:#888;margin-bottom:12px;">Would you like to come back to it?</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
          <button id="bb-resume" style="${_popupBtnStyle('#66bb6a')}">▶ Resume</button>
          <button id="bb-snooze" style="${_popupBtnStyle('#ffa726')}">⏰ Snooze 10m</button>
          <button id="bb-dismiss" style="${_popupBtnStyle('#ef5350')}">✕ Dismiss</button>
        </div>`;
      overlay.appendChild(card);
      document.documentElement.appendChild(overlay);
      card.querySelector('#bb-resume')?.addEventListener('click', () => _dismissAndSend(overlay, 'RESUME_BACKBURNER', { focusId: msg.focusId }));
      card.querySelector('#bb-snooze')?.addEventListener('click', () => _dismissAndSend(overlay, 'SNOOZE_BACKBURNER', { focusId: msg.focusId, snoozeMinutes: 10 }));
      card.querySelector('#bb-dismiss')?.addEventListener('click', () => _dismissAndSend(overlay, 'DISMISS_BACKBURNER', { focusId: msg.focusId }));
    }

    // ── Plan 036: Smart Idle Prompt (singleton) ──
    // NB-09: also carries offline-gap prompts (source:'gap') — same response
    // machinery (IDLE_PROMPT_RESPONSE), welcome-back copy + credit option.
    if (msg.type === 'IDLE_PROMPT') {
      if (document.getElementById('tabatha-popup-overlay')) return; // singleton
      const overlay = _createOverlay();
      const card = _createCard();
      const isGap = msg.source === 'gap';
      const gapMins = Math.round((msg.gapMs || 0) / 60000);
      const gapBody = msg.trimmed
        ? `Tabatha was offline for ~${gapMins}m while <strong style="color:#ff9800;">"${escapeHtml(msg.focusLabel || 'your focus')}"</strong> was running.<br>Its timer was paused back at the gap start — were you still working?`
        : `Tabatha was offline for ~${gapMins}m while <strong style="color:#ff9800;">"${escapeHtml(msg.focusLabel || 'your focus')}"</strong> was running.<br>You looked active off-Chrome, so the timer kept running — sound right?`;
      card.innerHTML = `
        <div style="font-size:30px;margin-bottom:8px;">${isGap ? '👋' : '💤'}</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">${isGap ? 'Welcome back!' : 'Still on task?'}</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:14px;">${isGap ? gapBody : `Chrome's been quiet, but you might still be working on<br><strong style="color:#ff9800;">"${escapeHtml(msg.focusLabel || 'your focus')}"</strong>`}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
          <button id="idle-ontask" style="${_popupBtnStyle('#66bb6a')}">${isGap ? (msg.trimmed ? '✅ I kept working — credit it' : '✅ Yes, keep the time') : '✅ Yes, on task'}</button>
          <button id="idle-diverged" style="${_popupBtnStyle('#ffa726')}">↪ I diverged</button>
          <button id="idle-pause" style="${_popupBtnStyle('#888')}">${isGap && msg.trimmed ? '⏸ Keep it paused' : '⏸ Pause focus'}</button>
        </div>`;
      overlay.appendChild(card);
      document.documentElement.appendChild(overlay);
      const respond = (response) => _dismissAndSend(overlay, 'IDLE_PROMPT_RESPONSE', { focusId: msg.focusId, response });
      card.querySelector('#idle-ontask')?.addEventListener('click', () => respond('on_task'));
      card.querySelector('#idle-diverged')?.addEventListener('click', () => respond('diverged'));
      card.querySelector('#idle-pause')?.addEventListener('click', () => respond('pause'));
    }

    // ── Plan 036: idle prompt resolved ──
    // Only auto-dismiss the overlay on 'timeout' (the hard-pause fallback fired).
    // On 'returned' the user just moved their mouse back to Chrome to click a
    // button — removing the overlay at that moment is the exact bug that makes
    // the options unreachable. Leave the overlay up; the button handlers remove it.
    if (msg.type === 'IDLE_PROMPT_RESOLVED') {
      if (msg.resolution === 'timeout') _removeExistingOverlay();
    }

    // ── Plan 036: Focus Drift Detected (singleton) ──
    if (msg.type === 'FOCUS_DRIFT_DETECTED') {
      if (document.getElementById('tabatha-popup-overlay')) return; // singleton
      const showDriftOverlay = () => {
        if (document.getElementById('tabatha-popup-overlay')) return; // singleton (may have opened during the voice window)
        const overlay = _createOverlay();
        const card = _createCard();
        card.innerHTML = `
          <div style="font-size:30px;margin-bottom:8px;">🧭</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Drifting off?</div>
          <div style="font-size:13px;color:#aaa;margin-bottom:14px;">You've been on unrelated tabs for a bit while focused on<br><strong style="color:#ff9800;">"${escapeHtml(msg.focusLabel || 'your focus')}"</strong></div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
            <button id="drift-still" style="${_popupBtnStyle('#66bb6a')}">✅ Still working on it</button>
            <button id="drift-switch" style="${_popupBtnStyle('#ab47bc')}">🔀 Switching tasks</button>
            <button id="drift-checking" style="${_popupBtnStyle('#888')}">👀 Just checking</button>
          </div>`;
        overlay.appendChild(card);
        document.documentElement.appendChild(overlay);
        let curTabId = null;
        chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' }).then(r => { curTabId = r?.tabId ?? null; }).catch(() => {});
        const respond = (response) => _dismissAndSend(overlay, 'FOCUS_DRIFT_RESPONSE', { focusId: msg.focusId, response, tabId: curTabId });
        card.querySelector('#drift-still')?.addEventListener('click', () => respond('still_working'));
        card.querySelector('#drift-switch')?.addEventListener('click', () => respond('switching'));
        card.querySelector('#drift-checking')?.addEventListener('click', () => respond('just_checking'));
      };
      // Voice: "hold off" → treat as "just checking" (the drift snooze path).
      _maybeAnnounce('drift-detected', { focusLabel: msg.focusLabel }, {
        onProceedModal: showDriftOverlay,
        onHoldOff: () => {
          try { chrome.runtime.sendMessage({ type: 'DISMISS_POPUP' }); } catch {}
          try { chrome.runtime.sendMessage({ type: 'FOCUS_DRIFT_RESPONSE', focusId: msg.focusId, response: 'just_checking' }); } catch {}
        }
      });
    }

    // ── Plan 036: Auto-Focus suggestion — non-blocking transient chip ──
    if (msg.type === 'AUTO_FOCUS_SUGGESTED') {
      _showAutoFocusChip(msg);
    }
    if (msg.type === 'AUTO_FOCUS_DISMISSED') {
      document.getElementById('tabatha-autofocus-chip')?.remove();
    }

    // ── Popup Dismissed — cross-tab cleanup ──
    if (msg.type === 'POPUP_DISMISSED') {
      _removeExistingOverlay();
    }

    // ── Focus Engine Updated — auto-dismiss stale popups ──
    if (msg.type === 'FOCUS_ENGINE_UPDATED') {
      const existing = document.getElementById('tabatha-popup-overlay');
      if (existing) {
        chrome.runtime.sendMessage({ type: 'GET_FOCUS_ENGINE' }).then(res => {
          const engine = res?.focusEngine;
          if (engine) {
            const hasDrifted = Object.values(engine.items || {}).some(i => i.focusState === 'drifted');
            const hasPaused = engine.activeFocusId && engine.items[engine.activeFocusId]?.focusState === 'paused';
            if (!hasDrifted && !hasPaused) existing.remove();
          }
        }).catch(() => {});
      }
    }
  });

  // 14. Cleanup on unload
  window.addEventListener('beforeunload', () => {
    clearInterval(interval);
  });
})();
