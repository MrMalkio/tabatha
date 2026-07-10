// ============================================================
// Cortex C9 — Voice output decisioning (pure, unit-tested).
//
// Two pure helpers that back the "Tabby speaks" subsystem (Plan 042 T2/T5):
//   • decideSpeakOrModal — given a would-be-modal event, the `voice` settings
//     block, and a presence signal, decide whether Tabby speaks, shows the
//     modal, or stays silent — plus the tone/mic-window knobs the orchestrator
//     needs. Voice output is additive: it never silently drops a notification
//     for an absent/unknown user (falls back to modal).
//   • composeSpokenLine — produce a short, soft, VARIED spoken line for a modal
//     type. Never the same canned line every time (product-feel requirement,
//     C9 §"Generation constraint"): a deterministic seed picks from a per-type
//     template pool so the output is testable yet varies across events.
//
// No chrome / DOM / speech APIs — those live in src/services/voiceOutput.js.
// ============================================================

/**
 * Decide how a would-be-modal event should surface under the voice settings.
 *
 * @param {string} modalType   e.g. 'focus-timer-expired' | 'drift-detected'
 * @param {object} voiceSettings  the `voice` settings block (see DEFAULT_SETTINGS)
 * @param {string|boolean} presence  'present' (or true) → user is at the machine;
 *   anything else ('absent' | 'unknown' | undefined) is treated as not-present.
 * @returns {{mode:'speak'|'modal'|'silent', preTone:boolean,
 *   micPreOpenMs:number, fallbackToModal:boolean}}
 */
export function decideSpeakOrModal(modalType, voiceSettings = {}, presence = 'unknown') {
  const master = voiceSettings?.enabled === true;
  const output = voiceSettings?.output || {};
  const outputEnabled = output.enabled === true;

  // Knobs the orchestrator needs regardless of the chosen mode.
  const preTone = output.toneBeforeSpeak !== false;            // default true
  const micPreOpenMs = Number.isFinite(output.micPreOpenMs) ? Math.max(0, output.micPreOpenMs) : 0;
  const fallbackToModal = output.modalFallback !== false;      // default true
  const base = { preTone, micPreOpenMs, fallbackToModal };

  // Master opt-in + output subsystem must both be on, else classic modal.
  if (!master || !outputEnabled) return { mode: 'modal', ...base };

  // An explicit per-modal-type override wins even over presence: 'silent'
  // means the user deliberately muted THIS event type entirely, 'modal' means
  // keep the dialog, 'speak' forces voice.
  const override = output.perModalType?.[modalType];
  if (override === 'silent') return { mode: 'silent', ...base };
  if (override === 'modal') return { mode: 'modal', ...base };

  // Presence gate: only speak to a user who is actually here. Absent/unknown
  // → modal, so a triggered event is never silently dropped.
  const present = presence === 'present' || presence === true;
  if (!present) return { mode: 'modal', ...base };

  if (override === 'speak') return { mode: 'speak', ...base };

  // Default when everything is enabled and the user is present.
  return { mode: 'speak', ...base };
}

// Short, soft template pools. Each function takes the compose context and
// returns one spoken line. ≥3 per modal type so consecutive events vary.
function label(c) {
  const l = c?.focusLabel || c?.label;
  return l ? `"${String(l).trim()}"` : 'your focus';
}

const LINE_POOLS = {
  'focus-timer-expired': [
    (c) => `Heads up — the time you set for ${label(c)} is up. Keep going or wrap up?`,
    (c) => `That's your timer on ${label(c)}. Want to push on, or call it?`,
    (c) => `Time's up on ${label(c)}. What would you like to do next?`,
    (c) => `Your focus timer just ran out on ${label(c)}. Still in it?`
  ],
  'checkpoint-prompt': [
    (c) => `Quick check-in on ${label(c)} — how's it coming along?`,
    (c) => `Good moment for a checkpoint on ${label(c)}. Where are you at?`,
    (c) => `Mind noting your progress on ${label(c)}?`
  ],
  'drift-detected': [
    (c) => `Looks like you've drifted from ${label(c)}. Still on it?`,
    (c) => `You've wandered off ${label(c)} for a bit — is that intentional?`,
    (c) => `Noticed some side tabs. Are you still working on ${label(c)}?`
  ],
  'welcome-back': [
    (c) => `Welcome back. Want to pick up ${label(c)} where you left off?`,
    (c) => `Good to see you again — ready to resume ${label(c)}?`,
    (c) => `Back at it? ${label(c)} is right where you left it.`
  ],
  'idle-pause': [
    (c) => `Things went quiet — are you still on ${label(c)}?`,
    (c) => `You there? I can pause ${label(c)} if you stepped away.`,
    (c) => `It's been quiet for a while. Keep ${label(c)} running?`
  ]
};

const GENERIC_POOL = [
  () => `Got a moment? There's something I'd flag.`,
  () => `Quick heads-up when you have a second.`,
  () => `I've got a nudge for you whenever you're ready.`
];

/**
 * Compose a short, soft, varied spoken line for a modal type.
 *
 * @param {string} modalType
 * @param {object} [context]  { seed?:number, focusLabel?:string, label?:string, ... }
 *   `seed` deterministically picks from the template pool (caller supplies it so
 *   the output is testable but still varies event-to-event, e.g. Date.now()).
 * @returns {string}
 */
export function composeSpokenLine(modalType, context = {}) {
  const pool = LINE_POOLS[modalType] || GENERIC_POOL;
  const rawSeed = Number.isFinite(context.seed) ? Math.abs(Math.floor(context.seed)) : 0;
  const idx = pool.length ? rawSeed % pool.length : 0;
  return pool[idx](context);
}
