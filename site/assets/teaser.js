/* ============================================================
   teaser.js — behaviour for the Tabatha teaser at `/`.

   External rather than inline because the site's CSP is
   `script-src 'self'` with no 'unsafe-inline' (see site/_headers);
   an inline block would be dropped without warning.

   Two jobs, nothing else:
     1. The instrument. Counts real elapsed time on this page.
     2. The waitlist. One input, POSTed to /api/waitlist.

   No analytics, no beacons, no third parties. The page reports
   nothing about the visitor anywhere. The only request it ever
   makes is the one the visitor explicitly submits.
   ============================================================ */
(function () {
  'use strict';

  // ── 1. the instrument ─────────────────────────────────────────────────────
  const clock = document.getElementById('clock');
  const sweep = document.getElementById('sweep');

  if (clock) {
    const started = Date.now();
    const pad = (n) => String(n).padStart(2, '0');

    const tick = () => {
      // Wall-clock delta, not a tick count: a background tab throttles timers,
      // so counting invocations would under-report exactly the inattention
      // this page is about. Elapsed time is measured, never accumulated.
      const secs = Math.floor((Date.now() - started) / 1000);
      const mins = Math.floor(secs / 60);

      // Past an hour the point is long since made, and MM would start lying.
      if (mins >= 60) {
        const hrs = Math.floor(mins / 60);
        clock.innerHTML = `${pad(hrs)}<span class="s">:</span>${pad(mins % 60)}`;
      } else {
        clock.innerHTML = `${pad(mins)}<span class="s">:</span>${pad(secs % 60)}`;
      }

      // The sweep is the seconds hand of the number above it. Reset to 0 with
      // the transition suppressed so it snaps back rather than rewinding
      // visibly across the bar each minute.
      if (sweep) {
        const s = secs % 60;
        if (s === 0) {
          sweep.style.transition = 'none';
          sweep.style.width = '0%';
          // Force layout so the next width change is not coalesced with this
          // one, which would swallow the reset and animate a rewind instead.
          void sweep.offsetWidth;
          sweep.style.transition = '';
        } else {
          sweep.style.width = ((s / 60) * 100).toFixed(2) + '%';
        }
      }
    };

    tick();
    setInterval(tick, 1000);
  }

  // ── 2. the waitlist ───────────────────────────────────────────────────────
  const form = document.getElementById('wl');
  const input = document.getElementById('email');
  const btn = document.getElementById('go');
  const msg = document.getElementById('msg');
  if (!form || !input || !btn || !msg) return;

  const say = (state, text) => {
    msg.dataset.state = state || '';
    msg.textContent = text || '';
  };

  // Deliberately permissive, and deliberately NOT the authority. The server
  // validates independently; this exists only to catch a typo before it costs
  // a round trip. Anything arguable is allowed through to the server.
  const LOOKS_LIKE_EMAIL = /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/;

  let busy = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;

    const email = input.value.trim();

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
    const label = btn.textContent;
    btn.textContent = 'Sending';
    say('', 'Adding you to the list.');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'teaser' }),
      });

      let body = {};
      try { body = await res.json(); } catch { /* non-JSON error page */ }

      if (res.ok) {
        // The server treats a repeat address as success and says nothing about
        // whether it was already there, so neither does this. One outcome.
        form.querySelector('.row').style.display = 'none';
        form.querySelector('.lbl').style.display = 'none';
        say('success', 'You are on the list. We will email you once, when it ships.');
        return;
      }

      if (res.status === 501) {
        // Honest: the backend is not wired up. Do not claim a signup that did
        // not happen.
        say('error', (body && body.message) || 'The waitlist is not open yet.');
      } else if (res.status === 429) {
        say('error', 'Too many attempts. Give it a minute and try again.');
      } else if (res.status === 400) {
        input.setAttribute('aria-invalid', 'true');
        say('error', (body && body.error) || 'That address was not accepted.');
      } else {
        say('error', (body && body.message) || 'Could not save that. Please try again shortly.');
      }
    } catch {
      // Offline, DNS, blocked request. Never silently swallow: the visitor
      // must not walk away believing they subscribed.
      say('error', 'Could not reach the server. Please try again shortly.');
    } finally {
      if (busy) {
        busy = false;
        btn.disabled = false;
        btn.textContent = label;
      }
    }
  });

  // Clear the error the moment they start fixing it.
  input.addEventListener('input', () => {
    if (msg.dataset.state === 'error') {
      input.removeAttribute('aria-invalid');
      say('', '');
    }
  });
})();
