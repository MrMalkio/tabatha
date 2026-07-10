# C6 — Optimization Loop

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5, §8
Origin: video V6/V7/V15 · [SOURCE-braindumps.md](../SOURCE-braindumps.md) Dump 1 (processing cadence) · Dump 2 (autonomous agent hand-off)
Phase: Phase 1 (single nightly high-level pass) → Phase 4 (full multi-cadence + proactive hand-off)

## Purpose
The second half of the THINK layer. C6 runs the master "how do I economize this workflow?" optimization prompt(s) over C5's validated patterns, on a schedule tuned to model/session cost, and emits the recommendation drafts the ACT layer (C7) surfaces. C6 owns *what to think about and when*; it does not own *which model/harness runs it* (that's C8) or *how it's presented/approved* (that's C7).

## Detailed behaviors (numbered, testable)

1. **Two cadences, one loop.**
   - LOW = intraday, runs several times during active hours, cheap/heuristic only.
   - HIGH = once per day at end-of-day (EOD), deep pass over the full day's validated patterns.
   - Testable via: a pure `selectCadence(now, lastLowAt, lastHighAt, config)` helper returning `'low'|'high'|null`, unit-testable with fixed clocks.

2. **Low-level pass — Phase 4 only, not built in Phase 1.**
   - Scans only the ledger delta since the last low pass.
   - Buckets candidates already flagged by C5; by default does **not** call a model — it just primes the queue the EOD pass consumes.
   - A config flag (`cortexLowPassLetItCook`) may allow an immediate cheap-model call once a paid tier exists.
   - Testable via: feeding a synthetic ledger delta and asserting the queue gains entries with zero model calls recorded.

3. **High-level pass — EOD, the only pass Phase 1 ships.**
   - Runs at a configurable time (default: fixed local clock, e.g. 23:00, or "on last clock-out" — TBD, see open questions).
   - Reads the full day's C5-validated patterns + anything the low pass queued.
   - Invokes the master prompt (`docs/cortex/prompts/economize-workflow.v1.md`) over that input.
   - Writes recommendation drafts into C7's store.
   - Testable via: a dry-run mode that stubs the model call and asserts the prompt payload shape matches the documented I/O contract (#7).

4. **"Guide tomorrow" digest.**
   - In addition to raw recommendations, the EOD pass writes a short structured summary (top-N economization opportunities + suggested next-day focus ordering).
   - Lets the next morning's dashboard (C7) or an autonomous agent (C8 proactive mode) consume it without re-running the pass.
   - Testable via: asserting the digest's top-N count and ordering match the underlying recommendation list's `expectedSavings` ranking.

5. **Autonomous hand-off.**
   - When C8's proactivity config is `proactive`, the EOD pass's full raw output (not just the digest) becomes the overnight autonomous agent's task input.
   - The agent may act overnight (build an extension, assemble a dashboard, finish flagged knowledge work); the user reviews results next morning via C7.
   - Testable via: asserting the hand-off payload is a strict superset of the digest payload (nothing dropped between digest and raw hand-off).

6. **Master prompts are versioned artifacts.**
   - Every optimization prompt lives at `docs/cortex/prompts/<name>.vN.md`, following `prompts/README.md` conventions — one file per version, never edited in place.
   - `economize-workflow.v1.md` is currently a placeholder; authoring it is a Phase 1 prerequisite for T5, owned by C6.
   - Testable via: a lint check that no `.vN.md` file's git history shows a content diff without a new `vN+1` sibling being added first.

7. **Prompt I/O contract.**
   - Input = the nightly ledger export (C4) + the ≥3–4× validated pattern list (C5), both in a JSON/JSONL shape TBD with C4 (see open questions).
   - Output = a JSON array of recommendation-shaped objects matching C7's schema (see C7 §"Recommendation record schema"), so C6's output is directly ingestible without a translation layer.
   - Testable via: schema-validating the prompt's output against C7's JSON schema in CI once the prompt exists.

8. **Cost-aware scheduling.**
   - Pass frequency and prompt size are tuned to the active routing tier's model/session limits (C8).
   - Phase 1 (cron-in-harness) runs against the user's own harness session budget, so C6 defaults to **one** high-level pass/day and a queue-only low pass (no model call) to avoid burning the user's quota.
   - Paid tiers (Phase 2+) can afford true multi-pass intraday calls since they're metered separately.
   - Testable via: asserting default `cortexLowPassIntervalHours` is `0` (disabled) whenever `cortexRoutingTier === 'cron-harness'`.

9. **Phase 1 concretely = one nightly cron-in-harness pass.**
   - C8 places a scheduled task/script that (a) reads the nightly ledger export C4 writes, (b) invokes `economize-workflow.v1.md` via the harness's own model access, (c) writes recommendation records into `cortexRecommendations` local storage (+ optional Supabase batch sync).
   - No intraday low pass ships in Phase 1.
   - Testable via: an end-to-end fixture that seeds a ledger export, runs the scripted pass, and asserts `cortexRecommendations` gained the expected records.

10. **Dedupe/idempotency.**
    - A pattern (by C5's pattern id) with an existing `pending`/`approved` recommendation must not be re-proposed.
    - Re-proposing after `dismissed` requires either fresh repeat evidence (≥3-4 more occurrences since dismissal) or an elapsed cooldown window (default proposed: 7 days — needs confirmation).
    - Testable via: running the pass twice over the same ledger and asserting no duplicate `pending` record for the same `patternId`.

11. **Fail-soft.**
    - If the harness/model call fails (quota, offline, harness not installed), C6 logs a `failed` run and skips the digest.
    - Must never block clock/focus/tab core functionality; Cortex is additive per the program spec's design principles.
    - Testable via: forcing the model call to throw and asserting core services (clock, focus) are unaffected and a `failed` run record exists.

12. **Test-observable runs.**
    - Every run (low or high, any outcome) appends a `cortexOptimizationRuns` record: `{ id, ranAt, cadence: 'low'|'high', tier, patternsConsidered, recommendationsEmitted, status: 'ok'|'failed'|'skipped', durationMs }`.
    - Phase 1 must be verifiable end-to-end without a UI — a script reading `cortexOptimizationRuns` + `cortexRecommendations` is sufficient to confirm the nightly pass worked.

## Data model touchpoints
| Store | Key / table | Written by | Read by |
|---|---|---|---|
| chrome.storage.local | `cortexLedger` (existing, T2) | captureService | C6's export step |
| chrome.storage.local | `cortexOptimizationRuns` (NEW) | C6 | C7 dashboard health state, debugging |
| chrome.storage.local | `cortexRecommendations` (NEW — schema owned by C7) | C6 (writer) | C7 (owner/reader) |
| flat-file export | nightly ledger export, path TBD under `captureStoragePath` (e.g. `Tabatha/Cortex/exports/YYYY-MM-DD.json`) | C4 | C6 cron-in-harness (Phase 1) |
| `docs/cortex/prompts/economize-workflow.v1.md` | prompt artifact | authored once (C6), versioned | C6 (Phase 1), C8 (routes it to a tier) |
| Supabase (future, cloud-batch, opt-in) | `tabatha.cortex_recommendations` (not yet migrated — C7's responsibility) | syncService | cross-device dashboard |

C6 authors no new Supabase migration itself — it only writes recommendation-shaped JSON into C7's local store. Migration 022 (ledger + capture refs) already covers everything C6 reads.

## Dependencies

**Depends on:**
- C4 (Observations Ledger) — nightly flat-file export is C6's Phase 1 input; `LIST_OBSERVATIONS` (captureService.js) is the equivalent live-storage read for in-session preview/debug.
- C5 (Pattern Engine) — supplies the ≥3–4× validated pattern list; C6 never re-validates repetition, it trusts C5's threshold.
- C8 (Agent Orchestration & Routing) — the execution surface (which model, which harness, which tier) the prompt actually runs against; C6 is routing-agnostic, it authors the *prompt*, C8 decides *how* it executes.
- `docs/cortex/prompts/README.md` — versioning conventions C6 must follow authoring `economize-workflow.v1.md`.

**Feeds:**
- C7 (Recommendation & Action Layer) — C6's EOD pass is C7's only recommendation source in Phase 1.
- C8 proactive mode — raw EOD output is the overnight autonomous agent's task input.
- A "guide tomorrow" digest surface (home/sidebar — placement undecided, see open questions).

## Reuse points (VERIFIED)
- `src/background/services/captureService.js` — `LIST_OBSERVATIONS` handler (line 119) and `getStorage(LEDGER_KEY)` primitive are the existing ledger-read path; C6's export step should call this rather than re-implementing ledger access.
- `src/utils/observationLedger.js` — pure, unit-tested `normalizeObservation`/`partitionOf` helpers (T1). The export formatter belongs alongside these as another pure helper (e.g. `src/utils/ledgerExport.js`), matching the project's existing chrome-free-logic convention (`captureDecision.js`, `sensitiveDataGuard.js`).
- `src/background/constants.js` `DEFAULT_SETTINGS` (lines 49-61) — `cortexLedgerCap: 5000` already exists; C6's new defaults (e.g. `cortexHighPassTime`, `cortexLowPassIntervalHours`) belong here, following the existing inline-comment style.
- `docs/cortex/prompts/README.md` — versioning convention already documented; must be followed exactly for v1.
- `.headbox/plan-registry.md` row **040** — confirms "Pattern+Optimization via cron-in-harness" is explicitly **T5**, still pending (partial 3/6). This file's Phase 1 scope must track that entry, not exceed it.
- `supabase/migrations/022_cortex_ledger.sql` — RLS/partition/index pattern (`profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())`) any future `cortex_recommendations` migration (C7's responsibility) should mirror.

## Open questions
1. Where does the "guide tomorrow" digest surface? No confirmed UI owner yet — home page has a "last session" card precedent (session log 2026-05-09) that's a plausible slot.
2. Does the Phase 4 low-level pass ever call a model, or stay a zero-cost heuristic prime forever? Dump 1 says "multiple times throughout the day at low levels" without pinning whether "low" means cheap-model or no-model.
3. Nightly export file format is undecided — C4's spec says "a flat file the harness/agents can read" without a schema. Needs C4↔C6 agreement (proposed: JSON Lines keyed by `observed_at`) before T5 is buildable.
4. Cooldown window for re-proposing a dismissed-then-repeated pattern (behavior #10) needs a confirmed default.
5. Once Anthropic (K5, currently "Need" for backend-proxy per API-KEYS.md) is procured, does the nightly pass prefer it over OpenAI/harness-default, or does Phase 1 stay model-agnostic indefinitely? Affects how model-specific the prompt authoring can be.

## Phase & rollout
- **Phase 1 (Plan 040, T5):** one nightly high-level pass, cron-in-harness (C8 tier ①), reads the nightly ledger export, `economize-workflow.v1.md` authored + versioned, writes `cortexRecommendations` + `cortexOptimizationRuns`. No intraday pass. Target v7.0.0.
- **Phase 2:** low-level pass added as a heuristic-only prime once a paid tier can afford it; C7 execution wiring lets approved recommendations actually run.
- **Phase 4:** full multi-cadence (low passes may call a cheap model), proactive overnight hand-off fully live, tied to C8's proactivity config.
