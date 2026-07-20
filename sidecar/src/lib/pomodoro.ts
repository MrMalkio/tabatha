// Pomodoro timer mode (Plan 040 roadmap "gusto" pick) — a PURE view over
// the existing elapsed-ms timer, never a new source of truth. The
// focus_items elapsed-ms freeze (data/focus.ts elapsedMsOf) and the
// focus_events pairing (data/events.ts computeIntervals) are unchanged by
// this file: pomodoro just slices whatever elapsedMs those already
// produce into focus/break phases for display. No new writes, no new
// focus_event kinds.
//
// Cycle numbering (0-based `cycleIndex`): cycle N covers one focus phase
// plus the break that follows it. The break after cycle N is a long break
// exactly when (N + 1) is a multiple of `cyclesToLongBreak` — i.e. after
// completing `cyclesToLongBreak` focus phases, the next break is long.
// Example with cyclesToLongBreak=4: cycles 0,1,2 get short breaks; cycle
// 3's break (the 4th focus phase's break) is the long one; cycle 4 starts
// a fresh set.

export type PomodoroPhase = 'focus' | 'break' | 'longBreak';

export interface PomodoroConfig {
  focusMin: number;
  breakMin: number;
  longBreakMin: number;
  cyclesToLongBreak: number;
}

export interface PomodoroState {
  phase: PomodoroPhase;
  phaseElapsedMs: number;
  phaseRemainingMs: number;
  cycleIndex: number;
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  focusMin: 25,
  breakMin: 5,
  longBreakMin: 15,
  cyclesToLongBreak: 4,
};

// Guard against zero/negative/non-finite minute values (a malformed or
// hand-edited settings.sidecar.pomodoro blob must never produce a
// zero-length phase — that would either divide-by-zero-loop or flash
// phases faster than a render tick). Falls back to the matching default.
function clampMinutes(mins: unknown, fallback: number): number {
  const n = Number(mins);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Guard cyclesToLongBreak to a positive integer >= 1 (1 means "every
// break is a long break"). Falls back to the default (4) when malformed.
function clampCycles(n: unknown, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : fallback;
}

/**
 * Given the SAME elapsedMs that data/focus.ts#elapsedMsOf already produces
 * (continuous across pauses, frozen while paused) and a pomodoro config,
 * return which phase the timer is currently in and how far through it.
 * Pure function — no clock reads, no state. Negative/non-finite elapsedMs
 * clamps to 0 rather than throwing (mirrors elapsedMsOf's own clamping).
 */
export function computePomodoroState(elapsedMs: number, config: PomodoroConfig): PomodoroState {
  const focusMs = clampMinutes(config?.focusMin, DEFAULT_POMODORO_CONFIG.focusMin) * 60000;
  const shortBreakMs = clampMinutes(config?.breakMin, DEFAULT_POMODORO_CONFIG.breakMin) * 60000;
  const longBreakMs = clampMinutes(config?.longBreakMin, DEFAULT_POMODORO_CONFIG.longBreakMin) * 60000;
  const cyclesToLongBreak = clampCycles(
    config?.cyclesToLongBreak,
    DEFAULT_POMODORO_CONFIG.cyclesToLongBreak
  );

  let remaining = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  let cycle = 0;

  // Bounded loop safety net: with clamped positive phase lengths this
  // always terminates within a couple iterations per cycle, but a
  // hard cap keeps a future refactor from ever hanging the UI thread.
  for (let guard = 0; guard < 100000; guard++) {
    if (remaining < focusMs) {
      return { phase: 'focus', phaseElapsedMs: remaining, phaseRemainingMs: focusMs - remaining, cycleIndex: cycle };
    }
    remaining -= focusMs;

    const isLongBreak = (cycle + 1) % cyclesToLongBreak === 0;
    const breakMs = isLongBreak ? longBreakMs : shortBreakMs;
    const breakPhase: PomodoroPhase = isLongBreak ? 'longBreak' : 'break';

    if (remaining < breakMs) {
      return { phase: breakPhase, phaseElapsedMs: remaining, phaseRemainingMs: breakMs - remaining, cycleIndex: cycle };
    }
    remaining -= breakMs;
    cycle += 1;
  }

  // Unreachable in practice (guard above always returns first), kept only
  // to satisfy the return type.
  return { phase: 'focus', phaseElapsedMs: 0, phaseRemainingMs: focusMs, cycleIndex: cycle };
}
