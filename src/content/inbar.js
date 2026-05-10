// Tabatha — Intent Bar (InBar)
// Non-intrusive bottom/top bar showing current intent, task, and timers
// Collapses to a persistent nub toggle when dismissed
// Supports inline note-taking for current focus/task/intent

(async () => {
  // 1. Get current tab's context and active focus
  let tabContext, activeFocus, settings, currentNote = '';
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_INBAR_DATA' });
    if (!res || !res.show) return;
    tabContext = res.tabContext;
    activeFocus = res.activeFocus;
    settings = res.settings || {};
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

  // 3. Create host container
  const host = document.createElement('div');
  host.id = 'tabatha-inbar-host';
  Object.assign(host.style, {
    position: 'fixed',
    [position]: '0',
    left: '0',
    width: '100vw',
    zIndex: '2147483646',
    pointerEvents: 'none',
    transition: 'height 0.2s ease'
  });
  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);

  // 4. Push page content
  const pushPage = (h) => {
    document.body.style.transition = 'margin 0.2s ease';
    if (position === 'bottom') document.body.style.marginBottom = `${h}px`;
    else document.body.style.marginTop = `${h}px`;
  };
  pushPage(BAR_HEIGHT);

  // 5. Styles
  const intentLabel = tabContext?.context || tabContext?.intent || null;
  const focusLabel = activeFocus?.label || null;
  const hasFocus = !!activeFocus;
  const hasContext = !!intentLabel;

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
    .intent-label { font-weight: 500; color: #eee; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
    .task-label { font-size: 10px; color: #777; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .timer { font-variant-numeric: tabular-nums; font-size: 10px; font-weight: 600; letter-spacing: 0.3px; }
    .timer-up { color: #00e5ff; }
    .timer-down { color: #ff6b6b; }
    .timer-task { color: #66bb6a; }
    .divider { width: 1px; height: 10px; background: rgba(255,255,255,0.12); flex-shrink: 0; }
    .badge { font-size: 7px; padding: 1px 4px; border-radius: 3px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-focus { background: #00e5ff18; color: #00e5ff; border: 1px solid #00e5ff33; }
    .badge-no-intent { background: #ff6b6b12; color: #ff6b6b; border: 1px solid #ff6b6b33; cursor: pointer; padding: 2px 8px; font-size: 9px; }
    .badge-no-intent:hover { background: #ff6b6b22; }

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
  `;
  shadow.appendChild(style);

  // 6. Build bar content
  const bar = document.createElement('div');
  bar.className = 'bar';

  let intentStartTime = tabContext?.startedAt ? new Date(tabContext.startedAt).getTime() : Date.now();
  let focusEndTime = activeFocus?.timerEndAt ? new Date(activeFocus.timerEndAt).getTime() : null;
  let taskTotalMs = activeFocus?.totalTimeMs || 0;

  bar.innerHTML = `
    <div class="left">
      ${hasContext || hasFocus ? `
        <span class="timer timer-up" id="intent-timer" title="Time on current intent">00:00</span>
        <span class="divider"></span>
        <span class="timer timer-task" id="task-timer" title="Total time on related task">00:00</span>
      ` : `
        <span style="font-size:10px;color:#555;">—</span>
      `}
    </div>
    <div class="center">
      ${hasFocus ? `<span class="badge badge-focus">🎯 focus</span>` : ''}
      ${intentLabel
        ? `<span class="intent-label" title="${intentLabel}">${intentLabel}</span>`
        : `<span class="badge badge-no-intent" id="set-intent-btn" title="Click to set intent via Tabatha popup">No intent set — click to set</span>`
      }
      ${focusLabel && focusLabel !== intentLabel
        ? `<span class="divider"></span><span class="task-label" title="${focusLabel}">📋 ${focusLabel}</span>`
        : ''
      }
    </div>
    <div class="right">
      ${focusEndTime ? `<span class="timer timer-down" id="focus-countdown" title="Focus countdown">--:--</span>` : ''}
      <button class="bar-btn note-btn" id="note-btn" title="Add note">📝</button>
      <button class="bar-btn" id="hide-bar" title="Collapse to nub">▾</button>
    </div>
  `;
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
      <textarea class="notes-textarea" id="note-text" placeholder="Jot a thought about this focus, task, or intent…">${currentNote}</textarea>
      <div class="notes-saved" id="note-saved">✓ Saved</div>
    </div>
  `;
  shadow.appendChild(notesPanel);

  // 8. Nub (collapsed toggle)
  const nub = document.createElement('div');
  nub.className = `nub${currentNote ? ' has-note' : ''}`;
  nub.innerHTML = '◉';
  nub.title = 'Show Tabatha InBar';
  shadow.appendChild(nub);

  // 9. Timer logic
  const intentTimerEl = shadow.getElementById('intent-timer');
  const taskTimerEl = shadow.getElementById('task-timer');
  const countdownEl = shadow.getElementById('focus-countdown');

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
    if (isCollapsed) return;
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

  // 10. Collapse / Expand
  const collapse = () => {
    isCollapsed = true;
    isNotesOpen = false;
    bar.classList.add('hidden');
    notesPanel.classList.remove('open');
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

  shadow.getElementById('hide-bar').onclick = collapse;
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

  shadow.getElementById('note-btn').onclick = toggleNotes;
  shadow.getElementById('close-notes').onclick = toggleNotes;

  // Auto-save notes with debounce
  noteTextarea.addEventListener('input', () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      const text = noteTextarea.value;
      chrome.runtime.sendMessage({ type: 'SAVE_INBAR_NOTE', note: text }).then(() => {
        noteSaved.classList.add('show');
        nub.classList.toggle('has-note', !!text);
        shadow.getElementById('note-btn').style.color = text ? '#ffc107' : '#555';
        setTimeout(() => noteSaved.classList.remove('show'), 1500);
      }).catch(() => {});
    }, 600);
  });

  // 12. "Set intent" click — open Tabatha popup
  const setIntentBtn = shadow.getElementById('set-intent-btn');
  if (setIntentBtn) {
    setIntentBtn.onclick = () => {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' }).catch(() => {});
    };
  }

  // 13. Listen for updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'FOCUS_ENGINE_UPDATED' || msg.type === 'TAB_UPDATED') {
      chrome.runtime.sendMessage({ type: 'GET_INBAR_DATA' }).then(res => {
        if (res?.activeFocus) {
          focusEndTime = res.activeFocus.timerEndAt ? new Date(res.activeFocus.timerEndAt).getTime() : null;
          taskTotalMs = res.activeFocus.totalTimeMs || 0;
        }
      }).catch(() => {});
    }
  });

  // 14. Cleanup on unload
  window.addEventListener('beforeunload', () => {
    clearInterval(interval);
  });
})();
