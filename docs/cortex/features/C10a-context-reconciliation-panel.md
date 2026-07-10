# C10a — AI Context Reconciliation & Confirmation Panel

Status: scoped (Fable, 2026-07-10 — from Malkio's direct request)
Parent: [Program Spec](../00-cortex-program-spec.md) §5 · Siblings: [C10](./C10-passive-self-correction.md) (passive), [C11a](./C11a-agent-interaction-surfaces.md) (attribution), [C7](./C7-recommendation-action-layer.md) (approve/dismiss pattern)
Origin: user (2026-07-10): "when active, the agent should use all available context efficiently to ensure tabs, groups, tasks, intents and such are all properly connected and nested, and retroactively edit timeframes based on the information provided — surfaced via an easy-to-understand confirmation panel for pending AI changes, with a large text box for new context about overall changes, with audio input as an option."
Phase: Phase 3–4 (after C10 v1 + C11a, both shipped v1 2026-07-10)

## Purpose
C10 quietly repairs records one correction at a time. C10a is the **active, holistic pass**: an agent session sweeps ALL available context — tabs, tab groups, tasks, intents, focuses, ledger observations, checkpoint notes, calendar — and proposes a coherent *set* of changes: re-linking, re-nesting (tab→intent→focus→task→project), and **retroactive timeframe edits** (start/end/elapsed corrections informed by the evidence). Nothing applies silently: everything lands in a **confirmation panel** the human reads in one glance and approves/adjusts, optionally adding new context by typing or speaking.

## Detailed behaviors
1. **Trigger**: manual ("Reconcile now" button on home/Work Shifts), on agent-session end (C11a — "here's what I understood from this agent session"), or scheduled (piggyback the C10 nightly, but output → pending panel instead of auto-apply).
2. **Full-context sweep**: unlike C10's per-record detectors, C10a reasons over the joined state: open/closed tabs + groups, all focuses/intents (incl. nesting: sub-focus, parent task, project/client tags), the observations ledger, checkpoints, and any free-text context the user just provided. Uses the C8 routing tier (harness/proxy) for the reasoning pass — the ledger export + a `reconcile-context.v1` master prompt (new versioned artifact in `docs/cortex/prompts/`).
3. **Proposal types** (superset of C10's): tab↔intent relink, tab→group assignment, intent→focus nesting, focus→task/project attachment, orphan adoption (per #213: no orphan tasks), **retroactive time edits** (backdate a focus start, trim/extend elapsed, split a block across two focuses — reusing the Plan 037 time-edit handlers: `ADJUST_FOCUS_TIME`, `SET_FOCUS_ELAPSED`), and merge/duplicate-collapse suggestions (LinkMergeModal precedent).
4. **Confirmation panel** (the heart of the feature):
   - One screen, plain language, grouped by kind: "🔗 3 re-links · 🕐 2 time corrections · 📂 1 regroup".
   - Each row: before → after, one-line WHY with the evidence ("this tab was open during 'Turning over 60 North' for 40 min"), and per-row ✓ apply / ✗ skip. Bulk "apply all" / "skip all".
   - **Large free-text box** ("Anything I should know?") — the user adds overall context ("that hour on QuickBooks was actually for client X"); submitting re-runs the reconciliation with the new context folded in.
   - **Audio input on the text box** — the C9 voice substrate (existing `VoiceInput` webspeech path; upgrades to `routed` STT per the voice DECISION doc). Spoken context also mirrors to the ledger (C9 hard rule).
   - Every applied change goes through the C10 apply/revert machinery (audited, reversible, `mutateKey` single-round-trip writes) and is stamped `controller: 'ai-agent'`, `controllerSource` per C11a.
5. **Efficiency mandate** ("use all available context efficiently"): batch the sweep into ONE routed reasoning call per run (ledger export envelope + state snapshot), not per-item calls; cache the last reconciliation watermark so re-runs only consider deltas.
6. **Trust ladder**: v1 = everything requires confirmation. Later, per-kind auto-apply thresholds can migrate rows into C10's silent path once the user has approved that kind N times (learned trust, config in C15).

## Data model touchpoints
- `cortexPendingChanges` storage key — the proposal set awaiting confirmation `{id, kind, before, after, why, evidence[], status: pending|applied|skipped}` (cap ~200, FIFO).
- Reuses `cortexCorrections` apply/revert audit path (C10) for applied rows.
- New prompt artifact `docs/cortex/prompts/reconcile-context.v1.md`.
- User-provided context (text or transcribed audio) → ledger observation `kind:'context-note'` + fed into the reconciliation input.

## Dependencies (transformer graph)
- **Depends on:** C10 (apply/revert machinery — shipped), C11a (attribution stamping — shipped), C8 (routing tier for the reasoning pass), C9 (audio input path), C4 (ledger as evidence).
- **Feeds:** C7 (the panel is a specialization of the recommendation-dashboard pattern), C11 analytics (honest post-reconciliation timelines), #213 data normalization (no orphans), Plan 032 Deep Editing (shares the review-queue concept — reconcile before deep-editing).

## Reuse points
| Existing asset | Path | Use |
|---|---|---|
| Self-correction apply/revert + audit | `src/background/services/selfCorrectionService.js` | apply engine for confirmed rows |
| Time-edit handlers (Plan 037) | `src/background/services/focusService.js` (`ADJUST_FOCUS_TIME`, `SET_FOCUS_ELAPSED`) | retroactive timeframe edits |
| Link/merge UI | `src/components/ui/LinkMergeModal.jsx` | row-level before→after patterns |
| Voice input | `src/components/ui/VoiceInput.jsx` + voice DECISION doc | audio into the context box |
| Recommendation panel | `src/settings/CortexPanel.jsx` | approve/dismiss interaction precedent |
| Agent sessions | `src/background/services/agentSessionService.js` | trigger-on-session-end + attribution |

## Open questions
1. Panel home: dedicated page (like Work Shifts), home-page drawer, or the settings Cortex panel? (Recommend: home drawer — it's a daily-driver surface.)
2. Should agent-session-end ALWAYS propose a reconciliation, or only when the session made writes?
3. Retroactive edits that cross a clock-in boundary (personal⇄org repartition) — allowed with extra confirmation, or blocked?
4. How does the free-text context persist — one-off input or a durable "context journal" the user can revisit?

## Phase & rollout
- **v1 (Phase 3, after Plan 042 voice basics):** manual trigger + panel + text box + apply/skip, reusing C10 machinery; reasoning via harness tier.
- **v2 (Phase 4):** agent-session-end trigger, audio input, delta watermarks, proxy-tier reasoning.
- **v3 (Phase 4+):** learned per-kind auto-apply (trust ladder → C10 silent path).
