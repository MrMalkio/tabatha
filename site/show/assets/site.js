/* ============================================================
   site.js — shared behaviour for the public Tabatha site.
   Loaded (deferred) by the hub, the 6 category pages, and the
   roadmap. NOT loaded by the 8 surface frames, which are the
   1280x800 Chrome Web Store captures and must stay pristine.

   Three jobs:
     1. SEARCH   — one box in the header on every page, querying
                   a prebuilt static index over every component,
                   section, surface, page and roadmap item.
     2. FEEDBACK — a Report bug / Request feature modal, bound to
                   a specific component when opened from a card.
     3. WIRING   — injects the header controls and the per-card
                   actions, so 90 cards need no per-card markup.

   Progressive enhancement throughout. With JS off, every card
   and every word of copy still renders; only these extras go.
   On file:// the index fetch fails (no same-origin) and search
   degrades to a clear, honest message rather than a dead box.
   ============================================================ */
(function () {
  'use strict';

  var GH_REPO = 'https://github.com/MrMalkio/tabatha';
  var API = '/api/feedback';
  var here = (location.pathname.split('/').pop() || 'index.html');

  /* -------------------------------------------------- helpers */
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  /** Resolve a page-relative URL. Every page sits flat in /showcase. */
  function rel(u) { return u; }

  /* ==========================================================
     1. SEARCH
     ========================================================== */
  var idx = null;         // loaded records
  var idxState = 'idle';  // idle | loading | ready | failed
  var results = [];
  var cursor = 0;

  var sOvl = el('div', 'ovl');
  sOvl.id = 'sx';
  sOvl.setAttribute('role', 'dialog');
  sOvl.setAttribute('aria-modal', 'true');
  sOvl.setAttribute('aria-label', 'Search the site');
  sOvl.innerHTML =
    '<div class="ovl-box" role="combobox" aria-expanded="true" aria-haspopup="listbox" aria-owns="sx-list">' +
      '<div class="sx-top">' +
        '<span class="ic" aria-hidden="true">🔍</span>' +
        '<input id="sx-input" type="text" autocomplete="off" spellcheck="false" ' +
          'placeholder="Search components, surfaces and roadmap…" ' +
          'aria-controls="sx-list" aria-autocomplete="list">' +
        '<span class="sx-esc">esc</span>' +
      '</div>' +
      '<div class="sx-results" id="sx-list" role="listbox" aria-label="Search results"></div>' +
      '<div class="sx-foot">' +
        '<span><b>↑↓</b> navigate</span><span><b>↵</b> open</span>' +
        '<span class="grow"></span><span id="sx-count"></span>' +
      '</div>' +
    '</div>';

  var sInput, sList, sCount;

  function loadIndex() {
    if (idxState === 'loading' || idxState === 'ready') return;
    idxState = 'loading';
    render();
    fetch('search-index.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        idx = (d.records || []).map(function (r) {
          r._hay = (
            r.name + ' ' + (r.purpose || '') + ' ' + (r.keywords || '') + ' ' +
            (r.src || '') + ' ' + (r.category || '') + ' ' + r.type
          ).toLowerCase();
          return r;
        });
        idxState = 'ready';
        query(sInput.value);
      })
      .catch(function () {
        // file:// or a missing index. Say so plainly; do not pretend.
        idxState = 'failed';
        render();
      });
  }

  /** Score a record against tokenised query. All tokens must hit. */
  function score(r, tokens) {
    var s = 0;
    var name = r.name.toLowerCase();
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (r._hay.indexOf(t) === -1) return -1;
      if (name === t) s += 100;
      else if (name.indexOf(t) === 0) s += 50;
      else if (name.indexOf(t) !== -1) s += 25;
      else if ((r.keywords || '').toLowerCase().indexOf(t) !== -1) s += 8;
      else s += 3;
    }
    // Components are the substance of the site; surface them first on ties.
    if (r.type === 'component') s += 6;
    if (r.type === 'surface') s += 4;
    if (r.page === here) s += 2;
    return s;
  }

  function query(q) {
    q = (q || '').trim().toLowerCase();
    if (!q || idxState !== 'ready') { results = []; render(); return; }
    var tokens = q.split(/\s+/);
    results = idx
      .map(function (r) { return { r: r, s: score(r, tokens) }; })
      .filter(function (x) { return x.s >= 0; })
      .sort(function (a, b) { return b.s - a.s || a.r.name.length - b.r.name.length; })
      .slice(0, 40)
      .map(function (x) { return x.r; });
    cursor = 0;
    render();
  }

  function hl(text, q) {
    var out = esc(text);
    if (!q) return out;
    q.trim().split(/\s+/).forEach(function (t) {
      if (t.length < 2) return;
      out = out.replace(
        new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'),
        '<mark>$1</mark>'
      );
    });
    return out;
  }

  function render() {
    if (!sList) return;
    var q = sInput ? sInput.value.trim() : '';

    if (idxState === 'loading') { sList.innerHTML = '<div class="sx-empty">Loading search index…</div>'; sCount.textContent = ''; return; }
    if (idxState === 'failed') {
      sList.innerHTML =
        '<div class="sx-empty">Search needs the site to be served over http.' +
        '<div class="sub">The index cannot be fetched from a local <b>file://</b> page. ' +
        'Browse via the header links, or run a static server from <b>showcase/</b>.</div></div>';
      sCount.textContent = ''; return;
    }
    if (!q) {
      sList.innerHTML = '<div class="sx-empty">Search every component, surface and roadmap item.' +
        '<div class="sub">Try <b>gatekeeper</b>, <b>paused</b>, <b>heatmap</b>, or <b>calendar</b>.</div></div>';
      sCount.textContent = idx ? idx.length + ' indexed' : ''; return;
    }
    if (!results.length) {
      sList.innerHTML = '<div class="sx-empty">No match for “' + esc(q) + '”.' +
        '<div class="sub">Missing something? <button class="lnk" id="sx-req" style="background:none;border:0;color:var(--cyan,#00D2FF);cursor:pointer;font:inherit;text-decoration:underline">Request it as a feature</button>.</div></div>';
      sCount.textContent = '0 results';
      var rq = document.getElementById('sx-req');
      if (rq) rq.addEventListener('click', function () { closeSearch(); openFeedback({ type: 'feature', title: q }); });
      return;
    }

    sList.innerHTML = results.map(function (r, i) {
      var kind = r.type === 'component' ? 'component'
        : r.type === 'roadmap' ? 'roadmap'
        : r.type === 'surface' ? 'surface'
        : r.type === 'section' ? 'section' : 'page';
      var meta = r.type === 'component' ? esc(r.category || '')
        : r.type === 'roadmap' ? 'Roadmap' : '';
      return '<a class="sx-item" role="option" id="sx-o' + i + '" href="' + esc(rel(r.url)) + '"' +
        ' aria-selected="' + (i === cursor ? 'true' : 'false') + '">' +
        '<span class="e" aria-hidden="true">' + esc(r.icon || '•') + '</span>' +
        '<span class="body">' +
          '<span class="t">' + hl(r.name, q) +
            '<span class="sx-kind ' + kind + '">' + kind + '</span>' +
            (meta ? '<span style="font-size:10.5px;color:var(--muted,#7d8894);font-weight:400">' + meta + '</span>' : '') +
          '</span>' +
          (r.purpose ? '<span class="d">' + hl(r.purpose, q) + '</span>' : '') +
        '</span></a>';
    }).join('');
    sCount.textContent = results.length + (results.length === 1 ? ' result' : ' results');
    Array.prototype.forEach.call(sList.children, function (n, i) {
      n.addEventListener('mousemove', function () { if (cursor !== i) { cursor = i; mark(); } });
    });
    mark();
  }

  function mark() {
    Array.prototype.forEach.call(sList.querySelectorAll('.sx-item'), function (n, i) {
      n.setAttribute('aria-selected', i === cursor ? 'true' : 'false');
    });
    var cur = sList.children[cursor];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest' });
    if (cur && sInput) sInput.setAttribute('aria-activedescendant', cur.id);
  }

  var lastFocus = null;
  function openSearch(seed) {
    lastFocus = document.activeElement;
    sOvl.classList.add('open');
    if (seed) sInput.value = seed;
    sInput.focus();
    sInput.select();
    loadIndex();
    render();
  }
  function closeSearch() {
    sOvl.classList.remove('open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ==========================================================
     2. FEEDBACK
     ========================================================== */
  var fOvl = el('div', 'ovl');
  fOvl.id = 'fb';
  fOvl.setAttribute('role', 'dialog');
  fOvl.setAttribute('aria-modal', 'true');
  fOvl.setAttribute('aria-labelledby', 'fb-title');

  var fbCtx = {};
  var whyNudged = false;   // reset per open; see submit()

  function fbShell() {
    fOvl.innerHTML =
      '<div class="ovl-box">' +
        '<form id="fb-form" novalidate>' +
          '<div class="fb-head">' +
            '<span aria-hidden="true">💬</span>' +
            '<h3 id="fb-title">Send feedback</h3>' +
            '<button type="button" class="x" id="fb-x" aria-label="Close">✕</button>' +
          '</div>' +
          '<div class="fb-body">' +
            '<div class="fb-msg err" id="fb-err"></div>' +
            '<div class="fb-row">' +
              '<label id="fb-typelbl">What kind of feedback is this?</label>' +
              '<div class="fb-seg" role="radiogroup" aria-labelledby="fb-typelbl">' +
                '<label id="fb-lab-bug"><input type="radio" name="type" value="bug"><span>🐞 Report a bug</span></label>' +
                '<label id="fb-lab-feature"><input type="radio" name="type" value="feature"><span>✨ Request a feature</span></label>' +
              '</div>' +
            '</div>' +
            '<div class="fb-row" id="fb-comp-row">' +
              '<label for="fb-comp">Component</label>' +
              '<input type="text" id="fb-comp" name="component" autocomplete="off">' +
              '<span class="hint">Prefilled from where you clicked. Edit it if this is about something else.</span>' +
            '</div>' +
            '<div class="fb-row">' +
              '<label for="fb-title-in">Title</label>' +
              '<input type="text" id="fb-title-in" name="title" maxlength="140" required>' +
            '</div>' +
            '<div class="fb-row">' +
              '<label for="fb-desc" id="fb-desclbl">Description</label>' +
              '<textarea id="fb-desc" name="description" maxlength="4000" required></textarea>' +
            '</div>' +
            // Feature-request only. A request without a problem behind it is a
            // proposed solution with nothing to check it against, so this is
            // asked for separately rather than folded into the description.
            '<div class="fb-row" id="fb-why-row">' +
              '<label for="fb-why">Why?</label>' +
              '<textarea id="fb-why" name="why" maxlength="2000" ' +
                'placeholder="What problem does this solve, and what does it cost you today?"></textarea>' +
              '<span class="hint">What are you actually trying to get done, and what is in the way? ' +
                'This is the part that decides whether it gets built.</span>' +
            '</div>' +
            '<div class="fb-row">' +
              '<label for="fb-email">Email <span style="font-weight:400;color:var(--muted,#7d8894)">(optional)</span></label>' +
              '<input type="email" id="fb-email" name="email" placeholder="Only if you want a reply">' +
            '</div>' +
          '</div>' +
          '<div class="fb-foot">' +
            '<span class="note" id="fb-note"></span>' +
            '<span class="grow"></span>' +
            '<button type="button" class="btn" id="fb-cancel">Cancel</button>' +
            '<button type="submit" class="btn primary" id="fb-send">Send</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    document.getElementById('fb-x').addEventListener('click', closeFeedback);
    document.getElementById('fb-cancel').addEventListener('click', closeFeedback);
    Array.prototype.forEach.call(fOvl.querySelectorAll('input[name=type]'), function (r) {
      r.addEventListener('change', paintType);
    });
    document.getElementById('fb-form').addEventListener('submit', submit);
  }

  function paintType() {
    var v = (fOvl.querySelector('input[name=type]:checked') || {}).value;
    var bug = document.getElementById('fb-lab-bug');
    var fea = document.getElementById('fb-lab-feature');
    bug.className = v === 'bug' ? 'on-bug' : '';
    fea.className = v === 'feature' ? 'on-feature' : '';
    document.getElementById('fb-title').textContent = v === 'bug' ? 'Report a bug' : 'Request a feature';
    document.getElementById('fb-desclbl').textContent = v === 'bug'
      ? 'What happened, and what did you expect instead?'
      : 'What would you like it to do?';
    document.getElementById('fb-desc').placeholder = v === 'bug'
      ? 'Steps to reproduce, what you saw, and what you expected.'
      : 'Describe the outcome you are after, not necessarily the solution.';
    // "Why?" belongs to feature requests only. A bug report already carries its
    // own why: it is broken. Toggled rather than always-on so the bug path keeps
    // exactly the fields it had.
    document.getElementById('fb-why-row').style.display = v === 'bug' ? 'none' : '';
  }

  /**
   * @param {{type?:string, component?:string, componentId?:string, title?:string}} ctx
   */
  function openFeedback(ctx) {
    ctx = ctx || {};
    fbCtx = ctx;
    whyNudged = false;
    lastFocus = document.activeElement;
    fbShell();
    var t = ctx.type === 'bug' ? 'bug' : 'feature';
    (fOvl.querySelector('input[name=type][value="' + t + '"]') || {}).checked = true;
    paintType();

    var comp = document.getElementById('fb-comp');
    comp.value = ctx.component || '';
    // No component context (header entry point): the field is still offered,
    // just empty and optional, so a general request needs no invented target.
    document.getElementById('fb-comp-row').style.display = '';
    if (!ctx.component) {
      comp.placeholder = 'Optional. Leave blank for a general request.';
      document.querySelector('#fb-comp-row .hint').textContent =
        'Not tied to a component. Name one if your request is about a specific part of the app.';
    }
    if (ctx.title) document.getElementById('fb-title-in').value = ctx.title;

    document.getElementById('fb-note').textContent = ctx.component ? 'About: ' + ctx.component : '';
    fOvl.classList.add('open');
    (ctx.title ? document.getElementById('fb-desc') : document.getElementById('fb-title-in')).focus();
  }
  function closeFeedback() {
    fOvl.classList.remove('open');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function payload() {
    return {
      type: (fOvl.querySelector('input[name=type]:checked') || {}).value || 'feature',
      component: document.getElementById('fb-comp').value.trim(),
      componentId: fbCtx.componentId || '',
      title: document.getElementById('fb-title-in').value.trim(),
      description: document.getElementById('fb-desc').value.trim(),
      why: document.getElementById('fb-why').value.trim(),
      email: document.getElementById('fb-email').value.trim(),
      page: here,
      url: location.href,
    };
  }

  /** Prefilled GitHub issue URL. The fallback path, and the file:// path. */
  function ghUrl(p) {
    var body = [
      p.description,
      // Kept as its own titled section rather than appended to the description,
      // so it survives as a distinct field once the issue is triaged.
      p.why ? '\n### Why this matters\n\n' + p.why : '',
      '',
      '---',
      p.component ? '- Component: `' + p.component + '`' + (p.componentId ? ' (`#' + p.componentId + '`)' : '') : '',
      '- Page: `' + p.page + '`',
      p.email ? '- Contact: ' + p.email : '',
      '- Sent from the Tabatha site',
    ].filter(Boolean).join('\n');
    return GH_REPO + '/issues/new' +
      '?title=' + encodeURIComponent((p.component ? '[' + p.component + '] ' : '') + p.title) +
      '&body=' + encodeURIComponent(body) +
      '&labels=' + encodeURIComponent(p.type === 'bug' ? 'bug' : 'enhancement');
  }

  function done(p, via) {
    var box = fOvl.querySelector('.ovl-box');
    var gh = ghUrl(p);
    box.innerHTML =
      '<div class="fb-done">' +
        '<div class="e" aria-hidden="true">' + (via === 'api' ? '✅' : '🔗') + '</div>' +
        '<h4>' + (via === 'api' ? 'Thanks. That is logged.' : 'Almost there') + '</h4>' +
        '<p>' + (via === 'api'
          ? 'Your ' + (p.type === 'bug' ? 'bug report' : 'feature request') + ' went straight to the Tabatha backlog.' +
            (p.email ? ' We will reply to ' + esc(p.email) + ' if we need more detail.' : '')
          : 'The direct channel is not available right now, so we have written your report into a GitHub issue for you. ' +
            'It opens prefilled. Press submit there and it lands in the same backlog.') + '</p>' +
        '<div style="margin-top:16px;display:flex;gap:8px;justify-content:center">' +
          (via === 'api' ? '' : '<a class="btn primary" id="fb-gh" href="' + esc(gh) + '" target="_blank" rel="noopener">Open the issue</a>') +
          '<button type="button" class="btn" id="fb-close2">Close</button>' +
        '</div>' +
      '</div>';
    document.getElementById('fb-close2').addEventListener('click', closeFeedback);
    var g = document.getElementById('fb-gh');
    if (g) g.focus();
  }

  function submit(e) {
    e.preventDefault();
    var p = payload();
    var err = document.getElementById('fb-err');
    err.classList.remove('show');

    if (!p.title) { err.textContent = 'A title is required.'; err.classList.add('show'); document.getElementById('fb-title-in').focus(); return; }
    if (!p.description) { err.textContent = 'A description is required.'; err.classList.add('show'); document.getElementById('fb-desc').focus(); return; }
    // "Why?" is required-ish on a feature request: asked for insistently once,
    // then yielded on. A hard block would just teach people to type "because".
    if (p.type === 'feature' && !p.why && !whyNudged) {
      whyNudged = true;
      err.textContent = 'Please say why this matters. A request without a problem behind it is very hard to weigh — but press Send again if you would rather skip it.';
      err.classList.add('show');
      document.getElementById('fb-why').focus();
      return;
    }
    if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) { err.textContent = 'That email address does not look right.'; err.classList.add('show'); document.getElementById('fb-email').focus(); return; }

    var btn = document.getElementById('fb-send');
    btn.disabled = true;
    btn.textContent = 'Sending…';

    // file:// has no origin to POST to; go straight to the fallback.
    if (location.protocol === 'file:') { done(p, 'gh'); return; }

    fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(p),
    })
      .then(function (r) {
        if (r.ok) return done(p, 'api');
        // 501 = backend not configured yet. Anything else = it broke.
        // Either way the user's words are not lost: hand them the issue.
        return done(p, 'gh');
      })
      .catch(function () { done(p, 'gh'); });
  }

  /* ==========================================================
     3. WIRING
     ========================================================== */
  function wireHeader() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var tools = el('div', 'site-tools');

    var sb = el('button', 'searchbtn',
      '<span aria-hidden="true">🔍</span><span class="lbl grow">Search</span><kbd>/</kbd>');
    sb.type = 'button';
    sb.setAttribute('aria-label', 'Search the site');
    sb.addEventListener('click', function () { openSearch(); });

    // The label is wrapped rather than a bare string so it can be dropped on
    // a phone. `white-space: nowrap` on the full text made this button the
    // widest rigid thing in the header, and a flex item that cannot shrink
    // sets a floor under the whole nav: it alone forced the layout viewport
    // to 427px on a 390px screen, on every page of the site.
    var rb = el('button', 'reqbtn',
      '<span aria-hidden="true">✨</span><span class="lbl">Request a feature</span>');
    rb.type = 'button';
    rb.setAttribute('aria-label', 'Request a feature');
    rb.addEventListener('click', function () { openFeedback({ type: 'feature' }); });

    tools.appendChild(sb);
    tools.appendChild(rb);

    // Sit left of the version badge if there is one, else at the end.
    var badge = nav.querySelector('.verbadge');
    if (badge) nav.insertBefore(tools, badge);
    else nav.appendChild(tools);
  }

  /**
   * Collapse the header links into a drawer on narrow viewports.
   *
   * Done here rather than in each page's markup for two reasons: the ten
   * pages carry the same nav with different link sets, and a parallel
   * branch is moving these files, so a CSS+JS-only change keeps that
   * merge to a rename. `.navlinks` is `display: contents` above the
   * breakpoint, so the desktop nav renders exactly as it did.
   */
  function wireNav() {
    var nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('.navtoggle')) return;
    var links = nav.querySelectorAll(':scope > a');
    if (!links.length) return;

    var box = el('div', 'navlinks');
    box.id = 'nav-links';
    // Insert where the first link already sits, so source order (and with
    // `display: contents`, visual order) is unchanged.
    links[0].parentNode.insertBefore(box, links[0]);
    Array.prototype.forEach.call(links, function (a) { box.appendChild(a); });

    var tog = el('button', 'navtoggle', '☰');
    tog.type = 'button';
    tog.setAttribute('aria-label', 'Menu');
    tog.setAttribute('aria-controls', 'nav-links');
    tog.setAttribute('aria-expanded', 'false');

    function setOpen(open) {
      box.classList.toggle('open', open);
      tog.setAttribute('aria-expanded', open ? 'true' : 'false');
      tog.innerHTML = open ? '✕' : '☰';
    }
    tog.addEventListener('click', function () {
      setOpen(tog.getAttribute('aria-expanded') !== 'true');
    });
    // Following a link inside the drawer must not leave it hanging open
    // behind an in-page anchor jump, which does not reload the page.
    box.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && tog.getAttribute('aria-expanded') === 'true') {
        setOpen(false); tog.focus();
      }
    });

    nav.appendChild(tog);
  }

  /** Give all 90 cards their actions without touching 90 blocks of markup. */
  function wireCards() {
    var cards = document.querySelectorAll('.libcard[id]');
    Array.prototype.forEach.call(cards, function (card) {
      if (card.querySelector('.cardfb')) return;
      var nameEl = card.querySelector('.libcap .t');
      var name = nameEl ? nameEl.textContent.trim() : card.id;
      var ctx = { component: name, componentId: card.id };

      var wrap = el('div', 'cardfb');
      var bug = el('button', 'bug', '🐞 Bug');
      bug.type = 'button';
      bug.title = 'Report a bug in ' + name;
      bug.setAttribute('aria-label', 'Report a bug in ' + name);
      bug.addEventListener('click', function () { openFeedback({ type: 'bug', component: ctx.component, componentId: ctx.componentId }); });

      var fea = el('button', null, '✨ Request');
      fea.type = 'button';
      fea.title = 'Request a feature for ' + name;
      fea.setAttribute('aria-label', 'Request a feature for ' + name);
      fea.addEventListener('click', function () { openFeedback({ type: 'feature', component: ctx.component, componentId: ctx.componentId }); });

      wrap.appendChild(bug);
      wrap.appendChild(fea);
      card.appendChild(wrap);
    });
  }

  /**
   * The companion download panel's CTA used to file an access request because
   * there was no artifact to link. As of the desktop-v0.2.0 release the CTA is
   * a real <a download> pointing at the GitHub release asset, so there is no
   * button to wire. Kept as a guarded no-op in case the panel reverts.
   */
  function wireDownload() {
    var btn = document.getElementById('dl-req');
    if (!btn) return;
    btn.addEventListener('click', function () {
      openFeedback({
        type: 'feature',
        component: 'Desktop Companion',
        componentId: 'get',
        title: 'Request access to the desktop companion (v0.2.0, Windows)',
      });
    });
  }

  function isTyping(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  function wireKeys() {
    document.addEventListener('keydown', function (e) {
      // "/" focuses search from anywhere you are not already typing.
      if (e.key === '/' && !isTyping(e.target) && !sOvl.classList.contains('open') && !fOvl.classList.contains('open')) {
        e.preventDefault(); openSearch(); return;
      }
      if (e.key === 'Escape') {
        if (sOvl.classList.contains('open')) { e.preventDefault(); closeSearch(); }
        else if (fOvl.classList.contains('open')) { e.preventDefault(); closeFeedback(); }
        return;
      }
      if (!sOvl.classList.contains('open')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (results.length) { cursor = (cursor + 1) % results.length; mark(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (results.length) { cursor = (cursor - 1 + results.length) % results.length; mark(); } }
      else if (e.key === 'Enter') {
        var cur = sList.children[cursor];
        if (cur && cur.href) { e.preventDefault(); location.href = cur.getAttribute('href'); }
      }
    });

    // Click the backdrop (not the panel) to dismiss.
    [sOvl, fOvl].forEach(function (o) {
      o.addEventListener('mousedown', function (e) {
        if (e.target === o) (o === sOvl ? closeSearch : closeFeedback)();
      });
    });
  }

  function init() {
    document.body.appendChild(sOvl);
    document.body.appendChild(fOvl);
    sInput = document.getElementById('sx-input');
    sList = document.getElementById('sx-list');
    sCount = document.getElementById('sx-count');
    sInput.addEventListener('input', function () { query(sInput.value); });
    sOvl.querySelector('.sx-esc').addEventListener('click', closeSearch);

    wireHeader();
    wireNav();
    wireCards();
    wireDownload();
    wireKeys();

    // Deep link: #component-id lands you on the card, highlighted, so a
    // search result arrives at something visibly picked out.
    if (location.hash.length > 1) {
      var target = document.getElementById(location.hash.slice(1));
      if (target && target.classList.contains('libcard')) {
        target.style.borderColor = 'rgba(0,210,255,.5)';
      }
    }
  }

  // Expose the one entry point other pages (roadmap cards) reuse.
  window.TabathaSite = { feedback: openFeedback, search: openSearch };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
