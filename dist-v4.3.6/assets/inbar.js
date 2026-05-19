(async()=>{let e,t,n,r=``,i=[],a=null,o=!1;try{let s=await chrome.runtime.sendMessage({type:`GET_INBAR_DATA`});if(!s||!s.show)return;e=s.tabContext,t=s.activeFocus,n=s.settings||{},i=s.allFocusItems||[],a=s.activeFocusId||null,o=!!s.isTabLinked,s.windowCount,r=(await chrome.runtime.sendMessage({type:`GET_INBAR_NOTES`}))?.note||``}catch{return}let s=n.inbarPosition||`bottom`;if(document.body||await new Promise(e=>{let t=new MutationObserver(()=>{document.body&&(t.disconnect(),e())});t.observe(document.documentElement,{childList:!0}),setTimeout(()=>{t.disconnect(),e()},3e3)}),!document.body)return;let c=!1,l=!1,u=!1,d=!1,f=``,p=null,m=!1;try{let e=(await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`}))?.tabId;if(e){let t=(await chrome.storage.local.get(`pausedIntents`)).pausedIntents||{},n=t[e];if(n)u=!0,f=n.note||``,p=n.pausedAt;else{let n=window.location.href.split(`#`)[0];for(let[r,i]of Object.entries(t))if(r!==String(e)&&i.url&&i.url.split(`#`)[0]===n&&i.note){u=!0,f=i.note||``,p=i.pausedAt,m=!0;break}}}}catch{}let h=document.createElement(`div`);h.id=`tabatha-inbar-host`,Object.assign(h.style,{position:`fixed`,[s]:`0`,left:`0`,width:`100vw`,height:`26px`,zIndex:`2147483646`,pointerEvents:`none`,transition:`height 0.2s ease`});let g=h.attachShadow({mode:`closed`});document.documentElement.appendChild(h),[`keydown`,`keyup`,`keypress`].forEach(e=>{h.addEventListener(e,e=>{e.stopPropagation()},!0)});let _=e=>{document.body.style.transition=`margin 0.2s ease`,s===`bottom`?document.body.style.marginBottom=`${e}px`:document.body.style.marginTop=`${e}px`};_(26);let v=e?.context||e?.intent||null,y=t?.label||null,b=v||y||null,x=!!t,S=!!b,C=document.createElement(`style`);C.textContent=`
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
      border-${s===`bottom`?`top`:`bottom`}: 1px solid rgba(255,255,255,0.08);
      padding: 0 10px;
      gap: 8px;
      user-select: none;
      pointer-events: auto;
      backdrop-filter: blur(12px);
      transition: transform 0.2s ease, opacity 0.2s ease;
    }
    .bar.hidden { transform: translateY(${s===`bottom`?`100%`:`-100%`}); opacity: 0; pointer-events: none; }

    .left, .right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
    .center { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; min-width: 0; }
    .intent-label { font-weight: 500; color: #eee; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; cursor: pointer; transition: color 0.15s; }
    .intent-label:hover { color: #66bb6a; text-decoration: underline; }
    .focus-label-left { font-size: 10px; font-weight: 600; color: #00e5ff; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .task-label { font-size: 10px; color: #777; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stale-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ffa726; margin-left: 4px; animation: stale-pulse 1.5s ease-in-out infinite; vertical-align: middle; }
    @keyframes stale-pulse { 0%,100% { opacity: 0.4; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
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
      ${s}: 6px;
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
      ${s===`bottom`?`bottom`:`top`}: 26px;
      right: 0;
      width: 320px;
      height: 0;
      overflow: hidden;
      background: #141414;
      border: 1px solid rgba(255,255,255,0.1);
      border-${s===`bottom`?`top-left`:`bottom-left`}-radius: 8px;
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
    .pause-prompt { position: absolute; ${s===`bottom`?`bottom`:`top`}: 26px; right: 40px; width: 300px; background: #1a1a0a; border: 1px solid rgba(255,193,7,0.2); border-radius: 8px; box-shadow: 0 -4px 20px rgba(0,0,0,0.5); padding: 10px 12px; pointer-events: auto; transform: scaleY(0); transform-origin: ${s===`bottom`?`bottom`:`top`}; transition: transform 0.2s ease; }
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
      ${s===`bottom`?`bottom`:`top`}: 26px;
      left: 50%;
      transform: translateX(-50%) scaleY(0);
      transform-origin: ${s===`bottom`?`bottom`:`top`};
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
  `,g.appendChild(C);let w=document.createElement(`div`);w.className=u?`bar paused`:`bar`;let T=e?.startedAt?new Date(e.startedAt).getTime():Date.now(),E=t?.timerEndAt?new Date(t.timerEndAt).getTime():null,D=t?.totalTimeMs||0,O=()=>{if(u){let e=f?`"${f.slice(0,40)}${f.length>40?`…`:``}"`:``;return`
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
        ${S||x?`
          <span class="timer timer-up" id="intent-timer" title="Time on current intent">00:00</span>
          <span class="divider"></span>
          <span class="timer timer-task" id="task-timer" title="Total time on related task">00:00</span>
        `:`
          <span style="font-size:10px;color:#555;">—</span>
        `}
        ${y?`<span class="divider"></span><span class="badge badge-focus">🎯</span><span class="focus-label-left" title="Active focus: ${y}">${y}</span>${t?.lastCheckpointAt&&Date.now()-new Date(t.lastCheckpointAt).getTime()>30*6e4?`<span class="stale-dot" title="Checkpoint overdue!"></span>`:!t?.lastCheckpointAt&&t?.startedAt&&Date.now()-new Date(t.startedAt).getTime()>30*6e4?`<span class="stale-dot" title="No checkpoints yet"></span>`:``}`:``}
      </div>
      <div class="center">
        ${v?`${x?`<span class="link-icon" title="${o?`Tab linked to active focus`:`Tab NOT linked to active focus`}" style="font-size:10px;margin-right:3px;opacity:${o?`1`:`0.5`};">${o?`🔗`:`⚡`}</span>`:``}<span class="intent-label" id="intent-label-click" title="Click to mark complete: ${v}">${v}</span>`:`<span class="badge badge-no-intent" id="set-intent-btn" title="Click to set intent">No intent set</span>`}
      </div>
      <div class="right">
        ${E?`<span class="timer timer-down" id="focus-countdown" title="Focus countdown">--:--</span>`:``}
        <button class="bar-btn" id="edit-btn" title="Edit intent / Assign to focus">✏️</button>
        <button class="bar-btn" id="checkpoint-btn" title="Checkpoint — log progress note" style="${t?.lastCheckpointAt&&Date.now()-new Date(t.lastCheckpointAt).getTime()>30*6e4?`color:#ffa726;`:``}">📋</button>
        <button class="bar-btn" id="refresh-btn" title="Refresh InBar state">🔄</button>
        <button class="bar-btn pause-btn" id="pause-btn" title="Pause — leave a note about where you left off">⏸</button>
        <button class="bar-btn note-btn" id="note-btn" title="Add note">📝</button>
        <button class="bar-btn" id="hide-bar" title="Collapse to nub">▾</button>
      </div>
    `};w.innerHTML=O(),g.appendChild(w);let k=document.createElement(`div`);k.className=`notes-panel`,k.innerHTML=`
    <div class="notes-inner">
      <div class="notes-header">
        <span>📝 Quick Note</span>
        <button class="bar-btn" id="close-notes" style="font-size:10px;">✕</button>
      </div>
      <textarea class="notes-textarea" id="note-text" placeholder="Jot a thought about this focus, task, or intent…">${r}</textarea>
      <div class="notes-saved" id="note-saved">✓ Saved</div>
    </div>
  `,g.appendChild(k);let A=document.createElement(`div`);A.className=`edit-dropdown`;let j=()=>(i||[]).filter(e=>e.focusState!==`completed`&&e.funnelStage!==`resolved`).sort((e,t)=>{let n={active:0,paused:1};return(n[e.focusState]??2)-(n[t.focusState]??2)}).map(e=>{let t=e.funnelStage||`unsorted`,n=e.focusState===`active`?`🎯`:e.focusState===`paused`?`⏸`:`📋`;return`<div class="focus-item${e.id===a?` active`:``}" data-focus-id="${e.id}">
        <span>${n} ${e.label}</span>
        <span class="focus-state queued">${t}</span>
      </div>`}).join(``)||`<div style="font-size:10px;color:#555;padding:4px;">No focus items yet</div>`;A.innerHTML=`
    <div class="edit-inner">
      <div class="edit-title">✏️ Edit Intent</div>
      <div class="edit-row">
        <input class="edit-input" id="edit-intent-input" placeholder="Intent for this tab..." value="${v||``}">
        <button class="edit-save" id="edit-intent-save">Save</button>
      </div>
      <textarea class="edit-input" id="edit-intent-desc" placeholder="Description (optional)..." style="width:100%;min-height:36px;resize:vertical;margin-bottom:6px;font-size:10px;">${e?.description||``}</textarea>
      <div class="edit-section">Assign to Focus</div>
      <div id="focus-list" style="max-height:180px;overflow-y:auto;">${j()}</div>
      <button class="new-focus-btn" id="new-focus-btn">+ Create new focus from this tab</button>
    </div>
  `,g.appendChild(A);let M=document.createElement(`div`);M.className=`nub${r?` has-note`:``}${u?` is-paused`:``}`,M.innerHTML=u?`⏸`:`◉`,M.title=u?`Paused — click to expand InBar`:`Show Tabatha InBar`,g.appendChild(M);let N=document.createElement(`div`);N.className=`pause-prompt`,N.innerHTML=`
    <div class="pause-prompt-title">⏸ Where did you leave off?</div>
    <textarea class="pause-prompt-input" id="pause-input" placeholder="e.g. Was debugging line 234, check the race condition…"></textarea>
    <div class="pause-prompt-actions">
      <button class="pause-prompt-btn pause-cancel" id="pause-cancel">Cancel</button>
      <button class="pause-prompt-btn pause-confirm" id="pause-confirm">Pause</button>
    </div>
  `,g.appendChild(N);let P=(Math.random()*6-3).toFixed(1),F=document.createElement(`div`);F.className=`sticky-overlay${u?``:` hidden`}`;let I=e=>e?new Date(e).toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`}):``,L=()=>`
    <div class="sticky-note" style="--tilt: ${P}deg; transform: rotate(${P}deg); animation: stickyDrop 0.4s ease-out;">
      <div class="sticky-tape"></div>
      <div class="sticky-header">
        <span>📌 Paused</span>
        <span class="sticky-time">${p?I(p):``}</span>
      </div>
      <div class="sticky-intent">${b||y||`Current work`}</div>
      <div class="sticky-body" id="sticky-body-text">${f||``}</div>
      <div class="sticky-actions">
        <button class="sticky-edit" id="sticky-edit">✏️ Edit Note</button>
        ${m?`<button class="sticky-resume" id="sticky-new-intent" style="background:#00e5ff;color:#000;">🆕 Start New Intent</button>`:``}
        <button class="sticky-resume" id="sticky-resume">▶ Resume</button>
      </div>
    </div>
  `;F.innerHTML=L(),g.appendChild(F);let R=g.getElementById(`intent-timer`),z=g.getElementById(`task-timer`),B=g.getElementById(`focus-countdown`),V=e=>{let t=Math.floor(Math.abs(e)/1e3),n=Math.floor(t/60),r=t%60,i=Math.floor(n/60),a=n%60;return i>0?`${i}:${String(a).padStart(2,`0`)}:${String(r).padStart(2,`0`)}`:`${String(a).padStart(2,`0`)}:${String(r).padStart(2,`0`)}`},H=()=>{if(c||u)return;let e=Date.now();if(R&&(R.textContent=V(e-T)),z&&(z.textContent=V(D+(e-T))),B&&E){let t=E-e;B.textContent=t>0?V(t):`+`+V(Math.abs(t)),B.style.color=t>0?`#ff6b6b`:`#ff4444`}};H();let ee=setInterval(H,1e3),te=async e=>{try{let t=(await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`}))?.tabId;if(!t)return;let n=(await chrome.storage.local.get(`pausedIntents`)).pausedIntents||{};n[t]={note:e,pausedAt:new Date().toISOString(),intentLabel:b||``,focusLabel:y||``,url:window.location.href},await chrome.storage.local.set({pausedIntents:n})}catch{}},U=async()=>{try{let e=(await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`}))?.tabId;if(!e)return;let t=(await chrome.storage.local.get(`pausedIntents`)).pausedIntents||{};delete t[e],await chrome.storage.local.set({pausedIntents:t})}catch{}},W=()=>{w.innerHTML=O(),w.className=u?`bar paused`:`bar`,M.className=`nub${r?` has-note`:``}${u?` is-paused`:``}`,M.innerHTML=u?`⏸`:`◉`,M.title=u?`Paused — click to expand InBar`:`Show Tabatha InBar`,F.classList.toggle(`hidden`,!u),u&&(F.innerHTML=L()),R=g.getElementById(`intent-timer`),z=g.getElementById(`task-timer`),B=g.getElementById(`focus-countdown`),K()},ne=e=>{u=!0,d=!1,f=e,p=new Date().toISOString(),N.classList.remove(`open`),te(e),W()},G=()=>{u=!1,f=``,p=null,U(),a&&chrome.runtime.sendMessage({type:`RESUME_FOCUS`,focusId:a}).catch(()=>{}),W()},K=()=>{let n=g.getElementById(`hide-bar`);n&&(n.onclick=re);let r=g.getElementById(`note-btn`);r&&(r.onclick=Z);let s=g.getElementById(`set-intent-btn`);s&&(s.onclick=()=>{chrome.runtime.sendMessage({type:`OPEN_POPUP`}).catch(()=>{})});let l=g.getElementById(`pause-btn`);l&&(l.onclick=()=>{if(u)G();else if(d=!d,N.classList.toggle(`open`,d),d){let e=g.getElementById(`pause-input`);e&&e.focus()}});let p=g.getElementById(`resume-inline`);p&&(p.onclick=G);let h=g.getElementById(`sticky-resume`);h&&(h.onclick=G);let _=g.getElementById(`sticky-new-intent`);_&&(_.onclick=()=>{u=!1,m=!1,U(),W(),chrome.runtime.sendMessage({type:`OPEN_POPUP`}).catch(()=>{})});let C=g.getElementById(`sticky-edit`);C&&(C.onclick=()=>{c&&q(),d=!0,N.classList.add(`open`);let e=g.getElementById(`pause-input`);e&&(e.value=f,e.focus())});let M=g.getElementById(`edit-btn`);M&&(M.onclick=()=>{let e=A.classList.contains(`open`);if(k.classList.remove(`open`),N.classList.remove(`open`),A.classList.toggle(`open`,!e),!e){let e=g.getElementById(`edit-intent-input`);e&&e.focus()}});let P=g.getElementById(`checkpoint-btn`);P&&t&&(P.onclick=()=>{$({focusId:t.id||a,label:t.label||y,checkpointCount:(t.checkpoint||[]).length,elapsedMs:t.liveElapsedMs||0,triggeredBy:`inbar_manual`})});let F=g.getElementById(`refresh-btn`);F&&(F.onclick=async()=>{try{let n=await chrome.runtime.sendMessage({type:`GET_INBAR_DATA`});if(!n)return;e=n.tabContext,t=n.activeFocus,i=n.allFocusItems||[],a=n.activeFocusId||null,o=!!n.isTabLinked,n.windowCount,v=e?.context||e?.intent||null,y=t?.label||null,b=v||y||null,x=!!t,S=!!b,t&&(E=t.timerEndAt?new Date(t.timerEndAt).getTime():null,D=t.totalTimeMs||0),T=e?.startedAt?new Date(e.startedAt).getTime():Date.now(),u||(w.innerHTML=O(),R=g.getElementById(`intent-timer`),z=g.getElementById(`task-timer`),B=g.getElementById(`focus-countdown`));let r=g.getElementById(`focus-list`);r&&(r.innerHTML=j()),K()}catch{}});let I=g.getElementById(`edit-intent-save`);I&&(I.onclick=async()=>{let e=g.getElementById(`edit-intent-input`),t=g.getElementById(`edit-intent-desc`),n=e?.value?.trim(),r=t?.value?.trim()||``;if(n)try{await chrome.runtime.sendMessage({type:`SET_INTENT`,payload:{intent:n,description:r}}),v=n,b=n,S=!0,A.classList.remove(`open`),w.innerHTML=O(),R=g.getElementById(`intent-timer`),z=g.getElementById(`task-timer`),B=g.getElementById(`focus-countdown`),K()}catch{}});let L=g.getElementById(`intent-label-click`);L&&(L.onclick=async()=>{if(v&&confirm(`Mark intent "${v}" as resolved?`))try{await chrome.runtime.sendMessage({type:`SET_INTENT`,payload:{intent:`✅ ${v}`,resolved:!0}}),v=null,b=y||null,S=!!b,w.innerHTML=O(),R=g.getElementById(`intent-timer`),z=g.getElementById(`task-timer`),B=g.getElementById(`focus-countdown`),K()}catch{}});let V=g.getElementById(`focus-list`);V&&(V.onclick=async e=>{let t=e.target.closest(`.focus-item`);if(!t)return;let n=t.dataset.focusId;if(n)try{await chrome.runtime.sendMessage({type:`SWITCH_FOCUS`,payload:{focusId:n}}),A.classList.remove(`open`)}catch{}});let H=g.getElementById(`new-focus-btn`);H&&(H.onclick=async()=>{let e=g.getElementById(`edit-intent-input`)?.value?.trim()||b||`New Focus`;try{await chrome.runtime.sendMessage({type:`START_FOCUS`,label:e,timerMinutes:15}),A.classList.remove(`open`)}catch{}})},re=()=>{c=!0,l=!1,d=!1,w.classList.add(`hidden`),k.classList.remove(`open`),N.classList.remove(`open`),A.classList.remove(`open`),_(0),h.style.height=`0`,setTimeout(()=>M.classList.add(`visible`),150)},q=()=>{c=!1,M.classList.remove(`visible`),setTimeout(()=>{w.classList.remove(`hidden`),_(26),h.style.height=`26px`},100)};M.onclick=q;let J=g.getElementById(`note-text`),Y=g.getElementById(`note-saved`),X,Z=()=>{l=!l,k.classList.toggle(`open`,l),_(l?146:26),l&&J.focus()};g.getElementById(`close-notes`).onclick=Z,J.addEventListener(`input`,()=>{clearTimeout(X),X=setTimeout(()=>{let e=J.value;chrome.runtime.sendMessage({type:`SAVE_INBAR_NOTE`,note:e}).then(()=>{Y.classList.add(`show`),M.classList.toggle(`has-note`,!!e);let t=g.getElementById(`note-btn`);t&&(t.style.color=e?`#ffc107`:`#555`),setTimeout(()=>Y.classList.remove(`show`),1500)}).catch(()=>{})},600)}),g.getElementById(`pause-confirm`).onclick=()=>{ne(g.getElementById(`pause-input`)?.value?.trim()||``)},g.getElementById(`pause-cancel`).onclick=()=>{d=!1,N.classList.remove(`open`)},g.getElementById(`pause-input`).onkeydown=e=>{e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),g.getElementById(`pause-confirm`).click())},K();let Q=e=>`background:${e}22;color:${e};border:1px solid ${e}44;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;`;function $({focusId:e,label:t,checkpointCount:n,elapsedMs:r,timerMinutes:i,triggeredBy:a}){let o=document.getElementById(`tabatha-popup-overlay`);o&&o.remove();let s=document.createElement(`div`);s.id=`tabatha-popup-overlay`,s.style.cssText=`position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;`;let c=document.createElement(`div`);c.style.cssText=`background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:24px;max-width:400px;width:90%;color:#eee;text-align:center;box-shadow:0 16px 40px rgba(0,0,0,0.4);`;let l=r?`${Math.floor(r/6e4)}:${String(Math.floor(r%6e4/1e3)).padStart(2,`0`)}`:`--:--`,u=i?`${i}:00`:`--:--`;c.innerHTML=`
      <div style="font-size:24px;margin-bottom:6px;">📋</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:4px;">Progress Check</div>
      <div style="font-size:12px;color:#aaa;margin-bottom:4px;">"${t||`Focus`}" · Elapsed: ${l} · Timer: ${u}</div>
      <div style="font-size:11px;color:#666;margin-bottom:10px;">Checkpoint #${(n||0)+1}</div>
      <textarea id="cpn-text" placeholder="What have you accomplished since your last checkpoint?" style="width:100%;height:56px;background:#111;border:1px solid #444;border-radius:4px;color:#eee;font-size:12px;padding:8px;resize:none;box-sizing:border-box;margin-bottom:10px;"></textarea>
      <div style="font-size:10px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.08em;">Submit with progress level:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:10px;">
        <button data-level="none" style="${Q(`#9e9e9e`)}">😐 None</button>
        <button data-level="little" style="${Q(`#29b6f6`)}">📈 Little</button>
        <button data-level="lot" style="${Q(`#66bb6a`)}">🚀 A Lot</button>
        <button data-level="almost_done" style="${Q(`#ffd54f`)}">🏁 Almost Done</button>
        <button data-level="stuck" style="${Q(`#ef5350`)}">🚧 Stuck</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button id="cpn-snooze" style="${Q(`#78909c`)}font-size:11px;">⏰ Snooze 5 min</button>
        <button id="cpn-skip" style="${Q(`#555`)}font-size:11px;">Skip this time</button>
      </div>`,s.appendChild(c),document.documentElement.appendChild(s),c.querySelectorAll(`[data-level]`).forEach(t=>{t.addEventListener(`click`,async()=>{let n=c.querySelector(`#cpn-text`)?.value||``,r=t.getAttribute(`data-level`);if(r===`stuck`&&!n.trim()){c.querySelector(`#cpn-text`).style.borderColor=`#ef5350`,c.querySelector(`#cpn-text`).placeholder=`Please describe what is blocking you...`;return}await chrome.runtime.sendMessage({type:`SAVE_CHECKPOINT_NOTE`,focusId:e,text:n,progressLevel:r,triggeredBy:a||`auto_prompt`});try{await chrome.runtime.sendMessage({type:`DISMISS_POPUP`})}catch{}s.remove()})}),c.querySelector(`#cpn-snooze`)?.addEventListener(`click`,async()=>{await chrome.runtime.sendMessage({type:`SNOOZE_CHECKPOINT`,focusId:e,snoozeMinutes:5}),s.remove()}),c.querySelector(`#cpn-skip`)?.addEventListener(`click`,()=>{try{chrome.runtime.sendMessage({type:`DISMISS_POPUP`})}catch{}s.remove()})}chrome.runtime.onMessage.addListener(n=>{(n.type===`FOCUS_ENGINE_UPDATED`||n.type===`TAB_UPDATED`||n.type===`INTENT_UPDATED`)&&chrome.runtime.sendMessage({type:`GET_INBAR_DATA`}).then(n=>{if(!n)return;e=n.tabContext,t=n.activeFocus,i=n.allFocusItems||[],a=n.activeFocusId||null,o=!!n.isTabLinked,n.windowCount,v=e?.context||e?.intent||null,y=t?.label||null,b=v||y||null,x=!!t,S=!!b,t&&(E=t.timerEndAt?new Date(t.timerEndAt).getTime():null,D=t.totalTimeMs||0),T=e?.startedAt?new Date(e.startedAt).getTime():Date.now(),u||(w.innerHTML=O(),R=g.getElementById(`intent-timer`),z=g.getElementById(`task-timer`),B=g.getElementById(`focus-countdown`));let r=g.getElementById(`focus-list`);r&&(r.innerHTML=j()),K()}).catch(()=>{});let r=e=>`background:${e}22;color:${e};border:1px solid ${e}44;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;`,s=async(e,t,n)=>{try{await chrome.runtime.sendMessage({type:`DISMISS_POPUP`})}catch{}try{await chrome.runtime.sendMessage({type:t,...n})}catch{}e?.remove()},c=()=>{document.getElementById(`tabatha-popup-overlay`)?.remove()},l=()=>{c();let e=document.createElement(`div`);return e.id=`tabatha-popup-overlay`,Object.assign(e.style,{position:`fixed`,top:`0`,left:`0`,width:`100vw`,height:`100vh`,background:`rgba(0,0,0,0.7)`,zIndex:`2147483647`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontFamily:`'Segoe UI',system-ui,sans-serif`}),e.onclick=t=>{t.target===e&&t.stopPropagation()},e},d=()=>{let e=document.createElement(`div`);return Object.assign(e.style,{background:`#1a1a1a`,border:`1px solid #333`,borderRadius:`8px`,padding:`24px 32px`,maxWidth:`440px`,width:`90vw`,textAlign:`center`,color:`#eee`}),e},f=e=>{let t=Math.floor((e||0)/1e3),n=Math.floor(t/60),r=t%60;return n>0?`${n}m ${r}s`:`${r}s`},p=(e,t,n)=>{e.querySelector(`#fte-extend`)?.addEventListener(`click`,()=>s(t,`EXTEND_FOCUS_TIMER`,{focusId:n,extraMinutes:5})),e.querySelector(`#fte-switch`)?.addEventListener(`click`,async()=>{try{let i=await chrome.runtime.sendMessage({type:`GET_FOCUS_ENGINE`}),a=Object.values(i?.focusEngine?.items||{}).filter(e=>e.id!==n&&e.focusState===`paused`),o=e.querySelector(`#fte-switch-list`);o&&(o.innerHTML=a.length?a.map(e=>`<button data-fid="${e.id}" style="${r(`#29b6f6`)}margin:2px;">${e.label}</button>`).join(``):`<span style="color:#666;font-size:11px;">No other focuses queued.</span>`,o.style.display=`flex`,o.style.flexWrap=`wrap`,o.style.gap=`4px`,o.style.justifyContent=`center`,o.style.marginTop=`6px`,a.forEach(e=>o.querySelector(`[data-fid="${e.id}"]`)?.addEventListener(`click`,()=>s(t,`SWITCH_FOCUS`,{focusId:e.id}))))}catch{}}),e.querySelector(`#fte-pause`)?.addEventListener(`click`,()=>s(t,`PAUSE_FOCUS`,{focusId:n})),e.querySelector(`#fte-break`)?.addEventListener(`click`,()=>s(t,`TOGGLE_BREAK`,{})),e.querySelector(`#fte-done`)?.addEventListener(`click`,()=>s(t,`COMPLETE_FOCUS`,{focusId:n})),e.querySelector(`#fte-note`)?.addEventListener(`click`,()=>{let t=e.querySelector(`#fte-note-area`);t&&(t.style.display=t.style.display===`none`?`block`:`none`)}),e.querySelector(`#fte-note-save`)?.addEventListener(`click`,async()=>{let t=e.querySelector(`#fte-note-input`)?.value||``;t.trim()&&await chrome.runtime.sendMessage({type:`SAVE_CHECKPOINT_NOTE`,focusId:n,text:t,triggeredBy:`inbar`,progressLevel:`lot`});let r=e.querySelector(`#fte-note-area`);r&&(r.style.display=`none`)})},m=()=>`
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px;">
        <button id="fte-extend" style="${r(`#00e5ff`)}">⏱️ +5 min</button>
        <button id="fte-switch" style="${r(`#29b6f6`)}">🔄 Switch</button>
        <button id="fte-pause" style="${r(`#ffa726`)}">⏸ Pause</button>
        <button id="fte-break" style="${r(`#ce93d8`)}">☕ Break</button>
        <button id="fte-done" style="${r(`#66bb6a`)}">✅ Complete</button>
        <button id="fte-note" style="${r(`#78909c`)}">📝 Note</button>
      </div>
      <div id="fte-switch-list"></div>
      <div id="fte-note-area" style="display:none;margin-top:10px;">
        <textarea id="fte-note-input" placeholder="Quick note..." style="width:100%;height:48px;background:#111;border:1px solid #444;border-radius:4px;color:#eee;font-size:12px;padding:6px;resize:none;box-sizing:border-box;"></textarea>
        <button id="fte-note-save" style="${r(`#78909c`)}margin-top:4px;">💾 Save Note</button>
      </div>`;if(n.type===`FOCUS_TIMER_EXPIRED`){if(document.getElementById(`tabatha-popup-overlay`))return;let e=l(),t=d();t.innerHTML=`
        <div style="font-size:32px;margin-bottom:8px;">⏰</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Focus Timer Expired</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:4px;">"${n.label}" — Your allotted ${n.timerMinutes}m is up.</div>
        ${m()}`,e.appendChild(t),document.documentElement.appendChild(e),p(t,e,n.focusId)}if(n.type===`WELCOME_BACK`&&n.pausedFocusId){if(document.getElementById(`tabatha-popup-overlay`))return;let e=l(),t=d();t.innerHTML=`
        <div style="font-size:28px;margin-bottom:8px;">👋</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Welcome Back!</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:6px;">You were away for ${f(n.idleDurationMs)}.</div>
        <div style="font-size:13px;color:#ccc;margin-bottom:16px;">Pick up where you left off?<br><strong style="color:#ff9800;">"${n.pausedFocusLabel}"</strong></div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="wb-resume" style="${r(`#ab47bc`)}">⚡ Resume Focus</button>
          <button id="wb-dismiss" style="${r(`#888`)}">Not now</button>
        </div>`,e.appendChild(t),document.documentElement.appendChild(e),t.querySelector(`#wb-resume`).addEventListener(`click`,()=>s(e,`RESUME_FOCUS`,{focusId:n.pausedFocusId})),t.querySelector(`#wb-dismiss`).addEventListener(`click`,()=>{try{chrome.runtime.sendMessage({type:`DISMISS_POPUP`})}catch{}e.remove()})}if(n.type===`FOCUS_RETURN_COMBO`){c();let e=l(),t=d();t.innerHTML=`
        <div style="font-size:28px;margin-bottom:8px;">👋⏰</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Welcome Back!</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:6px;">You were away for ${f(n.idleDurationMs)}.</div>
        <div style="font-size:13px;color:#ccc;margin-bottom:12px;">The time you gave yourself for <strong style="color:#ff9800;">"${n.focusLabel}"</strong> expired while you were away, how would you like to proceed?</div>
        ${m()}
        <div style="margin-top:10px;">
          <button id="combo-resume" style="${r(`#ab47bc`)}">⚡ Resume Focus</button>
        </div>`,e.appendChild(t),document.documentElement.appendChild(e),p(t,e,n.focusId),t.querySelector(`#combo-resume`)?.addEventListener(`click`,()=>s(e,`RESUME_FOCUS`,{focusId:n.focusId}))}if(n.type===`CHECKPOINT_PROMPT`&&$({focusId:n.focusId,label:n.label||n.focusLabel,checkpointCount:n.checkpointCount,elapsedMs:n.elapsedMs,timerMinutes:n.timerMinutes,triggeredBy:`auto_prompt`}),n.type===`POPUP_DISMISSED`&&c(),n.type===`FOCUS_ENGINE_UPDATED`){let e=document.getElementById(`tabatha-popup-overlay`);e&&chrome.runtime.sendMessage({type:`GET_FOCUS_ENGINE`}).then(t=>{let n=t?.focusEngine;if(n){let t=Object.values(n.items||{}).some(e=>e.focusState===`drifted`),r=n.activeFocusId&&n.items[n.activeFocusId]?.focusState===`paused`;!t&&!r&&e.remove()}}).catch(()=>{})}}),window.addEventListener(`beforeunload`,()=>{clearInterval(ee)})})();