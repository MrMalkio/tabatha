/* ============================================================
   docs.js — search + nav for the /docs help section.

   A trimmed sibling of ../show/assets/site.js: same overlay markup,
   same CSS classes (.ovl, .sx- result rows, .searchbtn, .navlinks), same keyboard
   contract ("/" to open, arrows to move, Enter to go, Esc to close)
   — so switching between /show and /docs never feels like switching
   sites. What's dropped: the feedback modal and per-card actions,
   which are a /show concept (bug/feature against a component); a
   guide isn't a component, so there's nothing here to file a bug
   against yet.

   The one real difference: this fetches `docs-search-index.json`,
   a SEPARATE index from /show's, so /show's card count and this
   section's guide count never bleed into each other.
   ============================================================ */
(function () {
  'use strict';

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

  var idx = null;
  var idxState = 'idle';
  var results = [];
  var cursor = 0;

  var sOvl = el('div', 'ovl');
  sOvl.id = 'dx';
  sOvl.setAttribute('role', 'dialog');
  sOvl.setAttribute('aria-modal', 'true');
  sOvl.setAttribute('aria-label', 'Search the docs');
  sOvl.innerHTML =
    '<div class="ovl-box" role="combobox" aria-expanded="true" aria-haspopup="listbox" aria-owns="dx-list">' +
      '<div class="sx-top">' +
        '<span class="ic" aria-hidden="true">🔍</span>' +
        '<input id="dx-input" type="text" autocomplete="off" spellcheck="false" ' +
          'placeholder="Search guides, steps and settings…" ' +
          'aria-controls="dx-list" aria-autocomplete="list">' +
        '<span class="sx-esc">esc</span>' +
      '</div>' +
      '<div class="sx-results" id="dx-list" role="listbox" aria-label="Search results"></div>' +
      '<div class="sx-foot">' +
        '<span><b>↑↓</b> navigate</span><span><b>↵</b> open</span>' +
        '<span class="grow"></span><span id="dx-count"></span>' +
      '</div>' +
    '</div>';

  var sInput, sList, sCount;

  function loadIndex() {
    if (idxState === 'loading' || idxState === 'ready') return;
    idxState = 'loading';
    render();
    fetch('docs-search-index.json', { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        idx = (d.records || []).map(function (r) {
          r._hay = (r.name + ' ' + (r.purpose || '') + ' ' + (r.keywords || '') + ' ' + r.type).toLowerCase();
          return r;
        });
        idxState = 'ready';
        query(sInput.value);
      })
      .catch(function () {
        idxState = 'failed';
        render();
      });
  }

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
    if (r.type === 'step') s += 4;
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
      out = out.replace(new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>');
    });
    return out;
  }

  function render() {
    if (!sList) return;
    var q = sInput ? sInput.value.trim() : '';

    if (idxState === 'loading') { sList.innerHTML = '<div class="sx-empty">Loading the docs index…</div>'; sCount.textContent = ''; return; }
    if (idxState === 'failed') {
      sList.innerHTML = '<div class="sx-empty">Search needs the site to be served over http.' +
        '<div class="sub">The index cannot be fetched from a local <b>file://</b> page.</div></div>';
      sCount.textContent = ''; return;
    }
    if (!q) {
      sList.innerHTML = '<div class="sx-empty">Search every guide, step and setting.' +
        '<div class="sub">Try <b>backburner</b>, <b>pairing</b>, <b>checkpoint</b>, or <b>clock in</b>.</div></div>';
      sCount.textContent = idx ? idx.length + ' indexed' : ''; return;
    }
    if (!results.length) {
      sList.innerHTML = '<div class="sx-empty">No match for “' + esc(q) + '”.' +
        '<div class="sub">Try a different word, or browse the categories on the <a href="index.html" style="color:var(--cyan,#00D2FF)">Docs home</a>.</div></div>';
      sCount.textContent = '0 results'; return;
    }

    sList.innerHTML = results.map(function (r, i) {
      var kind = r.type === 'guide' ? 'page' : r.type === 'step' ? 'section' : 'component';
      return '<a class="sx-item" role="option" id="dx-o' + i + '" href="' + esc(r.url) + '"' +
        ' aria-selected="' + (i === cursor ? 'true' : 'false') + '">' +
        '<span class="e" aria-hidden="true">' + esc(r.icon || '•') + '</span>' +
        '<span class="body">' +
          '<span class="t">' + hl(r.name, q) + '<span class="sx-kind ' + kind + '">' + (r.type === 'guide' ? 'guide' : r.type === 'step' ? 'step' : r.type) + '</span></span>' +
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

  function isTyping(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); }

  function wireHeader() {
    var nav = document.querySelector('.nav');
    if (!nav) return;
    var sb = el('button', 'searchbtn', '<span aria-hidden="true">🔍</span><span class="lbl grow">Search docs</span><kbd>/</kbd>');
    sb.type = 'button';
    sb.setAttribute('aria-label', 'Search the docs');
    sb.addEventListener('click', function () { openSearch(); });
    var badge = nav.querySelector('.verbadge');
    if (badge) nav.insertBefore(sb, badge); else nav.appendChild(sb);
  }

  /** Same drawer trick as /show's site.js — see that file's comment. */
  function wireNav() {
    var nav = document.querySelector('.nav');
    if (!nav || nav.querySelector('.navtoggle')) return;
    var links = nav.querySelectorAll(':scope > a');
    if (!links.length) return;
    var box = el('div', 'navlinks');
    box.id = 'nav-links';
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
    tog.addEventListener('click', function () { setOpen(tog.getAttribute('aria-expanded') !== 'true'); });
    box.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && tog.getAttribute('aria-expanded') === 'true') { setOpen(false); tog.focus(); }
    });
    nav.appendChild(tog);
  }

  function wireKeys() {
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && !isTyping(e.target) && !sOvl.classList.contains('open')) { e.preventDefault(); openSearch(); return; }
      if (e.key === 'Escape') { if (sOvl.classList.contains('open')) { e.preventDefault(); closeSearch(); } return; }
      if (!sOvl.classList.contains('open')) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (results.length) { cursor = (cursor + 1) % results.length; mark(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (results.length) { cursor = (cursor - 1 + results.length) % results.length; mark(); } }
      else if (e.key === 'Enter') {
        var cur = sList.children[cursor];
        if (cur && cur.href) { e.preventDefault(); location.href = cur.getAttribute('href'); }
      }
    });
    sOvl.addEventListener('mousedown', function (e) { if (e.target === sOvl) closeSearch(); });
  }

  function init() {
    document.body.appendChild(sOvl);
    sInput = document.getElementById('dx-input');
    sList = document.getElementById('dx-list');
    sCount = document.getElementById('dx-count');
    sInput.addEventListener('input', function () { query(sInput.value); });
    sOvl.querySelector('.sx-esc').addEventListener('click', closeSearch);

    wireHeader();
    wireNav();
    wireKeys();

    // The hub's big front-door search box opens the same overlay.
    var big = document.getElementById('dsearch-trigger');
    if (big) big.addEventListener('click', function () { openSearch(); });
  }

  window.TabathaDocs = { search: openSearch };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
