/**
 * POST /api/waitlist — Cloudflare Pages Function.
 *
 * Receives an email address from the teaser page at `/` and appends it to
 * `tabatha.waitlist`. This is the only real action the teaser can perform.
 *
 * ── Configuration (Pages → Settings → Environment variables) ────────────────
 *   SUPABASE_URL          (required)             https://<ref>.supabase.co
 *   SUPABASE_SERVICE_KEY  (required, ENCRYPTED)  service_role key.
 *
 * The service-role key bypasses RLS, which is precisely why it lives here and
 * NEVER in client JS. `tabatha.waitlist` has RLS enabled with no policies (see
 * migration 028), so this Function is the single path that can write a row.
 * The key is read from `env` at request time and is never logged or echoed.
 * If either binding is absent the endpoint returns 501 and the client says so
 * plainly, so the page degrades honestly instead of pretending to have
 * subscribed someone.
 *
 * PRIVACY: the submitted address is written to exactly one place — the row.
 * It is never placed in a URL, a log line, or an error message.
 */

const MAX_EMAIL = 320; // RFC 5321 addressable maximum.

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

/**
 * Deliberately conservative. This is a gate, not a parser: full RFC 5322 is
 * unimplementable in a regex and the only authority on deliverability is a
 * delivered email. Reject the obviously-broken, accept the rest, and never
 * bounce a real person over an exotic-but-valid address.
 */
const EMAIL_RE = /^[^@\s,;:<>()[\]\\"]+@[^@\s,;:<>()[\]\\".]+(\.[^@\s,;:<>()[\]\\".]+)+$/;

/**
 * In-memory, per-isolate rate limit. Cloudflare runs many isolates, so this is
 * a speed bump against a naive script, NOT a security control: the real
 * protections are the UNIQUE constraint (a repeat address cannot add rows) and
 * the fact that a successful POST reveals nothing. Honest about what it is.
 * A determined flood needs Turnstile or a KV/D1-backed counter.
 */
const HITS = new Map();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

function rateLimited(ip) {
  const now = Date.now();
  const seen = (HITS.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  seen.push(now);
  HITS.set(ip, seen);

  // Bound the map so a spray of unique IPs cannot grow it without limit.
  if (HITS.size > 5000) {
    for (const [k, v] of HITS) {
      if (!v.some((t) => now - t < WINDOW_MS)) HITS.delete(k);
      if (HITS.size <= 2500) break;
    }
  }
  return seen.length > MAX_PER_WINDOW;
}

/** Reduce a Referer to a bare origin. Strips any query string or path. */
function toOrigin(ref) {
  if (!ref) return null;
  try {
    return new URL(ref).origin.slice(0, 200);
  } catch {
    return null;
  }
}

export async function onRequestPost({ request, env }) {
  // ── rate limit ───────────────────────────────────────────────────────────
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  if (rateLimited(ip)) {
    return json(429, {
      error: 'rate_limited',
      message: 'Too many attempts. Give it a minute and try again.',
    });
  }

  // ── parse ────────────────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Expected a JSON body.' });
  }

  // Normalise BEFORE validating, so the CHECK in migration 028
  // (email = lower(email)) always holds and case-variant duplicates collide on
  // the UNIQUE constraint rather than landing as separate rows.
  const email = String(body.email ?? '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .toLowerCase()
    .slice(0, MAX_EMAIL);

  if (!email) return json(400, { error: 'An email address is required.' });
  if (!EMAIL_RE.test(email)) {
    return json(400, { error: 'That does not look like an email address.' });
  }

  const source = String(body.source ?? 'teaser')
    .replace(/[^a-z0-9_-]/gi, '')
    .slice(0, 40) || 'teaser';
  const referrer = toOrigin(request.headers.get('Referer'));

  // ── not configured yet → 501, client says so plainly ─────────────────────
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    return json(501, {
      error: 'not_configured',
      message: 'The waitlist is not open yet.',
    });
  }

  // ── insert ───────────────────────────────────────────────────────────────
  try {
    const res = await fetch(
      `${url.replace(/\/+$/, '')}/rest/v1/waitlist` +
        '?on_conflict=email&select=id',
      {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Accept-Profile': 'tabatha',
          'Content-Profile': 'tabatha',
          // ignore-duplicates: a repeat signup is a no-op that still reports
          // success. This is the mechanism behind the promise below.
          Prefer: 'resolution=ignore-duplicates,return=representation',
        },
        body: JSON.stringify({ email, source, referrer }),
      },
    );

    if (!res.ok) {
      // Status only. The upstream body echoes the submitted row (the address)
      // and the key is in this scope; neither belongs in a log.
      console.error(`waitlist: Supabase responded ${res.status}`);
      return json(502, {
        error: 'upstream_failed',
        message: 'Could not save that right now. Please try again shortly.',
      });
    }

    // A duplicate returns 201 with an empty array under ignore-duplicates.
    // We deliberately do NOT branch on that: telling the caller "already
    // subscribed" would turn this endpoint into an address oracle, letting
    // anyone test whether a given person is on the list. Same response, always.
    return json(200, { ok: true });
  } catch (err) {
    console.error('waitlist: request failed', err?.name ?? 'Error');
    return json(502, {
      error: 'upstream_failed',
      message: 'Could not save that right now. Please try again shortly.',
    });
  }
}
