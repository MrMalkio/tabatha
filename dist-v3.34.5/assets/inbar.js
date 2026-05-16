(async()=>{let e,t,n,r=``,i=[],a=null;try{let o=await chrome.runtime.sendMessage({type:`GET_INBAR_DATA`});if(!o||!o.show)return;e=o.tabContext,t=o.activeFocus,n=o.settings||{},i=o.allFocusItems||[],a=o.activeFocusId||null,r=(await chrome.runtime.sendMessage({type:`GET_INBAR_NOTES`}))?.note||``}catch{return}let o=n.inbarPosition||`bottom`;if(document.body||await new Promise(e=>{let t=new MutationObserver(()=>{document.body&&(t.disconnect(),e())});t.observe(document.documentElement,{childList:!0}),setTimeout(()=>{t.disconnect(),e()},3e3)}),!document.body)return;let s=!1,c=!1,l=!1,u=!1,d=``,f=null,p=!1;try{let e=(await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`}))?.tabId;if(e){let t=(await chrome.storage.local.get(`pausedIntents`)).pausedIntents||{},n=t[e];if(n)l=!0,d=n.note||``,f=n.pausedAt;else{let n=window.location.href.split(`#`)[0];for(let[r,i]of Object.entries(t))if(r!==String(e)&&i.url&&i.url.split(`#`)[0]===n&&i.note){l=!0,d=i.note||``,f=i.pausedAt,p=!0;break}}}}catch{}let m=document.createElement(`div`);m.id=`tabatha-inbar-host`,Object.assign(m.style,{position:`fixed`,[o]:`0`,left:`0`,width:`100vw`,height:`26px`,zIndex:`2147483646`,pointerEvents:`none`,transition:`height 0.2s ease`});let h=m.attachShadow({mode:`closed`});document.documentElement.appendChild(m),[`keydown`,`keyup`,`keypress`].forEach(e=>{m.addEventListener(e,e=>{e.stopPropagation()},!0)});let g=e=>{document.body.style.transition=`margin 0.2s ease`,o===`bottom`?document.body.style.marginBottom=`${e}px`:document.body.style.marginTop=`${e}px`};g(26);let _=e?.context||e?.intent||null,v=t?.label||null,y=_||v||null,b=!!t,x=!!y,S=document.createElement(`style`);S.textContent=`
    * { box-sizing: border-box; }
    :host {
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 11px;
      color: #ccc;
    }

    /* === FULL BAR === */
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 26px;
      background: #0d0d0d;
      border-${o===`bottom`?`top`:`bottom`}: 1px solid rgba(255,255,255,0.08);
      padding: 0 10px;
      gap: 8px;
      user-select: none;
      pointer-events: auto;
      backdrop-filter: blur(12px);
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    .bar.hidden { transform: translateY(${o===`bottom`?`100%`:`-100%`}); opacity: 0; pointer-events: none; }

    .left, .right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .center { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; }
    .intent-label { font-weight: 500; color: #eee; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; cursor: pointer; transition: color 0.15s; }
    .intent-label:hover { color: #66bb6a; text-decoration: underline; }
    .focus-label-left { font-size: 10px; font-weight: 600; color: #00e5ff; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-label { font-size: 10px; color: #777; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .timer { font-variant-numeric: tabular-nums; font-size: 10px; font-weight: 600; letter-spacing: 0.3px; }
    .timer-up { color: #00e5ff; }
    .timer-down { color: #ff6b6b; }
    .timer-task { color: #66bb6a; }
    .divider { width: 1px; height: 10px; background: rgba(255,255,255,0.12); flex-shrink: 0; }
    .badge { font-size: 7px; padding: 1px 4px; border-radius: 3px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .badge-focus { background: #00e5ff18; color: #00e5ff; border: 1px solid #00e5ff33; }
    .badge-no-intent { background: #ff6b6b12; color: #ff6b6b; border: 1px solid #ff6b6b33; cursor: pointer; padding: 2px 8px; font-size: 9px; }
    .badge-no-intent:hover { background: #ff6b6b22; }

    .bar-btn {
      background: none; border: none; color: #555; font-size: 11px;
      cursor: pointer; padding: 2px 4px; line-height: 1; border-radius: 3px;
      transition: color 0.15s, background 0.15s;
    }
    .bar-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }
    .bar-btn.note-btn { color: ${r?`#ffc107`:`#555`}; }
    .bar-btn.note-btn:hover { color: #ffd54f; }

    /* === NUB (collapsed toggle) === */
    .nub {
      position: fixed;
      ${o}: 6px;
      right: 12px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #1a1a1a;
      border: 1px solid rgba(255,255,255,0.12);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      font-size: 9px;
      color: #00e5ff;
      transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease;
      opacity: 0;
      transform: scale(0.6);
      z-index: 2147483647;
      box-shadow: 0 1px 6px rgba(0,0,0,0.5);
    }
    .nub.visible { opacity: 1; transform: scale(1); }
    .nub:hover { background: #222; box-shadow: 0 0 8px rgba(0,229,255,0.3); border-color: #00e5ff44; }
    .nub.has-note { color: #ffc107; border-color: #ffc10744; }
    .nub.has-note:hover { box-shadow: 0 0 8px rgba(255,193,7,0.3); }

    /* === NOTES PANEL === */
    .notes-panel {
      position: absolute;
      ${o===`bottom`?`bottom`:`top`}: 26px;
      right: 0;
      width: 320px;
      height: 0;
      overflow: hidden;
      background: #141414;
      border: 1px solid rgba(255,255,255,0.1);
      border-${o===`bottom`?`top-left`:`bottom-left`}-radius: 8px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.4);
      transition: height 0.2s ease;
      pointer-events: auto;
    }
    .notes-panel.open { height: 120px; }
    .notes-inner {
      padding: 8px 10px;
      height: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .notes-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 10px;
      font-weight: 600;
      color: #888;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .notes-header span { color: #ffc107; }
    .notes-textarea {
      flex: 1;
      background: #0a0a0a;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 4px;
      color: #ddd;
      font-family: inherit;
      font-size: 11px;
      padding: 6px 8px;
      resize: none;
      outline: none;
      line-height: 1.4;
    }
    .notes-textarea:focus { border-color: #00e5ff44; }
    .notes-textarea::placeholder { color: #444; }
    .notes-saved {
      font-size: 9px;
      color: #66bb6a;
      text-align: right;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .notes-saved.show { opacity: 1; }

    /* === PAUSE FEATURE === */
    .bar-btn.pause-btn { color: #888; }
    .bar-btn.pause-btn:hover { color: #ffc107; background: rgba(255,193,7,0.1); }
    .bar-btn.pause-btn.is-paused { color: #66bb6a; }
    .bar-btn.pause-btn.is-paused:hover { color: #81c784; background: rgba(102,187,106,0.1); }
    .bar.paused { background: linear-gradient(90deg, #1a1400 0%, #0d0d0d 40%); border-color: rgba(255,193,7,0.15); }
    .pause-label { font-size: 10px; color: #ffc107; font-weight: 600; display: flex; align-items: center; gap: 4px; }
    .pause-label .note-preview { color: #bbb; font-weight: 400; font-style: italic; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .resume-btn-inline { background: #66bb6a22; color: #66bb6a; border: 1px solid #66bb6a44; border-radius: 4px; padding: 2px 8px; font-size: 10px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
    .resume-btn-inline:hover { background: #66bb6a33; border-color: #66bb6a66; }

    /* Pause mini-prompt */
    .pause-prompt { position: absolute; ${o===`bottom`?`bottom`:`top`}: 26px; right: 40px; width: 300px; background: #1a1a0a; border: 1px solid rgba(255,193,7,0.2); border-radius: 8px; box-shadow: 0 -4px 20px rgba(0,0,0,0.5); padding: 10px 12px; pointer-events: auto; transform: scaleY(0); transform-origin: ${o===`bottom`?`bottom`:`top`}; transition: transform 0.2s ease; }
    .pause-prompt.open { transform: scaleY(1); }
    .pause-prompt-title { font-size: 10px; font-weight: 700; color: #ffc107; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }
    .pause-prompt-input { width: 100%; background: #0d0d00; border: 1px solid rgba(255,193,7,0.15); border-radius: 4px; color: #ddd; font-family: inherit; font-size: 11px; padding: 6px 8px; resize: none; outline: none; height: 48px; line-height: 1.4; }
    .pause-prompt-input:focus { border-color: #ffc10744; }
    .pause-prompt-input::placeholder { color: #555; }
    .pause-prompt-actions { display: flex; gap: 6px; margin-top: 6px; justify-content: flex-end; }
    .pause-prompt-btn { padding: 4px 12px; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; }
    .pause-confirm { background: #ffc107; color: #000; }
    .pause-confirm:hover { background: #ffd54f; }
    .pause-cancel { background: #333; color: #aaa; }
    .pause-cancel:hover { background: #444; }

    /* Sticky note overlay */
    .sticky-overlay { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 2147483645; display: flex; align-items: center; justify-content: center; }
    .sticky-overlay.hidden { display: none; }
    .sticky-note { pointer-events: auto; width: min(440px, 85vw); padding: 28px 32px 20px; background: linear-gradient(135deg, #fff9c4 0%, #fff59d 30%, #ffee58 100%); border-radius: 3px; box-shadow: 2px 4px 24px rgba(0,0,0,0.25), 0 1px 4px rgba(0,0,0,0.15), inset 0 -2px 6px rgba(0,0,0,0.04); color: #3e2723; font-family: 'Segoe Script', 'Comic Sans MS', 'Patrick Hand', cursive; position: relative; cursor: default; transition: transform 0.3s ease; }
    .sticky-note::before { content: ''; position: absolute; top: -6px; left: 50%; transform: translateX(-50%); width: 60px; height: 16px; background: rgba(200,200,200,0.6); border-radius: 0 0 3px 3px; }
    .sticky-tape { position: absolute; top: -10px; left: 50%; transform: translateX(-50%) rotate(-1deg); width: 70px; height: 20px; background: rgba(255,255,255,0.5); border-radius: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .sticky-header { font-size: 11px; color: #795548; font-family: 'Segoe UI', system-ui, sans-serif; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; }
    .sticky-time { font-size: 10px; color: #8d6e63; font-family: 'Segoe UI', system-ui, sans-serif; font-weight: 400; }
    .sticky-intent { font-size: 12px; color: #5d4037; font-family: 'Segoe UI', system-ui, sans-serif; margin-bottom: 10px; opacity: 0.8; }
    .sticky-body { font-size: 18px; line-height: 1.5; color: #3e2723; min-height: 40px; word-wrap: break-word; margin: 8px 0 16px; }
    .sticky-body:empty::after { content: '(no note)'; color: #a1887f; font-style: italic; }
    .sticky-actions { display: flex; gap: 8px; justify-content: center; }
    .sticky-resume { background: #43a047; color: #fff; border: none; padding: 8px 24px; border-radius: 6px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: 'Segoe UI', system-ui, sans-serif; transition: all 0.15s; box-shadow: 0 2px 8px rgba(67,160,71,0.3); }
    .sticky-resume:hover { background: #388e3c; transform: translateY(-1px); box-shadow: 0 3px 12px rgba(67,160,71,0.4); }
    .sticky-edit { background: transparent; color: #795548; border: 1px solid #bcaaa4; padding: 6px 14px; border-radius: 6px; font-size: 11px; cursor: pointer; font-family: 'Segoe UI', system-ui, sans-serif; transition: all 0.15s; }
    .sticky-edit:hover { background: rgba(121,85,72,0.08); border-color: #8d6e63; }
    .nub.is-paused { color: #ffc107; border-color: #ffc10744; }
    .nub.is-paused:hover { box-shadow: 0 0 8px rgba(255,193,7,0.3); }

    /* === EDIT DROPDOWN === */
    .edit-dropdown {
      position: absolute;
      ${o===`bottom`?`bottom`:`top`}: 26px;
      left: 50%;
      transform: translateX(-50%) scaleY(0);
      transform-origin: ${o===`bottom`?`bottom`:`top`};
      width: 320px;
      background: #141414;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.5);
      pointer-events: auto;
      transition: transform 0.15s ease;
      z-index: 2147483647;
    }
    .edit-dropdown.open { transform: translateX(-50%) scaleY(1); }
    .edit-inner { padding: 10px 12px; }
    .edit-title { font-size: 10px; font-weight: 700; color: #00e5ff; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .edit-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
    .edit-input { flex: 1; background: #0d0d0d; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; color: #eee; font-family: inherit; font-size: 11px; padding: 5px 8px; outline: none; }
    .edit-input:focus { border-color: #00e5ff44; }
    .edit-save { background: #00e5ff22; color: #00e5ff; border: 1px solid #00e5ff44; border-radius: 4px; padding: 4px 10px; font-size: 10px; font-weight: 600; cursor: pointer; }
    .edit-save:hover { background: #00e5ff33; }
    .edit-section { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin: 8px 0 4px; }
    .focus-item { padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; color: #ccc; transition: background 0.1s; display: flex; justify-content: space-between; align-items: center; }
    .focus-item:hover { background: rgba(255,255,255,0.06); }
    .focus-item.active { background: #00e5ff12; border-left: 2px solid #00e5ff; }
    .focus-state { font-size: 8px; padding: 1px 4px; border-radius: 3px; text-transform: uppercase; font-weight: 600; }
    .focus-state.active { background: #66bb6a22; color: #66bb6a; }
    .focus-state.paused { background: #ffa72622; color: #ffa726; }
    .focus-state.queued { background: #64b5f622; color: #64b5f6; }
    .new-focus-btn { width: 100%; background: none; border: 1px dashed rgba(255,255,255,0.15); border-radius: 4px; color: #888; padding: 5px; font-size: 10px; cursor: pointer; margin-top: 4px; }
    .new-focus-btn:hover { border-color: #00e5ff44; color: #00e5ff; }

    @keyframes stickyDrop { from { opacity: 0; transform: rotate(var(--tilt)) translateY(-30px) scale(0.9); } to { opacity: 1; transform: rotate(var(--tilt)) translateY(0) scale(1); } }
  `,h.appendChild(S);let C=document.createElement(`div`);C.className=l?`bar paused`:`bar`;let w=e?.startedAt?new Date(e.startedAt).getTime():Date.now(),T=t?.timerEndAt?new Date(t.timerEndAt).getTime():null,E=t?.totalTimeMs||0,D=()=>{if(l){let e=d?`"${d.slice(0,40)}${d.length>40?`…`:``}"`:``;return`
        <div class="left">
          <span style="font-size:10px;color:#ffc107;">⏸</span>
        </div>
        <div class="center">
          <span class="pause-label">⏸ PAUSED ${e?`<span class="note-preview">— ${e}</span>`:``}</span>
          <button class="resume-btn-inline" id="resume-inline">▶ Resume</button>
        </div>
        <div class="right">
          <button class="bar-btn pause-btn is-paused" id="pause-btn" title="Resume intent">▶</button>
          <button class="bar-btn note-btn" id="note-btn" title="Add note">📝</button>
          <button class="bar-btn" id="hide-bar" title="Collapse to nub">▾</button>
        </div>
      `}return`
      <div class="left">
        ${x||b?`
          <span class="timer timer-up" id="intent-timer" title="Time on current intent">00:00</span>
          <span class="divider"></span>
          <span class="timer timer-task" id="task-timer" title="Total time on related task">00:00</span>
        `:`
          <span style="font-size:10px;color:#555;">—</span>
        `}
        ${v?`<span class="divider"></span><span class="badge badge-focus">🎯</span><span class="focus-label-left" title="Active focus: ${v}">${v}</span>`:``}
      </div>
      <div class="center">
        ${_?`<span class="intent-label" id="intent-label-click" title="Click to mark complete: ${_}">${_}</span>`:`<span class="badge badge-no-intent" id="set-intent-btn" title="Click to set intent">No intent set</span>`}
      </div>
      <div class="right">
        ${T?`<span class="timer timer-down" id="focus-countdown" title="Focus countdown">--:--</span>`:``}
        <button class="bar-btn" id="edit-btn" title="Edit intent / Assign to focus">✏️</button>
        <button class="bar-btn" id="refresh-btn" title="Refresh InBar state">🔄</button>
        <button class="bar-btn pause-btn" id="pause-btn" title="Pause — leave a note about where you left off">⏸</button>
        <button class="bar-btn note-btn" id="note-btn" title="Add note">📝</button>
        <button class="bar-btn" id="hide-bar" title="Collapse to nub">▾</button>
      </div>
    `};C.innerHTML=D(),h.appendChild(C);let O=document.createElement(`div`);O.className=`notes-panel`,O.innerHTML=`
    <div class="notes-inner">
      <div class="notes-header">
        <span>📝 Quick Note</span>
        <button class="bar-btn" id="close-notes" style="font-size:10px;">✕</button>
      </div>
      <textarea class="notes-textarea" id="note-text" placeholder="Jot a thought about this focus, task, or intent…">${r}</textarea>
      <div class="notes-saved" id="note-saved">✓ Saved</div>
    </div>
  `,h.appendChild(O);let k=document.createElement(`div`);k.className=`edit-dropdown`;let A=()=>(i||[]).filter(e=>e.focusState!==`completed`&&e.funnelStage!==`resolved`).sort((e,t)=>{let n={active:0,paused:1};return(n[e.focusState]??2)-(n[t.focusState]??2)}).map(e=>{let t=e.funnelStage||`unsorted`,n=e.focusState===`active`?`🎯`:e.focusState===`paused`?`⏸`:`📋`;return`<div class="focus-item${e.id===a?` active`:``}" data-focus-id="${e.id}">
        <span>${n} ${e.label}</span>
        <span class="focus-state queued">${t}</span>
      </div>`}).join(``)||`<div style="font-size:10px;color:#555;padding:4px;">No focus items yet</div>`;k.innerHTML=`
    <div class="edit-inner">
      <div class="edit-title">✏️ Edit Intent</div>
      <div class="edit-row">
        <input class="edit-input" id="edit-intent-input" placeholder="Intent for this tab..." value="${_||``}">
        <button class="edit-save" id="edit-intent-save">Save</button>
      </div>
      <textarea class="edit-input" id="edit-intent-desc" placeholder="Description (optional)..." style="width:100%;min-height:36px;resize:vertical;margin-bottom:6px;font-size:10px;">${e?.description||``}</textarea>
      <div class="edit-section">Assign to Focus</div>
      <div id="focus-list" style="max-height:180px;overflow-y:auto;">${A()}</div>
      <button class="new-focus-btn" id="new-focus-btn">+ Create new focus from this tab</button>
    </div>
  `,h.appendChild(k);let j=document.createElement(`div`);j.className=`nub${r?` has-note`:``}${l?` is-paused`:``}`,j.innerHTML=l?`⏸`:`◉`,j.title=l?`Paused — click to expand InBar`:`Show Tabatha InBar`,h.appendChild(j);let M=document.createElement(`div`);M.className=`pause-prompt`,M.innerHTML=`
    <div class="pause-prompt-title">⏸ Where did you leave off?</div>
    <textarea class="pause-prompt-input" id="pause-input" placeholder="e.g. Was debugging line 234, check the race condition…"></textarea>
    <div class="pause-prompt-actions">
      <button class="pause-prompt-btn pause-cancel" id="pause-cancel">Cancel</button>
      <button class="pause-prompt-btn pause-confirm" id="pause-confirm">Pause</button>
    </div>
  `,h.appendChild(M);let N=(Math.random()*6-3).toFixed(1),P=document.createElement(`div`);P.className=`sticky-overlay${l?``:` hidden`}`;let F=e=>e?new Date(e).toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`}):``,I=()=>`
    <div class="sticky-note" style="--tilt: ${N}deg; transform: rotate(${N}deg); animation: stickyDrop 0.4s ease-out;">
      <div class="sticky-tape"></div>
      <div class="sticky-header">
        <span>📌 Paused</span>
        <span class="sticky-time">${f?F(f):``}</span>
      </div>
      <div class="sticky-intent">${y||v||`Current work`}</div>
      <div class="sticky-body" id="sticky-body-text">${d||``}</div>
      <div class="sticky-actions">
        <button class="sticky-edit" id="sticky-edit">✏️ Edit Note</button>
        ${p?`<button class="sticky-resume" id="sticky-new-intent" style="background:#00e5ff;color:#000;">🆕 Start New Intent</button>`:``}
        <button class="sticky-resume" id="sticky-resume">▶ Resume</button>
      </div>
    </div>
  `;P.innerHTML=I(),h.appendChild(P);let L=h.getElementById(`intent-timer`),R=h.getElementById(`task-timer`),z=h.getElementById(`focus-countdown`),B=e=>{let t=Math.floor(Math.abs(e)/1e3),n=Math.floor(t/60),r=t%60,i=Math.floor(n/60),a=n%60;return i>0?`${i}:${String(a).padStart(2,`0`)}:${String(r).padStart(2,`0`)}`:`${String(a).padStart(2,`0`)}:${String(r).padStart(2,`0`)}`},V=()=>{if(s||l)return;let e=Date.now();if(L&&(L.textContent=B(e-w)),R&&(R.textContent=B(E+(e-w))),z&&T){let t=T-e;z.textContent=t>0?B(t):`+`+B(Math.abs(t)),z.style.color=t>0?`#ff6b6b`:`#ff4444`}};V();let H=setInterval(V,1e3),U=async e=>{try{let t=(await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`}))?.tabId;if(!t)return;let n=(await chrome.storage.local.get(`pausedIntents`)).pausedIntents||{};n[t]={note:e,pausedAt:new Date().toISOString(),intentLabel:y||``,focusLabel:v||``,url:window.location.href},await chrome.storage.local.set({pausedIntents:n})}catch{}},W=async()=>{try{let e=(await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`}))?.tabId;if(!e)return;let t=(await chrome.storage.local.get(`pausedIntents`)).pausedIntents||{};delete t[e],await chrome.storage.local.set({pausedIntents:t})}catch{}},G=()=>{C.innerHTML=D(),C.className=l?`bar paused`:`bar`,j.className=`nub${r?` has-note`:``}${l?` is-paused`:``}`,j.innerHTML=l?`⏸`:`◉`,j.title=l?`Paused — click to expand InBar`:`Show Tabatha InBar`,P.classList.toggle(`hidden`,!l),l&&(P.innerHTML=I()),L=h.getElementById(`intent-timer`),R=h.getElementById(`task-timer`),z=h.getElementById(`focus-countdown`),J()},K=e=>{l=!0,u=!1,d=e,f=new Date().toISOString(),M.classList.remove(`open`),U(e),G()},q=()=>{l=!1,d=``,f=null,W(),a&&chrome.runtime.sendMessage({type:`RESUME_FOCUS`,focusId:a}).catch(()=>{}),G()},J=()=>{let n=h.getElementById(`hide-bar`);n&&(n.onclick=ee);let r=h.getElementById(`note-btn`);r&&(r.onclick=$);let o=h.getElementById(`set-intent-btn`);o&&(o.onclick=()=>{chrome.runtime.sendMessage({type:`OPEN_POPUP`}).catch(()=>{})});let c=h.getElementById(`pause-btn`);c&&(c.onclick=()=>{if(l)q();else if(u=!u,M.classList.toggle(`open`,u),u){let e=h.getElementById(`pause-input`);e&&e.focus()}});let f=h.getElementById(`resume-inline`);f&&(f.onclick=q);let m=h.getElementById(`sticky-resume`);m&&(m.onclick=q);let g=h.getElementById(`sticky-new-intent`);g&&(g.onclick=()=>{l=!1,p=!1,W(),G(),chrome.runtime.sendMessage({type:`OPEN_POPUP`}).catch(()=>{})});let S=h.getElementById(`sticky-edit`);S&&(S.onclick=()=>{s&&Y(),u=!0,M.classList.add(`open`);let e=h.getElementById(`pause-input`);e&&(e.value=d,e.focus())});let j=h.getElementById(`edit-btn`);j&&(j.onclick=()=>{let e=k.classList.contains(`open`);if(O.classList.remove(`open`),M.classList.remove(`open`),k.classList.toggle(`open`,!e),!e){let e=h.getElementById(`edit-intent-input`);e&&e.focus()}});let N=h.getElementById(`refresh-btn`);N&&(N.onclick=async()=>{try{let n=await chrome.runtime.sendMessage({type:`GET_INBAR_DATA`});if(!n)return;e=n.tabContext,t=n.activeFocus,i=n.allFocusItems||[],a=n.activeFocusId||null,_=e?.context||e?.intent||null,v=t?.label||null,y=_||v||null,b=!!t,x=!!y,t&&(T=t.timerEndAt?new Date(t.timerEndAt).getTime():null,E=t.totalTimeMs||0),w=e?.startedAt?new Date(e.startedAt).getTime():Date.now(),l||(C.innerHTML=D(),L=h.getElementById(`intent-timer`),R=h.getElementById(`task-timer`),z=h.getElementById(`focus-countdown`));let r=h.getElementById(`focus-list`);r&&(r.innerHTML=A()),J()}catch{}});let P=h.getElementById(`edit-intent-save`);P&&(P.onclick=async()=>{let e=h.getElementById(`edit-intent-input`),t=h.getElementById(`edit-intent-desc`),n=e?.value?.trim(),r=t?.value?.trim()||``;if(n)try{await chrome.runtime.sendMessage({type:`SET_INTENT`,payload:{intent:n,description:r}}),_=n,y=n,x=!0,k.classList.remove(`open`),C.innerHTML=D(),L=h.getElementById(`intent-timer`),R=h.getElementById(`task-timer`),z=h.getElementById(`focus-countdown`),J()}catch{}});let F=h.getElementById(`intent-label-click`);F&&(F.onclick=async()=>{if(_&&confirm(`Mark intent "${_}" as resolved?`))try{await chrome.runtime.sendMessage({type:`SET_INTENT`,payload:{intent:`✅ ${_}`,resolved:!0}}),_=null,y=v||null,x=!!y,C.innerHTML=D(),L=h.getElementById(`intent-timer`),R=h.getElementById(`task-timer`),z=h.getElementById(`focus-countdown`),J()}catch{}});let I=h.getElementById(`focus-list`);I&&(I.onclick=async e=>{let t=e.target.closest(`.focus-item`);if(!t)return;let n=t.dataset.focusId;if(n)try{await chrome.runtime.sendMessage({type:`SWITCH_FOCUS`,payload:{focusId:n}}),k.classList.remove(`open`)}catch{}});let B=h.getElementById(`new-focus-btn`);B&&(B.onclick=async()=>{let e=h.getElementById(`edit-intent-input`)?.value?.trim()||y||`New Focus`;try{await chrome.runtime.sendMessage({type:`START_FOCUS`,label:e,timerMinutes:15}),k.classList.remove(`open`)}catch{}})},ee=()=>{s=!0,c=!1,u=!1,C.classList.add(`hidden`),O.classList.remove(`open`),M.classList.remove(`open`),k.classList.remove(`open`),g(0),m.style.height=`0`,setTimeout(()=>j.classList.add(`visible`),150)},Y=()=>{s=!1,j.classList.remove(`visible`),setTimeout(()=>{C.classList.remove(`hidden`),g(26),m.style.height=`26px`},100)};j.onclick=Y;let X=h.getElementById(`note-text`),Z=h.getElementById(`note-saved`),Q,$=()=>{c=!c,O.classList.toggle(`open`,c),g(c?146:26),c&&X.focus()};h.getElementById(`close-notes`).onclick=$,X.addEventListener(`input`,()=>{clearTimeout(Q),Q=setTimeout(()=>{let e=X.value;chrome.runtime.sendMessage({type:`SAVE_INBAR_NOTE`,note:e}).then(()=>{Z.classList.add(`show`),j.classList.toggle(`has-note`,!!e);let t=h.getElementById(`note-btn`);t&&(t.style.color=e?`#ffc107`:`#555`),setTimeout(()=>Z.classList.remove(`show`),1500)}).catch(()=>{})},600)}),h.getElementById(`pause-confirm`).onclick=()=>{K(h.getElementById(`pause-input`)?.value?.trim()||``)},h.getElementById(`pause-cancel`).onclick=()=>{u=!1,M.classList.remove(`open`)},h.getElementById(`pause-input`).onkeydown=e=>{e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),h.getElementById(`pause-confirm`).click())},J(),chrome.runtime.onMessage.addListener(n=>{if((n.type===`FOCUS_ENGINE_UPDATED`||n.type===`TAB_UPDATED`||n.type===`INTENT_UPDATED`)&&chrome.runtime.sendMessage({type:`GET_INBAR_DATA`}).then(n=>{if(!n)return;e=n.tabContext,t=n.activeFocus,i=n.allFocusItems||[],a=n.activeFocusId||null,_=e?.context||e?.intent||null,v=t?.label||null,y=_||v||null,b=!!t,x=!!y,t&&(T=t.timerEndAt?new Date(t.timerEndAt).getTime():null,E=t.totalTimeMs||0),w=e?.startedAt?new Date(e.startedAt).getTime():Date.now(),l||(C.innerHTML=D(),L=h.getElementById(`intent-timer`),R=h.getElementById(`task-timer`),z=h.getElementById(`focus-countdown`));let r=h.getElementById(`focus-list`);r&&(r.innerHTML=A()),J()}).catch(()=>{}),n.type===`FOCUS_TIMER_EXPIRED`){let e=document.createElement(`div`);Object.assign(e.style,{position:`fixed`,top:`0`,left:`0`,width:`100vw`,height:`100vh`,background:`rgba(0,0,0,0.7)`,zIndex:`2147483647`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontFamily:`'Segoe UI', system-ui, sans-serif`});let t=document.createElement(`div`);Object.assign(t.style,{background:`#1a1a1a`,border:`1px solid #333`,borderRadius:`8px`,padding:`24px 32px`,maxWidth:`400px`,textAlign:`center`,color:`#eee`}),t.innerHTML=`
        <div style="font-size:32px;margin-bottom:8px;">⏰</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Focus Timer Expired</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:16px;">"${n.label}" — Your allotted ${n.timerMinutes}m is up.</div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="t-extend" style="background:#00e5ff22;color:#00e5ff;border:1px solid #00e5ff44;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;">⏱️ Extend 5 min</button>
          <button id="t-done" style="background:#66bb6a22;color:#66bb6a;border:1px solid #66bb6a44;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;">✅ Complete & Move On</button>
        </div>
      `,e.appendChild(t),document.documentElement.appendChild(e),t.querySelector(`#t-extend`).onclick=async()=>{await chrome.runtime.sendMessage({type:`EXTEND_FOCUS_TIMER`,focusId:n.focusId,extraMinutes:5}),e.remove()},t.querySelector(`#t-done`).onclick=async()=>{await chrome.runtime.sendMessage({type:`COMPLETE_FOCUS`,focusId:n.focusId}),e.remove()},e.onclick=t=>{t.target===e&&t.stopPropagation()}}if(n.type===`WELCOME_BACK`&&n.pausedFocusId){let e=document.createElement(`div`);Object.assign(e.style,{position:`fixed`,top:`0`,left:`0`,width:`100vw`,height:`100vh`,background:`rgba(0,0,0,0.6)`,zIndex:`2147483647`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontFamily:`'Segoe UI', system-ui, sans-serif`});let t=Math.round((n.idleDurationMs||0)/6e4),r=document.createElement(`div`);Object.assign(r.style,{background:`#1a1a1a`,border:`1px solid #333`,borderRadius:`8px`,padding:`24px 32px`,maxWidth:`420px`,textAlign:`center`,color:`#eee`}),r.innerHTML=`
        <div style="font-size:28px;margin-bottom:8px;">👋</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Welcome Back!</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:6px;">You were away for ${t}m.</div>
        <div style="font-size:13px;color:#ccc;margin-bottom:16px;">Pick up where you left off?<br><strong style="color:#ff9800;">"${n.pausedFocusLabel}"</strong></div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="wb-resume" style="background:#ab47bc22;color:#ab47bc;border:1px solid #ab47bc44;border-radius:6px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;">⚡ Resume Focus</button>
          <button id="wb-dismiss" style="background:#33333366;color:#888;border:1px solid #444;border-radius:6px;padding:8px 16px;font-size:13px;cursor:pointer;">Not now</button>
        </div>
      `,e.appendChild(r),document.documentElement.appendChild(e),r.querySelector(`#wb-resume`).onclick=async()=>{await chrome.runtime.sendMessage({type:`RESUME_FOCUS`,focusId:n.pausedFocusId}),e.remove()},r.querySelector(`#wb-dismiss`).onclick=()=>e.remove(),e.onclick=t=>{t.target===e&&e.remove()}}}),window.addEventListener(`beforeunload`,()=>{clearInterval(H)})})();