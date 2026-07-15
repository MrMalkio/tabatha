import { connect, sleep } from './cdp.mjs';
import { writeFileSync } from 'fs';

const verRes = await fetch('http://127.0.0.1:9333/json/version').then(r => r.json());
const browser = await connect(verRes.webSocketDebuggerUrl);

const { targetId } = await browser.send('Target.createTarget', { url: 'chrome://extensions/' });
const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
await browser.send('Runtime.enable', {}, sessionId);
await sleep(1500);

// toggle developer mode on via clicking, then screenshot
const res = await browser.send('Runtime.evaluate', {
  expression: `
    (function(){
      const mgr = document.querySelector('extensions-manager');
      const toolbar = mgr && mgr.shadowRoot.querySelector('extensions-toolbar');
      const toggle = toolbar && toolbar.shadowRoot.querySelector('#devMode');
      if (toggle) toggle.click();
      return !!toggle;
    })()
  `,
  returnByValue: true,
}, sessionId);
console.log('toggled dev mode:', res.result.value);
await sleep(1000);

const res2 = await browser.send('Runtime.evaluate', {
  expression: `
    (function(){
      function findAll(root, sel) {
        let out = [];
        root.querySelectorAll(sel).forEach(e => out.push(e));
        root.querySelectorAll('*').forEach(e => { if (e.shadowRoot) out = out.concat(findAll(e.shadowRoot, sel)); });
        return out;
      }
      const items = findAll(document, 'extensions-item');
      return items.map(i => i.id);
    })()
  `,
  returnByValue: true,
}, sessionId);
console.log('extension ids:', JSON.stringify(res2.result.value));

await browser.send('Page.enable', {}, sessionId);
const shot = await browser.send('Page.captureScreenshot', { format: 'png' }, sessionId);
writeFileSync('ext-list2.png', Buffer.from(shot.data, 'base64'));
browser.close();
