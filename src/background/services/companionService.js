// ============================================================
// Tabatha - Companion Service (Plan 023 Task 05b)
// Owns the desktop companion WebSocket lifecycle and the companion
// runtime-message handlers.
// ============================================================

import {
  COMPANION_HEARTBEAT_MS,
  COMPANION_HELLO_ACK_TIMEOUT_MS,
  COMPANION_RECONNECT_BASE_MS,
  COMPANION_RECONNECT_MAX_MS,
  COMPANION_REJECTED_RECONNECT_MS,
  COMPANION_WS_URL
} from '../constants.js';
import { broadcastToExtension } from './notificationService.js';
import { setSessionFromCompanion } from './clockService.js';
import { isVersionNewer } from '../../utils/semver.js';
import { getInstallIdentity } from '../../services/installIdentity.js';

// chrome.storage.local key for the Stage-2 pairing token the user pastes from
// the companion tray's "Pair Extension" action. Read at HELLO time only —
// NEVER logged, never included in any diagnostic/broadcast payload.
const PAIRING_TOKEN_KEY = 'companionPairingToken';

// Re-export the shared comparator so existing importers (and tests) that pull
// `isVersionNewer` from companionService keep working unchanged. The single
// source of truth now lives in src/utils/semver.js and is reused by the
// "What's New" layer (FIX-11).
export { isVersionNewer };

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
    // Stage-2 handshake state (companion 0.3.1+). HELLO is the FIRST message
    // after onopen; post-open sync (focus push + clock pull) is deferred until
    // HELLO_ACK or a short fallback timeout (older 0.3.0 companions never ack).
    // pairingRejected latches after HELLO_REJECTED so reconnects back off to a
    // long fixed interval instead of hammering a companion that requires a
    // token the user hasn't pasted yet.
    this.helloAcked = false;
    this.postOpenSyncDone = false;
    this.helloTimeoutTimer = null;
    this.pairingRejected = false;
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
        // Stage-2 (companion 0.3.1+): HELLO must be the FIRST message on the
        // wire. The pre-existing post-open sync (focus push + clock pull) is
        // deferred until HELLO_ACK — or a short fallback timeout so an older
        // 0.3.0 companion that never acks still gets synced. See
        // _runPostOpenSync for what runs after the gate.
        this._beginHandshake();
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
        this._resetHandshake();
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
    this._resetHandshake();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this._updateStorageStatus(false);
  }

  _scheduleReconnect() {
    this._clearReconnect();
    // After HELLO_REJECTED, use a long fixed backoff instead of the normal
    // exponential ramp — reconnecting faster can't succeed until the user
    // pastes a pairing token, so don't spam the companion.
    const delay = this.pairingRejected ? COMPANION_REJECTED_RECONNECT_MS : this.reconnectDelay;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
      if (!this.pairingRejected) {
        this.reconnectDelay = Math.min(this.reconnectDelay * 2, COMPANION_RECONNECT_MAX_MS);
        console.debug(`[CompanionBridge] Next reconnect delay: ${this.reconnectDelay}ms`);
      }
    }, delay);
  }

  // ── Stage-2 HELLO handshake (companion 0.3.1+) ────────────────────────
  // Sends HELLO as the first post-open message, then arms a fallback timer:
  // if no HELLO_ACK arrives within COMPANION_HELLO_ACK_TIMEOUT_MS (an older
  // 0.3.0 companion never acks), post-open sync proceeds anyway.
  async _beginHandshake() {
    this.helloAcked = false;
    this.postOpenSyncDone = false;
    let token = null;
    try {
      const got = await chrome.storage.local.get(PAIRING_TOKEN_KEY);
      token = got?.[PAIRING_TOKEN_KEY] || null;
    } catch { /* storage unavailable — send token: null (TOFU open mode) */ }
    let profileHint = null;
    try {
      // Stable per-profile install id (migration 017 lineage) — the same
      // localId syncService keys browser_profiles upserts on. Never invent a
      // separate identity scheme for the companion.
      const identity = await getInstallIdentity();
      profileHint = identity?.localId || null;
    } catch { /* identity unavailable — hint stays null */ }

    const sent = this.send({
      type: 'HELLO',
      token,
      client_info: { surface: 'background', profile_hint: profileHint }
    });
    if (!sent) return; // socket died between onopen and here; onclose handles it

    this._clearHelloTimeout();
    this.helloTimeoutTimer = setTimeout(() => {
      // No ack — assume a pre-0.3.1 companion and proceed.
      this._runPostOpenSync('ack_timeout');
    }, COMPANION_HELLO_ACK_TIMEOUT_MS);
  }

  // The post-open sync that used to run directly in onopen: push our current
  // focus and pull the companion's clock state. Gated so it runs exactly once
  // per connection (first of HELLO_ACK / fallback timeout wins).
  _runPostOpenSync(reason) {
    if (this.postOpenSyncDone || !this.connected) return;
    this.postOpenSyncDone = true;
    this._clearHelloTimeout();
    console.debug(`[CompanionBridge] Post-open sync (${reason})`);
    this._syncCurrentFocus();
    // FIX-2: pull the companion's current clock state on connect so a
    // companion that was already clocked-in (or out) before the extension
    // came up reflects immediately, without waiting for a change broadcast.
    this.requestClockState();
  }

  _clearHelloTimeout() {
    if (this.helloTimeoutTimer) {
      clearTimeout(this.helloTimeoutTimer);
      this.helloTimeoutTimer = null;
    }
  }

  _resetHandshake() {
    this._clearHelloTimeout();
    this.helloAcked = false;
    this.postOpenSyncDone = false;
  }

  _handleHelloAck() {
    this.helloAcked = true;
    this.pairingRejected = false;
    this.reconnectDelay = COMPANION_RECONNECT_BASE_MS;
    // Handshake accepted — clear any stale "pairing required" flag the UI
    // may be showing from an earlier rejection.
    chrome.storage.local.set({ companionPairingRequired: false });
    this._emit('helloAck', {});
    this._runPostOpenSync('hello_ack');
  }

  _handleHelloRejected() {
    // Companion requires a (correct) pairing token. Latch the rejected state
    // so reconnects back off to the long fixed interval, surface "pairing
    // required" for the settings UI, and don't run post-open sync. The token
    // itself is NEVER logged.
    console.warn('[CompanionBridge] HELLO_REJECTED — companion requires pairing');
    this.pairingRejected = true;
    this._resetHandshake();
    chrome.storage.local.set({ companionPairingRequired: true });
    this._emit('helloRejected', {});
    // The companion may close the socket itself; if it doesn't, close from
    // our side so the connection isn't half-open (onclose schedules the
    // backed-off reconnect either way).
    if (this.ws) {
      try { this.ws.close(); } catch { /* already closing */ }
    }
  }

  // Called when the user saves a new pairing token: clear the rejected latch
  // and retry immediately with the fresh token.
  retryPairing() {
    this.pairingRejected = false;
    this.reconnectDelay = COMPANION_RECONNECT_BASE_MS;
    chrome.storage.local.set({ companionPairingRequired: false });
    if (this.connected && this.ws) {
      // Re-handshake on a live socket isn't part of the protocol — bounce the
      // connection so HELLO goes out fresh as the first message.
      try { this.ws.close(); } catch { /* ignore */ }
    } else {
      this._clearReconnect();
      this.connect();
    }
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

  // Cortex Plan 041 T1: push capture config to the companion (C1 handoff —
  // the companion captures only while the browser is blurred).
  sendCaptureConfig(config) {
    return this.send({ type: 'CAPTURE_CONFIG', ...config });
  }

  requestCaptureState() {
    return this.send({ type: 'GET_CAPTURE_STATE' });
  }

  // Cortex C3 (silent frame write): hand a redacted frame to the companion,
  // which owns the real base dir and writes it silently, then replies
  // FILE_WRITTEN. rel_path is root-relative (partition/YYYY-MM/filename); the
  // companion prefixes its configured capture root.
  sendCaptureFrame(relPath, dataUrl) {
    return this.send({ type: 'CAPTURE_FRAME', rel_path: relPath, data_url: dataUrl });
  }

  // Cortex C4/C6 (silent export write): hand the nightly ledger/actions export
  // to the companion, which writes it under its exports/ dir and replies
  // FILE_WRITTEN with rel_path 'exports/<filename>'. `content` is the already
  // serialized file body (string).
  sendWriteExport(filename, content) {
    return this.send({ type: 'WRITE_EXPORT', filename, content });
  }

  _handleMessage(msg) {
    // Plan 036: any inbound message proves the companion is alive.
    this.lastMessageAt = Date.now();
    switch (msg.type) {
      // Stage-2 handshake replies (companion 0.3.1+).
      case 'HELLO_ACK':
        this._handleHelloAck();
        break;

      case 'HELLO_REJECTED':
        this._handleHelloRejected();
        break;

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

      // Cortex Plan 041 T1: OS-side capture events (companion owns capture
      // while the browser is blurred). captureService folds these into the
      // observations ledger via the listener registered in background.js.
      case 'CAPTURE_TAKEN':
        this._emit('captureTaken', msg);
        break;

      case 'CAPTURE_STATE':
        this._emit('captureState', msg);
        break;

      // Cortex C3/C4: companion ack that a CAPTURE_FRAME / WRITE_EXPORT landed
      // on disk. The extension already recorded its observation optimistically,
      // so this is fire-and-forget — log + emit for any interested listener.
      case 'FILE_WRITTEN':
        this._handleFileWritten(msg);
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

  _handleFileWritten(msg) {
    if (msg?.ok === false) {
      console.warn('[CompanionBridge] FILE_WRITTEN failed:', msg?.rel_path, msg?.error || '');
    } else {
      console.debug('[CompanionBridge] FILE_WRITTEN:', msg?.rel_path);
    }
    this._emit('fileWritten', msg);
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
    clock: companionBridge.clockState,
    helloAcked: companionBridge.helloAcked,
    pairingRequired: companionBridge.pairingRejected
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

    // Stage-2 pairing: store (or clear) the pairing token pasted from the
    // companion tray's "Pair Extension" action, then retry the handshake with
    // it. The token value is never logged and never echoed back in the reply.
    case 'COMPANION_SET_PAIRING_TOKEN': {
      const token = typeof message.token === 'string' ? message.token.trim() : '';
      try {
        if (token) {
          await chrome.storage.local.set({ [PAIRING_TOKEN_KEY]: token });
        } else {
          await chrome.storage.local.remove(PAIRING_TOKEN_KEY);
        }
      } catch (e) {
        return { ok: false, error: e?.message || 'Failed to store token' };
      }
      companionBridge.retryPairing();
      return { ok: true, hasToken: !!token };
    }

    default:
      return undefined;
  }
}
