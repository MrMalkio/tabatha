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

      default:
        console.debug('[CompanionBridge] Unknown message type:', msg.type);
    }
  }

  _handleAppSwitch(msg) {
    this.lastAppSwitch = {
      appName: msg.app_name,
      displayName: msg.app_display_name,
      windowTitle: msg.window_title,
      category: msg.category,
      timestamp: msg.timestamp
    };

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
