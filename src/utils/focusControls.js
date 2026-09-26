// Which primary control (⏸ Pause / ▶ Resume) a surface should offer for the
// current focus. Every non-paused running state is pausable — including
// 'drifted' (timer ran out, or "I diverged" on the away-gap prompt), which the
// background's pauseFocus accepts and the home page already treats as
// pausable. The sidebar used to require exactly 'active', so its Pause
// vanished whenever a timer overran (2026-09-26 report).
const RUNNING = new Set(['active', 'drifted']);

export function primaryFocusControl(focusState) {
  if (focusState === 'paused') return 'resume';
  if (RUNNING.has(focusState)) return 'pause';
  return null;
}
