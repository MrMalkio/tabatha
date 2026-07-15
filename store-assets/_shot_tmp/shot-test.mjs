import { connect, sleep } from './cdp.mjs';
import { writeFileSync } from 'fs';

const verRes = await fetch('http://127.0.0.1:9333/json/version').then(r => r.json());
const browser = await connect(verRes.webSocketDebuggerUrl);

const list = await fetch('http://127.0.0.1:9333/json/list').then(r => r.json());
const target = list.find(t => t.url.includes('home.html'));
const { sessionId } = await browser.send('Target.attachToTarget', { targetId: target.id, flatten: true });
await browser.send('Page.enable', {}, sessionId);
await sleep(500);
const shot = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId);
writeFileSync('test.png', Buffer.from(shot.data, 'base64'));
console.log('saved', shot.data.length);
browser.close();
