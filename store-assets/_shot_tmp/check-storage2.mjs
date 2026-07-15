import { connect, sleep } from './cdp.mjs';

const verRes = await fetch('http://127.0.0.1:9333/json/version').then(r => r.json());
const browser = await connect(verRes.webSocketDebuggerUrl);

const list = await fetch('http://127.0.0.1:9333/json/list').then(r => r.json());
const target = list.find(t => t.url.includes('home.html'));
const { sessionId } = await browser.send('Target.attachToTarget', { targetId: target.id, flatten: true });
await browser.send('Runtime.enable', {}, sessionId);
const res = await browser.send('Runtime.evaluate', {
  expression: `JSON.stringify({ hasChrome: typeof chrome, chromeKeys: typeof chrome !== 'undefined' ? Object.keys(chrome) : null, hasStorage: typeof chrome !== 'undefined' && !!chrome.storage })`,
  returnByValue: true,
}, sessionId);
console.log(JSON.stringify(res, null, 2));
browser.close();
