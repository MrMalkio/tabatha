(async()=>{let e;try{e=await chrome.runtime.sendMessage({type:`CHECK_CONTEXT_NEEDED`})}catch{return}if(!e||!e.needed)return;let t=e.inheritedContext||``;e.inheritedIntent;let n=e.contextSource||null,r=[],i=[],a=[],o=3,s=!0,c=10;try{let e=await chrome.runtime.sendMessage({type:`GET_FOCUS_ENGINE`});e?.focusEngine?.items&&(r=Object.values(e.focusEngine.items).filter(e=>e.focusState===`active`||e.focusState===`paused`).sort((e,t)=>new Date(t.createdAt)-new Date(e.createdAt)))}catch{}try{let e=await chrome.storage.local.get([`intentHistory`,`intentPresets`,`settings`]);if(o=e.settings?.inheritItemCount||3,s=e.settings?.inpopStrictMode!==!1,c=e.settings?.inpopBlurStrength??10,e.intentHistory){let t=new Date().toDateString(),n=new Set,a=new Set(r.map(e=>e.label.toLowerCase()));for(let r of e.intentHistory){let e=r.context??r.newContext;if(e&&new Date(r.timestamp).toDateString()===t&&!n.has(e.toLowerCase())&&!a.has(e.toLowerCase())&&(n.add(e.toLowerCase()),i.push(e),i.length>=5))break}}if(e.intentPresets?.persistent){let t=new Set(r.map(e=>e.label.toLowerCase())),n=new Set(i.map(e=>e.toLowerCase()));a=e.intentPresets.persistent.filter(e=>!t.has(e.label.toLowerCase())&&!n.has(e.label.toLowerCase())).map(e=>e.label)}}catch{}if(r=r.slice(0,o),await new Promise(e=>{if(document.body)return e();let t=new MutationObserver(()=>{document.body&&(t.disconnect(),e())});t.observe(document.documentElement,{childList:!0}),setTimeout(()=>{t.disconnect(),e()},3e3)}),!document.body)return;let l=document.createElement(`div`);l.id=`tabatha-gatekeeper-host`,Object.assign(l.style,{position:`fixed`,top:`0`,left:`0`,width:`100vw`,height:`100vh`,zIndex:`2147483647`,backgroundColor:`rgba(0,0,0,${s?.85:.6})`,backdropFilter:`blur(${c}px)`,pointerEvents:`auto`});let u=l.attachShadow({mode:`closed`});document.documentElement.appendChild(l),s&&(document.body.style.overflow=`hidden`);let d=document.createElement(`style`);d.textContent=`
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
      padding: 28px 32px;
      border-radius: 16px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5);
      width: 400px;
      text-align: center;
      border: 1px solid #333;
    }
    h1 { margin: 0 0 4px; font-size: 20px; font-weight: 700; letter-spacing: 0.02em; }
    .subtitle { color: #888; margin: 0 0 18px; font-size: 12px; }
    .mode-badge { display: inline-block; font-size: 9px; padding: 1px 6px; border-radius: 3px; margin-left: 6px; font-weight: 600; }
    .mode-strict { background: #ff6b6b22; color: #ff6b6b; }
    .mode-relaxed { background: #66bb6a22; color: #66bb6a; }

    input, select {
      width: 100%;
      padding: 9px 12px;
      margin-bottom: 10px;
      background: #333;
      border: 1px solid #444;
      color: white;
      border-radius: 8px;
      font-size: 13px;
      box-sizing: border-box;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus, select:focus { border-color: #00e5ff; }

    .section-label {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #555;
      text-align: left;
      margin: 10px 0 5px;
      font-weight: 600;
    }

    .preset-list { display: flex; flex-direction: column; gap: 3px; margin-bottom: 6px; }

    .preset-item {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 10px; background: #252525; border: 1px solid #333;
      border-radius: 6px; cursor: pointer; text-align: left;
      color: #ccc; transition: border-color 0.15s, background 0.15s;
    }
    .preset-item:hover { border-color: #00e5ff; background: #2a2a2a; }
    .preset-item .label { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .preset-item .badge { font-size: 8px; background: #333; padding: 1px 5px; border-radius: 3px; color: #888; }

    .preset-item.active-item { font-size: 12px; padding: 8px 10px; }
    .preset-item.recent-item { font-size: 11px; padding: 5px 9px; color: #aaa; }
    .preset-item.common-item { font-size: 10px; padding: 4px 8px; color: #888; background: #222; border-color: #2a2a2a; }
    .preset-item.common-item:hover { border-color: #555; }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-top: 14px;
    }

    button {
      padding: 9px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      transition: transform 0.1s, opacity 0.2s;
    }
    button:active { transform: scale(0.98); }

    .btn-primary { background: #fff; color: #000; grid-column: span 2; }
    .btn-secondary { background: #333; color: #fff; border: 1px solid #444; }
    .btn-danger { background: #3c1f1f; color: #ff6b6b; border: 1px solid #5c2b2b; }
    .btn-later { background: #1f2f3c; color: #6bb3ff; border: 1px solid #2b3f5c; }
    .btn-nevermind { background: transparent; color: #888; border: 1px solid #444; grid-column: span 2; }
    .btn-dismiss { background: transparent; color: #66bb6a; border: 1px solid #66bb6a44; grid-column: span 2; font-size: 11px; padding: 7px; }

    .btn-primary:hover { opacity: 0.9; }
    .btn-secondary:hover { background: #444; }
    .btn-danger:hover { background: #4a2626; }
    .btn-later:hover { background: #2a3f5c; }
    .btn-nevermind:hover { color: #66bb6a; border-color: #66bb6a; }
    .btn-dismiss:hover { background: #66bb6a11; }

    .actions-subtext {
      grid-column: span 2;
      font-size: 9px;
      color: #555;
      text-align: center;
      margin-top: 2px;
    }

    .skip-link {
      display: block;
      margin-top: 14px;
      font-size: 10px;
      color: #555;
      text-decoration: none;
      cursor: pointer;
      transition: color 0.15s;
    }
    .skip-link:hover { color: #888; text-decoration: underline; }

    [data-tip] { position: relative; }
    [data-tip]:hover::after {
      content: attr(data-tip);
      position: absolute;
      bottom: calc(100% + 6px);
      left: 50%;
      transform: translateX(-50%);
      background: #111;
      color: #ddd;
      font-size: 10px;
      font-weight: 400;
      padding: 4px 8px;
      border-radius: 4px;
      white-space: normal;
      max-width: 250px;
      pointer-events: none;
      z-index: 10;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      border: 1px solid #333;
      animation: tipFade 0.15s ease-out;
    }
    @keyframes tipFade { from { opacity: 0; transform: translateX(-50%) translateY(4px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
  `,u.appendChild(d);let f=document.createElement(`div`);f.className=`container`;let p=``;r.length>0&&(p=`<div class="preset-list">${r.map(e=>`
      <div class="preset-item active-item" data-inherit-id="${e.id}" data-tip="Click to inherit this focus. Or type above first to nest a sub-intent under it.">
        <span style="font-size:13px">${e.focusState===`active`?`🎯`:`⏸`}</span>
        <span class="label">${e.label}</span>
        <span class="badge">${e.funnelStage||`focus`}</span>
      </div>
    `).join(``)}</div>`);let m=``;i.length>0&&(m=`<div class="section-label">Recent</div><div class="preset-list">${i.map(e=>`
      <div class="preset-item recent-item" data-preset="${e}" data-tip="Click to reuse this intent">
        <span class="label">${e}</span>
      </div>
    `).join(``)}</div>`);let h=``;a.length>0&&(h=`<div class="section-label">Common</div><div class="preset-list">${a.map(e=>`
      <div class="preset-item common-item" data-preset="${e}" data-tip="Persistent intent — click to reuse">
        <span class="label">${e}</span>
      </div>
    `).join(``)}</div>`);let g=s?`<span class="mode-badge mode-strict">Strict</span>`:`<span class="mode-badge mode-relaxed">Relaxed</span>`,_=s?``:`<button class="btn-dismiss" id="dismiss" data-tip="Continue without setting intent — page will be accessible but untracked">Dismiss — browse without intent</button>`;f.innerHTML=`
    <h1>Why are you here?${g}</h1>
    <p class="subtitle" data-tip="Tabatha helps you browse with intention">Define your intent to proceed.</p>
    ${n===`inherited`?`<div style="font-size:10px;color:#888;margin-bottom:6px;text-align:left;">Inherited from parent tab — confirm or change:</div>`:``}
    <input type="text" id="context" placeholder="What are you working on?" value="${t.replace(/"/g,`&quot;`)}" autofocus data-tip="Type a new intent, or skip and click a preset below">

    ${p}
    ${m}
    ${h}

    <div class="actions">
      <button class="btn-primary" id="continue" data-tip="Set intent and proceed to the site">Continue</button>
      <button class="btn-secondary" id="side-quest" data-tip="Quick detour — Tabatha will remind you when time is up">⚔️ Side Quest</button>
      <button class="btn-danger" id="sugar-box" data-tip="Save this site for later as a reward — tab will close">🍬 Sugar Box</button>
      <button class="btn-secondary" id="park" data-tip="Save tab to Parked list — tab will close">🅿️ Park</button>
      <button class="btn-later" id="later" data-tip="Save this intent for future action — tab will close">🔖 Later</button>
      <button class="btn-nevermind" id="nevermind" data-tip="Close tab — logs a focus win!">🚫 Nevermind</button>
      ${_}
      <div class="actions-subtext">Any button proceeds — each classifies your decision differently</div>
    </div>

    <a class="skip-link" id="skip-domain" data-tip="Stop showing this prompt on ${location.hostname}">Skip intent for this domain</a>
  `,u.appendChild(f);let v=u.getElementById(`context`),y=()=>{l.remove(),document.body&&(document.body.style.overflow=``)},b=(e,t={})=>chrome.runtime.sendMessage({type:`LOG_INTENT_ACTION`,action:e,url:window.location.href,domain:location.hostname,...t}).catch(()=>{}),x=async(e,t=null)=>{let n=v.value.trim(),r=n||e;await chrome.runtime.sendMessage({type:`SET_TAB_CONTEXT`,context:r,category:`work`,intent:t?`inherited_from_focus`:`preset`}).catch(()=>{}),t?await chrome.runtime.sendMessage({type:`ASSOCIATE_TAB_WITH_FOCUS`,focusId:t}).catch(()=>{}):n&&n.toLowerCase()!==e.toLowerCase()&&await chrome.runtime.sendMessage({type:`SET_TAB_CONTEXT`,context:n,category:`work`,intent:`child_of_preset`,parentContext:e}).catch(()=>{}),await b(t?`inherit`:`continue`,{context:r,focusId:t,parentContext:n?e:null}),y()};u.getElementById(`continue`).onclick=async()=>{let e=v.value.trim();if(!e){v.style.borderColor=`#ff6b6b`,v.placeholder=`Please describe your intent...`;return}await chrome.runtime.sendMessage({type:`SET_TAB_CONTEXT`,context:e,category:`work`,intent:`user_defined`}).catch(()=>{}),await b(`continue`,{context:e}),y()},u.getElementById(`side-quest`).onclick=async()=>{let e=v.value.trim()||`Side Quest`;await chrome.runtime.sendMessage({type:`START_SIDE_QUEST`,context:e,minutes:5}).catch(()=>{}),await b(`side_quest`,{context:e}),y()},u.getElementById(`sugar-box`).onclick=async()=>{await chrome.runtime.sendMessage({type:`ADD_TO_SUGAR_BOX`,url:window.location.href,title:document.title}).catch(()=>{}),await b(`sugar_box`),y();try{let e=await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`});e?.tabId&&await chrome.runtime.sendMessage({type:`CLOSE_TAB`,tabId:e.tabId})}catch{window.close()}},u.getElementById(`park`).onclick=async()=>{await chrome.runtime.sendMessage({type:`PARK_TAB`,url:window.location.href,title:document.title}).catch(()=>{}),await b(`park`),y();try{let e=await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`});e?.tabId&&await chrome.runtime.sendMessage({type:`CLOSE_TAB`,tabId:e.tabId})}catch{window.close()}},u.getElementById(`later`).onclick=async()=>{let e=v.value.trim()||document.title;await chrome.runtime.sendMessage({type:`PARK_TAB`,url:window.location.href,title:document.title,context:e}).catch(()=>{}),await b(`later`,{context:e}),y();try{let e=await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`});e?.tabId&&await chrome.runtime.sendMessage({type:`CLOSE_TAB`,tabId:e.tabId})}catch{window.close()}},u.getElementById(`nevermind`).onclick=async()=>{await b(`nevermind`);try{let e=await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`});e?.tabId&&await chrome.runtime.sendMessage({type:`CLOSE_TAB`,tabId:e.tabId})}catch{window.close()}};let S=u.getElementById(`dismiss`);S&&(S.onclick=async()=>{await b(`dismiss`),y()}),u.getElementById(`skip-domain`).onclick=async()=>{await chrome.runtime.sendMessage({type:`SKIP_DOMAIN`,domain:location.hostname}).catch(()=>{}),await b(`skip_domain`),y()},u.querySelectorAll(`[data-inherit-id]`).forEach(e=>{e.onclick=()=>x(e.querySelector(`.label`).textContent,e.getAttribute(`data-inherit-id`))}),u.querySelectorAll(`[data-preset]`).forEach(e=>{e.onclick=()=>x(e.getAttribute(`data-preset`))}),v.onkeydown=e=>{e.key===`Enter`&&u.getElementById(`continue`).click()}})();