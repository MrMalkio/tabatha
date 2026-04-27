// Tabatha — Intent Bar (InBar)
// Non-intrusive bottom bar showing current intent, task, and timers
// Pushes page content up by its height

(async () => {
  // 1. Get current tab's context and active focus
  let tabContext, activeFocus, settings;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_INBAR_DATA' });
    if (!res || !res.show) return;
    tabContext = res.tabContext;
    activeFocus = res.activeFocus;
    settings = res.settings || {};
  } catch (e) { return; }

  // Config
  const position = settings.inbarPosition || 'bottom'; // 'bottom' or 'top'
  const BAR_HEIGHT = 24;

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

  // 3. Push page content
  document.body.style.transition = 'margin 0.2s ease';
  if (position === 'bottom') {
    document.body.style.marginBottom = `${BAR_HEIGHT}px`;
  } else {
    document.body.style.marginTop = `${BAR_HEIGHT}px`;
  }

  // 4. Create bar
  const host = document.createElement('div');
  host.id = 'tabatha-inbar-host';
  Object.assign(host.style, {
    position: 'fixed',
    [position]: '0',
    left: '0',
    width: '100vw',
    height: `${BAR_HEIGHT}px`,
    zIndex: '2147483646',
    pointerEvents: 'auto'
  });

  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);

  const style = document.createElement('style');
  style.textContent = `
    :host {
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 11px;
      color: #ccc;
    }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: ${BAR_HEIGHT}px;
      background: #111;
      border-${position === 'bottom' ? 'top' : 'bottom'}: 1px solid #333;
      padding: 0 12px;
      gap: 12px;
      user-select: none;
    }
    .left, .right { display: flex; align-items: center; gap: 10px; }
    .center { flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px; }
    .intent-label { font-weight: 500; color: #eee; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-label { font-size: 10px; color: #888; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .timer { font-variant-numeric: tabular-nums; font-size: 10px; font-weight: 600; }
    .timer-up { color: #00e5ff; }
    .timer-down { color: #ff6b6b; }
    .timer-task { color: #66bb6a; }
    .divider { width: 1px; height: 12px; background: #333; }
    .badge { font-size: 8px; padding: 1px 4px; border-radius: 3px; font-weight: 600; }
    .badge-focus { background: #00e5ff22; color: #00e5ff; }
    .badge-no-intent { background: #ff6b6b22; color: #ff6b6b; }
    .close-btn {
      background: none; border: none; color: #555; font-size: 12px;
      cursor: pointer; padding: 0 2px; line-height: 1;
    }
    .close-btn:hover { color: #fff; }
  `;
  shadow.appendChild(style);

  // 5. Build bar content
  const bar = document.createElement('div');
  bar.className = 'bar';

  const intentLabel = tabContext?.context || tabContext?.intent || null;
  const focusLabel = activeFocus?.label || null;
  const hasFocus = !!activeFocus;

  // Timers state
  let intentStartTime = tabContext?.startedAt ? new Date(tabContext.startedAt).getTime() : Date.now();
  let focusEndTime = activeFocus?.timerEndAt ? new Date(activeFocus.timerEndAt).getTime() : null;
  let taskTotalMs = activeFocus?.totalTimeMs || 0;

  bar.innerHTML = `
    <div class="left">
      <span class="timer timer-up" id="intent-timer" title="Time on current intent">00:00</span>
      <span class="divider"></span>
      <span class="timer timer-task" id="task-timer" title="Total time on related task">00:00</span>
    </div>
    <div class="center">
      ${hasFocus ? `<span class="badge badge-focus">🎯</span>` : ''}
      ${intentLabel
        ? `<span class="intent-label" title="${intentLabel}">${intentLabel}</span>`
        : `<span class="intent-label badge-no-intent" title="No intent set">No intent set</span>`
      }
      ${focusLabel && focusLabel !== intentLabel
        ? `<span class="divider"></span><span class="task-label" title="${focusLabel}">📋 ${focusLabel}</span>`
        : ''
      }
    </div>
    <div class="right">
      ${focusEndTime
        ? `<span class="timer timer-down" id="focus-countdown" title="Focus countdown">--:--</span>`
        : ''
      }
      <button class="close-btn" id="close-bar" title="Hide InBar for this tab">✕</button>
    </div>
  `;
  shadow.appendChild(bar);

  // 6. Timer logic
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
    const now = Date.now();
    // Intent timer (counting up)
    if (intentTimerEl) intentTimerEl.textContent = fmt(now - intentStartTime);
    // Task timer (total task time, counting up)
    if (taskTimerEl) taskTimerEl.textContent = fmt(taskTotalMs + (now - intentStartTime));
    // Countdown
    if (countdownEl && focusEndTime) {
      const remaining = focusEndTime - now;
      if (remaining > 0) {
        countdownEl.textContent = fmt(remaining);
        countdownEl.style.color = '#ff6b6b';
      } else {
        countdownEl.textContent = '+' + fmt(Math.abs(remaining));
        countdownEl.style.color = '#ff4444';
      }
    }
  };

  tick();
  const interval = setInterval(tick, 1000);

  // 7. Close button
  shadow.getElementById('close-bar').onclick = () => {
    clearInterval(interval);
    host.remove();
    if (position === 'bottom') document.body.style.marginBottom = '';
    else document.body.style.marginTop = '';
  };

  // 8. Listen for updates
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'FOCUS_ENGINE_UPDATED' || msg.type === 'TAB_UPDATED') {
      // Refresh data
      chrome.runtime.sendMessage({ type: 'GET_INBAR_DATA' }).then(res => {
        if (res?.activeFocus) {
          focusEndTime = res.activeFocus.timerEndAt ? new Date(res.activeFocus.timerEndAt).getTime() : null;
          taskTotalMs = res.activeFocus.totalTimeMs || 0;
        }
      }).catch(() => {});
    }
  });

  // 9. Cleanup on unload
  window.addEventListener('beforeunload', () => {
    clearInterval(interval);
  });
})();
