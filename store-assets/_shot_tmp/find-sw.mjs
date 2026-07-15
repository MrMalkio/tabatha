import { connect, sleep } from './cdp.mjs';

const verRes = await fetch('http://127.0.0.1:9333/json/version').then(r => r.json());
const browserWs = verRes.webSocketDebuggerUrl;
const browser = await connect(browserWs);

const targets = new Map();
browser.on('Target.targetCreated', (p) => targets.set(p.targetInfo.targetId, p.targetInfo));
browser.on('Target.targetInfoChanged', (p) => targets.set(p.targetInfo.targetId, p.targetInfo));

await browser.send('Target.setDiscoverTargets', { discover: true });
await sleep(1500);

for (const t of targets.values()) {
  console.log(t.type, '|', t.title, '|', t.url);
}

browser.close();
