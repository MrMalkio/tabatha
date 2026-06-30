// Tabatha — Feedback Service (Workstream B2)
//
// Brokers in-app feedback to Asana through a Supabase Edge Function so the
// Asana PAT never ships in the (world-readable, unpacked) extension. The
// extension only holds the Supabase publishable/anon key, which it already
// embeds for normal data sync.
//
//   Extension form → SUBMIT_FEEDBACK → here → POST
//     {SUPABASE_URL}/functions/v1/feedback-to-asana  (anon-key Bearer)
//   → edge fn (holds ASANA_PAT + ASANA_PROJECT_GID) → app.asana.com/api/1.0/tasks
//
// The AbortSignal.timeout + best-effort error shape mirrors fireWebhook() in
// src/background/webhooks.js; the Supabase anon-key Bearer + edge-function
// invoke is net-new (webhooks.js authenticates with an optional HMAC header,
// not a Supabase token).

// Embedded Supabase project URL + publishable (anon) key — identical to
// src/services/supabaseClient.js. Kept inline (not imported) so the background
// service worker does not pull the full supabase-js client just to fire a POST.
const SUPABASE_URL = 'https://mtdgoahskcibjbhfvofx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_lPmWAzfBqbHkyGslkhohQA_8QgdBCu_';
const FEEDBACK_FN_PATH = '/functions/v1/feedback-to-asana';
const TIMEOUT_MS = 8000;
const VALID_KINDS = new Set(['bug', 'idea']);

let injected = {};

export function configureFeedbackService(deps = {}) {
  injected = { ...injected, ...deps };
}

function getFetch() {
  return injected.fetchImpl || globalThis.fetch;
}

async function getIdentityContext() {
  try {
    const res = await chrome.storage.local.get('_browserProfile');
    const p = res?._browserProfile || {};
    return { localId: p.localId || null, machineId: p.machineId || null };
  } catch {
    return { localId: null, machineId: null };
  }
}

function getVersion() {
  try { return chrome.runtime.getManifest?.()?.version || 'unknown'; }
  catch { return 'unknown'; }
}

// Build the payload contract:
//   { kind, text, version, context:{surface,localId,machineId,url}, submittedAt }
async function buildPayload(message) {
  const kind = VALID_KINDS.has(message?.kind) ? message.kind : 'idea';
  const text = typeof message?.text === 'string' ? message.text.trim() : '';
  const ctxIn = message?.context || {};
  const identity = await getIdentityContext();
  return {
    kind,
    text,
    version: getVersion(),
    context: {
      surface: ctxIn.surface || 'unknown',
      localId: ctxIn.localId ?? identity.localId,
      machineId: ctxIn.machineId ?? identity.machineId,
      url: ctxIn.url || null,
    },
    submittedAt: new Date().toISOString(),
  };
}

async function submitFeedback(message) {
  const payload = await buildPayload(message);
  if (!payload.text) {
    return { ok: false, error: 'Feedback text is required' };
  }

  const fetchImpl = getFetch();
  try {
    const response = await fetchImpl(`${SUPABASE_URL}${FEEDBACK_FN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!response.ok) {
      let detail = '';
      try { detail = await response.text(); } catch { /* ignore */ }
      return { ok: false, error: `Feedback failed: ${response.status} ${response.statusText || ''} ${detail}`.trim() };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'Feedback request failed' };
  }
}

export async function handleMessage(type, message) {
  switch (type) {
    case 'SUBMIT_FEEDBACK':
      return submitFeedback(message);
    default:
      return undefined;
  }
}
