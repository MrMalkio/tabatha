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
// supabase-js persists the session under this key in chrome.storage.local
// (see src/services/supabaseClient.js chromeStorageAdapter). Project ref is the
// subdomain of SUPABASE_URL.
const SUPABASE_AUTH_STORAGE_KEY = 'sb-mtdgoahskcibjbhfvofx-auth-token';
const FEEDBACK_FN_PATH = '/functions/v1/feedback-to-asana';
const TIMEOUT_MS = 8000;
const VALID_KINDS = new Set(['bug', 'idea']);
const MAX_TEXT_LEN = 4000;

let injected = {};

export function configureFeedbackService(deps = {}) {
  injected = { ...injected, ...deps };
}

function getFetch() {
  return injected.fetchImpl || globalThis.fetch;
}

// The signed-in user's Supabase access token (NOT the world-readable anon key).
// Read straight from the shared chrome.storage.local session so the background
// service worker need not construct a full supabase-js client. Injectable for
// tests via configureFeedbackService({ getAccessToken }).
async function getAccessToken() {
  if (injected.getAccessToken) return injected.getAccessToken();
  try {
    const res = await chrome.storage.local.get(SUPABASE_AUTH_STORAGE_KEY);
    let session = res?.[SUPABASE_AUTH_STORAGE_KEY] ?? null;
    if (typeof session === 'string') {
      try { session = JSON.parse(session); } catch { /* not JSON */ }
    }
    return session?.access_token || session?.currentSession?.access_token || null;
  } catch {
    return null;
  }
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
// Preserves the RAW kind (not normalized) so submitFeedback can reject an
// invalid one rather than silently coercing it.
async function buildPayload(message) {
  const kind = message?.kind;
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
  // Input bounds (mirror the edge function so we fail fast, before any network).
  if (!payload.text) {
    return { ok: false, error: 'Feedback text is required' };
  }
  if (payload.text.length > MAX_TEXT_LEN) {
    return { ok: false, error: `Feedback text must be ${MAX_TEXT_LEN} characters or fewer` };
  }
  if (!VALID_KINDS.has(payload.kind)) {
    return { ok: false, error: 'Feedback kind must be "bug" or "idea"' };
  }

  // Authenticate as the signed-in user. No session → do not spam the endpoint.
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return { ok: false, error: 'You must be signed in to send feedback' };
  }

  const fetchImpl = getFetch();
  try {
    const response = await fetchImpl(`${SUPABASE_URL}${FEEDBACK_FN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // User's access token as Bearer (edge function verifies the user);
        // anon key stays in `apikey` so the Supabase gateway routes the call.
        'Authorization': `Bearer ${accessToken}`,
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
