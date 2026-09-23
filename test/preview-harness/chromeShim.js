// ============================================================
// test/preview-harness/chromeShim.js
//
// Minimal chrome.* API shim so Tabatha's extension pages (home/sidebar/
// settings/popup/workshifts/activity) can render under `npm run dev`
// (http://localhost:5173), which our browser automation CAN reach —
// unlike real chrome-extension:// pages, which claude-in-chrome refuses
// to script (see docs/audits/2026-07-24-live-extension-e2e.md).
//
// THIS IS NOT A REAL EXTENSION CONTEXT. It proves layout, structure,
// empty-state handling, and client-side grouping/filter logic against
// fixture data. It does NOT prove: real chrome.storage persistence
// semantics, real background-service business logic, real Supabase
// round-trips, MV3 service-worker lifecycle behavior, or anything
// timing-sensitive to the real extension message-passing pipe. Treat
// every "PASS" produced against this harness as "renders correctly given
// plausible fixture data," not "works end-to-end in the real extension."
//
// Usage: injected automatically by vite.harness.config.js's
// transformIndexHtml hook when running `npm run dev:harness`. Not part of
// the production build (vite.config.js / `npm run build` never reference
// this file).
// ============================================================

import {
  FIXTURE_FOCUS_ENGINE,
  FIXTURE_TASKS,
  FIXTURE_DEVICE_ROWS,
  FIXTURE_OTHER_PROFILES,
  FIXTURE_CLOCK_SESSION,
  FIXTURE_CLOCK_HISTORY,
  FIXTURE_COMPANION_SESSIONS_EMPTY,
  FIXTURE_COMPANION_SESSIONS_POPULATED,
  FIXTURE_SETTINGS,
  FIXTURE_INSTALL_IDENTITY,
  FIXTURE_AUTH_STATE,
  FIXTURE_LIVE_STINTS
} from './fixtures.js';

// Guard: this file is only meaningful in a browser (it assigns
// window.chrome). If it's ever accidentally swept up by a non-browser JS
// runner (e.g. a broadened `node --test` glob), no-op instead of throwing
// `ReferenceError: window is not defined` and failing the run.
if (typeof window !== 'undefined') {

// Toggle via ?companion=on in the URL (default: off, to exercise the
// empty-state / H7 path first — the harder case to get right).
const params = new URLSearchParams(window.location.search);
const companionOn = params.get('companion') === 'on';

console.info(
  '%c[preview-harness] chrome.* shim active — this is fixture data, not real product data',
  'color:#b45309;font-weight:bold'
);

// ---- storage.local backing store -------------------------------------
const store = {
  clockSession: FIXTURE_CLOCK_SESSION,
  clockHistory: FIXTURE_CLOCK_HISTORY,
  intentHistory: [],
  tasks: FIXTURE_TASKS,
  tabs: {},
  timeTracking: { byTab: {}, byCategory: {} },
  parkedTabs: [],
  sugarBox: [],
  settings: FIXTURE_SETTINGS,
  focusEngine: FIXTURE_FOCUS_ENGINE,
  companionConnected: companionOn,
  companionActiveApp: companionOn ? 'VS Code' : null,
  companionStatus: companionOn ? 'connected' : 'disconnected',
  companionRecentSessions: companionOn
    ? FIXTURE_COMPANION_SESSIONS_POPULATED
    : FIXTURE_COMPANION_SESSIONS_EMPTY,
  companionPairingRequired: false,
  companionPairingToken: null,
  skippedDomains: [],
  intentPresets: { persistent: [] },
  blockedSites: [],
  urlRules: [],
  _syncDiagnostics: [],
  _lastSyncSuccess: iso_now(),
  _browserProfile: FIXTURE_INSTALL_IDENTITY,
  _otherProfiles: FIXTURE_OTHER_PROFILES,
  activityAuditLog: [],
  workSchedule: {},
  _selfDeviceStatus: null,
  _profileCache: FIXTURE_AUTH_STATE.session.user,
  tabatha_theme: 'pop-art',
  tabathaOrg: { operations: {}, initiatives: {}, clients: {}, projects: {}, tasks: {} },
  tabathaWebhooks: {}
};

function iso_now() {
  return new Date().toISOString();
}

// ---- storage.onChanged (two separate listener registries — real Chrome
// exposes BOTH chrome.storage.onChanged (area-scoped) and
// chrome.storage.local.onChanged (local-only); Tabatha's code uses both,
// see src/components/UnifiedTimeline.jsx / src/hooks/useChromeStorage.js)
const areaListeners = new Set();
const localListeners = new Set();

function fireChange(changes) {
  areaListeners.forEach((fn) => { try { fn(changes, 'local'); } catch (e) { console.error(e); } });
  localListeners.forEach((fn) => { try { fn(changes); } catch (e) { console.error(e); } });
}

function setKeys(obj) {
  const changes = {};
  Object.entries(obj).forEach(([k, newValue]) => {
    changes[k] = { oldValue: store[k], newValue };
    store[k] = newValue;
  });
  fireChange(changes);
}

// ---- canned chrome.runtime.sendMessage responses per message `type` ----
// Keep in sync with the message types UI pages actually send (see the
// preview-harness README for the source audit of these). Anything not
// listed resolves to `{}` (matches real background behavior for an
// unhandled type reasonably closely enough for layout testing) with a
// console.warn so gaps are visible rather than silently wrong.
const RESPONDERS = {
  GET_AUTH_STATE: () => FIXTURE_AUTH_STATE,
  ENSURE_PROFILE: () => ({ ok: true }),
  GET_FOCUS_ENGINE: () => ({ focusEngine: store.focusEngine }),
  ADD_FOCUS: (payload) => {
    const id = `focus-new-${Date.now()}`;
    store.focusEngine = {
      ...store.focusEngine,
      items: { ...store.focusEngine.items, [id]: { id, ...payload, startedAt: iso_now() } }
    };
    return { ok: true, id, focusEngine: store.focusEngine };
  },
  START_FOCUS: () => ({ ok: true }),
  SWITCH_FOCUS: () => ({ ok: true }),
  COMPLETE_FOCUS: () => ({ ok: true }),
  PAUSE_FOCUS: () => ({ ok: true }),
  RESUME_FOCUS: () => ({ ok: true }),
  BACKBURNER_FOCUS: () => ({ ok: true }),
  UPDATE_FOCUS: () => ({ ok: true }),
  RENAME_FOCUS: () => ({ ok: true }),
  EXTEND_FOCUS_TIMER: () => ({ ok: true }),
  SET_FUNNEL_STAGE: () => ({ ok: true }),
  UPDATE_FOCUS_TAGS: () => ({ ok: true }),
  SET_FOCUS_START_TIME: () => ({ ok: true }),
  SAVE_CHECKPOINT_NOTE: () => ({ ok: true }),
  RESUME_BACKBURNER: () => ({ ok: true }),
  SNOOZE_BACKBURNER: () => ({ ok: true }),
  DISMISS_BACKBURNER: () => ({ ok: true }),
  CREATE_TASK: (payload) => {
    const task = { id: `task-new-${Date.now()}`, status: 'open', funnelStage: 'todo', ...payload };
    store.tasks = [...store.tasks, task];
    return { ok: true, task };
  },
  UPDATE_TASK: () => ({ ok: true }),
  DELETE_TASK: () => ({ ok: true }),
  ASSOCIATE_TAB_WITH_FOCUS: () => ({ ok: true }),
  LIST_AGENT_SESSIONS: () => ({ sessions: [] }),
  END_AGENT_SESSION: () => ({ ok: true }),
  RECORD_VOICE_OBSERVATION: () => ({ ok: true }),
  TOGGLE_BREAK: () => ({ ok: true }),
  CLOCK_IN: () => ({ ok: true }),
  CLOCK_OUT: () => ({ ok: true }),
  GET_LAST_SESSION: () => ({ session: FIXTURE_CLOCK_HISTORY[0] || null }),
  GET_CLOCK_HISTORY: () => ({ history: store.clockHistory }),
  RENAME_TAB: () => ({ ok: true }),
  FOCUS_TAB: () => ({ ok: true }),
  UPDATE_TAB_CONTEXT: () => ({ ok: true }),
  GET_SAVED_GROUPS: () => ({ groups: [] }),
  GET_CHECKPOINT_STATUS: () => ({ stale: false }),
  REMOVE_PARKED_TAB: () => ({ ok: true }),
  EXPORT_MARKDOWN: () => ({ markdown: '# Preview harness export\n\n(fixture data)' }),
  SYNC_NOW: () => ({ ok: true, syncedAt: iso_now() }),
  CLEAR_SYNC_DIAGNOSTICS: () => ({ ok: true }),
  REPULL_ORG_REGISTRY: () => ({ ok: true }),
  COMPANION_SET_PAIRING_TOKEN: () => ({ ok: true }),
  GET_AUTO_FOCUS_DISMISSALS: () => ({ dismissals: [] }),
  CLEAR_AUTO_FOCUS_DISMISSALS: () => ({ ok: true }),
  MANAGE_BLOCKED_SITES: () => ({ ok: true }),
  // Devices panel (Feature #222) — deliberately returns duplicate-ish rows
  // + one revoked + one stale, so grouping/show-all/revoked-row logic in
  // src/utils/deviceGrouping.js + DevicesPanel.jsx actually gets exercised
  // rather than trivially passing on an empty or single-row list.
  LIST_DEVICES: () => ({ devices: FIXTURE_DEVICE_ROWS, rawCount: FIXTURE_DEVICE_ROWS.length }),
  MINT_DEVICE_CODE: () => ({ code: '123456', expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString() }),
  RENAME_DEVICE: () => ({ ok: true }),
  SET_DEVICE_PAUSED: () => ({ ok: true }),
  SET_DEVICE_KIND: () => ({ ok: true }),
  SIGNOUT_DEVICE: () => ({ ok: true }),
  GET_SELF_DEVICE_STATUS: () => ({ paused: false }),
  GET_CAPTURE_STATE: () => ({ enabled: false }),
  GET_COMPANION_CAPTURE_STATE: () => ({ enabled: companionOn }),
  LIST_RECOMMENDATIONS: () => ({ recommendations: [] }),
  LIST_PENDING_CHANGES: () => ({ changes: [] }),
  SET_RECOMMENDATION_STATUS: () => ({ ok: true }),
  IMPORT_RECOMMENDATIONS: () => ({ ok: true }),
  DOWNLOAD_HARNESS_CRON: () => ({ ok: true }),
  RUN_LEDGER_EXPORT: () => ({ ok: true }),
  EXPORT_APPROVED_ACTIONS: () => ({ ok: true }),
  GET_MORNING_DIGEST: () => ({ digest: null }),
  RUN_RECONCILE: () => ({ ok: true }),
  ADD_RECONCILE_CONTEXT: () => ({ ok: true }),
  GET_ALL_TABS: () => ({ tabs: [] }),
  GET_DOMAIN_HISTORY: () => ({ history: [] }),
  SUBMIT_FEEDBACK: () => ({ ok: true }),
  LIST_LIVE_STINTS: () => FIXTURE_LIVE_STINTS,
  CLOCK_OUT_INSTALL: () => ({ ok: true }),
  DISMISS_INSTALL: () => ({ ok: true }),
  CLEAR_ALL_OFFLINE: () => ({ ok: true }),
  LINK_TAB_TO_INTENT: () => ({ ok: true }),
  LINK_INTENT_TO_TASK: () => ({ ok: true }),
  MERGE_INTENTS: () => ({ ok: true }),
  ADJUST_FOCUS_TIME: () => ({ ok: true }),
  REMOVE_LAST_PAUSE: () => ({ ok: true }),
  SET_FOCUS_ELAPSED: () => ({ ok: true }),
  GET_LAST_ACTIVITY: () => ({ lastActivityAt: iso_now() }),
  EDIT_CHECKPOINT: () => ({ ok: true }),
  DELETE_CHECKPOINT: () => ({ ok: true }),
  GET_OTHER_QUEUE: () => ({ devices: FIXTURE_OTHER_PROFILES })
};

// ---- window.chrome shim -------------------------------------------------
window.chrome = {
  runtime: {
    id: 'preview-harness-fake-id',
    lastError: undefined,
    getManifest: () => ({ version: '0.0.0-preview-harness' }),
    openOptionsPage: () => {
      console.info('[preview-harness] openOptionsPage() called (no-op)');
    },
    sendMessage: (message, callback) => {
      const { type, ...payload } = message || {};
      const responder = RESPONDERS[type];
      const respond = (result) => {
        // Simulate async message-passing so React effects behave the same
        // as they would against a real, slightly-latent background worker.
        setTimeout(() => {
          if (typeof callback === 'function') callback(result);
        }, 0);
      };
      if (!responder) {
        console.warn(`[preview-harness] sendMessage('${type}') — no canned responder, returning {}`);
        respond({});
        return;
      }
      try {
        respond(responder(payload) || {});
      } catch (err) {
        console.error(`[preview-harness] responder for '${type}' threw`, err);
        respond({ error: String(err?.message || err) });
      }
    },
    onMessage: {
      addListener: () => {},
      removeListener: () => {}
    }
  },
  storage: {
    local: {
      get: (keys, callback) => {
        let result = {};
        if (keys == null) {
          result = { ...store };
        } else if (typeof keys === 'string') {
          result = { [keys]: store[keys] };
        } else if (Array.isArray(keys)) {
          keys.forEach((k) => { result[k] = store[k]; });
        } else if (typeof keys === 'object') {
          Object.keys(keys).forEach((k) => { result[k] = store[k] !== undefined ? store[k] : keys[k]; });
        }
        setTimeout(() => callback(result), 0);
      },
      set: (obj, callback) => {
        setKeys(obj);
        if (typeof callback === 'function') setTimeout(callback, 0);
      },
      remove: (keys, callback) => {
        const list = Array.isArray(keys) ? keys : [keys];
        const changes = {};
        list.forEach((k) => { changes[k] = { oldValue: store[k], newValue: undefined }; delete store[k]; });
        fireChange(changes);
        if (typeof callback === 'function') setTimeout(callback, 0);
      },
      onChanged: {
        addListener: (fn) => localListeners.add(fn),
        removeListener: (fn) => localListeners.delete(fn)
      }
    },
    sync: {
      get: (keys, callback) => setTimeout(() => callback({}), 0),
      set: (_obj, callback) => { if (typeof callback === 'function') setTimeout(callback, 0); }
    },
    onChanged: {
      addListener: (fn) => areaListeners.add(fn),
      removeListener: (fn) => areaListeners.delete(fn)
    }
  },
  tabs: {
    query: (_queryInfo, callback) => setTimeout(() => callback([
      { id: 1, url: 'https://example.com', title: 'Preview harness tab', active: true }
    ]), 0),
    create: (createProps) => {
      console.info('[preview-harness] chrome.tabs.create() — opening in this window instead', createProps);
      if (createProps?.url) window.open(createProps.url, '_blank');
    }
  },
  identity: {
    getRedirectURL: () => window.location.origin + '/oauth-redirect-fake',
    launchWebAuthFlow: (_opts, callback) => {
      console.warn('[preview-harness] identity.launchWebAuthFlow() is stubbed — no real OAuth in this harness');
      setTimeout(() => callback(undefined), 0);
    }
  },
  alarms: {
    create: () => {},
    clear: (_name, callback) => { if (typeof callback === 'function') setTimeout(() => callback(true), 0); }
  },
  action: {
    setBadgeText: () => {},
    setBadgeBackgroundColor: () => {}
  }
};

// Expose fixture controls on window for ad-hoc console poking during
// manual harness testing (e.g. `__harness.setKeys({tasks: []})`).
window.__harness = { store, setKeys, companionOn };

} // end `if (typeof window !== 'undefined')` guard
