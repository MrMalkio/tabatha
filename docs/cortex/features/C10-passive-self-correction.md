# C10 — Passive Self-Correction

> 🔗 Google Doc: https://docs.google.com/document/d/1EGJhxsnFOFMG6qurAX0mFAoUa4mragRZ060PH2HR5nY/edit?usp=drivesdk&ouid=104108780460431833741

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5 (C10)
Origin: user — Dump 2 (`SOURCE-braindumps.md`)
Phase: Phase 3 (per §8); pure-logic groundwork already partially seeded in Phase 1 T1 (`observationLedger.js`)

## Purpose

C10 is the mechanism that makes Tabby "almost invisible" (Dump 2, verbatim: *"many users need Tabby to be as passive as possible, almost invisible, constantly updating its own records of what's happening, what tabs are linked to what, what intents really are, how long something has actually been worked on — assuming the human is always lacking on updating and management"*).

Tabatha already asks the human to do bookkeeping it could infer: link a tab to a focus, name an intent accurately, close out a stint on time. C10 is the standing assumption that this bookkeeping will be **wrong or late**, and a background process whose job is to notice and fix it from observation — not from nagging the user to fix it themselves. It is the direct complement to C15's interaction-density dial: turning the dial toward "invisible" is only honest if something is actually keeping the records straight while the buttons go untouched.

## Detailed behaviors

### 1. What gets corrected
- **Tab↔intent/focus links.** A tab opened under one focus context but actually used for another (the user forgot to switch, or `autoFocusService`'s drift detector never fired because confidence stayed low) gets its `associatedTabIds` membership corrected once the evidence is unambiguous.
- **What an intent "really is."** A focus/intent's `label` was set once at creation and then the work drifted (e.g. "Q3 report" balloons into "Q3 report + client emails"). C10 proposes a relabel or a split, sourced from the same category/domain/companion-app signals `autoFocusService.matchTab()` already computes — reused, not reimplemented.
- **Actual duration worked.** `elapsedMs` on a focus item, and `work_ms` on a clock stint, are both susceptible to the same failure mode already solved once for stints: a session dies without a clean stop (SW suspend, crash, forgotten clock-out) and the record freezes at a stale value. C10 generalizes the **reconstruct-from-frozen-state** pattern already shipped for stints (`reconstructStintFromStatus` in `src/utils/stintReconciliation.js`, migration 017's ghost-stint fix) to focus/intent duration: recompute `elapsedMs` from the last known-good heartbeat/observation rather than trusting a value that stopped updating.

### 2. Correction pipeline
1. **Trigger.** Runs opportunistically — on SW wake, on ledger write (C4), and on a periodic alarm (interval gated by the C15 density dial: more frequent for "passive" users who won't self-correct, sparser for "high-touch" users who do their own upkeep).
2. **Evidence gathering.** Reads the Observations Ledger (C4) window around the record in question: capture refs (C1), category/domain matches, companion active-app signal, URL rules — the exact evidence classes `autoFocusService.matchTab()` / `isTabRelatedToFocus()` already assemble for real-time drift detection. C10 is that same evidentiary logic run **retroactively** over already-written records instead of gating a live prompt.
3. **Confidence scoring.** Reuses the `CONFIDENCE_ORDER = ['low', 'medium', 'high', 'explicit']` ladder from `autoFocusService.js` verbatim as the correction-confidence model:
   - `explicit` — an unambiguous rule match (URL rule, exact companion-app pairing) → auto-apply silently.
   - `high` — category/domain corroborated by ≥2 independent signals → auto-apply, logged as reversible.
   - `medium` — single-signal match → auto-apply only if the density dial is set to "passive"; otherwise queue as a suggestion in the same surface C7's Recommendation Dashboard already renders.
   - `low` — logged to the ledger as a hint only, never auto-applied (mirrors `matchTab()`'s `'low'` tier today, which is "logged only, never surfaced").
4. **Write-back.** Applies the correction to the live record (`focusEngine.items[...]`, `clock_sessions` row, etc.) through the same service functions normal user edits go through — C10 never bypasses validation just because the writer is Tabatha instead of the user.
5. **Audit.** Every correction — auto-applied or queued — is logged via `logAudit()` (`src/background/services/activityAuditService.js`) with a new `action` value namespace, e.g. `SELF_CORRECT_TAB_LINK`, `SELF_CORRECT_INTENT_LABEL`, `SELF_CORRECT_DURATION`, carrying `previousState`/`newState` so the diff is inspectable. This reuses the existing FIFO-capped (`chrome.storage.local`, 500 entries) audit log verbatim — no new storage primitive.
6. **Reversal.** Because every correction's `previousState` is captured in the audit entry, a "revert" action can be built directly on top of `getAuditLog()` without new plumbing: replay `previousState` back onto the record and log a `REVERT_CORRECTION` entry pointing at the original. Phase 3 ships auto-apply + audit; the revert *action* (a UI affordance in Logs/Settings) is scoped as an open question below rather than assumed shipped.

### 3. Passive-by-default framing
- Default posture is **silent auto-apply at `high`/`explicit` confidence, queue at `medium`, log-only at `low`** — this is the "almost invisible" default the braindump asks for, expressed as a concrete threshold rather than a vibe.
- The threshold itself is a C15 config surface value (`correctionConfidenceThreshold`, mirroring `autoFocusConfidence` in `DEFAULT_SETTINGS`), so a high-touch user can require `explicit`-only auto-apply and see everything else as a dashboard suggestion instead.
- C10 never fabricates a correction with no evidentiary basis — "always behind" is an assumption about the human, not a license to guess; below `low`-confidence evidence, no correction is proposed at all.

## Example scenario

A user starts a focus labeled "Invoice cleanup" and works in QuickBooks (via companion) plus two browser tabs. Ten minutes in, they open a third tab to look up a vendor's tax ID for the same invoice, but never click "link tab" — the InBar prompt (`autoFocusService`'s drift detector) doesn't fire because the tab shares a domain-group with an already-associated tab (Layer 3 relation), so it was never even flagged as drift. Two hours later the SW is suspended mid-session (browser restart) and `focusEngine.items[...].elapsedMs` freezes at 47 minutes even though the user kept working for another 20 after that point, evidenced by continued capture refs and companion active-app pings.

At the next correction pass, C10:
1. Confirms the third tab is `high`-confidence related (same domain group as an associated tab) → silently finalizes the tab↔focus link (it was already *functionally* linked via Layer 3, so this is a housekeeping write, not a surprising one).
2. Detects `elapsedMs` stopped advancing while capture/companion evidence continued for 20 more minutes → recomputes `elapsedMs` to 67 minutes at `high` confidence (two independent evidence sources: capture refs + companion heartbeat) → auto-applies.
3. Logs both as `SELF_CORRECT_TAB_LINK` and `SELF_CORRECT_DURATION` audit entries with `previousState`/`newState`, so if the recomputed duration is wrong (e.g. the user stepped away without pausing), it's a one-click revert away from being undone once the revert UI (open question #1) exists.

## Interfaces (proposed message contracts)

Following the `handleMessage(type, message)` router pattern already used by `captureService.js`/`autoFocusService.js`:

| Message | Direction | Purpose |
|---|---|---|
| `LIST_CORRECTIONS` | popup/settings → background | Read recent self-corrections (filtered `activityAuditLog` entries by `action` prefix `SELF_CORRECT_*`) |
| `GET_CORRECTION_SETTINGS` | popup/settings → background | Read the C15-driven `correctionConfidenceThreshold` + cadence |
| `SET_CORRECTION_SETTINGS` | settings → background | Update threshold/cadence (density-dial-scoped) |
| `REVERT_CORRECTION` | popup/settings → background | Replay a `previousState` back onto the record; logs `REVERT_CORRECTION` |
| `RUN_SELF_CORRECTION_PASS` | debug/settings → background | Manual trigger, for testing/debug parity with `CAPTURE_NOW`'s manual-trigger precedent |

## Data model touchpoints

- **Reads:** `tabatha.cortex_observations` (migration 022), `focusEngine` (chrome.storage.local), `clockSession`/`clock_sessions`, `urlRules`, categories (`getCategories()`), companion active-app signal (`companionBridge`).
- **Writes:** existing focus/intent/clock records in place (no schema change required for the write path itself); `activityAuditLog` (chrome.storage.local, existing key/shape, new `action` values only).
- **New (proposed, not yet migrated):** a lightweight `corrections` sub-shape inside the audit entry's `metadata` (e.g. `{ correctionType, confidence, evidenceRefs: [captureRef, observationId, ...] }`) — additive to the existing audit entry shape, no migration needed since `activityAuditLog` is an unstructured chrome.storage array. If corrections need cloud durability beyond the 500-entry local cap, that is a future `cortex_corrections` table — **not** scoped for Phase 3; flagged as an open question.

## Dependencies (transformer graph)

**Depends on:**
- C4 Observations Ledger — the evidence substrate every correction reads.
- C1 Adaptive Capture Engine — capture frames raise correction confidence when text/telemetry evidence alone is ambiguous.
- C11 Cross-Signal Attention Accounting — human-vs-agent attribution must resolve *before* C10 corrects "how long something was actually worked on," otherwise AI-agent-driven browser activity could be misattributed as human focus time.
- C15 Config & Interaction-Density Model — supplies the confidence threshold and correction cadence.
- Existing (pre-Cortex): `autoFocusService.js` (confidence ladder + evidence-matching logic, reused not reimplemented), `activityAuditService.js` (audit sink), `stintReconciliation.js` (reconstruct-from-frozen-state precedent).

**Feeds:**
- C5 Pattern Engine — corrected records are cleaner input; a high rate of a specific correction type is itself a pattern worth surfacing (e.g. "this URL rule keeps needing a manual override").
- C7 Recommendation & Action Layer — `medium`-confidence corrections queue into the same dashboard.
- C14 Agent Data Map & Governance — corrections are a distinct signal type that must be cataloged (which records get silently rewritten, by what confidence rule).

## Reuse points (VERIFIED)

| Asset | Path | Verified | Reuse |
|---|---|---|---|
| Audit trail sink (`logAudit`, `getAuditLog`, FIFO cap 500) | `src/background/services/activityAuditService.js` | read 2026-07-10 | Correction write-back + revert source |
| Confidence ladder (`CONFIDENCE_ORDER`, `confidenceMeets`) | `src/background/services/autoFocusService.js:19,52-54` | read 2026-07-10 | Correction confidence model, verbatim tiers |
| Evidence matching (`matchTab`, `isTabRelatedToFocus`, 5-layer association) | `src/background/services/autoFocusService.js:96-245` | read 2026-07-10 | Retroactive correction evidence gathering |
| Record-repair-from-frozen-state precedent | `src/utils/stintReconciliation.js` (`reconstructStintFromStatus`) | read 2026-07-10 | Duration recomputation pattern, generalized from stints to focus/intent |
| Ledger substrate | `src/utils/observationLedger.js`, migration `022_cortex_ledger.sql` | read 2026-07-10 | Evidence source (`tabatha.cortex_observations`) |
| `autoFocusConfidence` setting precedent | `src/background/constants.js:41` | read 2026-07-10 | Pattern for the new `correctionConfidenceThreshold` setting |

## Implementation approach

Follows the pure-logic-first precedent Phase 1 T1 already established for C1/C2/C4 (`src/utils/captureDecision.js`, `sensitiveDataGuard.js`, `observationLedger.js`, `retentionPolicy.js`, each with a matching `test/*.test.js` under Node's built-in `node --test`, 62 tests total per the T1 commit). C10 should ship as:
- `src/utils/selfCorrection.js` — pure functions: `scoreCorrectionConfidence(evidence)`, `proposeTabLinkCorrection(record, ledgerWindow)`, `recomputeDuration(record, ledgerWindow)`. No chrome/supabase dependency, unit-testable in isolation exactly like `stintReconciliation.js` and the T1 modules.
- A thin `src/background/services/selfCorrectionService.js` shell that orchestrates the pure helpers against `chrome.storage`/`activityAuditService`, mirroring `captureService.js`'s "shell wraps pure logic" split.

## Related existing feature specs

Per program spec §3's "Cortex absorbs/relates" reuse map, C10 has no direct pre-Cortex feature-file predecessor (self-correction is a genuinely new capability), but two adjacent drafts constrain its design:
- **`docs/features/213-focus-task-data-architecture.md`** — normalizes the focus/task data model. C10's tab↔intent-link and duration corrections write into whatever shape #213 lands on; this file's proposed write-back path (§Detailed behaviors, step 4) assumes corrections go through the same service functions normal edits do, so it should track #213's schema rather than assume today's `focusEngine.items` shape is final.
- **`docs/features/212-inpop-intent-dropdown-header.md`** — user-facing intent editing surface. Any `medium`-confidence correction queued for review (rather than auto-applied) is a natural fit for this surface rather than a new UI, consistent with C10's "reuse the existing dashboard/InBar surfaces" posture.

## Open questions

1. **Revert UX** — the audit log makes reversal technically trivial, but no surface (Logs panel, Settings) currently exposes a "revert this correction" button. Scoped as Phase 3 stretch, not core.
2. **Cross-device correction races** — if two installs (per `browser_profiles`/`awarenessService`) both observe the same focus and independently propose corrections, which wins? Likely: correction is scoped to records the install itself owns (no cross-install correction in v1) — needs explicit confirmation.
3. **Cloud durability of corrections beyond the 500-entry local audit cap** — do we need a `cortex_corrections` Supabase table, or is local-only acceptable for Phase 3 given Cortex Phase 1 is already local-first?
4. **Correction of AI-agent-attributed time (C11 dependency)** — until C11 ships (Phase 5), C10 has no reliable way to exclude agent-driven browser activity from "how long something was actually worked on." Phase 3 C10 should document this as a known blind spot rather than silently over-crediting the human.

## Phase & rollout

- **Phase 3** (per program spec §8): ship confidence-scored auto-correction for tab↔intent links and duration recomputation, gated by the C15 density dial, fully audited via `activityAuditService`. No revert UI required to ship.
- **Phase 5 follow-up:** once C11 lands, re-run C10's duration-correction logic with human-vs-agent attribution as an additional evidence input, closing open question #4.
