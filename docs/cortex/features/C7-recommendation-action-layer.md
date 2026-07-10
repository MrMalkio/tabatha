# C7 — Recommendation & Action Layer

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: video V8/V9/V10/V11/V12 · [SOURCE-braindumps.md](../SOURCE-braindumps.md) Dump 2 (dashboard yes/no, reactive vs proactive)
Phase: Phase 1 (read-only dashboard) / Phase 2 (execution)

## Purpose
The ACT layer's human-facing surface. C7 turns C6's optimization output into concrete, approvable suggestions and — from Phase 2 on — executes the approved ones. Phase 1 is strictly read-only: surface, approve, dismiss. Nothing generates or runs until Phase 2.

## Detailed behaviors (numbered, testable)

1. **Recommendation Dashboard is the sole Phase 1 surface.**
   - A read-only list of `cortex_recommendation` records (schema below), each rendered as a card: type icon, one-line title, evidence link back to the pattern, expected savings, Approve / Dismiss.
   - Testable via: a snapshot render against a hand-seeded `cortexRecommendations` fixture covering all four status values.

2. **Placement.**
   - Add `{ id: 'recommendations', label: '💡 Recommendations' }` to the settings `SECTIONS` array (`src/settings/index.jsx`, right after the existing `privacy` entry at line 101) — a natural neighbor since it's gated by the same capture toggle that produces the underlying data.
   - A secondary cross-link (a "New recommendations (N)" badge) can point out from Work Shifts, but settings is the primary home for Phase 1.
   - Testable via: a nav-click integration test asserting the section renders and the badge count matches `pending` record count.

3. **Suggestion types** (Phase 1 = read-only for all four; Phase 2 adds execution):

   | Type | Example (source video) | Evidence pattern | Expected-savings shape |
   |---|---|---|---|
   | `keyboard_shortcut` | repeated manual click-sequence → suggest a hotkey | ≥3–4× repeated UI action (C5) | time / click-count saved |
   | `tool_replacement` | $15/mo paid transcription → local Whisper, 250ms→50ms | repeated use of a paid tool with a known local/free equivalent | `{ costPerMonthSaved, latencyBeforeMs, latencyAfterMs }` |
   | `custom_code` | auto-write a Chrome extension that opens a fixed page-set | repeated identical multi-tab-open sequence | time saved per occurrence × frequency |
   | `morning_digest` | consolidate N manual polling loops into one digest | repeated polling pattern across tabs/sites at similar times of day | interruptions eliminated/day |

4. **Recommendation record schema (canonical, owned by C7):**
   ```json
   {
     "id": "uuid",
     "type": "keyboard_shortcut | tool_replacement | custom_code | morning_digest",
     "title": "string",
     "description": "string",
     "evidence": { "patternId": "string", "observationRefs": ["string"], "repeatCount": 0 },
     "expectedSavings": { "kind": "time|cost|latency|interruptions", "value": 0, "unit": "string", "notes": "string?" },
     "status": "pending | approved | dismissed | executed",
     "createdAt": "ISO", "decidedAt": "ISO|null", "executedAt": "ISO|null",
     "executionRef": "string|null",
     "source": "C6-high | C6-low",
     "partition": "personal | org"
   }
   ```
5. **Approve/dismiss flow (Phase 1).**
   - `LIST_RECOMMENDATIONS` / `APPROVE_RECOMMENDATION` / `DISMISS_RECOMMENDATION` messages; approve/dismiss only flip `status` + set `decidedAt` — no side effects beyond the record.
   - Follows the `handleMessage` switch convention already established in `captureService.js`.
   - Testable via: dispatching each message against a seeded array and asserting only `status`/`decidedAt` change.

6. **On approval (Phase 2+).**
   - Cortex generates the prompt/script/extension using whatever AI it has access to (per the active C8 routing tier) and triggers it as a task.
   - Reactive mode surfaces a follow-up confirmation once generated; proactive mode (C8 `proactivity: 'proactive'`) skips the confirmation and runs it, presenting the result next time the user opens Tabatha.
   - Testable via: a stubbed-generation integration test asserting `status` transitions `approved → executed` only after `executionRef` is set.

7. **Dismiss is terminal but not destructive.**
   - Dismissing never deletes the record (kept for audit + to prevent re-nagging).
   - It can only return to `pending` via C6's cooldown/fresh-evidence rule (see C6 behavior #10).
   - Testable via: asserting a `dismissed` record's id persists across a subsequent nightly pass run.

8. **Morning digest is a standing recommendation, not a one-shot.**
   - Once approved, subsequent EOD passes *update* the existing digest recommendation rather than creating a new one nightly — treated as "already approved, keep applying."
   - Testable via: running two consecutive EOD passes and asserting the digest recommendation count stays at 1.

9. **Personal vs org partition mirrors C4's ledger partition.**
   - Org-clocked-in observations can only produce org-visible recommendations if org policy (C12) allows it.
   - Phase 1 default = personal-only; no org recommendation surfacing yet.
   - Testable via: asserting `partition: 'org'` records never appear in a personal-profile `LIST_RECOMMENDATIONS` response absent explicit org policy.

10. **Health/empty states are explicit, not a blank screen.**
    - "no recommendations yet" vs "Cortex capture is off" (deep-links to the Privacy & Capture toggle) vs "last optimization run failed" (surfaced from C6's `cortexOptimizationRuns`).
    - Phase 1's read-only UI must stay diagnosable without opening devtools.
    - Testable via: rendering the dashboard against each of the three states and asserting the matching banner text.

11. **Default ordering.**
    - Expected savings (rough ordinal: cost > time > latency > interruptions) descending, then most recent.
    - No user-driven reordering in Phase 1 — reordering/prioritization is a C15 config-surface nice-to-have, not a Phase 1 blocker.
    - Testable via: a pure `sortRecommendations(list)` helper, unit-tested against a mixed-type fixture.

12. **Test-observable.**
    - `LIST_RECOMMENDATIONS` must run against a hand-seeded `cortexRecommendations` array with zero chrome/network calls — same chrome-free-logic posture as `captureDecision.js`/`sensitiveDataGuard.js`.

## Data model touchpoints
| Store | Key / table | Written by | Read by |
|---|---|---|---|
| chrome.storage.local | `cortexRecommendations` (NEW, schema above) | C6 (create), C7 (status transitions) | C7 dashboard |
| chrome.storage.local | `cortexOptimizationRuns` (from C6) | C6 | C7 health banner |
| Supabase (opt-in cloud batch) | `tabatha.cortex_recommendations` (proposed migration **023**, not yet authored) | syncService | cross-device dashboard, org view (Phase 2+) |
| Message API | `LIST_RECOMMENDATIONS`, `APPROVE_RECOMMENDATION`, `DISMISS_RECOMMENDATION` (NEW, likely `recommendationService.js`) | dashboard UI | background router |

The proposed `023_cortex_recommendations.sql` should mirror migration 022's shape exactly: `profile_id`/`org_id`/`team_id`/`browser_profile_id`, `partition` check constraint, RLS via `profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())`, and an index on `(profile_id, status, created_at)`.

## Dependencies

**Depends on:**
- C6 (Optimization Loop) — sole source of recommendations in Phase 1.
- C5 (Pattern Engine) — indirectly, via `evidence.patternId` on each record.
- C8 (Agent Orchestration & Routing) — the execution surface Phase 2+ approval triggers into; also resolves "whatever AI it has access to."
- C15 (Config & Interaction-Density Model) — proactivity level gates whether approval auto-executes or just queues.
- C3/C12 (Storage Fabric / Team SOP) — governs the personal≠org visibility rule (behavior #9).

**Feeds:**
- C8 — approved records become C8's Phase 2+ reactive/proactive task input.
- C9 (Voice & Audio) — hotkey 2 ("Speak to Tabby") is a natural alternate approve/dismiss channel; voice can accept/act on a recommendation instead of clicking.
- Work Shifts / home — optional cross-link badge (out of scope to design here).

## Reuse points (VERIFIED)
- `src/settings/index.jsx` — `SECTIONS` array (lines 84-107), existing `privacy` entry at line 101, is the direct precedent for adding `recommendations`.
- `src/settings/UrlRulesSection.jsx` — existing settings sub-page pattern (own file, imported into `index.jsx`, manages a filterable list with per-item actions) — closest template for a new `RecommendationsSection.jsx`.
- `src/settings/TeamActivityPanel.jsx` — existing read-only list-of-cards pattern; closest template for how recommendation cards should render (both are "list of records with light metadata, no heavy interaction").
- `src/workshifts/index.jsx` — `view` state + hash-routing (`#live`, lines 42-44) precedent, if a secondary dashboard placement is wanted later.
- `src/background/services/captureService.js` `handleMessage` switch (lines 115-123) — the exact message-handler convention (`GET_CAPTURE_STATE`, `SET_CAPTURE_ENABLED`, `LIST_OBSERVATIONS`, `CAPTURE_NOW`) `LIST_RECOMMENDATIONS`/`APPROVE_RECOMMENDATION`/`DISMISS_RECOMMENDATION` should follow in a new `recommendationService.js`, registered in `background.js` next to `captureService` (import line 73, registration line 192).
- `supabase/migrations/022_cortex_ledger.sql` — RLS + partition + index pattern to mirror for the proposed `023_cortex_recommendations.sql`.

## Open questions
1. Confirm dashboard placement (settings section vs dedicated page vs Work Shifts view) — behavior #2 proposes settings section as primary; needs sign-off before T5/T6.
2. Expected-savings normalization for sort ordering (#11) — cost/time/latency/interruptions aren't directly comparable; needs either a real conversion heuristic or an accepted rough ordinal.
3. "Whatever AI it has access to" (the spec's own phrasing) for Phase 2+ generation resolves through C8's active tier — but what's the fallback/retry contract if that tier can't produce runnable code mid-generation (e.g. cron-in-harness quota exhausted)?
4. Should a dismissed-then-repeated recommendation surface differently ("this came back") from a brand-new one, to avoid the dashboard feeling repetitive?
5. Migration 023 authorship — should C7's owner draft it now (Phase 1, unapplied like 022) or defer until Phase 2 execution actually needs cloud sync? Leaning toward drafting now for schema parity, applying later.

## Phase & rollout
- **Phase 1:** dashboard read-only, settings-section placement, `LIST/APPROVE/DISMISS` handlers, no execution. Target v7.0.0.
- **Phase 2:** execution (script/extension/prompt generation) via C8 tiers ②/③; morning digest becomes a standing feature; migration 023 applied.
- **Phase 4:** proactive hand-off fully wired to C8's autonomous overnight agent — approved/queued recommendations become the overnight task set.
