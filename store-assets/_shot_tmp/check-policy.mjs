import { connect, sleep } from './cdp.mjs';

const verRes = await fetch('http://127.0.0.1:9333/json/version').then(r => r.json());
const browser = await connect(verRes.webSocketDebuggerUrl);

const { targetId } = await browser.send('Target.createTarget', { url: 'chrome://policy/' });
const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
await browser.send('Runtime.enable', {}, sessionId);
await sleep(1500);
const res = await browser.send('Runtime.evaluate', {
  expression: `
    (function(){
      function allText(root) {
        let out = root.textContent || '';
        root.querySelectorAll('*').forEach(e => { if (e.shadowRoot) out += ' ' + allText(e.shadowRoot); });
        return out;
      }
      return allText(document).replace(/\s+/g,' ').trim();
    })()
  `,
  returnByValue: true,
}, sessionId);
console.log(res.result.value.slice(0, 4000));
browser.close();
