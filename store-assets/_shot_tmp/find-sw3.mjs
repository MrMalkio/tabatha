import { connect, sleep } from './cdp.mjs';

const verRes = await fetch('http://127.0.0.1:9333/json/version').then(r => r.json());
const browser = await connect(verRes.webSocketDebuggerUrl);

const res = await browser.send('Target.getTargets', {});
for (const t of res.targetInfos) {
  console.log(t.type, '|', t.title, '|', t.url, '|', t.attached);
}
browser.close();
