# C5 — Pattern Engine

> 🔗 Google Doc: https://docs.google.com/document/d/1wkvKOXMTuopenE0idz-VblgC6qT1YSpyeJEBe8l73uI/edit?usp=drivesdk&ouid=104108780460431833741

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5, §8
Origin: video V3/V5
Phase: Phase 1 (runs inside the C6/C8 cron-in-harness, not as extension code)

## Purpose

The first half of the THINK layer. C5 reads the Observations Ledger (C4), detects **repeated behaviors**, and only promotes something to a "pattern" once it has repeated enough to be signal rather than noise. This is the explicit guardrail called out in the source video (V5) and the program spec: without a repetition floor, every one-off oddity in 5000+ ledger rows would surface as a "finding," drowning the useful ones. Phase 1's key architectural decision (program spec §8 item 5, Decisions log) is that C5 does **not** run as extension/service-worker code — it runs as prompt logic inside the harness cron job C6/C8 write into the user's existing Claude Code / Codex install, reading the nightly plain-file ledger export (C4 behavior 8). C5 in Phase 1 is therefore mostly a *specification of a threshold and a sampling rule*, enforced in the master optimization prompt (and any lightweight pre-processing script) rather than in `src/`.

## Detailed behaviors

1. **Repetition threshold: ≥3–4 occurrences within a window.** A behavior is only flagged as a pattern once it has recurred **at least 3 times** (the video's number) — the program spec's own summary tightens this to "3–4×" as the acceptable range, so Phase 1 should treat **3 as the floor and 4 as the conservative default**, configurable rather than hardcoded, so a user/org can tune sensitivity. "Window" is deliberately left open in the source material (not specified as calendar-day vs rolling N-days) — Phase 1 default: a rolling **7-day** window over the ledger export, re-evaluated on each nightly cron run. A behavior that repeated 3× six weeks ago and never since should not still be "active" — the window bounds recency.
2. **What counts as "the same behavior" is a dedupe-key-shaped match, not literal equality.** C5 should reuse the *concept* behind C4's `dedupeKey()` (`src/utils/observationLedger.js:81`, `surface|host-or-app|focusId|intentId`) to group ledger rows into candidate repeated-behavior buckets, then count distinct occurrences (e.g. distinct sessions/dwell-periods, not raw row count, since one dwell can produce many capture-timed rows before C4's dedupe-collapsing — see C4 Open Question 2 — is implemented). Until C4 ships consecutive-dedupe collapsing, C5's counting logic in the harness prompt must itself collapse consecutive same-key rows before counting toward the 3–4× threshold, or it will over-count a single long dwell as "many repetitions."
3. **A pattern candidate needs a minimum descriptive signal before vision-on-demand is even considered.** Text metadata (host, app, title, category, focus/intent labels) is the first and default evidence source for *what* the repeated behavior is. Most patterns (e.g. "opened `mail.google.com` 5×/day between two other tabs," "same 3 tool tabs reopened every session") should be fully explainable from text metadata alone, at zero additional vision-model cost.
4. **Vision-on-demand triggers only when text is insufficient to explain a validated (≥3–4×) pattern.** This is explicitly shared machinery with C1/C3: C5 requests ~N frames (video's number: ~20, program spec doesn't override it — Phase 1 default: N ≈ 5–10 per candidate pattern, deliberately smaller than the video's 20, to keep vision-model cost low per the design principle "reuse first / passive by default"; the video's 20 was for a different framing — sampling an entire day, not one candidate pattern) via the `storage_uri` on the pattern's associated `cortex_capture_refs` rows (C3). Vision-on-demand is a **cost gate**, not a default step — most patterns should never invoke it.
5. **Vision extraction is scoped to the ambiguous slice, not the whole session.** Only frames from the specific repeated-behavior window are sampled — C5 does not do open-ended "look at everything" vision passes; that would defeat the entire "why do we already have 8,640 lines of metadata" reuse premise the program spec leads with.
6. **Pattern output shape (for C6 to consume) is not yet formally specified**, but per the program spec's THINK→ACT flow (C5 feeds C6, C6 feeds C7's recommendation dashboard) it needs at minimum: a stable pattern identifier, the matched `dedupeKey`-equivalent signature, occurrence count + window, the representative ledger row(s)/timestamps as evidence, and (if invoked) the vision extraction summary. Phase 1 ships this as a section of the master optimization prompt's *output*, i.e. a structured block the harness prompt is instructed to produce — not a database table (see Open questions on whether Phase 2 needs one).
7. **Runs on the same cadence as C6's harness cron**, not independently. Per program spec §8 item 5, C5+C6 ship together as "v1 via cron-in-harness" — there is no standalone C5 scheduled job in Phase 1; the pattern-detection step is a stage *within* the master optimization prompt run, not a separate invocation. Multi-cadence timing (intraday-low, EOD-high — program spec §5 C6) is a C6 concern that C5 inherits: whichever cadence the harness cron fires at, C5's threshold/window logic runs identically, just against however much ledger data has accumulated since the last run.
8. **No repetition-count state persists between cron runs in Phase 1.** Because C5 reads a fresh nightly export each run (not a live incrementally-updated store), a pattern that was 2× yesterday and hits 3× today re-evaluates from the full rolling window each time — there is no separate "pattern tracker" database. This is simple but means every run re-scans the whole window; acceptable at Phase 1 data volumes (thousands of rows/week), flagged as a scaling concern for later phases.

## Data model touchpoints

| Table / key | Role in C5 |
|---|---|
| Nightly plain-file ledger export (C4 behavior 8) | C5's sole Phase 1 input — read by the harness cron job, not queried live from `chrome.storage` or Supabase. |
| `tabatha.cortex_observations` (migration 022) | Would be C5's input if/when it runs server-side (Phase 2+ backend-proxy routing tier) instead of cron-in-harness; not used in Phase 1. |
| `tabatha.cortex_capture_refs.storage_uri` | The pointer C5 follows for vision-on-demand frame sampling. |
| (not yet defined) pattern output structure | See behavior 6 — a prompt-output convention in Phase 1, not a stored table. Phase 2 candidate: a `cortex_patterns` table (id, signature, occurrence_count, window_start/end, evidence refs, vision_summary) mirroring the migration-022 shape, so C7's dashboard has something durable to render yes/no against instead of re-parsing prompt output each time. |
| `docs/cortex/prompts/` (program spec §10) | Where the master "economize" / pattern-detection system prompt that encodes the 3–4× threshold and vision-on-demand trigger logic is versioned. Directory exists (`docs/cortex/prompts/README.md`) but the actual prompt has not been authored yet. |

## Dependencies (transformer graph)

- **Depends on:**
  - C4 (Observations Ledger) — the data source; specifically its nightly export (Phase 1) rather than the live `chrome.storage` ledger.
  - C1 (Adaptive Capture Engine) + C3 (Storage & Retention Fabric) — supply the frames sampled during vision-on-demand, via `storage_uri`.
  - C8 (Agent Orchestration & Routing) — C5 physically executes *inside* whatever harness C8's cron-in-harness step wrote the scheduled task into; C5 has no independent runtime in Phase 1.
- **Feeds:**
  - C6 (Optimization Loop) — consumes validated (≥3–4×) patterns as the input to "how do I economize this workflow?" recommendation generation. In Phase 1 this is really "C5 is a stage of C6's prompt," not a separate hop.
  - C7 (Recommendation & Action Layer) — indirectly, via C6; a pattern is what a recommendation is *about*.
  - C14 (Agent Data Map & Governance) — if/when a `cortex_patterns` table exists (Phase 2), it needs a DATA-MAP entry.

## Reuse points (verified)

| Asset | Path | Reuse |
|---|---|---|
| Dedupe-key concept (grouping logic to adapt for repetition counting) | `src/utils/observationLedger.js:81` (`dedupeKey`) | C5's harness-side pattern-matching should use the same `surface|host-or-app|focusId|intentId` grouping shape so a "pattern" in C5's sense is defined consistently with a "context" in C4's sense — not a new taxonomy. |
| Vision-on-demand's frame source | `tabatha.cortex_capture_refs.storage_uri` (migration 022, line 51) | Already modeled; C5 doesn't need new schema to *locate* candidate frames, only to decide *when* to fetch them. |
| Cron-in-harness precedent / governance | Program spec §5 C8, citing Headbox integration | C5's entire Phase 1 execution model (prompt logic in an existing Claude Code/Codex scheduled task) depends on C8's routing tier ① being built first; C5 has no standalone code path. |
| Master prompt versioning location | `docs/cortex/prompts/README.md` (directory scaffolded, confirmed present, empty of actual prompts) | Where the 3–4× threshold + vision-on-demand trigger logic must be encoded as prompt text, per program spec §10. |

## What's already built (Phase 1 T1–T3)

- Nothing C5-specific has shipped in T1–T3. T1–T3 delivered C3's retention planner, C4's normalization/partition helpers, and the capture-service shell (C1/C2 orchestration) — all upstream of C5. C5 has **zero lines of code or prompt text** as of this expansion; it is purely specified here.
- The `docs/cortex/prompts/` directory exists as a placeholder (`README.md` only).

## Open questions

1. **Window definition (calendar-day vs rolling N-days) is not specified in the source material.** This spec defaults to a rolling 7-day window as the Phase 1 choice; needs confirmation, since a shorter window (e.g. 3-day) would surface daily habits faster but a longer one (14–30 day) better matches "workflow," not "day," per the video's framing of workflow economization.
2. **3 vs 4 as the actual enforced floor.** The program spec states "3–4×" as a range, not a fixed number; Phase 1 needs one concrete default (this spec proposes 4 as conservative-default, 3 as the configurable floor) rather than shipping an ambiguous range into the prompt.
3. **Vision-on-demand sample count (~N).** The video's number (~20 frames) was for a different scope (sampling a day); this spec proposes N≈5-10 per pattern candidate as more appropriate to Phase 1's per-pattern (not per-day) triggering, but this is an estimate, not a validated cost/accuracy tradeoff — needs a real pass once vision-model routing (C8) exists to test against.
4. **Occurrence counting before C4's dedupe-collapsing ships (C4 Open Question 2).** Until C4 collapses consecutive same-context rows, C5's harness-side counting logic must implement its own collapsing pass or risk false-positive pattern floors from a single long dwell producing many capture rows. This is a real Phase 1 blocker for accuracy, not just a nice-to-have.
5. **Durable pattern storage (Phase 2).** Is a `cortex_patterns` table needed once C7's dashboard needs to persist "dismissed" vs "pending" state per pattern across days, or does the harness re-derive + re-present patterns fresh each run with dashboard state tracked elsewhere (e.g. `settings` or a lighter-weight dismissal list)? Not decided; flagged since C7 is a Phase 1 deliverable (read-only dashboard) that needs *something* to show, even if C5 itself has no durable store.
6. **How does C5's harness-side prompt logic actually read the nightly export?** Depends entirely on C4 Open Question 3 (export write path) and C8's routing-tier-① mechanics (how the harness task is registered/invoked) — C5 cannot be implemented end-to-end until both resolve; this spec documents the *rule* (3-4x threshold, vision-on-demand trigger) independent of that plumbing so the rule itself can be reviewed now.

## Phase & rollout

- **Phase 1 (target v7.0.0):** author the master pattern-detection + optimization prompt (`docs/cortex/prompts/`) encoding the 3–4× threshold, rolling-window default, and vision-on-demand trigger rule; runs inside C8's cron-in-harness task against C4's nightly export. No `src/` code ships for C5 itself in Phase 1 — it is prompt-encoded logic, by design (program spec §8 item 5, Decisions log "Routing... start cron-in-harness").
- **Phase 2:** if backend-proxy or Gateway routing tiers (C8 ②/③) land, C5's logic may migrate from prompt-only to a real service (`patternService.js`-shape) with a durable `cortex_patterns` table, enabling C7's dashboard to track dismiss/approve state server-side instead of re-deriving each run.
- **Phase 3+:** cross-signal patterns (C11 — e.g. combining ledger repetition with reply-latency or human-vs-agent attribution) once those signals exist.
