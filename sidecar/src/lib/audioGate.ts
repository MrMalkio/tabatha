// Tiny shared audio-gate (Plan 040 Addendum 7). Chaperone pre-recorded lines
// and voice-check-in TTS share one audio channel; per the addendum,
// "chaperone interrupt wins on conflict". chaperone.ts exposed no
// playing/active state, so both sides register here instead:
//   - chaperone claims 'chaperone' while a line is playing;
//   - voice check-in claims 'tts' while an utterance is speaking, and
//     refuses to START while any OTHER channel is busy (so it never talks
//     over the chaperone — but the chaperone never checks the gate, so it
//     still interrupts/overlaps TTS freely, i.e. chaperone wins).
// Module-level Set, not React state: callers are imperative audio paths.

const active = new Set<string>();

export function claimAudio(channel: string): void {
  active.add(channel);
}

export function releaseAudio(channel: string): void {
  active.delete(channel);
}

/** True when any channel other than `except` currently holds the gate. */
export function isAudioBusy(except?: string): boolean {
  for (const c of active) {
    if (c !== except) return true;
  }
  return false;
}
