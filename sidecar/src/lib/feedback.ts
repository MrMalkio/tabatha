import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { SUPABASE_URL, SUPABASE_ANON_KEY, supabase } from './supabase';
import { getDeviceId } from './device';

// Tabby Sidecar — feedback & bug reporting (Plan 040 Epic 7)
//
// Mirrors the extension's src/background/services/feedbackService.js contract
// so a single edge function (supabase/functions/feedback-to-asana) can serve
// both surfaces once it's deployed:
//   { kind: 'bug'|'idea', text, version, context:{surface,localId,machineId,url}, submittedAt }
//
// As of this writing `feedback-to-asana` is NOT deployed on the linked Supabase
// project (verified via `supabase functions list --project-ref
// mtdgoahskcibjbhfvofx` — only cortex-proxy, asana-task-action, asana-widget,
// send-focus-push are ACTIVE). Its CORS is also pinned to the Chrome extension
// origin only (`chrome-extension://hoknmoclnhccpgofpdihmiadmnmejjod`), which
// would block a browser fetch from the Sidecar's web origin even once deployed,
// until that allowlist is widened. See docs note in SettingsScreen / final
// report for the gap.
//
// So: always attempt the POST (forward-compatible — it'll just start working
// the moment the function is deployed with a compatible CORS policy), but on
// any failure (404 not-found, CORS block, network error, non-2xx) fall back to
// a local AsyncStorage queue so nothing the user typed is lost. The queue is
// retried opportunistically (call `flushFeedbackQueue()` on screen mount).

const FEEDBACK_FN_PATH = '/functions/v1/feedback-to-asana';
const QUEUE_KEY = 'tabby.sidecar.feedbackQueue';
const TIMEOUT_MS = 8000;
const MAX_TEXT_LEN = 4000;

export type FeedbackKind = 'bug' | 'feature';

export interface FeedbackPayload {
  kind: 'bug' | 'idea';
  text: string;
  version: string;
  context: {
    surface: string;
    localId: string | null;
    machineId: string | null;
    url: string | null;
    platform: string;
    ua: string | null;
    profileId: string | null;
  };
  submittedAt: string;
  source: 'sidecar';
}

export interface QueuedFeedback extends FeedbackPayload {
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

export type SubmitResult =
  | { status: 'sent'; taskGid?: string | null }
  | { status: 'queued'; reason: string }
  | { status: 'error'; reason: string };

/** UI kind -> wire kind. The edge fn / extension contract only knows 'bug'|'idea'. */
function toWireKind(kind: FeedbackKind): 'bug' | 'idea' {
  return kind === 'bug' ? 'bug' : 'idea';
}

function platformSurface(): string {
  if (Platform.OS !== 'web') return `sidecar_${Platform.OS}`;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iphone|ipad|ipod/i.test(ua)) return 'sidecar_ios_web';
  if (/android/i.test(ua)) return 'sidecar_android_web';
  return 'sidecar_web';
}

function currentUserAgent(): string | null {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') {
    return navigator.userAgent;
  }
  return null;
}

function currentUrlPath(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.pathname + window.location.search;
  }
  return null;
}

export interface BuildFeedbackInput {
  kind: FeedbackKind;
  text: string;
  version: string;
  profileId: string | null;
}

export async function buildFeedbackPayload(
  input: BuildFeedbackInput
): Promise<FeedbackPayload> {
  const deviceId = await getDeviceId();
  return {
    kind: toWireKind(input.kind),
    text: input.text.trim(),
    version: input.version,
    context: {
      surface: platformSurface(),
      localId: deviceId,
      machineId: deviceId,
      url: currentUrlPath(),
      platform: Platform.OS,
      ua: currentUserAgent(),
      profileId: input.profileId,
    },
    submittedAt: new Date().toISOString(),
    source: 'sidecar',
  };
}

async function readQueue(): Promise<QueuedFeedback[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue: QueuedFeedback[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* best effort — worst case the user resubmits */
  }
}

async function enqueue(payload: FeedbackPayload, reason: string): Promise<void> {
  const queue = await readQueue();
  queue.push({ ...payload, queuedAt: new Date().toISOString(), attempts: 0, lastError: reason });
  await writeQueue(queue);
}

export async function queuedFeedbackCount(): Promise<number> {
  const queue = await readQueue();
  return queue.length;
}

function withTimeout(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/** Raw POST to the edge function. Throws on any non-2xx or network failure. */
async function postFeedback(
  payload: FeedbackPayload,
  accessToken: string
): Promise<{ taskGid?: string | null }> {
  const { signal, cancel } = withTimeout(TIMEOUT_MS);
  try {
    const response = await fetch(`${SUPABASE_URL}${FEEDBACK_FN_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        /* ignore */
      }
      throw new Error(`${response.status} ${response.statusText || ''} ${detail}`.trim());
    }
    const data = await response.json().catch(() => ({}) as { taskGid?: string | null });
    return { taskGid: data?.taskGid ?? null };
  } finally {
    cancel();
  }
}

/**
 * Submit feedback: try the live edge function first, and only fall back to the
 * local queue if that fails (not deployed yet, CORS-blocked, offline, etc).
 */
export async function submitFeedback(input: BuildFeedbackInput): Promise<SubmitResult> {
  const text = input.text.trim();
  if (!text) return { status: 'error', reason: 'Feedback text is required.' };
  if (text.length > MAX_TEXT_LEN) {
    return { status: 'error', reason: `Feedback must be ${MAX_TEXT_LEN} characters or fewer.` };
  }

  const payload = await buildFeedbackPayload({ ...input, text });

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    // Shouldn't happen (Settings is behind auth) but queue rather than drop.
    await enqueue(payload, 'Not signed in');
    return { status: 'queued', reason: 'You appear to be signed out — saved locally instead.' };
  }

  try {
    const { taskGid } = await postFeedback(payload, accessToken);
    return { status: 'sent', taskGid };
  } catch (e: any) {
    const reason = e?.message || 'Network error';
    await enqueue(payload, reason);
    return { status: 'queued', reason };
  }
}

/**
 * Retry everything sitting in the local queue (e.g. call on Settings mount).
 * Best-effort: items that still fail stay queued with an incremented attempt
 * count; items that succeed are removed.
 */
export async function flushFeedbackQueue(): Promise<{ sent: number; remaining: number }> {
  const queue = await readQueue();
  if (queue.length === 0) return { sent: 0, remaining: 0 };

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { sent: 0, remaining: queue.length };

  const stillQueued: QueuedFeedback[] = [];
  let sent = 0;
  for (const item of queue) {
    try {
      await postFeedback(item, accessToken);
      sent += 1;
    } catch (e: any) {
      stillQueued.push({
        ...item,
        attempts: (item.attempts || 0) + 1,
        lastError: e?.message || 'Network error',
      });
    }
  }
  await writeQueue(stillQueued);
  return { sent, remaining: stillQueued.length };
}
