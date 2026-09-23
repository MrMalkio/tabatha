import React, { useState } from 'react';
import { sendMessage } from '../hooks/useChromeStorage';

// TR-14a (2026-07-23) — non-intrusive feedback affordance for the Sidebar
// and Home surfaces (extension half of TR-14; the Sidecar side is a
// separate track). Reuses the EXACT feedback path the popup already ships
// (src/popup/index.jsx's FeedbackForm): SUBMIT_FEEDBACK → background's
// feedbackService.js → POST {SUPABASE_URL}/functions/v1/feedback-to-asana,
// with the same { kind, text, version, context } payload contract
// (feedbackService.buildPayload attaches version/localId/machineId/
// submittedAt server-side — this component only supplies kind/text/
// context.surface/context.url). No new backend, no new message type.
//
// Deliberately NOT a modal: at rest it's a single small button, and
// expanding it opens a small anchored popover — never a full-screen
// overlay — so it never blocks or interrupts the surface's primary content.
//
//   variant="corner" — a persistent small circular button pinned to a
//     screen corner (position: fixed). Used on Home, where the page is a
//     tall scrolling dashboard and a corner affordance is the natural
//     "always reachable, never in the way" placement.
//   variant="inline" — a plain icon button that sits in normal flow next to
//     other icon buttons (e.g. the Sidebar's ⚙️/⏱️/🏠 header row) — i.e. the
//     "settings-adjacent link" option. Its popover anchors under the button
//     instead of floating at a screen corner.
export default function FeedbackWidget({ surface, variant = 'corner' }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('bug');
  const [text, setText] = useState('');
  const [status, setStatus] = useState(null); // null | 'sending' | 'sent' | 'error'

  const submit = async () => {
    if (!text.trim() || status === 'sending') return;
    setStatus('sending');
    const resp = await sendMessage('SUBMIT_FEEDBACK', {
      kind,
      text: text.trim(),
      context: { surface, url: (typeof window !== 'undefined' && window.location?.href) || null },
    });
    if (resp?.ok) {
      setStatus('sent');
      setText('');
      setTimeout(() => { setStatus(null); setOpen(false); }, 1500);
    } else {
      setStatus('error');
    }
  };

  const isCorner = variant === 'corner';

  const wrapperStyle = isCorner
    ? { position: 'fixed', bottom: '14px', right: '14px', zIndex: 500 }
    : { position: 'relative', display: 'inline-flex' };

  const popoverStyle = isCorner
    ? { position: 'absolute', bottom: '38px', right: 0, width: '230px' }
    : { position: 'absolute', top: '22px', right: 0, width: '210px' };

  return (
    <div style={wrapperStyle} data-search-id={`feedback-widget-${surface}`}>
      {open && (
        <div
          style={{
            ...popoverStyle,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: '8px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.28)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <select
              value={kind}
              onChange={e => setKind(e.target.value)}
              style={{ fontSize: '11px', padding: '3px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', outline: 'none' }}
            >
              <option value="bug">🐛 Bug</option>
              <option value="idea">💡 Idea</option>
            </select>
            <span style={{ fontSize: '9px', color: 'var(--color-text-muted)', flex: 1 }}>To the Tabatha team</span>
            <button
              onClick={() => { setOpen(false); setStatus(null); }}
              style={{ background: 'transparent', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer', fontSize: '11px' }}
            >✕</button>
          </div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={kind === 'bug' ? 'What went wrong?' : "What's your idea?"}
            rows={3}
            autoFocus
            style={{ width: '100%', padding: '5px 7px', fontSize: '11px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', outline: 'none', resize: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={submit}
              disabled={!text.trim() || status === 'sending'}
              style={{ background: 'transparent', border: '1px solid var(--color-accent-primary)', color: 'var(--color-accent-primary)', borderRadius: 'var(--radius-sm)', padding: '3px 10px', fontSize: '11px', cursor: text.trim() && status !== 'sending' ? 'pointer' : 'default', opacity: text.trim() && status !== 'sending' ? 1 : 0.5, fontWeight: 600 }}
            >{status === 'sending' ? 'Sending…' : 'Send'}</button>
            {status === 'sent' && <span style={{ fontSize: '11px', color: '#66bb6a' }}>✓ Thanks!</span>}
            {status === 'error' && <span style={{ fontSize: '11px', color: '#ef5350' }}>Couldn't send — try later</span>}
          </div>
        </div>
      )}

      {isCorner ? (
        <button
          onClick={() => setOpen(o => !o)}
          title="Send feedback"
          style={{
            width: '30px', height: '30px', borderRadius: '50%',
            background: open ? 'var(--color-accent-primary)' : 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: open ? '#000' : 'var(--color-text-muted)',
            cursor: 'pointer', fontSize: '13px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >💬</button>
      ) : (
        <button
          onClick={() => setOpen(o => !o)}
          title="Send feedback"
          style={{ background: 'none', border: 'none', fontSize: '12px', cursor: 'pointer', padding: '0 2px', color: open ? 'var(--color-accent-primary)' : 'var(--color-text-muted)' }}
        >💬</button>
      )}
    </div>
  );
}
