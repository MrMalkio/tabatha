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

// Malkio 2026-07-10: default install path for the desktop companion's frames
// directory — shown as a fallback note when the companion hasn't reported its
// actual (possibly custom-configured) frames_dir yet, e.g. companion offline.
const DEFAULT_CAPTURE_DIR = '%APPDATA%\\Tabatha Desktop\\captures\\';

export default function CortexPanel({ settings = {}, updateSetting = () => {} }) {
  const [state, setState] = useState(null);
  const [companionCapture, setCompanionCapture] = useState(null);
  const [recs, setRecs] = useState([]);
  const [notice, setNotice] = useState('');
  const [digest, setDigest] = useState(null);
  const fileRef = useRef(null);

  // C10a — context reconciliation panel state.
  const [pendingChanges, setPendingChanges] = useState([]);
  const [reconcileSummary, setReconcileSummary] = useState(null);
  const [contextNote, setContextNote] = useState('');
  const [reconcileBusy, setReconcileBusy] = useState(false);

  const refresh = useCallback(() => {
    sendMessage('GET_CAPTURE_STATE').then(setState).catch(() => {});
    sendMessage('GET_COMPANION_CAPTURE_STATE').then(setCompanionCapture).catch(() => {});
    sendMessage('LIST_RECOMMENDATIONS').then((r) => setRecs(r?.recommendations || [])).catch(() => {});
    sendMessage('LIST_PENDING_CHANGES').then((r) => {
      setPendingChanges(r?.proposals || []);
      setReconcileSummary(r?.summary || null);
    }).catch(() => {});
  }, []);

  // Live status: re-fetch when the master toggle flips (prop) and whenever
  // capture state / ledger / recommendations change in storage — the panel
  // previously fetched once on mount and went stale (Malkio 2026-07-10:
  // toggle ON but status card stuck on OFF).
  useEffect(() => { refresh(); }, [refresh, settings.screenshotCapture]);

  useEffect(() => {
    const onStorage = (changes, area) => {
      if (area !== 'local') return;
      if (changes.cortexCaptureState || changes.cortexLedger || changes.cortexRecommendations ||
          changes.cortexPendingChanges || changes.companionCaptureState || changes.settings) {
        refresh();
      }
    };
    try { chrome.storage.onChanged.addListener(onStorage); } catch { /* dev env */ }
    return () => { try { chrome.storage.onChanged.removeListener(onStorage); } catch { /* dev env */ } };
  }, [refresh]);

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

  // ── C10a: context reconciliation ────────────────────────────────
  const runReconcile = async () => {
    setReconcileBusy(true);
    const res = await sendMessage('RUN_RECONCILE', {}).catch(() => null);
    setReconcileBusy(false);
    if (res?.ok) {
      setPendingChanges(res.proposals || []);
      setReconcileSummary(res.summary || null);
      setNotice(`Reconciled — ${res.summary?.total ?? 0} proposal(s) pending.`);
    } else {
      setNotice('Reconcile failed.');
    }
  };

  const decideReconcile = async (id, apply) => {
    await sendMessage(apply ? 'APPLY_RECONCILE' : 'SKIP_RECONCILE', { id }).catch(() => {});
    refresh();
  };

  const submitContext = async () => {
    const text = contextNote.trim();
    if (!text) return;
    setReconcileBusy(true);
    const res = await sendMessage('ADD_RECONCILE_CONTEXT', { text }).catch(() => null);
    setReconcileBusy(false);
    if (res?.ok) {
      setContextNote('');
      setPendingChanges(res.proposals || []);
      setReconcileSummary(res.summary || null);
      setNotice('Context added — re-reconciled.');
    } else {
      setNotice('Could not add context.');
    }
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
        <div style={fieldRow}>
          <span style={fieldLabel}>Last nightly export</span>
          <span style={{ fontSize: '12px' }}>{state?.lastExportDay || 'never'}</span>
        </div>
        <div style={fieldRow}>
          <span style={fieldLabel}>Capture folder (this machine)</span>
          <span style={{ fontSize: '11px', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-all' }}>
            {companionCapture?.framesDir || DEFAULT_CAPTURE_DIR}
            {!companionCapture?.framesDir && (
              <span style={{ ...muted, display: 'block', fontSize: '10px' }}>
                default shown — desktop companion not connected to confirm the real path
              </span>
            )}
          </span>
        </div>
        <div style={{ ...fieldRow, borderBottom: 'none' }}>
          <span style={fieldLabel}>Last frame written (companion)</span>
          <span style={{ fontSize: '12px' }}>
            {companionCapture?.lastCaptureAt ? new Date(companionCapture.lastCaptureAt).toLocaleString() : 'never'}
          </span>
        </div>
        <p style={{ ...muted, margin: '8px 0 0', lineHeight: 1.5 }}>
          Frames land under this folder, partitioned by <code>personal</code>/<code>org</code>
          {' '}(based on clock state) and by browser + OS surface. The desktop companion owns the
          real write while it's connected — Tabatha never uses a Save-As dialog.
        </p>
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

      {/* ════ C9 Voice (v0) — Plan 042 T2/T5 ════════════════════════════════
          Minimal surface: master + "Tabby speaks" toggles only. The rest of
          the voice schema (hotkeys, stt tiers, per-modal overrides) stays
          config-file-level for now. Nested writes go through the whole `voice`
          object because updateSetting is a flat top-level setter. */}
      <div style={{ fontSize: '13px', fontWeight: 700, margin: '20px 0 8px' }}>🗣 Voice (v0)</div>
      <GlassCard style={{ padding: '12px' }}>
        <label style={{ ...fieldRow, cursor: 'pointer' }}>
          <span style={fieldLabel}>Voice features (master)</span>
          <input
            type="checkbox"
            checked={!!settings.voice?.enabled}
            onChange={(e) => updateSetting('voice', { ...(settings.voice || {}), enabled: e.target.checked })}
          />
        </label>
        <label style={{ ...fieldRow, borderBottom: 'none', cursor: settings.voice?.enabled ? 'pointer' : 'not-allowed', opacity: settings.voice?.enabled ? 1 : 0.5 }}>
          <span style={fieldLabel}>Tabby speaks (voice output)</span>
          <input
            type="checkbox"
            disabled={!settings.voice?.enabled}
            checked={!!settings.voice?.output?.enabled}
            onChange={(e) => updateSetting('voice', {
              ...(settings.voice || {}),
              output: { ...((settings.voice || {}).output || {}), enabled: e.target.checked }
            })}
          />
        </label>
        <p style={{ ...muted, margin: '6px 0 0', lineHeight: 1.5 }}>
          Off by default. With output on, the focus-timer and drift prompts are spoken
          (soft tone → a brief “hold off” mic window → a short line) before the dialog
          appears — and always fall back to the dialog if you're away. Web Speech only;
          nothing leaves this machine and no new permissions are used.
        </p>
      </GlassCard>

      {/* ════ C10a — Context Reconciliation (Plan 042) ══════════════════════
          The active, holistic pass. "Reconcile now" sweeps the day's joined
          state (tabs, groups, focuses, ledger) and proposes a coherent SET of
          changes — re-links, retroactive time edits, regroups, orphan adoption
          (#213). Everything is confirm-first: nothing applies without a ✓.
          v1 reasoning is local + deterministic; routed reasoning + audio input
          on the note box are v2. */}
      <div style={{ fontSize: '13px', fontWeight: 700, margin: '20px 0 8px' }}>🔧 Context Reconciliation</div>
      <p style={{ ...muted, margin: '0 0 10px', lineHeight: 1.5 }}>
        Sweeps today's tabs, groups, focuses and observations and proposes a set of fixes for you to
        confirm — re-linking tabs to the right intent, retroactively correcting time, regrouping
        misfiled tabs, and adopting parentless focuses. Nothing changes until you approve each row.
      </p>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
        <button style={btnSmall} disabled={reconcileBusy} onClick={runReconcile}>
          {reconcileBusy ? 'Reconciling…' : 'Reconcile now'}
        </button>
        {reconcileSummary && reconcileSummary.total > 0 && (
          <span style={muted}>
            {[
              ['🔗', reconcileSummary.counts?.byKind?.['tab-intent-link']],
              ['🕐', reconcileSummary.counts?.byKind?.['focus-time']],
              ['📂', reconcileSummary.counts?.byKind?.['tab-group']],
              ['🌱', reconcileSummary.counts?.byKind?.['orphan-adopt']]
            ].filter(([, n]) => n > 0).map(([icon, n]) => `${icon} ${n}`).join(' · ')}
          </span>
        )}
      </div>

      {(() => {
        const RECONCILE_ICONS = { 'tab-intent-link': '🔗', 'focus-time': '🕐', 'tab-group': '📂', 'orphan-adopt': '🌱' };
        const pendingRows = pendingChanges.filter((p) => p.status === 'pending' || !p.status);
        const resolvedRows = pendingChanges.filter((p) => p.status === 'applied' || p.status === 'skipped');
        return (
          <>
            {pendingRows.length === 0 && (
              <p style={{ ...muted, lineHeight: 1.5, marginBottom: '10px' }}>
                No pending changes. Enable capture, use Tabatha for a bit, then hit “Reconcile now”.
              </p>
            )}
            {pendingRows.map((p) => (
              <GlassCard key={p.id} style={{ padding: '10px', marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{RECONCILE_ICONS[p.kind] || '💡'} {p.why}</div>
                    <div style={{ ...muted, marginTop: '3px' }}>confidence: {p.confidence}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button style={btnSmall} onClick={() => decideReconcile(p.id, true)}>✓</button>
                    <button style={btnDanger} onClick={() => decideReconcile(p.id, false)}>✗</button>
                  </div>
                </div>
              </GlassCard>
            ))}
            {resolvedRows.length > 0 && (
              <>
                <div style={{ ...muted, fontWeight: 600, margin: '8px 0 4px' }}>Resolved</div>
                {resolvedRows.slice(-8).map((p) => (
                  <div key={p.id} style={{ ...fieldRow, opacity: 0.7 }}>
                    <span style={{ fontSize: '11px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {RECONCILE_ICONS[p.kind] || '💡'} {p.why}
                    </span>
                    <span style={{ fontSize: '10px', fontWeight: 700, flexShrink: 0, color: p.status === 'applied' ? '#66bb6a' : '#ef5350' }}>
                      {p.status}
                    </span>
                  </div>
                ))}
              </>
            )}
          </>
        );
      })()}

      {/* Free-text context box. Submitting mirrors the note to the ledger and
          re-runs the reconciliation folding it in. TODO(v2): audio input on this
          box via the C9 voice substrate (VoiceInput / routed STT) — no mic in v1. */}
      <div style={{ marginTop: '10px' }}>
        <label style={{ ...fieldLabel, display: 'block', marginBottom: '4px' }}>Anything I should know?</label>
        <textarea
          value={contextNote}
          onChange={(e) => setContextNote(e.target.value)}
          rows={3}
          placeholder="e.g. that hour on QuickBooks was actually for Client X…"
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            background: 'var(--color-bg-base)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)',
            padding: '8px', fontSize: '12px', fontFamily: 'inherit'
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button style={btnSmall} disabled={reconcileBusy || !contextNote.trim()} onClick={submitContext}>
            Add context &amp; re-reconcile
          </button>
        </div>
      </div>
    </div>
  );
}
