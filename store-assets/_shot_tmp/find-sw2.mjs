import { connect, sleep } from './cdp.mjs';

const verRes = await fetch('http://127.0.0.1:9333/json/version').then(r => r.json());
const browser = await connect(verRes.webSocketDebuggerUrl);

const targets = new Map();
browser.on('Target.targetCreated', (p) => targets.set(p.targetInfo.targetId, p.targetInfo));
browser.on('Target.targetInfoChanged', (p) => targets.set(p.targetInfo.targetId, p.targetInfo));
await browser.send('Target.setDiscoverTargets', { discover: true });

// find the existing 'page' target for about:blank, attach, navigate to example.com to wake background
const list = await fetch('http://127.0.0.1:9333/json/list').then(r => r.json());
const blank = list.find(t => t.url === 'about:blank');
const { sessionId } = await browser.send('Target.attachToTarget', { targetId: blank.id, flatten: true });
await browser.send('Page.enable', {}, sessionId);
await browser.send('Page.navigate', { url: 'https://example.com' }, sessionId);
await sleep(3000);

for (const t of targets.values()) {
  console.log(t.type, '|', t.title, '|', t.url);
}
browser.close();
