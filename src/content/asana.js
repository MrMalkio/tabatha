// Tabatha — Asana task controls.
// Injects a compact, isolated control strip on Asana task pages. It survives
// Asana's SPA navigation and never reads task descriptions or private fields;
// only the current task identity, visible title, and visible parent breadcrumb.
/* global chrome */

import { parseAsanaUrl } from '../utils/taskUrlResolver.js';

(async () => {
  if (location.hostname !== 'app.asana.com') return;

  let currentTask = null;
  let lastContextSignature = '';
  let lastStatus = null;
  let host = null;
  let shadow = null;
  let refreshTimer = null;
  let collapsed = false;
  let busy = false;

  function readText(element) {
    const value = element?.value || element?.getAttribute?.('value') || element?.textContent || '';
    return value.replace(/\s+/g, ' ').trim();
  }

  function taskNameFromPage() {
    const selectors = [
      '[data-testid="task-name"]',
      '[aria-label="Task name"]',
      'textarea[aria-label*="task name" i]',
      '[contenteditable="true"][aria-label*="task name" i]',
      '[role="heading"][aria-level="1"]',
    ];
    for (const selector of selectors) {
      const text = readText(document.querySelector(selector));
      if (text && text !== 'Asana' && text.length < 500) return text;
    }
    return document.title
      .replace(/\s*[-–—]\s*Asana\s*$/i, '')
      .replace(/\s*\|\s*Asana\s*$/i, '')
      .trim() || 'Asana task';
  }

  function findParentTask(currentGid) {
    const roots = [
      ...document.querySelectorAll('[aria-label*="parent" i], [data-testid*="parent" i]'),
      ...Array.from(document.querySelectorAll('div,span')).filter(el => /^parent task:?$/i.test(readText(el))).slice(0, 8),
    ];

    for (const root of roots) {
      let scope = root;
      for (let depth = 0; scope && depth < 5; depth += 1, scope = scope.parentElement) {
        const links = scope.matches?.('a[href]') ? [scope] : Array.from(scope.querySelectorAll?.('a[href]') || []);
        for (const link of links) {
          const parsed = parseAsanaUrl(link.href);
          if (parsed?.type !== 'task' || parsed.taskGid === currentGid) continue;
          return { parentTaskGid: parsed.taskGid, parentTaskName: readText(link) || null };
        }
      }
    }
    return { parentTaskGid: null, parentTaskName: null };
  }

  function readCurrentTask() {
    const parsed = parseAsanaUrl(location.href);
    if (parsed?.platform !== 'asana' || parsed.type !== 'task' || !parsed.taskGid) return null;
    const parent = findParentTask(parsed.taskGid);
    return {
      taskGid: parsed.taskGid,
      taskName: taskNameFromPage(),
      taskUrl: location.href,
      workspaceGid: parsed.workspaceGid || null,
      projectGid: parsed.projectGid || null,
      focusMode: !!parsed.focusMode,
      ...parent,
    };
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor((ms || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function sessionElapsed(session) {
    if (Number.isFinite(session?.durationMs)) return session.durationMs;
    const started = Date.parse(session?.startedAt);
    return Number.isFinite(started) ? Date.now() - started : 0;
  }

  function button(label, className, handler, title) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.textContent = label;
    if (title) el.title = title;
    el.onclick = handler;
    return el;
  }

  function ensureHost() {
    if (host?.isConnected) return;
    host = document.createElement('div');
    host.id = 'tabatha-asana-bridge-host';
    shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; }
      .card { position: fixed; right: 12px; bottom: 36px; z-index: 2147483645; width: min(430px, calc(100vw - 24px)); background: rgba(13,13,15,.97); color: #eee; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; box-shadow: 0 12px 36px rgba(0,0,0,.42); font: 11px/1.35 'Segoe UI', system-ui, sans-serif; overflow: hidden; backdrop-filter: blur(14px); }
      .head { min-height: 34px; display: flex; align-items: center; gap: 8px; padding: 6px 8px; }
      .mark { color: #f06a6a; font-weight: 800; letter-spacing: .04em; }
      .title { flex: 1; min-width: 0; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .context { color: #9ca3af; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
      .toggle { border: 0; background: transparent; color: #888; cursor: pointer; padding: 3px 5px; }
      .body { border-top: 1px solid rgba(255,255,255,.08); padding: 8px; display: grid; gap: 8px; }
      .actions { display: grid; grid-template-columns: 1fr 1fr 1.25fr; gap: 6px; }
      button.action { border: 1px solid rgba(255,255,255,.14); border-radius: 5px; padding: 7px 8px; color: #eee; background: #242428; cursor: pointer; font: inherit; font-weight: 650; }
      button.action:hover { border-color: rgba(255,255,255,.3); background: #2d2d32; }
      button.focus { color: #67e8f9; border-color: rgba(103,232,249,.25); }
      button.human { color: #86efac; border-color: rgba(134,239,172,.25); }
      button.agent { color: #c4b5fd; border-color: rgba(196,181,253,.25); }
      button.stop { color: #fca5a5; border-color: rgba(252,165,165,.3); }
      .agent-row { display: grid; grid-template-columns: 1fr auto; gap: 6px; }
      input { width: 100%; border: 1px solid rgba(255,255,255,.12); border-radius: 5px; background: #18181b; color: #eee; padding: 6px 8px; font: inherit; outline: none; }
      input:focus { border-color: rgba(196,181,253,.55); }
      .sessions { display: grid; gap: 5px; }
      .session { display: flex; align-items: center; gap: 7px; padding: 5px 7px; background: rgba(255,255,255,.045); border-radius: 5px; }
      .session .who { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .session .time { font-variant-numeric: tabular-nums; color: #d1d5db; }
      .session button { border: 0; background: transparent; color: #fca5a5; cursor: pointer; font: inherit; }
      .summary { display: flex; gap: 12px; color: #9ca3af; font-variant-numeric: tabular-nums; }
      .summary strong { color: #e5e7eb; font-weight: 650; }
      .parent { color: #a1a1aa; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .notice { min-height: 14px; color: #fbbf24; }
      .hidden { display: none; }
      @media (max-width: 620px) { .actions { grid-template-columns: 1fr; } .card { bottom: 32px; } }
    `;
    shadow.appendChild(style);
    document.documentElement.appendChild(host);
  }

  function render() {
    if (!currentTask) {
      host?.remove();
      host = null;
      shadow = null;
      return;
    }
    ensureHost();
    const oldCard = shadow.querySelector('.card');
    oldCard?.remove();

    const card = document.createElement('section');
    card.className = 'card';
    const head = document.createElement('div');
    head.className = 'head';
    const mark = document.createElement('span');
    mark.className = 'mark';
    mark.textContent = 'TABATHA';
    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = currentTask.taskName;
    title.title = currentTask.taskName;
    const context = document.createElement('span');
    context.className = 'context';
    context.textContent = currentTask.focusMode ? 'Focused task' : 'Asana task';
    const toggle = button(collapsed ? '▴' : '▾', 'toggle', () => { collapsed = !collapsed; render(); }, collapsed ? 'Expand controls' : 'Collapse controls');
    head.append(mark, title, context, toggle);
    card.appendChild(head);

    const body = document.createElement('div');
    body.className = `body${collapsed ? ' hidden' : ''}`;
    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.append(
      button('Set focus', 'action focus', () => runAction('focus'), 'Create or switch to a Tabatha focus linked to this task'),
      button('My time', 'action human', () => runAction('human'), 'Track your attention on this Asana task'),
      button('Agent time', 'action agent', () => runAction('agent'), 'Track an agent’s attention on this Asana task')
    );
    body.appendChild(actions);

    const agentRow = document.createElement('div');
    agentRow.className = 'agent-row';
    const agentInput = document.createElement('input');
    agentInput.id = 'agent-name';
    agentInput.placeholder = 'Agent name (optional)';
    agentInput.value = sessionStorage.getItem('tabatha-asana-agent-name') || '';
    agentInput.onchange = () => sessionStorage.setItem('tabatha-asana-agent-name', agentInput.value.trim());
    const agentHint = document.createElement('span');
    agentHint.className = 'context';
    agentHint.textContent = 'Human and agents can run concurrently';
    agentRow.append(agentInput, agentHint);
    body.appendChild(agentRow);

    const activeForTask = lastStatus?.activeForTask || [];
    if (activeForTask.length) {
      const sessions = document.createElement('div');
      sessions.className = 'sessions';
      for (const session of activeForTask) {
        const row = document.createElement('div');
        row.className = 'session';
        const who = document.createElement('span');
        who.className = 'who';
        who.textContent = session.controller === 'ai-agent' ? `🤖 ${session.agentName || 'Agent'} working` : '🧑 I’m working';
        const time = document.createElement('span');
        time.className = 'time';
        time.textContent = formatDuration(sessionElapsed(session));
        const stop = button('Stop', '', () => stopSession(session));
        row.append(who, time, stop);
        sessions.appendChild(row);
      }
      body.appendChild(sessions);
    }

    const summary = lastStatus?.summary;
    const summaryRow = document.createElement('div');
    summaryRow.className = 'summary';
    summaryRow.innerHTML = `<span>Total <strong>${formatDuration(summary?.totalMs || 0)}</strong></span><span>Mine <strong>${formatDuration(summary?.humanMs || 0)}</strong></span><span>Agents <strong>${formatDuration(summary?.agentMs || 0)}</strong></span>`;
    body.appendChild(summaryRow);

    const parent = document.createElement('div');
    parent.className = 'parent';
    parent.textContent = currentTask.parentTaskGid
      ? `↳ Rolls up to ${currentTask.parentTaskName || `parent task ${currentTask.parentTaskGid}`}`
      : 'Direct task time · parent rollup is added when Asana exposes a parent breadcrumb';
    body.appendChild(parent);

    const notice = document.createElement('div');
    notice.className = 'notice';
    notice.id = 'notice';
    notice.textContent = busy ? 'Updating Tabatha…' : '';
    body.appendChild(notice);
    card.appendChild(body);
    shadow.appendChild(card);
  }

  async function runAction(kind) {
    if (!currentTask || busy) return;
    busy = true;
    render();
    try {
      if (kind === 'focus') {
        const result = await chrome.runtime.sendMessage({ type: 'SET_ASANA_TASK_FOCUS', task: currentTask });
        if (result?.error) throw new Error(result.error);
      } else {
        const agentName = kind === 'agent' ? (shadow.querySelector('#agent-name')?.value?.trim() || 'Agent') : null;
        if (agentName) sessionStorage.setItem('tabatha-asana-agent-name', agentName);
        const result = await chrome.runtime.sendMessage({
          type: 'START_ASANA_TASK_TIMER',
          task: currentTask,
          actorType: kind === 'agent' ? 'agent' : 'human',
          agentName,
        });
        if (result?.error) throw new Error(result.error);
        lastStatus = result;
      }
    } catch (error) {
      const notice = shadow?.querySelector('#notice');
      if (notice) notice.textContent = error?.message || 'Tabatha could not update this task';
    } finally {
      busy = false;
      await refreshStatus();
    }
  }

  async function stopSession(session) {
    if (busy) return;
    busy = true;
    render();
    try {
      const result = await chrome.runtime.sendMessage({
        type: 'STOP_ASANA_TASK_TIMER',
        taskGid: currentTask.taskGid,
        actorKey: session.actorKey,
      });
      if (result?.error) throw new Error(result.error);
      lastStatus = result;
    } finally {
      busy = false;
      await refreshStatus();
    }
  }

  async function refreshStatus() {
    if (!currentTask) return;
    try {
      lastStatus = await chrome.runtime.sendMessage({ type: 'GET_ASANA_TASK_STATUS', taskGid: currentTask.taskGid });
    } catch { /* service worker can be restarting */ }
    render();
  }

  async function inspectPage() {
    const next = readCurrentTask();
    if (!next) {
      currentTask = null;
      lastStatus = null;
      lastContextSignature = '';
      render();
      return;
    }

    currentTask = next;
    const signature = JSON.stringify([
      next.taskGid,
      next.taskName,
      next.parentTaskGid,
      next.parentTaskName,
      next.focusMode,
    ]);
    if (signature !== lastContextSignature) {
      lastContextSignature = signature;
      try {
        lastStatus = await chrome.runtime.sendMessage({ type: 'SYNC_ASANA_TASK_CONTEXT', task: next });
      } catch { /* retry on the next SPA inspection */ }
      collapsed = !next.focusMode && collapsed;
    }
    render();
  }

  const observer = new MutationObserver(() => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(inspectPage, 350);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  setInterval(() => {
    inspectPage();
    if (currentTask) refreshStatus();
  }, 3000);
  setInterval(() => { if (currentTask && lastStatus?.activeForTask?.length) render(); }, 1000);
  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'ASANA_TASK_TRACKING_UPDATED' || message?.type === 'FOCUS_ENGINE_UPDATED') refreshStatus();
  });

  await inspectPage();
})();
