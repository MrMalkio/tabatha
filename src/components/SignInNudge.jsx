/* global chrome */
// ============================================================
// SignInNudge — 6.7.88 Workspace sign-in reminder
//
// Shown at the top of Home, Sidebar and Settings ONLY for Workspace policy
// installs (installType 'admin') that have no Tabatha session. It is a
// reminder, never a gate: inline in normal flow, nothing is dimmed or
// disabled. "Remind me later" hides it for 2 hours (shared across surfaces),
// then it returns. It disappears the moment the user signs in — the
// background (signInNudgeService) rewrites 'signInNudgeState' on sign-in.
// ============================================================
import { useEffect, useState } from 'react';
import { useChromeStorage, sendMessage } from '../hooks/useChromeStorage';
import {
  SIGNIN_NUDGE_STATE_KEY,
  SIGNIN_NUDGE_SNOOZE_KEY,
  shouldShowNudge,
  snoozeUntil
} from '../utils/signInNudge.js';

const TICK_MS = 60 * 1000;

function openSignIn() {
  try {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html#sync') });
  } catch {
    sendMessage('OPEN_SIGN_IN');
  }
}

export default function SignInNudge({ compact = false, style = {}, onSignIn }) {
  const [state] = useChromeStorage(SIGNIN_NUDGE_STATE_KEY, null);
  const [snoozedUntil, setSnoozedUntil] = useChromeStorage(SIGNIN_NUDGE_SNOOZE_KEY, 0);
  const [now, setNow] = useState(() => Date.now());

  // Ask the background to re-check once on mount (cheap), then tick so an
  // expired "later" brings the banner back without a reload.
  useEffect(() => {
    sendMessage('REFRESH_SIGNIN_NUDGE');
    const iv = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(iv);
  }, []);

  const show = shouldShowNudge({
    installType: state?.installType,
    signedIn: state?.signedIn,
    snoozedUntil,
    now,
  });
  if (!show) return null;

  const color = '#f59e0b';

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
        padding: compact ? '5px 8px' : '8px 12px',
        marginBottom: compact ? '5px' : '8px',
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', color,
        fontSize: compact ? '10px' : '12px', fontWeight: 500,
        ...style,
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        You're using Tabatha through your workspace. Sign in so your time and intents sync.
      </span>
      <button
        onClick={() => (onSignIn ? onSignIn() : openSignIn())}
        style={{
          background: color, color: '#000', border: 'none', borderRadius: 'var(--radius-sm)',
          padding: compact ? '2px 8px' : '4px 12px', fontSize: compact ? '10px' : '11px', fontWeight: 700,
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        Sign in
      </button>
      <button
        onClick={() => setSnoozedUntil(snoozeUntil())}
        title="Hide for 2 hours"
        style={{
          background: 'transparent', border: 'none', color, cursor: 'pointer',
          fontSize: compact ? '10px' : '11px', padding: '0 2px', flexShrink: 0,
        }}
      >
        Remind me later
      </button>
    </div>
  );
}
