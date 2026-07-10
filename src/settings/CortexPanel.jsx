import React, { useState, useEffect, useRef, useCallback } from 'react';
import { GlassCard } from '../components/ui/GlassCard';
import { sendMessage } from '../hooks/useChromeStorage';

// ════════════════════════════════════════════
// Cortex Panel (Plan 040 Phase 1 T5) — the C7 Recommendation Dashboard v1.
// Read-only surface: shows capture status + observations, lists imported
// recommendations, and lets the user approve/dismiss (yes/no). Execution of
// approved items is Phase 2. Also hosts the C8 tier-① "cron-in-harness"
// bundle download and a manual ledger-export trigger.
// ════════════════════════════════════════════

const fieldRow = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--color-border)' };
const fieldLabel = { fontSize: '12px', fontWeight: 500 };
const muted = { fontSize: '11px', color: 'var(--color-text-muted)' };
const btnSmall = { background: 'var(--color-accent-primary)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#000', padding: '4px 12px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' };
const btnGhost = { ...btnSmall, background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' };
const btnDanger = { ...btnSmall, background: '#ef535022', color: '#ef5350' };

const TYPE_ICONS = {
  hotkey: '⌨️', 'tool-replacement': '🔁', 'custom-code': '🧩', digest: '📰', other: '💡'
};

const selectStyle = { background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', padding: '4px 8px', fontSize: '11px' };

export default function CortexPanel({ settings = {}, updateSetting = () => {} }) {
  const [state, setState] = useState(null);
  const [recs, setRecs] = useState([]);
  const [notice, setNotice] = useState('');
  const [digest, setDigest] = useState(null);
  const fileRef = useRef(null);

  const refresh = useCallback(() => {
    sendMessage('GET_CAPTURE_STATE').then(setState).catch(() => {});
    sendMessage('LIST_RECOMMENDATIONS').then((r) => setRecs(r?.recommendations || [])).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const decide = async (id, status) => {
    await sendMessage('SET_RECOMMENDATION_STATUS', { id, status }).catch(() => {});
    refresh();
  };

  const importFile = async (file) => {
    try {
      const payload = JSON.parse(await file.text());
      const res = await sendMessage('IMPORT_RECOMMENDATIONS', { payload });
      setNotice(res?.ok
        ? `Imported ${res.added} new recommendation(s)${res.rejected?.length ? `, ${res.rejected.length} rejected` : ''}.`
        : `Import failed: ${res?.error}`);
    } catch (err) {
      setNotice(`Import failed: ${err.message}`);
    }
    refresh();
  };

  const downloadCron = async (harness) => {
    const res = await sendMessage('DOWNLOAD_HARNESS_CRON', { harness }).catch(() => null);
    setNotice(res?.ok ? `Cron bundle saved to Downloads. ${res.instructions}` : `Failed: ${res?.error || 'unknown'}`);
  };

  const runExport = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await sendMessage('RUN_LEDGER_EXPORT', { day: today }).catch(() => null);
    setNotice(res?.exported
      ? `Exported ${res.records} observation(s) for ${res.day} to Downloads.`
      : `Nothing to export for ${res?.day || today}.`);
    refresh();
  };

  const exportActions = async () => {
    const res = await sendMessage('EXPORT_APPROVED_ACTIONS').catch(() => null);
    setNotice(res?.exported
      ? `Exported ${res.actions} approved action(s) to ${res.path}.`
      : `Nothing to export (${res?.reason || 'error'}).`);
  };

  const loadDigest = async () => {
    const d = await sendMessage('GET_MORNING_DIGEST').catch(() => null);
    setDigest(d?.schema ? d : { sections: [] });
  };

  const pending = recs.filter((r) => r.status === 'pending');
  const decided = recs.filter((r) => r.status !== 'pending');
  const approvedCount = recs.filter((r) => r.status === 'approved').length;

  return (
    <div style={{ marginTop: '20px' }}>
      <div style={{ fontSize: '13px', fontWeight: 700, margin: '0 0 8px' }}>🧠 Cortex — Observation & Optimization</div>
      <p style={{ ...muted, margin: '0 0 12px', lineHeight: 1.5 }}>
        Local-first and opt-in. When screenshot capture is on, Tabatha records context-driven
        observations (and frames, redacted per your sensitive-data rules) under your Downloads
        folder, exports a nightly ledger, and an overnight agent in your own harness turns it
        into the recommendations below. Nothing leaves this machine.
      </p>

      <GlassCard style={{ padding: '12px', marginBottom: '12px' }}>
        <div style={fieldRow}>
          <span style={fieldLabel}>Capture status</span>
          <span style={{ fontSize: '12px', fontWeight: 600, color: state?.enabled ? '#66bb6a' : 'var(--color-text-muted)' }}>
            {state?.enabled ? 'ON' : 'OFF'}
          </span>
        </div>
        <div style={fieldRow}>
          <span style={fieldLabel}>Observations in ledger</span>
          <span style={{ fontSize: '12px' }}>{state?.observationCount ?? '—'}</span>
        </div>
        <div style={fieldRow}>
          <span style={fieldLabel}>Last capture</span>
          <span style={{ fontSize: '12px' }}>{state?.lastCaptureAt ? new Date(state.lastCaptureAt).toLocaleString() : 'never'}</span>
        </div>
        <div style={{ ...fieldRow, borderBottom: 'none' }}>
          <span style={fieldLabel}>Last nightly export</span>
          <span style={{ fontSize: '12px' }}>{state?.lastExportDay || 'never'}</span>
        </div>
      </GlassCard>

      {/* C15 config surface v1 (Plan 041 T6): routing tier + proactivity */}
      <GlassCard style={{ padding: '12px', marginBottom: '12px' }}>
        <div style={fieldRow}>
          <span style={fieldLabel}>AI routing tier (C8 ladder)</span>
          <select
            style={selectStyle}
            value={settings.cortexRouting || 'harness'}
            onChange={(e) => updateSetting('cortexRouting', e.target.value)}
          >
            <option value="harness">① Harness cron (local files, no key)</option>
            <option value="proxy">② Backend proxy (sign-in required)</option>
            <option value="gateway" disabled>③ Vercel AI Gateway (key pending)</option>
            <option value="byok" disabled>④ Bring your own key (Phase 2+)</option>
          </select>
        </div>
        <div style={{ ...fieldRow, borderBottom: 'none' }}>
          <span style={fieldLabel}>Proactivity</span>
          <select
            style={selectStyle}
            value={settings.cortexProactivity || 'reactive'}
            onChange={(e) => updateSetting('cortexProactivity', e.target.value)}
          >
            <option value="reactive">Reactive — I approve everything</option>
            <option value="proactive">Proactive — act overnight on approved kinds</option>
          </select>
        </div>
        {settings.cortexProactivity === 'proactive' && (
          <p style={{ ...muted, margin: '6px 0 0' }}>
            Overnight agents may generate digests and instructions for approved items.
            Generated code is always review-first — never auto-installed.
          </p>
        )}
      </GlassCard>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        <button style={btnGhost} onClick={runExport}>Export today's ledger now</button>
        <button style={btnGhost} onClick={() => downloadCron('claude-code')}>Set up nightly agent (Claude Code)</button>
        <button style={btnGhost} onClick={() => downloadCron('codex')}>Set up nightly agent (Codex)</button>
        <button style={btnGhost} onClick={() => fileRef.current?.click()}>Import recommendations…</button>
        {approvedCount > 0 && (
          <button style={btnGhost} onClick={exportActions}>Export approved actions ({approvedCount})</button>
        )}
        <button style={btnGhost} onClick={loadDigest}>Preview morning digest</button>
        <input
          ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.[0]) importFile(e.target.files[0]); e.target.value = ''; }}
        />
      </div>
      {notice && <p style={{ ...muted, color: 'var(--color-accent-primary)', margin: '0 0 12px' }}>{notice}</p>}

      {digest && (
        <GlassCard style={{ padding: '12px', marginBottom: '12px' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '6px' }}>📰 Morning digest — {digest.day}</div>
          {digest.sections?.length ? digest.sections.map((s) => (
            <div key={s.source} style={fieldRow}>
              <span style={{ fontSize: '11px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.source}{s.titles?.length ? ` — ${s.titles[0]}` : ''}
              </span>
              <span style={{ fontSize: '10px', flexShrink: 0 }}>{s.visits} visit{s.visits === 1 ? '' : 's'}</span>
            </div>
          )) : <p style={muted}>No digest sections — approve a “digest” recommendation first.</p>}
        </GlassCard>
      )}

      <div style={{ fontSize: '12px', fontWeight: 700, margin: '0 0 6px' }}>
        Recommendations {pending.length ? `(${pending.length} pending)` : ''}
      </div>
      {recs.length === 0 && (
        <p style={{ ...muted, lineHeight: 1.5 }}>
          None yet. Enable capture, let the nightly export run (03:30), have your harness agent
          process it, then import the recommendations file it writes.
        </p>
      )}
      {pending.map((rec) => (
        <GlassCard key={rec.id} style={{ padding: '12px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '12px', fontWeight: 600 }}>
                {TYPE_ICONS[rec.type] || '💡'} {rec.title}
              </div>
              <div style={{ ...muted, marginTop: '4px', lineHeight: 1.4 }}>{rec.rationale}</div>
              {rec.expectedSavings && (
                <div style={{ fontSize: '10px', color: '#66bb6a', marginTop: '4px' }}>Expected: {rec.expectedSavings}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              <button style={btnSmall} onClick={() => decide(rec.id, 'approved')}>Yes</button>
              <button style={btnDanger} onClick={() => decide(rec.id, 'dismissed')}>No</button>
            </div>
          </div>
        </GlassCard>
      ))}
      {decided.length > 0 && (
        <>
          <div style={{ ...muted, fontWeight: 600, margin: '8px 0 4px' }}>Decided</div>
          {decided.slice(0, 10).map((rec) => (
            <div key={rec.id} style={{ ...fieldRow, opacity: 0.7 }}>
              <span style={{ fontSize: '11px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {TYPE_ICONS[rec.type] || '💡'} {rec.title}
              </span>
              <span style={{ fontSize: '10px', fontWeight: 700, flexShrink: 0, color: rec.status === 'approved' ? '#66bb6a' : rec.status === 'executed' ? 'var(--color-accent-primary)' : '#ef5350' }}>
                {rec.status}
              </span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
