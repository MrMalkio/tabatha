import { connect, sleep } from './cdp.mjs';

const verRes = await fetch('http://127.0.0.1:9333/json/version').then(r => r.json());
const browser = await connect(verRes.webSocketDebuggerUrl);

const list = await fetch('http://127.0.0.1:9333/json/list').then(r => r.json());
const target = list.find(t => t.url.includes('example.com'));
const { sessionId } = await browser.send('Target.attachToTarget', { targetId: target.id, flatten: true });
await browser.send('Page.enable', {}, sessionId);
await browser.send('Page.navigate', { url: 'chrome://extensions/' }, sessionId);
await sleep(1500);
await browser.send('Runtime.enable', {}, sessionId);
const res = await browser.send('Runtime.evaluate', {
  expression: `
    (function(){
      const mgr = document.querySelector('extensions-manager');
      return mgr ? mgr.outerHTML.slice(0,500) : 'no manager, tag names: ' + Array.from(document.querySelectorAll('*')).slice(0,20).map(e=>e.tagName).join(',');
    })()
  `,
  returnByValue: true,
}, sessionId);
console.log(JSON.stringify(res, null, 2));
browser.close();
