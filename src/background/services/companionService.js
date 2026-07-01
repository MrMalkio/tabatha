// ============================================================
// Tabatha - Companion Service (Plan 023 Task 05b)
// Owns the desktop companion WebSocket lifecycle and the companion
// runtime-message handlers.
// ============================================================

import {
  COMPANION_HEARTBEAT_MS,
  COMPANION_RECONNECT_BASE_MS,
  COMPANION_RECONNECT_MAX_MS,
  COMPANION_WS_URL
} from '../constants.js';
import { broadcastToExtension } from './notificationService.js';
import { setSessionFromCompanion } from './clockService.js';

// Minimal dotted-numeric version comparison (manifest versions are MV3
// dot-separated integers, e.g. "6.4.0"). Returns true iff `candidate` is
// strictly greater than `current`. Non-numeric / malformed parts compare as 0
// so a parse failure never triggers a spurious reload.
export function isVersionNewer(current, candidate) {
  if (!current || !candidate) return false;
  const a = String(current).split('.').map((n) => parseInt(n, 10) || 0);
  const b = String(candidate).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (bv > av) return true;
    if (bv < av) return false;
  }
  return false; // equal
}

class CompanionBridge {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.reconnectDelay = COMPANION_RECONNECT_BASE_MS;
    this.listeners = new Map();
    this.companionStatus = null;
    this.lastAppSwitch = null;
    this.desktopClock = null;
    this.initialized = false;
    this.lastBroadcastedIdleState = null;
    // Plan 036: heartbeat + desktop-activity tracking for the Smart Idle Engine.
    // lastMessageAt proves the companion process is alive; lastActivityAt is
    // the last time the user actually did something on the desktop (app switch
    // or a non-idle IDLE_STATE); desktopIdle mirrors the companion's own idle.
    this.lastMessageAt = null;
    this.lastActivityAt = null;
    this.desktopIdle = false;
  }

  initialize() {
    if (this.initialized) return;
    this.initialized = true;
    this.connect();
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    try {
      this.ws = new WebSocket(COMPANION_WS_URL);

      this.ws.onopen = () => {
        console.log('[CompanionBridge] Connected to desktop companion');
        this.connected = true;
        this.reconnectDelay = COMPANION_RECONNECT_BASE_MS;
        this._startHeartbeat();
        this._updateStorageStatus(true);
        this._emit('connected', {});
        this._syncCurrentFocus();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this._handleMessage(msg);
        } catch (e) {
          console.warn('[CompanionBridge] Failed to parse message:', e);
        }
      };

      this.ws.onerror = () => {
        console.debug('[CompanionBridge] WebSocket error (companion may not be running)');
      };

      this.ws.onclose = () => {
        console.log('[CompanionBridge] Disconnected from desktop companion');
        this.connected = false;
        this.ws = null;
        this._stopHeartbeat();
        this._updateStorageStatus(false);
        this._emit('disconnected', {});
        this._scheduleReconnect();
      };
    } catch (e) {
      console.debug('[CompanionBridge] Connection failed:', e.message);
      this._scheduleReconnect();
    }
  }

  disconnect() {
    this._clearReconnect();
    this._stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this._updateStorageStatus(false);
  }

  _scheduleReconnect() {
    this._clearReconnect();
    this.reconnectTimer = setTimeout(() => {
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, COMPANION_RECONNECT_MAX_MS);
      console.debug(`[CompanionBridge] Next reconnect delay: ${this.reconnectDelay}ms`);
    }, this.reconnectDelay);
  }

  _clearReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'PING' });
    }, COMPANION_HEARTBEAT_MS);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  sendFocusUpdate(focusId, label) {
    return this.send({
      type: 'FOCUS_UPDATE',
      focus_id: focusId || null,
      label: label || null
    });
  }

  sendClockIn(label) {
    return this.send({ type: 'CLOCK_IN', label: label || null });
  }

  sendClockOut() {
    return this.send({ type: 'CLOCK_OUT' });
  }

  sendToggleBreak() {
    return this.send({ type: 'TOGGLE_BREAK' });
  }

  requestSummary(date) {
    return this.send({ type: 'REQUEST_SUMMARY', date: date || null });
  }

  requestClockState() {
    return this.send({ type: 'GET_CLOCK_STATE' });
  }

  _handleMessage(msg) {
    // Plan 036: any inbound message proves the companion is alive.
    this.lastMessageAt = Date.now();
    switch (msg.type) {
      case 'APP_SWITCH':
        this._handleAppSwitch(msg);
        break;

      case 'APP_SESSION_END':
        this._handleSessionEnd(msg);
        break;

      case 'COMPANION_STATUS':
        this._handleCompanionStatus(msg);
        break;

      case 'CLOCK_STATE':
        this._handleClockState(msg);
        break;

      case 'DAILY_SUMMARY':
        this._handleDailySummary(msg);
        break;

      case 'IDLE_STATE':
        this._handleIdleState(msg);
        break;

      case 'UPDATE_READY':
        this._handleUpdateReady(msg);
        break;

      default:
        console.debug('[CompanionBridge] Unknown message type:', msg.type);
    }
  }

  // Workstream D: the companion has atomically swapped the extension's code on
  // disk and is telling us a new version is ready. If it's strictly newer than
  // what we're running, leave a breadcrumb and reload so Chrome re-reads the
  // updated unpacked files. If it's equal (or older) we ignore it — this is the
  // loop guard that stops a reloaded worker from reloading again on reconnect.
  _handleUpdateReady(msg) {
    const targetVersion = msg && msg.version;
    if (!targetVersion) {
      console.warn('[CompanionBridge] UPDATE_READY missing version, ignoring');
      return;
    }

    let currentVersion = null;
    try {
      currentVersion = chrome.runtime.getManifest().version;
    } catch (e) {
      console.warn('[CompanionBridge] Could not read manifest version:', e);
    }

    if (currentVersion && !isVersionNewer(currentVersion, targetVersion)) {
      // Equal or older — already on (at least) this version. Loop guard.
      console.log(
        `[CompanionBridge] UPDATE_READY ${targetVersion} not newer than ${currentVersion}, ignoring`
      );
      return;
    }

    console.log(
      `[CompanionBridge] UPDATE_READY: ${currentVersion} -> ${targetVersion}, reloading shortly`
    );

    // Breadcrumb so the post-reload bootstrap can log from->to and fire a sync.
    const breadcrumb = {
      from: currentVersion,
      to: targetVersion,
      notes: msg.notes || null,
      at: Date.now()
    };
    try {
      chrome.storage.local.set({ _pendingUpdate: breadcrumb });
    } catch (e) {
      console.warn('[CompanionBridge] Failed to write _pendingUpdate breadcrumb:', e);
    }

    // Defer briefly so the storage write (and any in-flight writes) flush
    // before the worker is torn down.
    setTimeout(() => {
      try {
        chrome.runtime.reload();
      } catch (e) {
        console.error('[CompanionBridge] chrome.runtime.reload() failed:', e);
      }
    }, 1500);
  }

  _handleAppSwitch(msg) {
    this.lastAppSwitch = {
      appName: msg.app_name,
      displayName: msg.app_display_name,
      windowTitle: msg.window_title,
      category: msg.category,
      timestamp: msg.timestamp
    };

    // Plan 036: an app switch is concrete desktop activity.
    this.lastActivityAt = Date.now();
    this.desktopIdle = false;

    chrome.storage.local.set({ companionActiveApp: this.lastAppSwitch });
    this._emit('appSwitch', this.lastAppSwitch);

    const isChrome = msg.app_name?.toLowerCase() === 'chrome.exe';
    if (!isChrome) {
      this._emit('chromeBlurred', {
        app: msg.app_display_name,
        category: msg.category
      });
    } else {
      this._emit('chromeFocused', {});
    }
  }

  _handleSessionEnd(msg) {
    const session = msg.session;
    this._emit('appSessionEnd', session);

    chrome.storage.local.get('companionRecentSessions', (result) => {
      const sessions = result.companionRecentSessions || [];
      sessions.unshift(session);
      const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const recentSessions = sessions.filter((s) => {
        const ts = new Date(s.started_at || s.startedAt || s.start || s.timestamp || 0).getTime();
        return ts > cutoff;
      });
      chrome.storage.local.set({ companionRecentSessions: recentSessions });
    });
  }

  _handleCompanionStatus(msg) {
    this.companionStatus = {
      version: msg.version,
      uptimeMs: msg.uptime_ms,
      tracking: msg.tracking,
      connectedClients: msg.connected_clients
    };

    chrome.storage.local.set({ companionStatus: this.companionStatus });
    this._emit('companionStatus', this.companionStatus);
  }

  _handleClockState(msg) {
    this.desktopClock = msg.clock;
    chrome.storage.local.set({ companionClock: msg.clock });
    // FIX-02 / FIX-05: mirror the companion clock into the canonical
    // `clockSession` key that Home reads. setSessionFromCompanion is the
    // companion-origin writer — it maps snake_case → camelCase and must NOT
    // send anything back to the companion (no echo loop). Best-effort: a write
    // failure must not break the rest of the message handling.
    Promise.resolve(setSessionFromCompanion(msg.clock)).catch((e) => {
      console.warn('[CompanionBridge] Failed to apply companion clock state:', e);
    });
    this._emit('clockState', msg.clock);
  }

  _handleDailySummary(msg) {
    chrome.storage.local.set({ companionDailySummary: msg.summary });
    this._emit('dailySummary', msg.summary);
  }

  _handleIdleState(msg) {
    const state = msg.is_idle ? 'idle' : 'active';
    const payload = {
      isIdle: msg.is_idle,
      idleMs: msg.idle_ms
    };

    // Plan 036: track the companion's own idle verdict + activity timestamp.
    this.desktopIdle = !!msg.is_idle;
    if (!msg.is_idle) this.lastActivityAt = Date.now();

    this._emit('idleState', payload);
    if (state !== this.lastBroadcastedIdleState) {
      this.lastBroadcastedIdleState = state;
      broadcastToExtension({
        type: 'COMPANION_IDLE_STATE',
        state,
        ...payload
      });
    }
  }

  async _syncCurrentFocus() {
    try {
      const result = await chrome.storage.local.get(['focusState']);
      const focus = result.focusState;
      if (focus && focus.active && focus.id) {
        this.sendFocusUpdate(focus.id, focus.label);
      }
    } catch {
      // Focus state may not exist yet.
    }
  }

  _updateStorageStatus(connected) {
    chrome.storage.local.set({
      companionConnected: connected,
      companionLastSeen: connected ? Date.now() : null
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) set.delete(callback);
  }

  _emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(data);
        } catch (e) {
          console.error(`[CompanionBridge] Error in ${event} listener:`, e);
        }
      }
    }
  }

  get isConnected() {
    return this.connected;
  }

  get activeApp() {
    return this.lastAppSwitch;
  }

  // Plan 036: timestamp (ms) of the last inbound companion message, or null.
  get lastHeartbeat() {
    return this.lastMessageAt;
  }

  // Plan 036: normalised active-app accessor for the idle/auto-focus engines.
  // Returns null when nothing is known, otherwise the raw app switch plus a
  // canonical `name` field (callers use `.name`).
  getActiveApp() {
    if (!this.lastAppSwitch) return null;
    return {
      ...this.lastAppSwitch,
      name: this.lastAppSwitch.displayName || this.lastAppSwitch.appName || null
    };
  }

  // Plan 036: category of the active desktop app (from the companion), or null.
  getActiveAppCategory() {
    return this.lastAppSwitch?.category || null;
  }

  // Plan 036: true when the desktop companion shows the user was genuinely
  // active within `graceMs`. Requires a live connection, a recent message
  // (companion not silently dead), recent concrete activity, and that the
  // companion isn't itself reporting idle. Conservative by design: a false
  // here simply lets the normal Chrome idle path proceed.
  isRecentlyActive(graceMs = 5 * 60 * 1000) {
    if (!this.connected) return false;
    if (this.desktopIdle) return false;
    const now = Date.now();
    // The companion must have spoken recently, otherwise we can't trust it.
    if (!this.lastMessageAt || now - this.lastMessageAt > graceMs) return false;
    // And we need concrete activity (app switch / non-idle) within grace.
    if (!this.lastActivityAt || now - this.lastActivityAt > graceMs) return false;
    return true;
  }

  get clockState() {
    return this.desktopClock;
  }

  get status() {
    return this.companionStatus;
  }
}

export const companionBridge = new CompanionBridge();

export function initialize() {
  companionBridge.initialize();
}

export function getConnectionStatus() {
  return {
    connected: companionBridge.isConnected,
    status: companionBridge.status,
    activeApp: companionBridge.activeApp,
    clock: companionBridge.clockState
  };
}

export function sendClockEvent(event) {
  switch (event?.type || event) {
    case 'clock_in':
    case 'CLOCK_IN':
      return companionBridge.sendClockIn(event?.label);

    case 'clock_out':
    case 'CLOCK_OUT':
      return companionBridge.sendClockOut();

    case 'toggle_break':
    case 'clock_break':
    case 'TOGGLE_BREAK':
      return companionBridge.sendToggleBreak();

    default:
      return false;
  }
}

export function heartbeat() {
  if (!companionBridge.isConnected) return false;
  return companionBridge.send({ type: 'PING' });
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'GET_COMPANION_STATUS':
      return getConnectionStatus();

    case 'GET_COMPANION_SUMMARY':
      if (companionBridge.isConnected) {
        companionBridge.requestSummary(message.date);
        return { requested: true };
      }
      return { connected: false };

    case 'COMPANION_CLOCK_IN':
      if (companionBridge.isConnected) {
        companionBridge.sendClockIn(message.label);
        return { sent: true };
      }
      return { connected: false };

    case 'COMPANION_CLOCK_OUT':
      if (companionBridge.isConnected) {
        companionBridge.sendClockOut();
        return { sent: true };
      }
      return { connected: false };

    case 'COMPANION_CLOCK_BREAK':
    case 'COMPANION_TOGGLE_BREAK':
      if (companionBridge.isConnected) {
        companionBridge.sendToggleBreak();
        return { sent: true };
      }
      return { connected: false };

    default:
      return undefined;
  }
}
