/* ============================================================
   download.js — behaviour for /download.

   External rather than inline because the site's CSP is
   `script-src 'self'` with no 'unsafe-inline' (see site/_headers) —
   mirrors the pattern in teaser.js.

   Two independent jobs:
     1. The invite-gated extension download. Checks a token against
        the invite-check edge function (NON-consuming — the same
        token still works afterwards on the real activation paths).
        On a valid check, fetches the public update-channel pointer
        for the current zip/version/sha256 and reveals it.
     2. The waitlist. Same endpoint and behaviour as the homepage
        teaser (functions/api/waitlist.js) — no new backend.
   ============================================================ */
(function () {
  'use strict';

  var INVITE_CHECK_URL = 'https://mtdgoahskcibjbhfvofx.supabase.co/functions/v1/invite-check';
  var INVITE_ANON_KEY = 'sb_publishable_lPmWAzfBqbHkyGslkhohQA_8QgdBCu_';
  var UPDATE_CHANNEL_URL = 'https://raw.githubusercontent.com/MrMalkio/tabatha/update-channel/latest.json';

  // ── 1. invite-gated extension download ──────────────────────────────────
  (function initInviteGate() {
    var form = document.getElementById('invform');
    var input = document.getElementById('invkey');
    var btn = document.getElementById('invgo');
    var msg = document.getElementById('invmsg');
    var reveal = document.getElementById('invreveal');
    if (!form || !input || !btn || !msg || !reveal) return;

    var say = function (state, text) {
      msg.dataset.state = state || '';
      msg.textContent = text || '';
    };

    var busy = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;

      var token = input.value.trim();
      if (!token) {
        input.setAttribute('aria-invalid', 'true');
        say('error', 'Paste the invite key you were sent.');
        input.focus();
        return;
      }

      busy = true;
      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = 'Checking…';
      say('', 'Checking your key.');
      reveal.hidden = true;

      fetch(INVITE_CHECK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: INVITE_ANON_KEY },
        body: JSON.stringify({ token: token }),
      })
        .then(function (res) { return res.json().catch(function () { return {}; }); })
        .then(function (body) {
          if (!body || body.valid !== true) {
            input.setAttribute('aria-invalid', 'true');
            say('error', "That key isn't valid. Double-check it, or write to caspera@duckandshark.com.");
            return;
          }
          input.removeAttribute('aria-invalid');
          say('success', 'Key accepted — this same key still works afterwards to activate your account, it has not been used up.');
          return loadRelease();
        })
        .catch(function () {
          say('error', 'Could not reach the check right now. Please try again shortly.');
        })
        .finally(function () {
          busy = false;
          btn.disabled = false;
          btn.textContent = label;
        });
    });

    input.addEventListener('input', function () {
      if (msg.dataset.state === 'error') {
        input.removeAttribute('aria-invalid');
        say('', '');
      }
    });

    function loadRelease() {
      return fetch(UPDATE_CHANNEL_URL, { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('bad response');
          return res.json();
        })
        .then(function (data) {
          if (!data || !data.zipUrl) throw new Error('bad payload');
          renderRelease(data);
        })
        .catch(function () {
          say('error', 'Your key is valid, but the release pointer could not be reached. Try again shortly, or email caspera@duckandshark.com.');
        });
    }

    function renderRelease(data) {
      var version = data.version ? String(data.version) : 'latest';
      var sha = data.sha256 ? String(data.sha256) : null;
      var zipUrl = data.zipUrl;

      reveal.innerHTML = '';

      var head = document.createElement('p');
      head.innerHTML = '<strong>Tabatha v' + escapeHtml(version) + '</strong> — the current staff build.';
      reveal.appendChild(head);

      var row = document.createElement('div');
      row.className = 'btnrow';
      var a = document.createElement('a');
      a.className = 'btn';
      a.href = zipUrl;
      a.textContent = 'Download extension (.zip)';
      row.appendChild(a);
      reveal.appendChild(row);

      if (sha) {
        var shaP = document.createElement('p');
        shaP.className = 'docs';
        shaP.textContent = 'sha256: ' + sha;
        reveal.appendChild(shaP);
      }

      var steps = document.createElement('ol');
      [
        'Unzip the download.',
        'Open chrome://extensions and turn on Developer mode (top right).',
        'Click Load unpacked and select the unzipped folder.',
      ].forEach(function (text) {
        var li = document.createElement('li');
        li.textContent = text;
        steps.appendChild(li);
      });
      reveal.appendChild(steps);

      var note = document.createElement('p');
      note.innerHTML = 'From here, updates arrive <strong>automatically in-app</strong> — no need to come back to this page for future versions.';
      reveal.appendChild(note);

      reveal.hidden = false;
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }
  })();

  // ── 2. waitlist (same endpoint/markup pattern as the homepage teaser) ───
  (function initWaitlist() {
    var form = document.getElementById('wl');
    var input = document.getElementById('email');
    var btn = document.getElementById('go');
    var msg = document.getElementById('msg');
    if (!form || !input || !btn || !msg) return;

    var say = function (state, text) {
      msg.dataset.state = state || '';
      msg.textContent = text || '';
    };

    var LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;
    var busy = false;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (busy) return;

      var email = input.value.trim();
      if (!email) {
        input.setAttribute('aria-invalid', 'true');
        say('error', 'An email address is needed to tell you anything.');
        input.focus();
        return;
      }
      if (!LOOKS_LIKE_EMAIL.test(email)) {
        input.setAttribute('aria-invalid', 'true');
        say('error', 'That does not look like an email address.');
        input.focus();
        return;
      }

      input.removeAttribute('aria-invalid');
      busy = true;
      btn.disabled = true;
      var label = btn.textContent;
      btn.textContent = 'Sending';
      say('', 'Adding you to the list.');

      fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, source: 'download' }),
      })
        .then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            return { res: res, body: body };
          });
        })
        .then(function (r) {
          var res = r.res, body = r.body;
          if (res.ok) {
            form.querySelector('.row').style.display = 'none';
            form.querySelector('.lbl').style.display = 'none';
            say('success', 'You are on the list. We will email you once an invite opens up.');
            return;
          }
          if (res.status === 501) {
            say('error', (body && body.message) || 'The waitlist is not open yet.');
          } else if (res.status === 429) {
            say('error', 'Too many attempts. Give it a minute and try again.');
          } else if (res.status === 400) {
            input.setAttribute('aria-invalid', 'true');
            say('error', (body && body.error) || 'That address was not accepted.');
          } else {
            say('error', (body && body.message) || 'Could not save that. Please try again shortly.');
          }
        })
        .catch(function () {
          say('error', 'Could not reach the server. Please try again shortly.');
        })
        .finally(function () {
          if (busy) {
            busy = false;
            btn.disabled = false;
            btn.textContent = label;
          }
        });
    });

    input.addEventListener('input', function () {
      if (msg.dataset.state === 'error') {
        input.removeAttribute('aria-invalid');
        say('', '');
      }
    });
  })();
})();
