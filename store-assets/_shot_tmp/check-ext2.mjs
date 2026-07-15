import { connect, sleep } from './cdp.mjs';

const verRes = await fetch('http://127.0.0.1:9333/json/version').then(r => r.json());
const browser = await connect(verRes.webSocketDebuggerUrl);

const list = await fetch('http://127.0.0.1:9333/json/list').then(r => r.json());
const target = list.find(t => t.url.includes('chrome://extensions'));
const { sessionId } = await browser.send('Target.attachToTarget', { targetId: target.id, flatten: true });
await browser.send('Runtime.enable', {}, sessionId);
const res = await browser.send('Runtime.evaluate', {
  expression: `
    (function(){
      function findAll(root, sel) {
        let out = [];
        root.querySelectorAll(sel).forEach(e => out.push(e));
        root.querySelectorAll('*').forEach(e => { if (e.shadowRoot) out = out.concat(findAll(e.shadowRoot, sel)); });
        return out;
      }
      const items = findAll(document, 'extensions-item');
      return items.map(i => ({ id: i.id, html: i.shadowRoot ? i.shadowRoot.textContent.replace(/\s+/g,' ').trim().slice(0,300) : 'no shadow' }));
    })()
  `,
  returnByValue: true,
}, sessionId);
console.log(JSON.stringify(res, null, 2));
browser.close();
