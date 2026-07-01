// Minimal in-memory chrome.* mock for Plan 036 regression tests.
// Installed onto globalThis.chrome before exercising background services.
// Only the surface the services actually call is implemented; everything
// else is a no-op listener registrar so imports/registration never throw.

export function installChromeMock({ tabs = {}, store = {} } = {}) {
  const storage = { ...store };
  const noopListener = () => ({ addListener() {}, removeListener() {}, hasListener() { return false; } });

  function getFromStore(keys) {
    if (keys == null) return { ...storage };
    if (typeof keys === 'string') return { [keys]: storage[keys] };
    if (Array.isArray(keys)) {
      const out = {};
      for (const k of keys) out[k] = storage[k];
      return out;
    }
    // object of defaults
    const out = { ...keys };
    for (const k of Object.keys(keys)) if (k in storage) out[k] = storage[k];
    return out;
  }

  const chrome = {
    _storage: storage,
    _tabs: tabs,
    storage: {
      local: {
        async get(keys) { return getFromStore(keys); },
        async set(obj) { Object.assign(storage, obj); },
        async remove(keys) { for (const k of [].concat(keys)) delete storage[k]; }
      },
      onChanged: noopListener()
    },
    tabs: {
      async query(q = {}) {
        let list = Object.entries(tabs).map(([id, t]) => ({ id: Number(id), ...t }));
        if (q.audible !== undefined) list = list.filter(t => !!t.audible === q.audible);
        if (q.active !== undefined) list = list.filter(t => !!t.active === q.active);
        return list;
      },
      async get(id) {
        const t = tabs[id] ?? tabs[String(id)];
        if (!t) throw new Error('No tab with id ' + id);
        return { id: Number(id), ...t };
      },
      onActivated: noopListener(),
      onCreated: noopListener(),
      onUpdated: noopListener(),
      onRemoved: noopListener()
    },
    alarms: {
      create() {}, clear() {}, clearAll() {},
      onAlarm: noopListener()
    },
    idle: {
      setDetectionInterval() {},
      async queryState() { return 'idle'; },
      onStateChanged: noopListener()
    },
    runtime: {
      onMessage: noopListener(),
      onStartup: noopListener(),
      onInstalled: noopListener(),
      async sendMessage() { return undefined; },
      getManifest() { return { version: '6.0.0' }; },
      getURL(p) { return p; }
    },
    notifications: { create() {} },
    webNavigation: { onBeforeNavigate: noopListener() },
    tabGroups: { TAB_GROUP_ID_NONE: -1, update() {} },
    scripting: { async executeScript() {} },
    // FIX-12: toolbar action / side panel / commands surfaces. Record the last
    // call so tests can assert what the service configured.
    action: {
      _lastPopup: undefined,
      async setPopup({ popup } = {}) { this._lastPopup = popup; },
      onClicked: noopListener()
    },
    sidePanel: {
      _lastBehavior: undefined,
      async setPanelBehavior(behavior = {}) { this._lastBehavior = behavior; },
      async setOptions() {},
      async open() {}
    },
    commands: { onCommand: noopListener() },
    windows: {
      WINDOW_ID_CURRENT: -2,
      _created: [],
      update() {},
      async create(opts) { this._created.push(opts); return { id: this._created.length }; }
    }
  };

  globalThis.chrome = chrome;
  return chrome;
}

export function resetChromeStore(chrome, store = {}) {
  for (const k of Object.keys(chrome._storage)) delete chrome._storage[k];
  Object.assign(chrome._storage, store);
}
