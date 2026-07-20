// Cortex C8 tier-② — backend proxy (Plan 041 T3).
// Holds the OpenAI key server-side so clients never ship one. Authenticated
// Supabase users POST small optimization/generation tasks; the function
// forwards to OpenAI and returns the completion. Personal-partition ledger
// data should NOT be sent here unless the user opted into cloud processing —
// the client enforces that; this function just refuses oversized payloads.
//
// Deploy (Malkio):
//   supabase secrets set OPENAI_API_KEY=<key from .env.cortex.local> --project-ref mtdgoahskcibjbhfvofx
//   supabase functions deploy cortex-proxy --project-ref mtdgoahskcibjbhfvofx
// JWT verification stays ON (default) — only signed-in Tabatha users can call it.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_INPUT_BYTES = 200_000; // ~a day's ledger export envelope, not raw frames
const DEFAULT_MODEL = 'gpt-4o-mini'; // cheap tier; caller may request gpt-4o

const ALLOWED_MODELS = new Set(['gpt-4o-mini', 'gpt-4o']);

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'POST only' }, 405);
  }
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return json({ error: 'proxy not configured (OPENAI_API_KEY secret missing)' }, 503);

  let body: { task?: string; system?: string; input?: string; model?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid JSON body' }, 400);
  }

  const { task, system, input, model } = body;
  if (!task || !system || typeof input !== 'string') {
    return json({ error: 'required: task, system, input' }, 400);
  }
  if (new TextEncoder().encode(input).length > MAX_INPUT_BYTES) {
    return json({ error: `input exceeds ${MAX_INPUT_BYTES} bytes` }, 413);
  }
  const chosenModel = ALLOWED_MODELS.has(model ?? '') ? model : DEFAULT_MODEL;

  const upstream = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: chosenModel,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: input }
      ],
      max_tokens: 4000
    })
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    return json({ error: `upstream ${upstream.status}`, detail: detail.slice(0, 500) }, 502);
  }
  const data = await upstream.json();
  return json({
    task,
    model: chosenModel,
    output: data.choices?.[0]?.message?.content ?? '',
    usage: data.usage ?? null
  });
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
