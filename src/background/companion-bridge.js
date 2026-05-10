/**
 * CompanionBridge — WebSocket client for Tabatha Desktop Companion
 * 
 * Connects to the local desktop companion (ws://localhost:9147)
 * to receive OS-level window activity and sync timeclock state.
 * 
 * This module runs in the service worker context and:
 * - Receives APP_SWITCH events (which app the user is focused on)
 * - Receives IDLE_STATE events (OS-level idle detection)  
 * - Syncs CLOCK_STATE bidirectionally
 * - Sends FOCUS_UPDATE when the user changes focus in the extension
 * - Stores companion status in chrome.storage.local
 */

const WS_URL = 'ws://localhost:9147';
const RECONNECT_INTERVAL_MS = 5000;    // Retry every 5s
const MAX_RECONNECT_INTERVAL_MS = 30000; // Cap at 30s
const HEARTBEAT_INTERVAL_MS = 30000;    // Ping every 30s

class CompanionBridge {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.reconnectDelay = RECONNECT_INTERVAL_MS;
    this.listeners = new Map(); // event -> Set<callback>
    this.companionStatus = null;
    this.lastAppSwitch = null;
    this.desktopClock = null;
    
    // Auto-connect on construction
    this.connect();
  }

  // ─── Connection Management ─────────────────────────────────

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return; // Already connected or connecting
    }

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[CompanionBridge] Connected to desktop companion');
        this.connected = true;
        this.reconnectDelay = RECONNECT_INTERVAL_MS; // Reset backoff
        this._startHeartbeat();
        this._updateStorageStatus(true);
        this._emit('connected', {});

        // Send current focus if available
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

      this.ws.onerror = (err) => {
        // Errors are normal when companion isn't running — log quietly
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
      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 1.5, MAX_RECONNECT_INTERVAL_MS);
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
    }, HEARTBEAT_INTERVAL_MS);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─── Send Messages ────────────────────────────────────────

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  /** Notify companion of the current focus */
  sendFocusUpdate(focusId, label) {
    return this.send({
      type: 'FOCUS_UPDATE',
      focus_id: focusId || null,
      label: label || null,
    });
  }

  /** Clock in via companion */
  sendClockIn(label) {
    return this.send({ type: 'CLOCK_IN', label: label || null });
  }

  /** Clock out via companion */
  sendClockOut() {
    return this.send({ type: 'CLOCK_OUT' });
  }

  /** Toggle break via companion */
  sendToggleBreak() {
    return this.send({ type: 'TOGGLE_BREAK' });
  }

  /** Request daily summary from companion */
  requestSummary(date) {
    return this.send({ type: 'REQUEST_SUMMARY', date: date || null });
  }

  /** Request current clock state */
  requestClockState() {
    return this.send({ type: 'GET_CLOCK_STATE' });
  }

  // ─── Message Handling ─────────────────────────────────────

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
      timestamp: msg.timestamp,
    };

    // Store in chrome.storage for UI access
    chrome.storage.local.set({
      companionActiveApp: this.lastAppSwitch,
    });

    this._emit('appSwitch', this.lastAppSwitch);

    // If the user switched away from Chrome, signal that to the idle system
    const isChrome = msg.app_name.toLowerCase() === 'chrome.exe';
    if (!isChrome) {
      this._emit('chromeBlurred', {
        app: msg.app_display_name,
        category: msg.category,
      });
    } else {
      this._emit('chromeFocused', {});
    }
  }

  _handleSessionEnd(msg) {
    const session = msg.session;
    this._emit('appSessionEnd', session);

    // Store recent sessions for the timeline
    chrome.storage.local.get('companionRecentSessions', (result) => {
      const sessions = result.companionRecentSessions || [];
      sessions.unshift(session);
      // Keep last 50 sessions
      if (sessions.length > 50) sessions.length = 50;
      chrome.storage.local.set({ companionRecentSessions: sessions });
    });
  }

  _handleCompanionStatus(msg) {
    this.companionStatus = {
      version: msg.version,
      uptimeMs: msg.uptime_ms,
      tracking: msg.tracking,
      connectedClients: msg.connected_clients,
    };

    chrome.storage.local.set({
      companionStatus: this.companionStatus,
    });

    this._emit('companionStatus', this.companionStatus);
  }

  _handleClockState(msg) {
    this.desktopClock = msg.clock;

    chrome.storage.local.set({
      companionClock: msg.clock,
    });

    this._emit('clockState', msg.clock);
  }

  _handleDailySummary(msg) {
    chrome.storage.local.set({
      companionDailySummary: msg.summary,
    });

    this._emit('dailySummary', msg.summary);
  }

  _handleIdleState(msg) {
    this._emit('idleState', {
      isIdle: msg.is_idle,
      idleMs: msg.idle_ms,
    });
  }

  // ─── Helpers ──────────────────────────────────────────────

  async _syncCurrentFocus() {
    try {
      const result = await chrome.storage.local.get(['focusState']);
      const focus = result.focusState;
      if (focus && focus.active && focus.id) {
        this.sendFocusUpdate(focus.id, focus.label);
      }
    } catch (e) {
      // Ignore — focus state may not exist yet
    }
  }

  _updateStorageStatus(connected) {
    chrome.storage.local.set({
      companionConnected: connected,
      companionLastSeen: connected ? Date.now() : null,
    });
  }

  // ─── Event System ─────────────────────────────────────────

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
        try { cb(data); } catch (e) {
          console.error(`[CompanionBridge] Error in ${event} listener:`, e);
        }
      }
    }
  }

  // ─── Status Accessors ─────────────────────────────────────

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

// Export singleton
export const companionBridge = new CompanionBridge();
export default CompanionBridge;
