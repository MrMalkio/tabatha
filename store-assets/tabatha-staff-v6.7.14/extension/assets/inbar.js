function e(e,t={},n=`unknown`){let r=t?.enabled===!0,i=t?.output||{},a=i.enabled===!0,o={preTone:i.toneBeforeSpeak!==!1,micPreOpenMs:Number.isFinite(i.micPreOpenMs)?Math.max(0,i.micPreOpenMs):0,fallbackToModal:i.modalFallback!==!1};if(!r||!a)return{mode:`modal`,...o};let s=i.perModalType?.[e];return s===`silent`?{mode:`silent`,...o}:s===`modal`||!(n===`present`||n===!0)?{mode:`modal`,...o}:{mode:`speak`,...o}}function t(e){let t=e?.focusLabel||e?.label;return t?`"${String(t).trim()}"`:`your focus`}var n={"focus-timer-expired":[e=>`Heads up — the time you set for ${t(e)} is up. Keep going or wrap up?`,e=>`That's your timer on ${t(e)}. Want to push on, or call it?`,e=>`Time's up on ${t(e)}. What would you like to do next?`,e=>`Your focus timer just ran out on ${t(e)}. Still in it?`],"checkpoint-prompt":[e=>`Quick check-in on ${t(e)} — how's it coming along?`,e=>`Good moment for a checkpoint on ${t(e)}. Where are you at?`,e=>`Mind noting your progress on ${t(e)}?`],"drift-detected":[e=>`Looks like you've drifted from ${t(e)}. Still on it?`,e=>`You've wandered off ${t(e)} for a bit — is that intentional?`,e=>`Noticed some side tabs. Are you still working on ${t(e)}?`],"welcome-back":[e=>`Welcome back. Want to pick up ${t(e)} where you left off?`,e=>`Good to see you again — ready to resume ${t(e)}?`,e=>`Back at it? ${t(e)} is right where you left it.`],"idle-pause":[e=>`Things went quiet — are you still on ${t(e)}?`,e=>`You there? I can pause ${t(e)} if you stepped away.`,e=>`It's been quiet for a while. Keep ${t(e)} running?`]},r=[()=>`Got a moment? There's something I'd flag.`,()=>`Quick heads-up when you have a second.`,()=>`I've got a nudge for you whenever you're ready.`];function i(e,t={}){let i=n[e]||r,a=Number.isFinite(t.seed)?Math.abs(Math.floor(t.seed)):0;return i[i.length?a%i.length:0](t)}var a=[`hold off`,`not now`,`later`,`stop`,`wait`,`hold on`];function o(){return typeof window<`u`}function s(){return new Promise(e=>{try{let t=o()&&(window.AudioContext||window.webkitAudioContext);if(!t)return e(!1);let n=new t,r=n.createOscillator(),i=n.createGain(),a=n.currentTime;r.type=`sine`,r.frequency.setValueAtTime(660,a),r.frequency.exponentialRampToValueAtTime(880,a+.18),i.gain.setValueAtTime(1e-4,a),i.gain.exponentialRampToValueAtTime(.06,a+.03),i.gain.exponentialRampToValueAtTime(1e-4,a+.2),r.connect(i).connect(n.destination),r.start(a),r.stop(a+.22),r.onended=()=>{try{n.close()}catch{}e(!0)},setTimeout(()=>e(!0),400)}catch{e(!1)}})}function c(e,t={}){return new Promise(n=>{try{let r=o()&&window.speechSynthesis,i=o()&&window.SpeechSynthesisUtterance;if(!r||!i||!e)return n({spoke:!1});let a=new i(String(e));a.rate=t.rate??.98,a.pitch=t.pitch??1,a.volume=t.volume??.85,a.lang=t.lang??`en-US`;let s=!1,c=e=>{s||(s=!0,n({spoke:e}))};a.onend=()=>c(!0),a.onerror=()=>c(!1),r.speak(a),setTimeout(()=>c(!0),Math.min(12e3,2500+String(e).length*90))}catch{n({spoke:!1})}})}function l(e=1500){return new Promise(t=>{let n=null,r=!1,i=(e,i=``)=>{if(!r){r=!0;try{n&&n.stop()}catch{}t({heard:e,transcript:i})}};try{let r=o()&&(window.SpeechRecognition||window.webkitSpeechRecognition);if(!r||!e||e<=0)return t({heard:`none`,transcript:``});n=new r,n.continuous=!1,n.interimResults=!0,n.lang=`en-US`,n.onresult=e=>{let t=``;for(let n=e.resultIndex;n<e.results.length;n++)t+=e.results[n][0].transcript;let n=t.toLowerCase();a.some(e=>n.includes(e))&&i(`hold-off`,t.trim())},n.onerror=()=>i(`none`),n.onend=()=>i(`none`),n.start(),setTimeout(()=>i(`none`),e)}catch{t({heard:`none`,transcript:``})}})}async function u({modalType:t,context:n={},voiceSettings:r={},presence:a=`unknown`,onProceedModal:o=()=>{},onHoldOff:u=()=>{}}={}){let d=()=>{try{o()}catch{}},f=()=>{try{u()}catch{}};try{let o=e(t,r,a);if(o.mode===`modal`)return d(),{mode:`modal`};if(o.mode===`silent`)return{mode:`silent`};if(o.preTone&&await s(),o.micPreOpenMs>0){let{heard:e}=await l(o.micPreOpenMs);if(e===`hold-off`)return await c(`Ok, I'll come back later.`,{rate:1}),f(),{mode:`speak`,heldOff:!0}}let{spoke:u}=await c(i(t,{seed:Date.now(),...n}));return d(),{mode:`speak`,spoke:u}}catch{return d(),{mode:`modal`,spoke:!1}}}(async()=>{let e,t,n,r=``,i=[],a=null,o=!1;try{let s=await chrome.runtime.sendMessage({type:`GET_INBAR_DATA`});if(!s||!s.show)return;e=s.tabContext,t=s.activeFocus,n=s.settings||{},i=s.allFocusItems||[],a=s.activeFocusId||null,o=!!s.isTabLinked,s.windowCount,r=(await chrome.runtime.sendMessage({type:`GET_INBAR_NOTES`}))?.note||``}catch{return}let s=n.inbarPosition||`bottom`;if(document.body||await new Promise(e=>{let t=new MutationObserver(()=>{document.body&&(t.disconnect(),e())});t.observe(document.documentElement,{childList:!0}),setTimeout(()=>{t.disconnect(),e()},3e3)}),!document.body)return;let c=!1,l=!1,d=!1,f=!1,p=``,m=null,h=!1;try{let e=(await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`}))?.tabId;if(e){let t=(await chrome.storage.local.get(`pausedIntents`)).pausedIntents||{},n=t[e];if(n)d=!0,p=n.note||``,m=n.pausedAt;else{let n=window.location.href.split(`#`)[0];for(let[r,i]of Object.entries(t))if(r!==String(e)&&i.url&&i.url.split(`#`)[0]===n&&i.note){d=!0,p=i.note||``,m=i.pausedAt,h=!0;break}}}}catch{}let g=!1,_=null;try{let e=((await chrome.runtime.sendMessage({type:`LIST_AGENT_SESSIONS`}))?.open||[]).filter(e=>e.scope===`machine`||e.scope===`window`);e.length&&(g=!0,_=(e.find(e=>e.scope===`machine`)||e[e.length-1]).id)}catch{}let v=()=>`bar${d?` paused`:``}${g?` agent-mode`:``}`,y=document.createElement(`div`);y.id=`tabatha-inbar-host`,Object.assign(y.style,{position:`fixed`,[s]:`0`,left:`0`,width:`100vw`,height:`26px`,zIndex:`2147483646`,pointerEvents:`none`,transition:`height 0.2s ease`});let b=y.attachShadow({mode:`closed`});document.documentElement.appendChild(y),[`keydown`,`keyup`,`keypress`].forEach(e=>{y.addEventListener(e,e=>{e.stopPropagation()},!0)});let x=e=>{document.body.style.setProperty(`transition`,`margin 0.2s ease`,`important`),e>0?document.body.style.setProperty(`transform`,`translateZ(0)`,`important`):document.body.style.removeProperty(`transform`),s===`bottom`?document.body.style.setProperty(`margin-bottom`,`${e}px`,`important`):document.body.style.setProperty(`margin-top`,`${e}px`,`important`)};x(26);let S=e?.context||e?.intent||null,C=t?.label||null,w=S||C||null,T=!!t,E=!!w,D=document.createElement(`style`);D.textContent=`
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
    /* C11a agent-mode (violet — distinct from cyan focus / red no-intent / amber pause) */
    .badge-agent { background: #7c4dff1f; color: #b388ff; border: 1px solid #7c4dff55; padding: 2px 8px; font-size: 9px; }
    .bar.agent-mode { border-color: rgba(124,77,255,0.4); box-shadow: inset 0 0 0 1px rgba(124,77,255,0.14); }
    .bar-btn.agent-btn { color: #888; }
    .bar-btn.agent-btn:hover { color: #b388ff; background: rgba(124,77,255,0.12); }
    .bar-btn.agent-btn.is-agent { color: #b388ff; }
    .nub.is-agent { color: #b388ff; border-color: #7c4dff66; }
    .nub.is-agent:hover { box-shadow: 0 0 8px rgba(124,77,255,0.35); }

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


    /* Backburner Alert Notification Card */

    .backburner-alert-card {
      position: fixed;
      top: 24px;
      right: 24px;
      width: 320px;
      background: rgba(21, 9, 11, 0.95);
      border: 1px solid #ff5252;
      border-radius: 8px;
      box-shadow: 0 4px 24px rgba(255, 82, 82, 0.35);
      padding: 12px 14px;
      pointer-events: auto;
      backdrop-filter: blur(12px);
      z-index: 2147483647;
      animation: alertSlideIn 0.3s ease-out;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .backburner-alert-card.hidden { display: none; }
    @keyframes alertSlideIn {
      from { transform: translateX(120%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .backburner-alert-card-title {
      font-weight: 700;
      color: #ff5252;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .backburner-alert-card-focus {
      font-size: 12px;
      font-weight: 600;
      color: #eee;
    }
    .backburner-alert-card-reason {
      font-size: 10px;
      color: #aaa;
      font-style: italic;
      background: rgba(255, 82, 82, 0.05);
      padding: 6px 8px;
      border-left: 2px solid #ff525255;
      border-radius: 2px;
    }
    .backburner-alert-card-actions {
      display: flex;
      gap: 6px;
      justify-content: flex-end;
    }
    .backburner-alert-card-btn {
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
    }
    .backburner-alert-switch { background: #ff5252; color: #fff; }
    .backburner-alert-switch:hover { background: #ff7b7b; }
    .backburner-alert-snooze { background: #333; color: #eee; }
    .backburner-alert-snooze:hover { background: #444; }
    .backburner-alert-dismiss { background: none; color: #888; border: 1px solid rgba(255,255,255,0.1); }
    .backburner-alert-dismiss:hover { color: #eee; background: rgba(255,255,255,0.05); }

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

    /* === BACKBURNER === */
    .bar-btn#backburner-btn { color: #888; }
    .bar-btn#backburner-btn:hover { color: #ff5252; background: rgba(255,82,82,0.1); }
    .backburner-prompt {
      position: absolute;
      ${s===`bottom`?`bottom`:`top`}: 26px;
      right: 80px;
      width: 320px;
      background: #1a0a0d;
      border: 1px solid rgba(255,82,82,0.25);
      border-radius: 8px;
      box-shadow: 0 -4px 20px rgba(0,0,0,0.6);
      padding: 12px 14px;
      pointer-events: auto;
      transform: scaleY(0);
      transform-origin: ${s===`bottom`?`bottom`:`top`};
      transition: transform 0.2s ease;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 2147483647;
    }
    .backburner-prompt.open { transform: scaleY(1); }
    .backburner-prompt-title { font-size: 10px; font-weight: 700; color: #ff5252; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
    .backburner-prompt-input { width: 100%; background: #0f0507; border: 1px solid rgba(255,82,82,0.2); border-radius: 4px; color: #eee; font-family: inherit; font-size: 11px; padding: 6px 8px; resize: none; outline: none; height: 38px; line-height: 1.4; box-sizing: border-box; }
    .backburner-prompt-input:focus { border-color: #ff5252aa; }
    .backburner-prompt-select { width: 100%; background: #0f0507; border: 1px solid rgba(255,82,82,0.2); border-radius: 4px; color: #eee; font-family: inherit; font-size: 11px; padding: 5px 8px; outline: none; box-sizing: border-box; }
    .backburner-prompt-actions { display: flex; gap: 6px; justify-content: flex-end; margin-top: 4px; }
    .backburner-prompt-btn { padding: 4px 12px; border-radius: 4px; font-size: 10px; font-weight: 600; cursor: pointer; border: none; transition: all 0.15s; }
    .backburner-confirm { background: #ff5252; color: #fff; }
    .backburner-confirm:hover { background: #ff7b7b; }
    .backburner-cancel { background: #333; color: #aaa; }
    .backburner-cancel:hover { background: #444; }

    @keyframes stickyDrop { from { opacity: 0; transform: rotate(var(--tilt)) translateY(-30px) scale(0.9); } to { opacity: 1; transform: rotate(var(--tilt)) translateY(0) scale(1); } }
  `,b.appendChild(D);let O=document.createElement(`div`);O.className=v();let k=e?.startedAt?new Date(e.startedAt).getTime():Date.now(),A=t?.timerEndAt?new Date(t.timerEndAt).getTime():null,j=t?.totalTimeMs||0,M=()=>{if(d){let e=p?`"${p.slice(0,40)}${p.length>40?`…`:``}"`:``;return`
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
        ${E||T?`
          <span class="timer timer-up" id="intent-timer" title="Time on current intent">00:00</span>
          <span class="divider"></span>
          <span class="timer timer-task" id="task-timer" title="Total time on related task">00:00</span>
        `:`
          <span style="font-size:10px;color:#555;">—</span>
        `}
        ${C?`<span class="divider"></span><span class="badge badge-focus">🎯</span><span class="focus-label-left" title="Active focus: ${C}">${C}</span>${t?.lastCheckpointAt&&Date.now()-new Date(t.lastCheckpointAt).getTime()>30*6e4?`<span class="stale-dot" title="Checkpoint overdue!"></span>`:!t?.lastCheckpointAt&&t?.startedAt&&Date.now()-new Date(t.startedAt).getTime()>30*6e4?`<span class="stale-dot" title="No checkpoints yet"></span>`:``}`:``}
      </div>
      <div class="center">
        ${g?`<span class="badge badge-agent" title="An agent is driving — not you">🤖 AGENT</span>`:``}
        ${S?`${T?`<span class="link-icon" title="${o?`Tab linked to active focus`:`Tab NOT linked to active focus`}" style="font-size:10px;margin-right:3px;opacity:${o?`1`:`0.5`};">${o?`🔗`:`⚡`}</span>`:``}<span class="intent-label" id="intent-label-click" title="Click to mark complete: ${S}">${S}</span>`:`<span class="badge badge-no-intent" id="set-intent-btn" title="Click to set intent">No intent set</span>`}
      </div>
      <div class="right">
        ${t?.letMeCook?`<span style="font-size:12px;margin-right:6px;" title="Let Me Cook Mode is active">🍳</span>`:``}
        ${A?`<span class="timer timer-down" id="focus-countdown" title="Focus countdown">--:--</span>`:``}
        <button class="bar-btn agent-btn${g?` is-agent`:``}" id="agent-btn" title="${g?`Agent is driving — click to hand control back to you`:`Mark this session as agent-driven`}">🤖</button>
        <button class="bar-btn" id="edit-btn" title="Edit intent / Assign to focus">✏️</button>
        <button class="bar-btn" id="checkpoint-btn" title="Checkpoint — log progress note" style="${t?.lastCheckpointAt&&Date.now()-new Date(t.lastCheckpointAt).getTime()>30*6e4?`color:#ffa726;`:``}">📋</button>
        <button class="bar-btn" id="refresh-btn" title="Refresh InBar state">🔄</button>
        <button class="bar-btn" id="backburner-btn" title="Backburner — put focus aside while waiting for something" style="${t?``:`display:none;`}">🔥</button>
        <button class="bar-btn pause-btn" id="pause-btn" title="Pause — leave a note about where you left off">⏸</button>
        <button class="bar-btn note-btn" id="note-btn" title="Add note">📝</button>
        <button class="bar-btn" id="hide-bar" title="Collapse to nub">▾</button>
      </div>
    `};O.innerHTML=M(),b.appendChild(O);let N=document.createElement(`div`);N.className=`notes-panel`,N.innerHTML=`
    <div class="notes-inner">
      <div class="notes-header">
        <span>📝 Quick Note</span>
        <button class="bar-btn" id="close-notes" style="font-size:10px;">✕</button>
      </div>
      <textarea class="notes-textarea" id="note-text" placeholder="Jot a thought about this focus, task, or intent…">${r}</textarea>
      <div class="notes-saved" id="note-saved">✓ Saved</div>
    </div>
  `,b.appendChild(N);let P=document.createElement(`div`);P.className=`edit-dropdown`;let ee=()=>(i||[]).filter(e=>e.focusState!==`completed`&&e.funnelStage!==`resolved`).sort((e,t)=>{let n={active:0,paused:1};return(n[e.focusState]??2)-(n[t.focusState]??2)}).map(e=>{let t=e.funnelStage||`unsorted`,n=e.focusState===`active`?`🎯`:e.focusState===`paused`?`⏸`:`📋`;return`<div class="focus-item${e.id===a?` active`:``}" data-focus-id="${e.id}">
        <span>${n} ${e.label}</span>
        <span class="focus-state queued">${t}</span>
      </div>`}).join(``)||`<div style="font-size:10px;color:#555;padding:4px;">No focus items yet</div>`;P.innerHTML=`
    <div class="edit-inner">
      <div class="edit-title">✏️ Edit Intent</div>
      <div class="edit-row">
        <input class="edit-input" id="edit-intent-input" placeholder="Intent for this tab..." value="${S||``}">
        <button class="edit-save" id="edit-intent-save">Save</button>
      </div>
      <textarea class="edit-input" id="edit-intent-desc" placeholder="Description (optional)..." style="width:100%;min-height:36px;resize:vertical;margin-bottom:6px;font-size:10px;">${e?.description||``}</textarea>
      <div class="edit-section">Assign to Focus</div>
      <div id="focus-list" style="max-height:180px;overflow-y:auto;">${ee()}</div>
      <button class="new-focus-btn" id="new-focus-btn">+ Create new focus from this tab</button>
    </div>
  `,b.appendChild(P);let F=document.createElement(`div`);F.className=`nub${r?` has-note`:``}${d?` is-paused`:``}${g?` is-agent`:``}`,F.innerHTML=d?`⏸`:`◉`,F.title=d?`Paused — click to expand InBar`:`Show Tabatha InBar`,b.appendChild(F);let I=document.createElement(`div`);I.className=`pause-prompt`,I.innerHTML=`
    <div class="pause-prompt-title">⏸ Where did you leave off?</div>
    <textarea class="pause-prompt-input" id="pause-input" placeholder="e.g. Was debugging line 234, check the race condition…"></textarea>
    <div class="pause-prompt-actions">
      <button class="pause-prompt-btn pause-cancel" id="pause-cancel">Cancel</button>
      <button class="pause-prompt-btn pause-confirm" id="pause-confirm">Pause</button>
    </div>
  `,b.appendChild(I);let L=document.createElement(`div`);L.className=`backburner-prompt`,L.innerHTML=`
    <div class="backburner-prompt-title">🔥 Backburner: "${C||`Current focus`}"</div>
    <div style="font-size: 9px; color: #888; margin-bottom: 2px;">Put this aside while waiting. We'll remind you to return.</div>
    <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 4px;">
      <span style="font-size: 10px; color: #aaa;">Duration:</span>
      <input type="number" id="backburner-duration" value="15" min="1" max="1440" style="width: 50px; background: #0f0507; border: 1px solid rgba(255,82,82,0.2); border-radius: 4px; color: #eee; font-size: 11px; padding: 3px 6px; text-align: center;">
      <span style="font-size: 10px; color: #aaa;">mins</span>
    </div>
    <textarea class="backburner-prompt-input" id="backburner-reason" placeholder="What are you waiting for? (e.g. test suite to pass)"></textarea>
    <div style="height: 1px; background: rgba(255,82,82,0.15); margin: 4px 0;"></div>
    <div style="font-size: 9px; color: #ff5252aa; font-weight: 600; text-transform: uppercase; margin-bottom: 2px;">What will you work on instead?</div>
    <select class="backburner-prompt-select" id="backburner-switch-select">${(()=>{let e=(i||[]).filter(e=>e.id!==a&&e.focusState!==`completed`&&e.funnelStage!==`resolved`),t=`<option value="">-- Switch to existing Focus --</option>`;return e.forEach(e=>{t+=`<option value="${e.id}">🎯 ${e.label}</option>`}),t})()}</select>
    <div style="font-size: 9px; color: #666; text-align: center; margin: 4px 0;">— OR CREATE NEW —</div>
    <input type="text" class="backburner-prompt-input" id="backburner-new-focus" placeholder="Create a new temporary focus..." style="height: 28px;">
    <div class="backburner-prompt-actions">
      <button class="backburner-prompt-btn backburner-cancel" id="backburner-cancel">Cancel</button>
      <button class="backburner-prompt-btn backburner-confirm" id="backburner-confirm">Backburner</button>
    </div>
  `,b.appendChild(L);let R=(Math.random()*6-3).toFixed(1),z=document.createElement(`div`);z.className=`sticky-overlay${d?``:` hidden`}`;let te=e=>e?new Date(e).toLocaleTimeString([],{hour:`2-digit`,minute:`2-digit`}):``,B=()=>`
    <div class="sticky-note" style="--tilt: ${R}deg; transform: rotate(${R}deg); animation: stickyDrop 0.4s ease-out;">
      <div class="sticky-tape"></div>
      <div class="sticky-header">
        <span>📌 Paused</span>
        <span class="sticky-time">${m?te(m):``}</span>
      </div>
      <div class="sticky-intent">${w||C||`Current work`}</div>
      <div class="sticky-body" id="sticky-body-text">${p||``}</div>
      <div class="sticky-actions">
        <button class="sticky-edit" id="sticky-edit">✏️ Edit Note</button>
        ${h?`<button class="sticky-resume" id="sticky-new-intent" style="background:#00e5ff;color:#000;">🆕 Start New Intent</button>`:``}
        <button class="sticky-resume" id="sticky-resume">▶ Resume</button>
      </div>
    </div>
  `;z.innerHTML=B(),b.appendChild(z);let V=document.createElement(`div`),H=(i||[]).find(e=>e.backburnered&&e.backburnerExpired);V.className=`backburner-alert-card${H?``:` hidden`}`;let U=e=>e?`
      <div class="backburner-alert-card-title">🔥 Backburner Expired</div>
      <div class="backburner-alert-card-focus">🎯 ${e.label}</div>
      ${e.backburnerReason?`<div class="backburner-alert-card-reason">Waiting for: "${e.backburnerReason}"</div>`:``}
      <div class="backburner-alert-card-actions">
        <button class="backburner-alert-card-btn backburner-alert-dismiss" id="backburner-alert-dismiss" data-focus-id="${e.id}">Dismiss</button>
        <button class="backburner-alert-card-btn backburner-alert-snooze" id="backburner-alert-snooze" data-focus-id="${e.id}">Snooze 10m</button>
        <button class="backburner-alert-card-btn backburner-alert-switch" id="backburner-alert-switch" data-focus-id="${e.id}">Resume Focus</button>
      </div>
    `:``;V.innerHTML=U(H),b.appendChild(V);let W=b.getElementById(`intent-timer`),G=b.getElementById(`task-timer`),K=b.getElementById(`focus-countdown`),q=e=>{let t=Math.floor(Math.abs(e)/1e3),n=Math.floor(t/60),r=t%60,i=Math.floor(n/60),a=n%60;return i>0?`${i}:${String(a).padStart(2,`0`)}:${String(r).padStart(2,`0`)}`:`${String(a).padStart(2,`0`)}:${String(r).padStart(2,`0`)}`},J=()=>{if(c||d)return;let e=Date.now();if(W&&(W.textContent=q(e-k)),G&&(G.textContent=q(j+(e-k))),K&&A){let t=A-e;K.textContent=t>0?q(t):`+`+q(Math.abs(t)),K.style.color=t>0?`#ff6b6b`:`#ff4444`}};J();let ne=setInterval(J,1e3),re=async e=>{try{let t=(await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`}))?.tabId;if(!t)return;let n=(await chrome.storage.local.get(`pausedIntents`)).pausedIntents||{};n[t]={note:e,pausedAt:new Date().toISOString(),intentLabel:w||``,focusLabel:C||``,url:window.location.href},await chrome.storage.local.set({pausedIntents:n})}catch{}},ie=async()=>{try{let e=(await chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`}))?.tabId;if(!e)return;let t=(await chrome.storage.local.get(`pausedIntents`)).pausedIntents||{};delete t[e],await chrome.storage.local.set({pausedIntents:t})}catch{}},ae=()=>{O.innerHTML=M(),O.className=v(),F.className=`nub${r?` has-note`:``}${d?` is-paused`:``}${g?` is-agent`:``}`,F.innerHTML=d?`⏸`:`◉`,F.title=d?`Paused — click to expand InBar`:`Show Tabatha InBar`,z.classList.toggle(`hidden`,!d),d&&(z.innerHTML=B());let e=(i||[]).find(e=>e.backburnered&&e.backburnerExpired);e?(V.innerHTML=U(e),V.classList.remove(`hidden`)):V.classList.add(`hidden`),W=b.getElementById(`intent-timer`),G=b.getElementById(`task-timer`),K=b.getElementById(`focus-countdown`),Y()},oe=e=>{d=!0,f=!1,p=e,m=new Date().toISOString(),I.classList.remove(`open`),re(e),ae()},se=()=>{d=!1,p=``,m=null,ie(),a&&chrome.runtime.sendMessage({type:`RESUME_FOCUS`,focusId:a}).catch(()=>{}),ae()},Y=()=>{let n=b.getElementById(`hide-bar`);n&&(n.onclick=ce);let s=b.getElementById(`note-btn`);s&&(s.onclick=ue);let l=b.getElementById(`set-intent-btn`);l&&(l.onclick=()=>{chrome.runtime.sendMessage({type:`OPEN_POPUP`}).catch(()=>{})});let u=b.getElementById(`pause-btn`);u&&(u.onclick=()=>{if(d)se();else if(f=!f,I.classList.toggle(`open`,f),f){let e=b.getElementById(`pause-input`);e&&e.focus()}});let m=b.getElementById(`agent-btn`);m&&(m.onclick=async()=>{try{if(g)await chrome.runtime.sendMessage({type:`END_AGENT_SESSION`,id:_,scope:`machine`}),g=!1,_=null;else{let e=await chrome.runtime.sendMessage({type:`START_AGENT_SESSION`,scope:`machine`,agentName:`manual`,source:`manual`});e?.session&&(g=!0,_=e.session.id)}d||(O.innerHTML=M(),W=b.getElementById(`intent-timer`),G=b.getElementById(`task-timer`),K=b.getElementById(`focus-countdown`)),O.className=v(),F.className=`nub${r?` has-note`:``}${d?` is-paused`:``}${g?` is-agent`:``}`,Y()}catch{}});let y=b.getElementById(`resume-inline`);y&&(y.onclick=se);let x=b.getElementById(`sticky-resume`);x&&(x.onclick=se);let D=b.getElementById(`sticky-new-intent`);D&&(D.onclick=()=>{d=!1,h=!1,ie(),ae(),chrome.runtime.sendMessage({type:`OPEN_POPUP`}).catch(()=>{})});let R=b.getElementById(`sticky-edit`);R&&(R.onclick=()=>{c&&le(),f=!0,I.classList.add(`open`);let e=b.getElementById(`pause-input`);e&&(e.value=p,e.focus())});let z=b.getElementById(`edit-btn`);z&&(z.onclick=()=>{let e=P.classList.contains(`open`);if(N.classList.remove(`open`),I.classList.remove(`open`),P.classList.toggle(`open`,!e),!e){let e=b.getElementById(`edit-intent-input`);e&&e.focus()}});let te=b.getElementById(`checkpoint-btn`);te&&t&&(te.onclick=()=>{de({focusId:t.id||a,label:t.label||C,checkpointCount:(t.checkpoint||[]).length,elapsedMs:t.liveElapsedMs||0,triggeredBy:`inbar_manual`})});let B=b.getElementById(`refresh-btn`);B&&(B.onclick=async()=>{try{let n=await chrome.runtime.sendMessage({type:`GET_INBAR_DATA`});if(!n)return;e=n.tabContext,t=n.activeFocus,i=n.allFocusItems||[],a=n.activeFocusId||null,o=!!n.isTabLinked,n.windowCount,S=e?.context||e?.intent||null,C=t?.label||null,w=S||C||null,T=!!t,E=!!w,t&&(A=t.timerEndAt?new Date(t.timerEndAt).getTime():null,j=t.totalTimeMs||0),k=e?.startedAt?new Date(e.startedAt).getTime():Date.now(),d||(O.innerHTML=M(),W=b.getElementById(`intent-timer`),G=b.getElementById(`task-timer`),K=b.getElementById(`focus-countdown`));let r=b.getElementById(`focus-list`);r&&(r.innerHTML=ee());let s=(i||[]).find(e=>e.backburnered&&e.backburnerExpired);s?(V.innerHTML=U(s),V.classList.remove(`hidden`)):V.classList.add(`hidden`),Y()}catch{}});let H=b.getElementById(`edit-intent-save`);H&&(H.onclick=async()=>{let e=b.getElementById(`edit-intent-input`),t=b.getElementById(`edit-intent-desc`),n=e?.value?.trim(),r=t?.value?.trim()||``;if(n)try{await chrome.runtime.sendMessage({type:`SET_INTENT`,payload:{intent:n,description:r}}),S=n,w=n,E=!0,P.classList.remove(`open`),O.innerHTML=M(),W=b.getElementById(`intent-timer`),G=b.getElementById(`task-timer`),K=b.getElementById(`focus-countdown`),Y()}catch{}});let q=b.getElementById(`intent-label-click`);q&&(q.onclick=async()=>{if(S&&confirm(`Mark intent "${S}" as resolved?`))try{await chrome.runtime.sendMessage({type:`SET_INTENT`,payload:{intent:`✅ ${S}`,resolved:!0}}),S=null,w=C||null,E=!!w,O.innerHTML=M(),W=b.getElementById(`intent-timer`),G=b.getElementById(`task-timer`),K=b.getElementById(`focus-countdown`),Y()}catch{}});let J=b.getElementById(`focus-list`);J&&(J.onclick=async e=>{let t=e.target.closest(`.focus-item`);if(!t)return;let n=t.dataset.focusId;if(n)try{await chrome.runtime.sendMessage({type:`SWITCH_FOCUS`,focusId:n}),P.classList.remove(`open`)}catch{}});let ne=b.getElementById(`new-focus-btn`);ne&&(ne.onclick=async()=>{let e=b.getElementById(`edit-intent-input`)?.value?.trim()||w||`New Focus`;try{await chrome.runtime.sendMessage({type:`START_FOCUS`,label:e,timerMinutes:15}),P.classList.remove(`open`)}catch{}});let re=b.getElementById(`backburner-btn`);re&&(re.onclick=()=>{let e=L.classList.contains(`open`);if(N.classList.remove(`open`),I.classList.remove(`open`),P.classList.remove(`open`),L.classList.toggle(`open`,!e),!e){let e=b.getElementById(`backburner-reason`);e&&e.focus()}});let oe=b.getElementById(`backburner-cancel`);oe&&(oe.onclick=()=>{L.classList.remove(`open`)});let X=b.getElementById(`backburner-confirm`);X&&(X.onclick=async()=>{let e=Number(b.getElementById(`backburner-duration`)?.value||15),t=b.getElementById(`backburner-reason`)?.value?.trim()||``,n=b.getElementById(`backburner-switch-select`),r=n?n.value:``,i=b.getElementById(`backburner-new-focus`)?.value?.trim()||``;try{await chrome.runtime.sendMessage({type:`BACKBURNER_FOCUS`,focusId:a,durationMinutes:e,reason:t,switchToFocusId:r,createNewFocusLabel:i}),L.classList.remove(`open`);let n=b.getElementById(`refresh-btn`);n&&n.click()}catch{}});let Z=b.getElementById(`backburner-alert-dismiss`);Z&&(Z.onclick=async()=>{let e=Z.dataset.focusId;try{await chrome.runtime.sendMessage({type:`DISMISS_BACKBURNER`,focusId:e}),V.classList.add(`hidden`);let t=b.getElementById(`refresh-btn`);t&&t.click()}catch{}});let Q=b.getElementById(`backburner-alert-snooze`);Q&&(Q.onclick=async()=>{let e=Q.dataset.focusId;try{await chrome.runtime.sendMessage({type:`SNOOZE_BACKBURNER`,focusId:e}),V.classList.add(`hidden`);let t=b.getElementById(`refresh-btn`);t&&t.click()}catch{}});let $=b.getElementById(`backburner-alert-switch`);$&&($.onclick=async()=>{let e=$.dataset.focusId;try{await chrome.runtime.sendMessage({type:`RESUME_BACKBURNER`,focusId:e}),V.classList.add(`hidden`);let t=b.getElementById(`refresh-btn`);t&&t.click()}catch{}})},ce=()=>{c=!0,l=!1,f=!1,O.classList.add(`hidden`),N.classList.remove(`open`),I.classList.remove(`open`),P.classList.remove(`open`),x(0),y.style.height=`0`,setTimeout(()=>F.classList.add(`visible`),150)},le=()=>{c=!1,F.classList.remove(`visible`),setTimeout(()=>{O.classList.remove(`hidden`),x(26),y.style.height=`26px`},100)};F.onclick=le;let X=b.getElementById(`note-text`),Z=b.getElementById(`note-saved`),Q,ue=()=>{l=!l,N.classList.toggle(`open`,l),x(l?146:26),l&&X.focus()};b.getElementById(`close-notes`).onclick=ue,X.addEventListener(`input`,()=>{clearTimeout(Q),Q=setTimeout(()=>{let e=X.value;chrome.runtime.sendMessage({type:`SAVE_INBAR_NOTE`,note:e}).then(()=>{Z.classList.add(`show`),F.classList.toggle(`has-note`,!!e);let t=b.getElementById(`note-btn`);t&&(t.style.color=e?`#ffc107`:`#555`),setTimeout(()=>Z.classList.remove(`show`),1500)}).catch(()=>{})},600)}),b.getElementById(`pause-confirm`).onclick=()=>{oe(b.getElementById(`pause-input`)?.value?.trim()||``)},b.getElementById(`pause-cancel`).onclick=()=>{f=!1,I.classList.remove(`open`)},b.getElementById(`pause-input`).onkeydown=e=>{e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),b.getElementById(`pause-confirm`).click())},Y();let $=e=>`background:${e}22;color:${e};border:1px solid ${e}44;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;`;function de({focusId:e,label:t,checkpointCount:n,elapsedMs:r,timerMinutes:i,triggeredBy:a}){let o=document.getElementById(`tabatha-popup-overlay`);o&&o.remove();let s=document.createElement(`div`);s.id=`tabatha-popup-overlay`,s.style.cssText=`position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif;`;let c=document.createElement(`div`);c.style.cssText=`background:#1a1a1a;border:1px solid #333;border-radius:12px;padding:24px;max-width:400px;width:90%;color:#eee;text-align:center;box-shadow:0 16px 40px rgba(0,0,0,0.4);`;let l=r?`${Math.floor(r/6e4)}:${String(Math.floor(r%6e4/1e3)).padStart(2,`0`)}`:`--:--`,u=i?`${i}:00`:`--:--`;c.innerHTML=`
      <div style="font-size:24px;margin-bottom:6px;">📋</div>
      <div style="font-size:15px;font-weight:600;margin-bottom:4px;">Progress Check</div>
      <div style="font-size:12px;color:#aaa;margin-bottom:4px;">"${t||`Focus`}" · Elapsed: ${l} · Timer: ${u}</div>
      <div style="font-size:11px;color:#666;margin-bottom:10px;">Checkpoint #${(n||0)+1}</div>
      <textarea id="cpn-text" placeholder="What have you accomplished since your last checkpoint?" style="width:100%;height:56px;background:#111;border:1px solid #444;border-radius:4px;color:#eee;font-size:12px;padding:8px;resize:none;box-sizing:border-box;margin-bottom:10px;"></textarea>
      <div style="font-size:10px;color:#888;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.08em;">Submit with progress level:</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin-bottom:10px;">
        <button data-level="none" style="${$(`#9e9e9e`)}">😐 None</button>
        <button data-level="little" style="${$(`#29b6f6`)}">📈 Little</button>
        <button data-level="lot" style="${$(`#66bb6a`)}">🚀 A Lot</button>
        <button data-level="almost_done" style="${$(`#ffd54f`)}">🏁 Almost Done</button>
        <button data-level="stuck" style="${$(`#ef5350`)}">🚧 Stuck</button>
      </div>
      <div style="display:flex;gap:8px;justify-content:center;">
        <button id="cpn-snooze" style="${$(`#78909c`)}font-size:11px;">⏰ Snooze 5 min</button>
        <button id="cpn-skip" style="${$(`#555`)}font-size:11px;">Skip this time</button>
      </div>`,s.appendChild(c),document.documentElement.appendChild(s),c.querySelectorAll(`[data-level]`).forEach(t=>{t.addEventListener(`click`,async()=>{let n=c.querySelector(`#cpn-text`)?.value||``,r=t.getAttribute(`data-level`);if(r===`stuck`&&!n.trim()){c.querySelector(`#cpn-text`).style.borderColor=`#ef5350`,c.querySelector(`#cpn-text`).placeholder=`Please describe what is blocking you...`;return}await chrome.runtime.sendMessage({type:`SAVE_CHECKPOINT_NOTE`,focusId:e,text:n,progressLevel:r,triggeredBy:a||`auto_prompt`});try{await chrome.runtime.sendMessage({type:`DISMISS_POPUP`})}catch{}s.remove()})}),c.querySelector(`#cpn-snooze`)?.addEventListener(`click`,async()=>{await chrome.runtime.sendMessage({type:`SNOOZE_CHECKPOINT`,focusId:e,snoozeMinutes:5}),s.remove()}),c.querySelector(`#cpn-skip`)?.addEventListener(`click`,()=>{try{chrome.runtime.sendMessage({type:`DISMISS_POPUP`})}catch{}s.remove()})}chrome.runtime.onMessage.addListener(r=>{(r.type===`FOCUS_ENGINE_UPDATED`||r.type===`TAB_UPDATED`||r.type===`INTENT_UPDATED`||r.type===`BACKBURNER_ALERT`)&&chrome.runtime.sendMessage({type:`GET_INBAR_DATA`}).then(n=>{if(!n)return;e=n.tabContext,t=n.activeFocus,i=n.allFocusItems||[],a=n.activeFocusId||null,o=!!n.isTabLinked,n.windowCount,S=e?.context||e?.intent||null,C=t?.label||null,w=S||C||null,T=!!t,E=!!w,t&&(A=t.timerEndAt?new Date(t.timerEndAt).getTime():null,j=t.totalTimeMs||0),k=e?.startedAt?new Date(e.startedAt).getTime():Date.now(),d||(O.innerHTML=M(),W=b.getElementById(`intent-timer`),G=b.getElementById(`task-timer`),K=b.getElementById(`focus-countdown`));let r=b.getElementById(`focus-list`);r&&(r.innerHTML=ee());let s=(i||[]).find(e=>e.backburnered&&e.backburnerExpired);s?(V.innerHTML=U(s),V.classList.remove(`hidden`)):V.classList.add(`hidden`),Y()}).catch(()=>{});let s=e=>`background:${e}22;color:${e};border:1px solid ${e}44;border-radius:6px;padding:8px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;`,c=async(e,t,n)=>{try{await chrome.runtime.sendMessage({type:`DISMISS_POPUP`})}catch{}try{await chrome.runtime.sendMessage({type:t,...n})}catch{}e?.remove()},l=()=>{document.getElementById(`tabatha-popup-overlay`)?.remove()},f=()=>{l();let e=document.createElement(`div`);return e.id=`tabatha-popup-overlay`,Object.assign(e.style,{position:`fixed`,top:`0`,left:`0`,width:`100vw`,height:`100vh`,background:`rgba(0,0,0,0.7)`,zIndex:`2147483647`,display:`flex`,alignItems:`center`,justifyContent:`center`,fontFamily:`'Segoe UI',system-ui,sans-serif`}),e.onclick=t=>{t.target===e&&t.stopPropagation()},e},p=()=>{let e=document.createElement(`div`);return Object.assign(e.style,{background:`#1a1a1a`,border:`1px solid #333`,borderRadius:`8px`,padding:`24px 32px`,maxWidth:`440px`,width:`90vw`,textAlign:`center`,color:`#eee`}),e},m=e=>{document.getElementById(`tabatha-autofocus-chip`)?.remove();let t=document.createElement(`div`);t.id=`tabatha-autofocus-chip`,Object.assign(t.style,{position:`fixed`,bottom:`16px`,right:`16px`,zIndex:`2147483646`,background:`#1a1a1a`,border:`1px solid #ab47bc66`,borderRadius:`10px`,padding:`10px 12px`,maxWidth:`320px`,boxShadow:`0 6px 24px rgba(0,0,0,0.4)`,fontFamily:`'Segoe UI',system-ui,sans-serif`,color:`#eee`,display:`flex`,alignItems:`center`,gap:`10px`,transition:`opacity 0.4s ease`,opacity:`0`}),t.innerHTML=`<span style="font-size:16px;">⚡</span>
        <div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.label||`Set a focus?`}</div><div style="font-size:10px;color:#888;">Suggested focus</div></div>
        <button id="afc-accept" style="${s(`#66bb6a`)}padding:4px 10px;">Set</button>
        <button id="afc-dismiss" style="background:transparent;border:none;color:#888;font-size:14px;cursor:pointer;line-height:1;">✕</button>`,document.documentElement.appendChild(t),requestAnimationFrame(()=>{t.style.opacity=`1`});let n=setTimeout(()=>{t.style.opacity=`0`,setTimeout(()=>t.remove(),400)},2e4),r=()=>clearTimeout(n);t.addEventListener(`mouseenter`,r),t.querySelector(`#afc-accept`)?.addEventListener(`click`,async()=>{r();try{await chrome.runtime.sendMessage({type:`ACCEPT_AUTO_FOCUS`,label:e.label})}catch{}t.remove()}),t.querySelector(`#afc-dismiss`)?.addEventListener(`click`,async()=>{r();try{await chrome.runtime.sendMessage({type:`DISMISS_AUTO_FOCUS`,domain:e.domain})}catch{}t.remove()})},h=e=>{let t=Math.floor((e||0)/1e3),n=Math.floor(t/60),r=t%60;return n>0?`${n}m ${r}s`:`${r}s`},g=()=>!!(n?.voice?.enabled&&n?.voice?.output?.enabled),_=()=>document.visibilityState===`visible`&&document.hasFocus()?`present`:`unknown`,v=(e,t,{onProceedModal:r,onHoldOff:i=()=>{}})=>{if(!g()){r();return}try{u({modalType:e,context:t,voiceSettings:n.voice,presence:_(),onProceedModal:r,onHoldOff:i})}catch{r()}},y=(e,t,n)=>{e.querySelector(`#fte-extend-custom`)?.addEventListener(`click`,()=>{c(t,`EXTEND_FOCUS_TIMER`,{focusId:n,extraMinutes:Number(e.querySelector(`#fte-snooze-custom-val`)?.value||5)})}),e.querySelector(`#fte-cook`)?.addEventListener(`click`,()=>c(t,`LET_ME_COOK`,{focusId:n})),e.querySelector(`#fte-switch`)?.addEventListener(`click`,async()=>{try{let r=await chrome.runtime.sendMessage({type:`GET_FOCUS_ENGINE`}),i=Object.values(r?.focusEngine?.items||{}).filter(e=>e.id!==n&&e.focusState===`paused`),a=e.querySelector(`#fte-switch-list`);a&&(a.innerHTML=i.length?i.map(e=>`<button data-fid="${e.id}" style="${s(`#29b6f6`)}margin:2px;">${e.label}</button>`).join(``):`<span style="color:#666;font-size:11px;">No other focuses queued.</span>`,a.style.display=`flex`,a.style.flexWrap=`wrap`,a.style.gap=`4px`,a.style.justifyContent=`center`,a.style.marginTop=`6px`,i.forEach(e=>a.querySelector(`[data-fid="${e.id}"]`)?.addEventListener(`click`,()=>c(t,`SWITCH_FOCUS`,{focusId:e.id}))))}catch{}}),e.querySelector(`#fte-pause`)?.addEventListener(`click`,()=>c(t,`PAUSE_FOCUS`,{focusId:n})),e.querySelector(`#fte-break`)?.addEventListener(`click`,()=>c(t,`TOGGLE_BREAK`,{})),e.querySelector(`#fte-done`)?.addEventListener(`click`,()=>c(t,`COMPLETE_FOCUS`,{focusId:n})),e.querySelector(`#fte-note`)?.addEventListener(`click`,()=>{let t=e.querySelector(`#fte-note-area`);t&&(t.style.display=t.style.display===`none`?`block`:`none`)}),e.querySelector(`#fte-note-save`)?.addEventListener(`click`,async()=>{let t=e.querySelector(`#fte-note-input`)?.value||``;t.trim()&&await chrome.runtime.sendMessage({type:`SAVE_CHECKPOINT_NOTE`,focusId:n,text:t,triggeredBy:`inbar`,progressLevel:`lot`});let r=e.querySelector(`#fte-note-area`);r&&(r.style.display=`none`)})},x=()=>`
      <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px;align-items:center;">
        <div style="display:flex;align-items:center;gap:4px;background:rgba(255,255,255,0.05);padding:4px 8px;border-radius:6px;border:1px solid #444;height:32px;box-sizing:border-box;">
          <input type="number" id="fte-snooze-custom-val" value="5" min="1" max="180" style="width:32px;background:#111;color:#eee;border:1px solid #555;border-radius:4px;font-size:11px;text-align:center;padding:2px 0;border:none;">
          <button id="fte-extend-custom" style="background:#00e5ff22;color:#00e5ff;border:1px solid #00e5ff44;border-radius:4px;padding:2px 6px;font-size:11px;font-weight:600;cursor:pointer;">⏱️ Snooze</button>
        </div>
        <button id="fte-cook" style="${s(`#ffd54f`)}">🍳 Let Me Cook</button>
        <button id="fte-switch" style="${s(`#29b6f6`)}">🔄 Switch</button>
        <button id="fte-pause" style="${s(`#ffa726`)}">⏸ Pause</button>
        <button id="fte-break" style="${s(`#ce93d8`)}">☕ Break</button>
        <button id="fte-done" style="${s(`#66bb6a`)}">✅ Complete</button>
        <button id="fte-note" style="${s(`#78909c`)}">📝 Note</button>
      </div>
      <div id="fte-switch-list"></div>
      <div id="fte-note-area" style="display:none;margin-top:10px;">
        <textarea id="fte-note-input" placeholder="Quick note..." style="width:100%;height:48px;background:#111;border:1px solid #444;border-radius:4px;color:#eee;font-size:12px;padding:6px;resize:none;box-sizing:border-box;"></textarea>
        <button id="fte-note-save" style="${s(`#78909c`)}margin-top:4px;">💾 Save Note</button>
      </div>`;if(r.type===`FOCUS_TIMER_EXPIRED`){if(document.getElementById(`tabatha-popup-overlay`))return;v(`focus-timer-expired`,{focusLabel:r.label,timerMinutes:r.timerMinutes},{onProceedModal:()=>{if(document.getElementById(`tabatha-popup-overlay`))return;let e=f(),t=p();t.innerHTML=`
          <div style="font-size:32px;margin-bottom:8px;">⏰</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Focus Timer Expired</div>
          <div style="font-size:13px;color:#aaa;margin-bottom:4px;">"${r.label}" — Your allotted ${r.timerMinutes}m is up.</div>
          ${x()}`,e.appendChild(t),document.documentElement.appendChild(e),y(t,e,r.focusId)},onHoldOff:()=>{try{chrome.runtime.sendMessage({type:`DISMISS_POPUP`})}catch{}try{chrome.runtime.sendMessage({type:`EXTEND_FOCUS_TIMER`,focusId:r.focusId,extraMinutes:5})}catch{}}})}if(r.type===`WELCOME_BACK`&&r.pausedFocusId){if(document.getElementById(`tabatha-popup-overlay`))return;let e=f(),t=p();t.innerHTML=`
        <div style="font-size:28px;margin-bottom:8px;">👋</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Welcome Back!</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:6px;">You were away for ${h(r.idleDurationMs)}.</div>
        <div style="font-size:13px;color:#ccc;margin-bottom:16px;">Pick up where you left off?<br><strong style="color:#ff9800;">"${r.pausedFocusLabel}"</strong></div>
        <div style="display:flex;gap:12px;justify-content:center;">
          <button id="wb-resume" style="${s(`#ab47bc`)}">⚡ Resume Focus</button>
          <button id="wb-dismiss" style="${s(`#888`)}">Not now</button>
        </div>`,e.appendChild(t),document.documentElement.appendChild(e),t.querySelector(`#wb-resume`).addEventListener(`click`,()=>c(e,`RESUME_FOCUS`,{focusId:r.pausedFocusId})),t.querySelector(`#wb-dismiss`).addEventListener(`click`,()=>{try{chrome.runtime.sendMessage({type:`DISMISS_POPUP`})}catch{}e.remove()})}if(r.type===`FOCUS_RETURN_COMBO`){l();let e=f(),t=p();t.innerHTML=`
        <div style="font-size:28px;margin-bottom:8px;">👋⏰</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Welcome Back!</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:6px;">You were away for ${h(r.idleDurationMs)}.</div>
        <div style="font-size:13px;color:#ccc;margin-bottom:12px;">The time you gave yourself for <strong style="color:#ff9800;">"${r.focusLabel}"</strong> expired while you were away, how would you like to proceed?</div>
        ${x()}
        <div style="margin-top:10px;">
          <button id="combo-resume" style="${s(`#ab47bc`)}">⚡ Resume Focus</button>
        </div>`,e.appendChild(t),document.documentElement.appendChild(e),y(t,e,r.focusId),t.querySelector(`#combo-resume`)?.addEventListener(`click`,()=>c(e,`RESUME_FOCUS`,{focusId:r.focusId}))}if(r.type===`CHECKPOINT_PROMPT`&&de({focusId:r.focusId,label:r.label||r.focusLabel,checkpointCount:r.checkpointCount,elapsedMs:r.elapsedMs,timerMinutes:r.timerMinutes,triggeredBy:`auto_prompt`}),r.type===`BACKBURNER_ALERT`){if(document.getElementById(`tabatha-popup-overlay`))return;let e=f(),t=p(),n=r.backburneredAt?Math.floor((Date.now()-new Date(r.backburneredAt).getTime())/6e4):`?`;t.innerHTML=`
        <div style="font-size:32px;margin-bottom:8px;">🔥</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;color:#ff9800;">Backburner Check-in</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:4px;">"<strong style="color:#ff9800;">${r.label||`Backburnered Focus`}</strong>" has been on the backburner for ${n}m.</div>
        <div style="font-size:12px;color:#888;margin-bottom:12px;">Would you like to come back to it?</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
          <button id="bb-resume" style="${s(`#66bb6a`)}">▶ Resume</button>
          <button id="bb-snooze" style="${s(`#ffa726`)}">⏰ Snooze 10m</button>
          <button id="bb-dismiss" style="${s(`#ef5350`)}">✕ Dismiss</button>
        </div>`,e.appendChild(t),document.documentElement.appendChild(e),t.querySelector(`#bb-resume`)?.addEventListener(`click`,()=>c(e,`RESUME_BACKBURNER`,{focusId:r.focusId})),t.querySelector(`#bb-snooze`)?.addEventListener(`click`,()=>c(e,`SNOOZE_BACKBURNER`,{focusId:r.focusId,snoozeMinutes:10})),t.querySelector(`#bb-dismiss`)?.addEventListener(`click`,()=>c(e,`DISMISS_BACKBURNER`,{focusId:r.focusId}))}if(r.type===`IDLE_PROMPT`){if(document.getElementById(`tabatha-popup-overlay`))return;let e=f(),t=p(),n=r.source===`gap`,i=Math.round((r.gapMs||0)/6e4),a=r.trimmed?`Tabatha was offline for ~${i}m while <strong style="color:#ff9800;">"${r.focusLabel||`your focus`}"</strong> was running.<br>Its timer was paused back at the gap start — were you still working?`:`Tabatha was offline for ~${i}m while <strong style="color:#ff9800;">"${r.focusLabel||`your focus`}"</strong> was running.<br>You looked active off-Chrome, so the timer kept running — sound right?`;t.innerHTML=`
        <div style="font-size:30px;margin-bottom:8px;">${n?`👋`:`💤`}</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:4px;">${n?`Welcome back!`:`Still on task?`}</div>
        <div style="font-size:13px;color:#aaa;margin-bottom:14px;">${n?a:`Chrome's been quiet, but you might still be working on<br><strong style="color:#ff9800;">"${r.focusLabel||`your focus`}"</strong>`}</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
          <button id="idle-ontask" style="${s(`#66bb6a`)}">${n?r.trimmed?`✅ I kept working — credit it`:`✅ Yes, keep the time`:`✅ Yes, on task`}</button>
          <button id="idle-diverged" style="${s(`#ffa726`)}">↪ I diverged</button>
          <button id="idle-pause" style="${s(`#888`)}">${n&&r.trimmed?`⏸ Keep it paused`:`⏸ Pause focus`}</button>
        </div>`,e.appendChild(t),document.documentElement.appendChild(e);let o=t=>c(e,`IDLE_PROMPT_RESPONSE`,{focusId:r.focusId,response:t});t.querySelector(`#idle-ontask`)?.addEventListener(`click`,()=>o(`on_task`)),t.querySelector(`#idle-diverged`)?.addEventListener(`click`,()=>o(`diverged`)),t.querySelector(`#idle-pause`)?.addEventListener(`click`,()=>o(`pause`))}if(r.type===`IDLE_PROMPT_RESOLVED`&&r.resolution===`timeout`&&l(),r.type===`FOCUS_DRIFT_DETECTED`){if(document.getElementById(`tabatha-popup-overlay`))return;v(`drift-detected`,{focusLabel:r.focusLabel},{onProceedModal:()=>{if(document.getElementById(`tabatha-popup-overlay`))return;let e=f(),t=p();t.innerHTML=`
          <div style="font-size:30px;margin-bottom:8px;">🧭</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:4px;">Drifting off?</div>
          <div style="font-size:13px;color:#aaa;margin-bottom:14px;">You've been on unrelated tabs for a bit while focused on<br><strong style="color:#ff9800;">"${r.focusLabel||`your focus`}"</strong></div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
            <button id="drift-still" style="${s(`#66bb6a`)}">✅ Still working on it</button>
            <button id="drift-switch" style="${s(`#ab47bc`)}">🔀 Switching tasks</button>
            <button id="drift-checking" style="${s(`#888`)}">👀 Just checking</button>
          </div>`,e.appendChild(t),document.documentElement.appendChild(e);let n=null;chrome.runtime.sendMessage({type:`GET_CURRENT_TAB_ID`}).then(e=>{n=e?.tabId??null}).catch(()=>{});let i=t=>c(e,`FOCUS_DRIFT_RESPONSE`,{focusId:r.focusId,response:t,tabId:n});t.querySelector(`#drift-still`)?.addEventListener(`click`,()=>i(`still_working`)),t.querySelector(`#drift-switch`)?.addEventListener(`click`,()=>i(`switching`)),t.querySelector(`#drift-checking`)?.addEventListener(`click`,()=>i(`just_checking`))},onHoldOff:()=>{try{chrome.runtime.sendMessage({type:`DISMISS_POPUP`})}catch{}try{chrome.runtime.sendMessage({type:`FOCUS_DRIFT_RESPONSE`,focusId:r.focusId,response:`just_checking`})}catch{}}})}if(r.type===`AUTO_FOCUS_SUGGESTED`&&m(r),r.type===`AUTO_FOCUS_DISMISSED`&&document.getElementById(`tabatha-autofocus-chip`)?.remove(),r.type===`POPUP_DISMISSED`&&l(),r.type===`FOCUS_ENGINE_UPDATED`){let e=document.getElementById(`tabatha-popup-overlay`);e&&chrome.runtime.sendMessage({type:`GET_FOCUS_ENGINE`}).then(t=>{let n=t?.focusEngine;if(n){let t=Object.values(n.items||{}).some(e=>e.focusState===`drifted`),r=n.activeFocusId&&n.items[n.activeFocusId]?.focusState===`paused`;!t&&!r&&e.remove()}}).catch(()=>{})}}),window.addEventListener(`beforeunload`,()=>{clearInterval(ne)})})();