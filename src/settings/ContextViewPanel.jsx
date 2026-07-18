// ============================================================
// Context View Customization Panel — Epic 9 (Plan 040, addenda 2 §D / 5 item 5)
//
// Design doc: docs/superpowers/specs/2026-07-18-epic9-cv-customization-design.md
// (CeeCee's gate-clearing ruling at its foot: allow-list hardcoded, no
// backfill of the legacy sidecar.* keys, colors/intensity out of v1.)
//
// Controls what shows on a paired TV/3rd-screen running the Sidecar's
// Context View — day countdown, "up next" queue, bottom timeline,
// checkpoint preview, and the phone-away alert's fade speed. Writes go
// through the same SECURITY DEFINER RPC `tabatha.update_profile_settings`
// (migration 038) the Sidecar's own settings writers use, so a write here
// and a write from the Sidecar never race each other (design doc §1) — this
// is the extension's first-ever write into `profiles.settings`.
//
// This is the extension's own Supabase session (Sync & Account), independent
// of whether the *phone* has ever signed into the Sidecar — a Sidecar-only
// user renders with the hardcoded defaults (all toggles on) and never needs
// to touch this panel; an extension-only user can still customize a paired
// screen even if they've never opened Tabby on their phone.
// ============================================================
import React, { useEffect, useState } from 'react';
import { updateProfileSettings } from '../services/supabaseClient';

const sectionLabel = { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-text-muted)', fontWeight: 600, marginBottom: '10px', marginTop: '16px' };
const fieldRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '13px' };
const fieldLabel = { color: 'var(--color-text-primary)', fontWeight: 500 };
const fieldSub = { color: 'var(--color-text-muted)', fontSize: '11px', marginTop: '2px', maxWidth: '360px' };
const inputStyle = { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', padding: '4px 8px', fontSize: '12px', outline: 'none', width: '70px' };
const toggleStyle = (on) => ({ width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: on ? 'var(--color-accent-primary)' : 'var(--color-border)', position: 'relative', transition: 'background 0.2s', flexShrink: 0 });
const toggleDot = (on) => ({ position: 'absolute', top: '2px', left: on ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: '#fff', transition: 'left 0.2s' });

// Same hardcoded defaults as sidecar/src/lib/contextViewSettings.ts —
// every toggle defaults ON, matching today's always-rendered behavior. A
// profile with no `contextView` key at all (every user before this ships)
// starts here, unchanged, until the first toggle is touched.
const DEFAULTS = {
  showDayCountdown: true,
  showUpNext: true,
  showTimeline: true,
  showCheckpoints: true,
  dayResetHour: 0,
  focusAwayImmediate: false,
};

function Toggle({ value, onChange, disabled }) {
  return (
    <button onClick={() => !disabled && onChange(!value)} style={{ ...toggleStyle(value), opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }} disabled={disabled}>
      <span style={toggleDot(value)} />
    </button>
  );
}

export default function ContextViewPanel({ profile, isSignedIn, refreshProfile }) {
  const cv = { ...DEFAULTS, ...(profile?.settings?.contextView || {}) };

  const [local, setLocal] = useState(cv);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Re-sync local toggle state when the server-side profile changes (e.g.
  // the realtime profile channel in useAuth.js refetches after this RPC
  // commits, or another install touched the same key).
  useEffect(() => {
    setLocal({ ...DEFAULTS, ...(profile?.settings?.contextView || {}) });
  }, [profile?.settings?.contextView]);

  const patch = async (key, value) => {
    if (!profile?.id) return;
    setLocal((prev) => ({ ...prev, [key]: value })); // optimistic
    setSaving(true);
    setError(null);
    try {
      const res = await updateProfileSettings({
        profileId: profile.id,
        patch: { contextView: { [key]: value } },
      });
      if (!res?.success) {
        throw new Error(res?.error || 'Save failed');
      }
      refreshProfile?.();
    } catch (err) {
      setError(err?.message || String(err));
      // Roll back the optimistic toggle on failure.
      setLocal((prev) => ({ ...prev, [key]: cv[key] }));
    } finally {
      setSaving(false);
    }
  };

  if (!isSignedIn) {
    return (
      <div data-search-id="contextview-signin">
        <div style={sectionLabel}>📺 Context View</div>
        <p style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
          Sign in (Sync & Account) to customize the Context View.
        </p>
      </div>
    );
  }

  return (
    <div data-search-id="contextview-panel">
      <div style={sectionLabel}>📺 Context View</div>
      <p style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '12px' }}>
        Controls what shows on a paired TV/3rd screen running the Sidecar's Context View.
      </p>

      <div style={fieldRow} data-search-id="contextview-day-countdown">
        <div>
          <div style={fieldLabel}>Day countdown</div>
          <div style={fieldSub}>Minutes left in the day (top-right).</div>
        </div>
        <Toggle value={local.showDayCountdown} onChange={(v) => patch('showDayCountdown', v)} disabled={saving} />
      </div>

      <div style={fieldRow} data-search-id="contextview-up-next">
        <div>
          <div style={fieldLabel}>Up next</div>
          <div style={fieldSub}>Queue preview under the current focus.</div>
        </div>
        <Toggle value={local.showUpNext} onChange={(v) => patch('showUpNext', v)} disabled={saving} />
      </div>

      <div style={fieldRow} data-search-id="contextview-timeline">
        <div>
          <div style={fieldLabel}>Timeline</div>
          <div style={fieldSub}>Bottom checkpoint/event timeline bar.</div>
        </div>
        <Toggle value={local.showTimeline} onChange={(v) => patch('showTimeline', v)} disabled={saving} />
      </div>

      <div style={fieldRow} data-search-id="contextview-checkpoint-preview">
        <div>
          <div style={fieldLabel}>Show last checkpoint</div>
          <div style={fieldSub}>Checkpoint counter + most recent note preview.</div>
        </div>
        <Toggle value={local.showCheckpoints} onChange={(v) => patch('showCheckpoints', v)} disabled={saving} />
      </div>

      <div style={fieldRow} data-search-id="contextview-fade-speed">
        <div>
          <div style={fieldLabel}>Phone-away fade</div>
          <div style={fieldSub}>On = instant red alert; off = slow 7s fade-in.</div>
        </div>
        <select
          value={local.focusAwayImmediate ? 'immediate' : 'slow'}
          onChange={(e) => patch('focusAwayImmediate', e.target.value === 'immediate')}
          disabled={saving}
          style={{ ...inputStyle, width: '110px' }}
        >
          <option value="slow">Slow fade</option>
          <option value="immediate">Immediate</option>
        </select>
      </div>

      <div style={fieldRow} data-search-id="contextview-day-reset-hour">
        <div>
          <div style={fieldLabel}>Day resets at (hr)</div>
          <div style={fieldSub}>The day-countdown counts down to this hour (0-23).</div>
        </div>
        <input
          type="number"
          min="0"
          max="23"
          value={local.dayResetHour}
          disabled={saving}
          onChange={(e) => {
            let v = parseInt(e.target.value, 10);
            if (!Number.isFinite(v) || v < 0 || v > 23) v = 0;
            patch('dayResetHour', v);
          }}
          style={inputStyle}
        />
      </div>

      {error && (
        <p style={{ fontSize: '11px', color: '#ef5350', marginTop: '10px' }}>⚠ {error}</p>
      )}
    </div>
  );
}
