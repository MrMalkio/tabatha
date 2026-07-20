/**
 * POST /api/feedback — Cloudflare Pages Function.
 *
 * Receives a bug report or feature request from the public site and files it
 * as a task on the Tabatha intake board in Asana.
 *
 * ── Configuration (Pages → Settings → Environment variables) ────────────────
 *   ASANA_TOKEN     (required, ENCRYPTED)  Asana personal access token.
 *   ASANA_PROJECT   (required)             GID of the PUBLIC INTAKE project.
 *                                          Point this at a dedicated intake
 *                                          board, never at the internal
 *                                          development board.
 *   ASANA_WORKSPACE (optional)             Workspace GID. Only needed if the
 *                                          token can see several workspaces.
 *
 * The token is read from `env` at request time and is NEVER hardcoded, logged,
 * or echoed back to the client. If it is absent the endpoint returns 501 and
 * the client falls back to opening a prefilled GitHub issue, so the feature
 * works before the backend is ever wired up.
 *
 * Anything the submitter typed is UNTRUSTED. It is written only into the task
 * name and notes as plain text, never interpolated into a URL or a command.
 */

const MAX = { title: 140, description: 4000, why: 2000, component: 120, email: 160 };

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      // Same-origin app; no CORS grant needed. Being explicit beats implying.
      'X-Content-Type-Options': 'nosniff',
    },
  });

/** Trim to a hard cap; strip control chars but keep newlines and tabs. */
const clean = (v, max) =>
  String(v ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, max);

export async function onRequestPost({ request, env }) {
  // ── parse ────────────────────────────────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Expected a JSON body.' });
  }

  const type = body.type === 'bug' ? 'bug' : 'feature';
  const title = clean(body.title, MAX.title);
  const description = clean(body.description, MAX.description);
  // Feature requests only — the client hides the field for bugs, and a bug that
  // arrives carrying one has nothing useful to say with it.
  const why = type === 'feature' ? clean(body.why, MAX.why) : '';
  const component = clean(body.component, MAX.component);
  const componentId = clean(body.componentId, MAX.component);
  const email = clean(body.email, MAX.email);
  const page = clean(body.page, 120);

  if (!title) return json(400, { error: 'A title is required.' });
  if (!description) return json(400, { error: 'A description is required.' });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json(400, { error: 'That email address is not valid.' });
  }

  // ── not configured yet → 501, client falls back to GitHub ────────────────
  const token = env.ASANA_TOKEN;
  const project = env.ASANA_PROJECT;
  if (!token || !project) {
    return json(501, {
      error: 'not_configured',
      message:
        'The feedback endpoint is not wired up yet. Use the GitHub issue fallback.',
    });
  }

  // ── compose ──────────────────────────────────────────────────────────────
  const name = `${type === 'bug' ? '🐞' : '✨'} ${component ? `[${component}] ` : ''}${title}`;
  const notes = [
    description,
    // Surfaced as its own labelled block above the metadata rule: on a feature
    // request this is the part that decides whether the task gets picked up, so
    // it must not read as one more footer field.
    ...(why ? ['', 'WHY THIS MATTERS', why] : []),
    '',
    '───────────────',
    `Type: ${type === 'bug' ? 'Bug report' : 'Feature request'}`,
    ...(type === 'feature' && !why ? ['Why: (not supplied)'] : []),
    component ? `Component: ${component}${componentId ? ` (#${componentId})` : ''}` : 'Component: (general)',
    page ? `Page: ${page}` : '',
    email ? `Reply to: ${email}` : 'Reply to: (not supplied)',
    `Received: ${new Date().toISOString()}`,
    'Source: public site (tabatha.pondocean.co)',
  ]
    .filter(Boolean)
    .join('\n');

  const data = { name, notes, projects: [project] };
  if (env.ASANA_WORKSPACE) data.workspace = env.ASANA_WORKSPACE;

  // ── file it ──────────────────────────────────────────────────────────────
  try {
    const res = await fetch('https://app.asana.com/api/1.0/tasks', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ data }),
    });

    if (!res.ok) {
      // Log status only. The upstream body can echo request content and the
      // token is in this scope; neither belongs in logs or in the response.
      console.error(`feedback: Asana responded ${res.status}`);
      return json(502, {
        error: 'upstream_failed',
        message: 'Could not file this right now. Please use the GitHub fallback.',
      });
    }

    const out = await res.json();
    return json(200, { ok: true, id: out?.data?.gid ?? null });
  } catch (err) {
    console.error('feedback: request failed', err?.name ?? 'Error');
    return json(502, {
      error: 'upstream_failed',
      message: 'Could not file this right now. Please use the GitHub fallback.',
    });
  }
}

