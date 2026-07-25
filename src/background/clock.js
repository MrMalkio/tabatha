// ════════════════════════════════════════════
// Tabatha — Clock Service (background module)
// Handles: CLOCK_IN, CLOCK_OUT, TOGGLE_BREAK, GET_CLOCK_STATUS
// Storage keys: clockSession, clockHistory
// ════════════════════════════════════════════

/**
 * @param {Function} getStorage - async (keys) => data
 * @param {Function} setStorage - async (data) => void
 * @param {Function} broadcastMessage - (msg) => void
 */
export function createClockService(getStorage, setStorage, broadcastMessage) {

  async function clockIn() {
    const { clockSession } = await getStorage('clockSession');
    if (clockSession?.active) return { error: 'Already clocked in', session: clockSession };
    const session = {
      active: true,
      clockedInAt: new Date().toISOString(),
      clockedOutAt: null,
      breaks: [],
      onBreak: false,
      breakStartedAt: null,
      // Sync forensics S5 / bug #5: break-END had no timestamp of its own, so
      // `last_clock_event_at` was derived as `breakStartedAt || clockedInAt`
      // and jumped BACKWARDS to the shift start when a break ended. A sibling
      // install still reading `on_break` was then strictly newer and dragged
      // this install back onto break. Recording the break-end instant makes
      // the published event time monotonic. See lastClockEventAt().
      breakEndedAt: null
    };
    await setStorage({ clockSession: session });
    broadcastMessage({ type: 'CLOCK_SESSION_UPDATED' });
    return { session };
  }

  async function clockOut() {
    const { clockSession } = await getStorage('clockSession');
    if (!clockSession?.active) return { error: 'Not clocked in' };
    // End any active break
    if (clockSession.onBreak && clockSession.breakStartedAt) {
      clockSession.breaks.push({ start: clockSession.breakStartedAt, end: new Date().toISOString() });
    }
    clockSession.active = false;
    clockSession.clockedOutAt = new Date().toISOString();
    clockSession.onBreak = false;
    clockSession.breakStartedAt = null;

    // Archive to history
    const { clockHistory } = await getStorage('clockHistory');
    const history = clockHistory || [];
    history.unshift({ ...clockSession });
    await setStorage({ clockSession, clockHistory: history.slice(0, 365) });
    broadcastMessage({ type: 'CLOCK_SESSION_UPDATED' });
    return { session: clockSession };
  }

  async function getClockStatus() {
    const { clockSession } = await getStorage('clockSession');
    return { session: clockSession || { active: false } };
  }

  async function toggleBreak() {
    const { clockSession } = await getStorage('clockSession');
    if (!clockSession?.active) return { error: 'Not clocked in' };

    if (clockSession.onBreak) {
      // End break
      const endedAt = new Date().toISOString();
      clockSession.breaks.push({ start: clockSession.breakStartedAt, end: endedAt });
      clockSession.onBreak = false;
      clockSession.breakStartedAt = null;
      // S5/#5: stamp the break-end so it can advance last_clock_event_at.
      // Without this the published timestamp regressed to clockedInAt.
      clockSession.breakEndedAt = endedAt;
    } else {
      // Start break
      clockSession.onBreak = true;
      clockSession.breakStartedAt = new Date().toISOString();
    }
    await setStorage({ clockSession });
    broadcastMessage({ type: 'CLOCK_SESSION_UPDATED' });
    return { session: clockSession };
  }

  /**
   * Get the last completed session from history (for "last session" display).
   */
  async function getLastSession() {
    const { clockHistory } = await getStorage('clockHistory');
    const history = clockHistory || [];
    if (history.length === 0) return { lastSession: null };
    const last = history[0];
    // Compute duration
    const clockedIn = new Date(last.clockedInAt).getTime();
    const clockedOut = new Date(last.clockedOutAt).getTime();
    let breakMs = 0;
    for (const b of last.breaks || []) {
      breakMs += new Date(b.end).getTime() - new Date(b.start).getTime();
    }
    return {
      lastSession: {
        ...last,
        totalMs: clockedOut - clockedIn,
        workMs: clockedOut - clockedIn - breakMs,
        breakMs,
      }
    };
  }

  /**
   * Get all clock history entries (for work logs/shifts page).
   */
  async function getClockHistory() {
    const { clockHistory } = await getStorage('clockHistory');
    const history = (clockHistory || []).map(session => {
      const clockedIn = new Date(session.clockedInAt).getTime();
      const clockedOut = new Date(session.clockedOutAt).getTime();
      let breakMs = 0;
      for (const b of session.breaks || []) {
        breakMs += new Date(b.end).getTime() - new Date(b.start).getTime();
      }
      return {
        ...session,
        totalMs: clockedOut - clockedIn,
        workMs: clockedOut - clockedIn - breakMs,
        breakMs,
      };
    });
    return { history };
  }

  return {
    clockIn,
    clockOut,
    getClockStatus,
    toggleBreak,
    getLastSession,
    getClockHistory,
  };
}
