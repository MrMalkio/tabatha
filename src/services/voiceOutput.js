// ============================================================
// Cortex C9 — Voice OUTPUT runtime (extension-page / content-script safe).
//
// The thin browser-API layer behind "Tabby speaks" (Plan 042 T2/T5). Pure
// decisioning lives in src/utils/voiceDecision.js; this module only touches
// Web APIs that exist in a DOM context: speechSynthesis (output),
// webkitSpeechRecognition (the "hold off" mic window), and WebAudio (the
// pre-tone earcon). NO service-worker / chrome.offscreen APIs — MV3 background
// scripts have no DOM/media access, so this must run from a content script or
// an extension page. Everything degrades gracefully when an API is missing so
// a caller in a hostile page context never throws.
//
// HARD CONSTRAINT: Web Speech only. No manifest permissions, no offscreen doc.
// ============================================================

import { decideSpeakOrModal, composeSpokenLine } from '../utils/voiceDecision.js';

const HOLD_OFF_PHRASES = ['hold off', 'not now', 'later', 'stop', 'wait', 'hold on'];

function hasWindow() {
  return typeof window !== 'undefined';
}

/**
 * Short, soft WebAudio earcon (~200ms) so the user learns "Tabby is about to
 * talk". Resolves when the tone finishes (or immediately if WebAudio is
 * unavailable). Never rejects.
 */
export function playTone() {
  return new Promise((resolve) => {
    try {
      const Ctx = hasWindow() && (window.AudioContext || window.webkitAudioContext);
      if (!Ctx) return resolve(false);
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.18);
      // Soft: low peak gain with a gentle attack/release (no click, no jar).
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.06, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.22);
      osc.onended = () => { try { ctx.close(); } catch { /* noop */ } resolve(true); };
      // Safety net if onended never fires.
      setTimeout(() => resolve(true), 400);
    } catch {
      resolve(false);
    }
  });
}

/** Cancel any in-flight speechSynthesis utterance. */
export function cancelSpeech() {
  try {
    if (hasWindow() && window.speechSynthesis) window.speechSynthesis.cancel();
  } catch { /* noop */ }
}

/**
 * Speak `text` with a soft rate/pitch. Resolves { spoke:boolean } — false when
 * speechSynthesis is unavailable or errors (the caller then falls back to the
 * modal). Never rejects.
 *
 * @param {string} text
 * @param {object} [opts] { rate?, pitch?, volume?, lang? }
 */
export function speak(text, opts = {}) {
  return new Promise((resolve) => {
    try {
      const synth = hasWindow() && window.speechSynthesis;
      const Utter = hasWindow() && window.SpeechSynthesisUtterance;
      if (!synth || !Utter || !text) return resolve({ spoke: false });
      const u = new Utter(String(text));
      u.rate = opts.rate ?? 0.98;   // a touch slower than default — softer cadence
      u.pitch = opts.pitch ?? 1.0;
      u.volume = opts.volume ?? 0.85;
      u.lang = opts.lang ?? 'en-US';
      let settled = false;
      const done = (spoke) => { if (!settled) { settled = true; resolve({ spoke }); } };
      u.onend = () => done(true);
      u.onerror = () => done(false);
      synth.speak(u);
      // Guard against browsers that never fire onend for short utterances.
      setTimeout(() => done(true), Math.min(12000, 2500 + String(text).length * 90));
    } catch {
      resolve({ spoke: false });
    }
  });
}

/**
 * Open the mic for `ms` and listen for a "hold off" interjection BEFORE Tabby
 * speaks. Resolves { heard:'hold-off'|'none', transcript }. Gracefully resolves
 * { heard:'none' } when recognition is unavailable or the mic is denied.
 *
 * @param {number} ms
 */
export function listenForHoldOff(ms = 1500) {
  return new Promise((resolve) => {
    let recognition = null;
    let settled = false;
    const finish = (heard, transcript = '') => {
      if (settled) return;
      settled = true;
      try { recognition && recognition.stop(); } catch { /* noop */ }
      resolve({ heard, transcript });
    };
    try {
      const SR = hasWindow() && (window.SpeechRecognition || window.webkitSpeechRecognition);
      if (!SR || !ms || ms <= 0) return resolve({ heard: 'none', transcript: '' });
      recognition = new SR();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        const norm = transcript.toLowerCase();
        if (HOLD_OFF_PHRASES.some((p) => norm.includes(p))) {
          finish('hold-off', transcript.trim());
        }
      };
      // not-allowed / no-speech / service errors all degrade to "none".
      recognition.onerror = () => finish('none');
      recognition.onend = () => finish('none');
      recognition.start();
      setTimeout(() => finish('none'), ms);
    } catch {
      resolve({ heard: 'none', transcript: '' });
    }
  });
}

/**
 * Orchestrate one "Tabby speaks" attempt for a would-be-modal event.
 * Fire-and-forget safe: always drives the user to SOME resolution (spoken
 * hold-off, spoken line, or the fallback modal) and never throws.
 *
 * Flow:
 *   decide → (modal|silent shortcut) → tone → mic hold-off window →
 *     hold-off?  speak "Ok, I'll come back later." + onHoldOff()
 *     else       speak the composed line → onProceedModal() (show anyway)
 *   any speech failure / error → onProceedModal() immediately.
 *
 * @param {object} args
 * @param {string} args.modalType
 * @param {object} [args.context]  compose context (label/seed/etc.)
 * @param {object} args.voiceSettings  the `voice` settings block
 * @param {string|boolean} [args.presence]
 * @param {Function} [args.onProceedModal]  show the classic overlay
 * @param {Function} [args.onHoldOff]       defer/snooze the event
 * @returns {Promise<{mode:string, spoke?:boolean, heldOff?:boolean}>}
 */
export async function tabbyAnnounce({
  modalType,
  context = {},
  voiceSettings = {},
  presence = 'unknown',
  onProceedModal = () => {},
  onHoldOff = () => {}
} = {}) {
  const safeModal = () => { try { onProceedModal(); } catch { /* noop */ } };
  const safeHoldOff = () => { try { onHoldOff(); } catch { /* noop */ } };

  try {
    const decision = decideSpeakOrModal(modalType, voiceSettings, presence);

    if (decision.mode === 'modal') { safeModal(); return { mode: 'modal' }; }
    if (decision.mode === 'silent') { return { mode: 'silent' }; }

    // mode === 'speak'
    if (decision.preTone) await playTone();

    if (decision.micPreOpenMs > 0) {
      const { heard } = await listenForHoldOff(decision.micPreOpenMs);
      if (heard === 'hold-off') {
        await speak("Ok, I'll come back later.", { rate: 1.0 });
        safeHoldOff();
        return { mode: 'speak', heldOff: true };
      }
    }

    const line = composeSpokenLine(modalType, { seed: Date.now(), ...context });
    const { spoke } = await speak(line);
    // Additive, never a silent substitute: after speaking (or on failure) the
    // classic overlay still surfaces so the user is never left un-notified.
    safeModal();
    return { mode: 'speak', spoke };
  } catch {
    safeModal();
    return { mode: 'modal', spoke: false };
  }
}
