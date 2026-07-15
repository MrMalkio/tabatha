import WebSocket from 'ws';

export function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { maxPayload: 256 * 1024 * 1024 });
    let id = 0;
    const pending = new Map();
    const listeners = new Map(); // event name -> Set(cb)

    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        const set = listeners.get(msg.method);
        if (set) for (const cb of set) cb(msg.params);
      }
    });
    ws.on('error', reject);
    ws.on('open', () => {
      resolve({
        send(method, params = {}, sessionId) {
          return new Promise((res, rej) => {
            const thisId = ++id;
            pending.set(thisId, { resolve: res, reject: rej });
            const payload = { id: thisId, method, params };
            if (sessionId) payload.sessionId = sessionId;
            ws.send(JSON.stringify(payload));
          });
        },
        on(method, cb) {
          if (!listeners.has(method)) listeners.set(method, new Set());
          listeners.get(method).add(cb);
        },
        close() {
          ws.close();
        },
      });
    });
  });
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
