(async()=>{let e=await chrome.runtime.sendMessage({type:`CHECK_BLOCKED_SITE`});if(!e||!e.blocked)return;let t=document.createElement(`div`);t.id=`tabatha-blockgate-host`,Object.assign(t.style,{position:`fixed`,top:`0`,left:`0`,width:`100vw`,height:`100vh`,zIndex:`2147483647`,backgroundColor:`rgba(180, 20, 20, 0.92)`,backdropFilter:`blur(20px)`});let n=t.attachShadow({mode:`closed`});document.documentElement.appendChild(t),document.body.style.overflow=`hidden`;let r=document.createElement(`style`);r.textContent=`
    :host {
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    * { box-sizing: border-box; }
    .container {
      background: #1a1a1a;
      padding: 32px 36px;
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      width: 460px;
      text-align: center;
      border: 1px solid #5c2b2b;
    }
    h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; color: #ff6b6b; }
    .subtitle { color: #888; margin: 0 0 8px; font-size: 12px; }
    .domain { color: #ff6b6b; font-weight: 600; font-size: 14px; margin-bottom: 20px; }

    .field-label {
      font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
      color: #888; text-align: left; margin-bottom: 4px; font-weight: 600;
    }
    textarea {
      width: 100%; padding: 10px 12px; margin-bottom: 4px;
      background: #333; border: 1px solid #444; color: white;
      border-radius: 8px; font-size: 13px; box-sizing: border-box;
      outline: none; transition: border-color 0.2s; resize: vertical;
      min-height: 70px; font-family: inherit;
    }
    textarea:focus { border-color: #ff6b6b; }
    .char-count { font-size: 10px; color: #666; text-align: right; margin-bottom: 12px; }
    .char-count.valid { color: #66bb6a; }

    input[type="text"], select {
      width: 100%; padding: 9px 12px; margin-bottom: 10px;
      background: #333; border: 1px solid #444; color: white;
      border-radius: 8px; font-size: 13px; outline: none;
    }
    input:focus, select:focus { border-color: #ff6b6b; }

    .timer-row {
      display: flex; gap: 8px; align-items: center; margin-bottom: 14px;
    }
    .timer-row select { flex: 1; margin-bottom: 0; }
    .timer-hint { font-size: 10px; color: #888; }

    .actions { display: flex; flex-direction: column; gap: 8px; margin-top: 16px; }

    button {
      padding: 10px; border: none; border-radius: 8px;
      cursor: pointer; font-weight: 600; font-size: 13px;
      transition: transform 0.1s, opacity 0.2s;
    }
    button:active { transform: scale(0.98); }
    button:disabled { opacity: 0.4; cursor: not-allowed; }

    .btn-proceed { background: #ff6b6b; color: #fff; }
    .btn-proceed:hover:not(:disabled) { background: #ff5252; }
    .btn-leave { background: transparent; color: #66bb6a; border: 1px solid #66bb6a; }
    .btn-leave:hover { background: #1a3a1a; }

    .assoc-label { font-size: 10px; color: #666; text-align: left; margin-top: 8px; }

    [data-tip] { position: relative; }
    [data-tip]:hover::after {
      content: attr(data-tip);
      position: absolute; bottom: calc(100% + 6px); left: 50%;
      transform: translateX(-50%); background: #111; color: #ddd;
      font-size: 10px; padding: 4px 8px; border-radius: 4px;
      white-space: normal; max-width: 220px; pointer-events: none;
      z-index: 10; border: 1px solid #333;
    }
  `,n.appendChild(r);let i=document.createElement(`div`);i.className=`container`,i.innerHTML=`
    <h1>🚫 Blocked Site</h1>
    <p class="subtitle" data-tip="You or your admin blocked this site. Write why you need access to proceed.">This site has been blocked by Tabatha.</p>
    <div class="domain">${location.hostname}</div>

    <div class="field-label">Why do you need to visit this site? (min 50 characters)</div>
    <textarea id="why" placeholder="Explain your reason for visiting this blocked site..." data-tip="Be specific — this helps you reflect on whether this visit is truly necessary"></textarea>
    <div class="char-count" id="char-count">0 / 50</div>

    <div class="field-label">How long do you need?</div>
    <div class="timer-row">
      <select id="timer" data-tip="After this time, Tabatha will remind you to leave">
        <option value="5">5 minutes</option>
        <option value="10">10 minutes</option>
        <option value="15" selected>15 minutes</option>
        <option value="30">30 minutes</option>
        <option value="60">1 hour</option>
      </select>
    </div>

    <div class="field-label">Associate with (optional)</div>
    <input type="text" id="intent" placeholder="Link to a task or intent..." data-tip="Associate this visit with a focus item or task for tracking">

    <div class="actions">
      <button class="btn-proceed" id="proceed" disabled data-tip="Write at least 50 characters to unlock">Proceed (locked)</button>
      <button class="btn-leave" id="leave" data-tip="Close this tab — no access needed">✅ Leave (focus win!)</button>
    </div>
  `,n.appendChild(i);let a=n.getElementById(`why`),o=n.getElementById(`char-count`),s=n.getElementById(`proceed`);a.addEventListener(`input`,()=>{let e=a.value.length;o.textContent=`${e} / 50`,e>=50?(o.classList.add(`valid`),s.disabled=!1,s.textContent=`Proceed`):(o.classList.remove(`valid`),s.disabled=!0,s.textContent=`Proceed (${50-e} chars needed)`)}),s.onclick=async()=>{let e=parseInt(n.getElementById(`timer`).value),r=a.value.trim(),i=n.getElementById(`intent`).value.trim();await chrome.runtime.sendMessage({type:`UNBLOCK_SITE_TEMPORARILY`,domain:location.hostname,minutes:e,why:r,intent:i}),await chrome.runtime.sendMessage({type:`LOG_INTENT_ACTION`,action:`unblock_site`,context:r,url:window.location.href,domain:location.hostname}),t.remove(),document.body.style.overflow=``},n.getElementById(`leave`).onclick=async()=>{await chrome.runtime.sendMessage({type:`LOG_INTENT_ACTION`,action:`blocked_leave`,url:window.location.href,domain:location.hostname});try{let e=await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`});e?.tabId&&await chrome.runtime.sendMessage({type:`CLOSE_TAB`,tabId:e.tabId})}catch{window.close()}}})();