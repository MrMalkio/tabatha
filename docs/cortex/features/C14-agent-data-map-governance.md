# C14 — Agent Data Map & Governance

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5, §9
Origin: user — **mandatory** (Malkio's word, program spec §5 C14)
Phase: Phase 1 (Plan 040 T6)

## Purpose

`docs/cortex/DATA-MAP.md` is the **single authoritative catalog** of every signal Tabatha captures — Cortex-native and pre-Cortex alike — so any downstream agent (Fable, Claude, Codex, a future autonomous overnight builder, a team-onboarding SOP agent) can answer "what data exists, where does it live, am I allowed to read/write it" without spelunking through services. This is explicitly **governance, not documentation-for-its-own-sake**: per the program spec, it is a **gate for merging capture features** — no new capture surface should ship without a corresponding DATA-MAP.md row. C14 does not populate DATA-MAP.md itself (that is explicitly another agent's task per this task's brief); C14 specifies the governance process, schema, and update triggers that make the map trustworthy and current.

## Detailed behaviors

### 1. The map is mandatory, not optional documentation
- Every signal Cortex captures — screenshot frames, sensitive-data guard decisions, ledger observations, capture refs, and (later) voice/camera/mobile — **must** have a row before the capturing feature is considered mergeable. This mirrors how migration 022 (verified, `supabase/migrations/022_cortex_ledger.sql`) was written as a "skeleton, not applied" specifically because Phase 1 is local-first — the map should track that nuance (a table existing in a migration file is not the same as data actually flowing to it).
- The map is the **contract downstream agents read before leveraging Tabatha data** — not a changelog. It documents current state, not history. When a signal's storage/retention/redaction changes, the row is *updated*, not appended-to.

### 2. Schema — every row answers six questions (frozen, from the existing stub)
`Signal | Source | Storage (local/cloud) | Partition (personal/org) | Retention | Redaction | Agent access`
- **Source** — the exact file/service that produces the signal (e.g. `src/utils/observationLedger.js`, `tabatha-desktop/src-tauri/src/window_monitor.rs`). Must be a real, checked path — not a cluster name.
- **Storage** — where the bytes actually live right now (chrome.storage.local key, SQLite table, Supabase table) — not where they will eventually live once a future phase ships.
- **Partition** — personal / org / both, per the privacy spine (program spec §6): org data only for clocked-in time, personal never flows upward.
- **Retention** — the actual configured value (e.g. `captureRetention.personal.maxAgeDays = 30`, verified `src/background/constants.js` line 57), not "TBD" once the source ships a real default. The seed rows in DATA-MAP.md today are still `TBD` for several columns — that is an explicit, tracked debt (see Dependencies), not this file's job to fix.
- **Redaction** — whether capture-time redaction/suppression applies to this signal (most telemetry: none; capture frames: C2's region-blur/suppress model).
- **Agent access** — the actual contract: can an agent read this signal at all, does it require the ledger's normalized/redacted form only (never raw frames/audio), does it require org-admin scope. This is the column most likely to be skipped by a rushed contributor — it is the one C14 cares about most, since it's what makes the map "governance" rather than "notes."

### 3. Every pre-Cortex data source is folded in — one map, not many
- Program Spec §3's reuse table ("What already exists in Tabatha") is the seed list: companion window-poll, companion SQLite (`app_sessions`/`clock_sessions`), companion WS server, categorizer, extension logger (`tabathaLogs`, cap 500), `activityAuditService`, behavioral telemetry (`intentHistory`, `focusState`, clock/clockHistory, tab events, domain visits, companion sessions), `companionBridge`, `syncService`. Every one of these needs a row — not just the four Cortex-native rows the stub currently seeds (window-poll, screen capture, behavioral telemetry, dictation).
- **This session found an additional pre-existing source not in Program Spec §3 at all:** `tabatha-mobile` (sibling repo, `C:\Users\mrmal\le dev\tabatha-mobile`) — a substantially-built Android companion (app-usage tracking, phone-call intelligence via `TelecomManager`/`CallLog`, local SQLite, Supabase+LAN sync) that predates this Cortex scoping session and is not referenced anywhere in the program spec. This is exactly the kind of gap C14's "fold in every prior source" rule exists to catch — flagged for whoever populates DATA-MAP.md next.

### 4. `.headbox/workspace-map.md` is a companion artifact, not a duplicate
- The program spec (§9) and this cluster's own dependencies both call for `.headbox/workspace-map.md` to gain `docs/cortex/**`, capture storage locations, and the new services (`captureService.js`, and later `voiceService`/`cortexService`) — but this file is a **structural map** (directory tree, "what file does what"), while DATA-MAP.md is a **data-governance contract** (what signal, what access rules). They serve different readers: workspace-map.md orients a human/agent new to the repo; DATA-MAP.md gates whether an agent may touch a given piece of data. Both need updating on the same trigger (a new capture surface lands), but they are not interchangeable and one should not be collapsed into the other.
- **Verified as of this session:** `.headbox/workspace-map.md`'s "Last touched" line still reads `2026-06-30 (v6.4.0)` and its directory tree does not mention `docs/cortex/`, `src/utils/captureDecision.js`, `src/utils/sensitiveDataGuard.js`, `src/utils/observationLedger.js`, `src/utils/retentionPolicy.js`, or `src/background/services/captureService.js` — all of which exist on disk today (commit `0dcd2fb`). The map is currently stale relative to Plan 040 T1–T3. This is a concrete, actionable backlog item for whoever executes C14, not a hypothetical.

### 5. The map is a living contract — update triggers, not a one-time write
- **Trigger: any new capture surface.** Per the program spec, "the map updates whenever capture surface changes (it is a living contract, gate for merging capture features)." Concretely: a PR that adds a new `kind`/`surface` value to `observationLedger.js`, a new settings key under the "Cortex" block of `DEFAULT_SETTINGS`, or a new Supabase table under a future migration (023+) should be blocked from merging without an accompanying DATA-MAP.md row/edit.
- **Trigger: a retention/redaction default changes.** If `captureRetention` or `sensitiveRules` defaults change, the corresponding row's Retention/Redaction columns must be updated in the same change.
- **Trigger: a new downstream agent workflow needs access.** If C8's autonomy ladder (cron-in-harness → backend proxy → gateway → BYOK) or C12's SOP-mode grants a new class of agent read access to ledger data, the Agent access column is where that grant is recorded — this is the enforcement surface, even though actual RLS/permission enforcement lives in Supabase policies (see migration 022's `CREATE POLICY` blocks, verified) and chrome.storage scoping, not in the markdown file itself. The map documents the contract; the code enforces it — the two must not drift.

## Data model touchpoints

- **`docs/cortex/DATA-MAP.md`** — the artifact itself (stub verified, `docs/cortex/DATA-MAP.md`, frozen 7-column schema, 4 seed rows). Populating it is explicitly out of scope for this expansion (owned by another agent per this task's instructions) — C14 specifies *how* it must be populated and kept current, not the content.
- **`supabase/migrations/022_cortex_ledger.sql`** (verified) — `tabatha.cortex_observations` and `tabatha.cortex_capture_refs`, both partition-checked (`CHECK (partition IN ('personal','org'))`) and RLS-gated on `profile_id`. DATA-MAP.md's Storage/Partition columns for ledger/capture-ref rows should point here once T4 (cloud-batch sync) actually starts writing to these tables — today they are schema-only (migration not applied, per the file's own header comment "NOT YET APPLIED").
- **`chrome.storage.local` keys `cortexLedger` and `cortexCaptureState`** (verified, `src/background/services/captureService.js` lines 25–26) — the actual Phase-1 local-first storage location; DATA-MAP.md's seed rows currently say "local (companion SQLite)" or "local + cloud batch" generically — these two specific keys should be named explicitly once populated.
- **`.headbox/workspace-map.md`** — companion structural doc; needs its own edit pass (see behavior 4) whenever DATA-MAP.md gains a row for a new *file/service*, though not for every new *signal* (a new `sensitiveRules` entry type doesn't need a workspace-map change; a new `voiceService.js` file does).

## Dependencies

**Depends on:**
- **C1 (Adaptive Capture Engine)** — the capture-timing decisions (`decideCapture`/`captureSurface`) determine what "Source" and "Storage" a screenshot-frame row documents.
- **C2 (Sensitive-Data Guard)** — the "Redaction" column's values come directly from C2's suppression/redaction rule shape (`evaluateCapture`, verified `src/utils/sensitiveDataGuard.js`).
- **C3 (Storage & Retention Fabric)** — the "Retention" column's real values come from `captureRetention`/`planRetention` (verified `src/utils/retentionPolicy.js`), once those move past their current `TBD` seed state.
- **C4 (Observations Ledger)** — the ledger's normalized record shape (`normalizeObservation`, verified) is the template for what a ledger-sourced row's Storage/Partition columns describe.
- **C11 (Cross-Signal Attention Accounting)** — as new external signals land (call logs, email reply latency, on/off windows — several of which `tabatha-mobile` already partially provides per behavior 3 above), each is a new row, not a retrofit of an existing one.

**Feeds:**
- **All clusters** — every agent reads DATA-MAP.md as a shared, read-before-write contract. This is the terminal node of the transformer graph in the sense that it has no downstream Cortex dependents *within* the spec — its "feed" is every future agent session, not another cluster file.
- **C12 (Team/Onboarding SOP Mode)** — org-mandated capture-on-clock-in policy needs the map's Agent access column to know what an onboarding-SOP agent may read about a new hire's activity.
- **C8 (Agent Orchestration & Routing)** — the autonomy ladder's higher tiers (backend proxy, BYOK) need the map to know what may leave the device at all before routing decisions execute.

## Reuse points (VERIFIED paths)

- `docs/cortex/DATA-MAP.md` — the target artifact, frozen 7-column schema already in place. **Verified**, read in full.
- `docs/cortex/00-cortex-program-spec.md` §3, §9 — the seed reuse-map table and the mandate itself. **Verified**.
- `supabase/migrations/022_cortex_ledger.sql` — table/column shapes to cite by exact name (`cortex_observations`, `cortex_capture_refs`, `partition`, `browser_profile_id`). **Verified**, read in full.
- `src/background/constants.js` `DEFAULT_SETTINGS` (Cortex block, lines ~48–74) — the real config values (`captureRetention`, `sensitiveRules`, `storage.cortexLedgerCap`) that Retention/Storage columns should cite verbatim rather than restating loosely. **Verified**.
- `src/background/services/captureService.js` — storage key names (`cortexLedger`, `cortexCaptureState`) and the `LIST_OBSERVATIONS`/`GET_CAPTURE_STATE` message contract, which is itself a candidate "Agent access" mechanism (an agent could read observations via this message API rather than raw storage). **Verified**, read in full.
- `.headbox/workspace-map.md` — confirmed **stale** relative to current `src/` state (see behavior 4); the specific gap list above (`docs/cortex/`, four `src/utils/*.js` files, `captureService.js`) is a ready-made task list, not speculation.
- `.headbox/plan-registry.md` line 40 (Plan 040 entry) — confirms T6 (Agent Data Map) is explicitly still pending ("Pending: T4 storage+capture I/O, T5 cron-in-harness+dashboard, T6 data-map"), i.e. C14 has not started as of this session. **Verified**.

## Open questions

1. **Enforcement mechanism.** The spec calls this a "gate for merging capture features" — is that gate a PR-template checklist item, a CI check that greps for new `kind`/`surface` values against DATA-MAP.md rows, or purely process/trust? Not specified anywhere in the source dumps; needs a decision before "mandatory" is more than a norm.
2. **Who owns keeping DATA-MAP.md and workspace-map.md in sync** when they diverge (e.g. a new service ships but only one doc gets updated)? No owner assigned today.
3. **`tabatha-mobile`/`tabatha-mobile-2` inclusion.** Should DATA-MAP.md's Phase-1 pass include rows for `tabatha-mobile`'s already-shipped signals (app usage, call logs) now, even though C13's Cortex-native mobile capture is Phase 5? Arguably yes, per "every pre-Cortex source is folded in" — but `tabatha-mobile` predates and sits outside the Tabatha repo/program entirely, so its inclusion needs an explicit decision, not an assumption.
4. **Retention/redaction "TBD" seed rows.** The four existing DATA-MAP.md rows have "TBD" for retention and agent-access on several rows despite real values now existing in `DEFAULT_SETTINGS` (e.g. `captureRetention.personal.maxAgeDays: 30`). Is closing that gap part of Plan 040 T6, or a separate follow-up? This task's brief explicitly says not to populate DATA-MAP.md, so this is flagged rather than fixed here.

## Phase & rollout

Phase 1 (Plan 040 T6), the last of the six Phase-1 tasks per `.headbox/plan-registry.md` (currently 3/6: T1–T3 done, T4–T6 pending). C14 cannot meaningfully close out until C1–C4's real (non-TBD) storage/retention/redaction values exist to populate the map with — so while T6 is sequenced last, it should be scoped as "the day T4/T5 land, write real rows the same week," not deferred indefinitely. Program Spec §8 lists "C14 Agent Data Map v1 (workspace-map + DATA-MAP.md updated)" as Phase-1 item 7 — the workspace-map.md update is just as much a Phase-1 deliverable as the DATA-MAP.md population, and per behavior 4 above it is currently the more overdue of the two.
