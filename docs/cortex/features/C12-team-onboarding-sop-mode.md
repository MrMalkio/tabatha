# C12 — Team / Onboarding SOP Mode

> 🔗 Google Doc: https://docs.google.com/document/d/1sP0-cmy_JTfQ9XEGmQE6BxdnCoChaRmjZYEwXKgyZxM/edit?usp=drivesdk&ouid=104108780460431833741

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5 (C12)
Origin: video V16 (Nick Saraev source video, program spec §2) + user Dump 1/2
Phase: Phase 4

## Purpose

Every other Cortex cluster optimizes one person's workflow for that person. C12 is the multiplier: point the same observation machinery at a **new hire**, and a manager gets a fast, evidence-based read on how the hire actually works — not a self-report — plus concrete tooling (hotkeys, extensions) built from what Cortex observed, rolled out at org scale. Program spec V16: *"Manager applies to new hires → learn SOPs faster; tailored hotkey/ext suggestions."* This is Cortex's path from individual productivity tool to an org-level onboarding accelerant, and the first cluster where Cortex's output is explicitly *for someone other than the person being observed*.

## Detailed behaviors

### 1. Onboarding acceleration — manager applies Cortex to a new hire
- A manager (an `org_members`/`team_members` role of `owner`/`manager`/`sub_manager` — the same role set migration 012 already grants read access to team member `browser_profiles`/`browser_profile_status`) can enable **SOP Observation Mode** for a specific new hire's profile, scoped to a defined ramp-up window (e.g. first 2–4 weeks).
- While active, the hire's C1–C6 pipeline runs exactly as it would for an individual user (capture → ledger → pattern engine → optimization loop), but the **manager's C7 Recommendation Dashboard** — not just the hire's — surfaces two additional outputs:
  - **SOP deviation flags**: where the hire's observed workflow for a repeated task (Pattern Engine's ≥3–4× threshold, C5) diverges from either (a) an org-defined reference SOP, if one exists, or (b) the aggregate pattern already observed across existing team members doing the same task.
  - **Tailored tooling suggestions**: the same C7 suggestion types (hotkeys, tool replacement, custom code/extension generation) generated from the hire's own repeated friction — e.g. if the hire repeatedly performs a 6-click sequence an existing team member does with a hotkey, C7 proposes teaching the hire that hotkey rather than "discovering" a brand-new optimization.
- **Org-scale propagation**: when a tailored suggestion proves valuable for one new hire (accepted + sustained use, mirroring C7's existing yes/no approval flow), it becomes a candidate to add to the org's onboarding SOP reference material for the *next* new hire — closing the loop from "one hire's friction" to "every future hire's baseline," which is the actual "org-scale time savings" the braindump asks for, not just faster ramp-up for one person at a time.

### 2. SOP learning from exemplar workflows
- Cortex can additionally be pointed at an **existing high-performing team member** (not just new hires) to build the reference SOP a new hire is compared against, if the org has no written SOP yet. This reuses the identical observation pipeline — "exemplar mode" is the same capability as "new-hire mode," just applied to a different profile and consumed as the *baseline* rather than the *subject*.
- This directly operationalizes program spec §5 C12's "SOP learning" behavior without inventing a second capture mechanism.

### 3. Org mandate — capture-on-clock-in, enforced
- Per the privacy spine (§6, rule 2) and program spec §5 C12, org admins (org `owner` role, or team `owner`/`manager`/`sub_manager` for team-scoped policy) can set an **org policy flag** requiring capture (C1) to be active whenever a member is clocked in — not opt-in per member, mandatory as a condition of clocking in under that org/team.
- **Enforcement path, reusing existing infra:**
  - The policy itself is a new org/team-scoped settings row (natural home: alongside the existing team/org role tables migration 012 already established — `tabatha.org_members`, `tabatha.team_members` — as a new `capture_policy` column or sibling table, RLS-gated by the same owner/manager role check migration 012's `create_invite_token` RPC and manager-read policies already use).
  - **Detection of violation:** `browser_profile_status` (migration 017 `browser_profiles` + `awarenessService.js`) already tracks `clock_state` (`clocked_in`/`on_break`/`clocked_out`) per install in real time via the 60s heartbeat (`pushHeartbeat()`) and the `chrome.storage.onChanged` push-on-clock-event path (`registerStorageListener()`/`schedulePush()`). C12 adds a `capture_enabled` boolean to the same status payload `buildStatusPayload()` already builds, so the moment a mandated member clocks in with capture off, the manager's team dashboard (the same one migration 012's manager-read RLS policies were built to power) can see it live, exactly the way it already sees `clock_state`/`focus_state` for every team install.
  - **What "enforced" means in v1:** visibility + org-policy attestation, not a hard technical block on clocking in. A manager sees non-compliant installs (mirroring how `awarenessService`'s Live Stints panel already surfaces every install's state to the account owner); whether non-compliance blocks clock-in entirely is an open question below, since Tabatha has no existing precedent for *refusing* a clock-in action based on a policy flag.
- **What gets captured under mandate is still governed by C1–C3**, unchanged — the mandate controls *whether* capture runs, not what it captures or how it's stored.

### 4. Personal vs org capture separation (never violated by the mandate)
- The mandate governs **org-partition** capture only. If a hire, mid-shift, briefly does something personal, the privacy spine's partition rule still applies: personal capture never flows to the org, full stop, mandate or not. This is not a new behavior C12 introduces — it's the existing partition model (`partition TEXT CHECK (partition IN ('personal','org'))` on `tabatha.cortex_observations`/`cortex_capture_refs`, migration 022) applied unchanged to mandated members. C12's job is only to make capture *mandatory while clocked in*, not to widen what counts as "org" data.
- Concretely: `partitionOf(rec, clockState)` in `observationLedger.js` already computes `'org'` for `clock_state ∈ {clocked_in, on_break}` and `'personal'` otherwise — the same function the mandate's enforcement leans on for clock-state detection is the function that already keeps the partition honest. No new partition logic needed.

### 5. Org retention (admin-set, time + space)
- Org-partition data captured under a C12 mandate follows **org-level retention**, admin-set on both axes (time and free disk space), per program spec §5 C3 and §6 rule 6 — this is C3's existing dual-retention-plan design, not a new retention model. `DEFAULT_SETTINGS.captureRetention` (constants.js) already has a nested-object shape distinguishing personal from org retention; C12's org mandate is the trigger that makes the org side of that config non-optional for mandated members rather than a shared org-vs-personal *design decision*, which is C12's contribution.

## Example scenario

An org owner hires a new bookkeeper and enables SOP Observation Mode for their profile with a 3-week window, plus turns on the org's `require_capture_on_clock_in` policy for the bookkeeping team. Week 1: the hire clocks in, capture runs automatically (no manual toggle needed — the mandate handled it), and C5's pattern engine notices the hire repeats a 5-step "export report → rename file → upload to client folder" sequence 6 times in 3 days. C6/C7 compares this against the same task pattern already observed (with consent) from the team's senior bookkeeper, who does it in 2 steps via a saved hotkey. C7 surfaces a tailored suggestion to the hire: "Try this hotkey — it replaces the 5-step export you've been doing." The hire accepts; the manager's dashboard shows the suggestion was accepted and sustained over the following week, so it gets proposed as a permanent addition to the team's onboarding SOP notes for the next hire.

Meanwhile, on day 4, the hire's laptop reconnects after a reinstall (an unpacked-extension `.pem` issue, per the program spec's board-item note in §12) — migration 017's `local_id`-keyed upsert means the manager's compliance view doesn't lose track of "this hire's install," it just re-attaches to the same `browser_profiles` row instead of spawning a fresh, disconnected one.

## Interfaces (proposed message contracts)

Following the `handleMessage(type, message)` router pattern already used by `captureService.js`/`autoFocusService.js`/`awarenessService.js`:

| Message | Direction | Purpose |
|---|---|---|
| `GET_ORG_CAPTURE_POLICY` | settings/dashboard → background | Read the org/team's `require_capture_on_clock_in` + retention settings |
| `SET_ORG_CAPTURE_POLICY` | manager settings → background | Write policy (role-gated exactly like migration 012's `create_invite_token`) |
| `START_SOP_OBSERVATION` | manager dashboard → background | Enable SOP Observation Mode for a target hire profile + window |
| `LIST_SOP_DEVIATIONS` | manager dashboard → background | Read C5-flagged deviations for an observed hire vs. baseline |
| `LIST_NONCOMPLIANT_INSTALLS` | manager dashboard → background | Filter team installs by `metadata.capture_enabled === false` while `clock_state` active — extends `LIST_LIVE_STINTS`'s existing shape |
| `PROMOTE_SUGGESTION_TO_SOP` | manager dashboard → background | Move an accepted, sustained C7 suggestion into org SOP reference material |

## Data model touchpoints

- **Reads:** `tabatha.org_members`, `tabatha.team_members` (roles), `tabatha.browser_profiles`/`browser_profile_status` (migration 017, `awarenessService.js`), `tabatha.cortex_observations`/`cortex_capture_refs` (migration 022, filtered to `partition = 'org'`).
- **New (proposed):**
  - `tabatha.org_capture_policy` (or a column set on an existing org/team settings table if one exists by Phase 4) — `{ org_id | team_id, require_capture_on_clock_in BOOLEAN, retention_days INT, retention_min_free_gb INT, created_by, updated_at }`. RLS mirrors migration 012's owner/manager write pattern exactly.
  - `browser_profile_status.metadata` (jsonb, already used for `idle_state` per Plan 036 — see `awarenessService.js:31`) gains a `capture_enabled` key via the same additive, no-migration-needed mechanism `idle_state` already uses, rather than a new top-level column — following the existing precedent for low-friction status-payload additions.
  - **SOP reference material** — likely a `tabatha.org_sop_notes` table or, more cheaply for v1, reuse of the existing Flux/Tasks context store scoped to org-level rather than personal — deferred to implementation planning, flagged as an open question.

## Dependencies (transformer graph)

**Depends on:**
- C3 Storage & Retention Fabric — org partition + admin-set retention is the storage substrate C12's mandate writes into.
- C1 Adaptive Capture Engine — the thing being mandated.
- C5 Pattern Engine — SOP-deviation detection is a pattern-engine query scoped to one hire vs. the team baseline.
- C6 Optimization Loop — runs the analysis over team/exemplar ledgers to produce tailored suggestions.
- C7 Recommendation & Action Layer — delivery surface for tailored hotkey/extension suggestions, to both the hire and the manager.
- Existing (pre-Cortex): `awarenessService.js` + `browser_profile_status` (real-time clock-state visibility), migration 012 (manager-scoping RLS pattern — the exact role-gating C12's policy write access reuses), migration 017 (durable per-install identity, needed so "this specific hire's install is non-compliant" is a stable claim across reinstalls/reconnects).

**Feeds:**
- C14 Agent Data Map & Governance — org capture policy and its enforcement-visibility fields are new governance surface that must be cataloged (who can see a compliance flag, where it's stored, whether it's itself org- or personal-partitioned — it's org, since it's a management signal about a mandate, not the hire's personal data).
- C11 Cross-Signal Attention Accounting — indirectly: a manager assessing hire SOP speed benefits from knowing whether observed speed reflects the hire or an agent the hire delegated to (see C11 open question #2 — not assumed part of C12's mandate).

## Reuse points (VERIFIED)

| Asset | Path | Verified | Reuse |
|---|---|---|---|
| Manager role-scoped RLS (org owner; team owner/manager/sub_manager) | `supabase/migrations/012_manager_scoping_and_invite_mint.sql` | read 2026-07-10 | Exact role-gating template for the new `org_capture_policy` table's RLS |
| Invite-token mint RPC pattern (`SECURITY DEFINER`, role-checked) | `supabase/migrations/012_manager_scoping_and_invite_mint.sql:119-193` | read 2026-07-10 | Template for a future `set_capture_policy` RPC if org policy writes need the same authorised-mint shape |
| Durable per-install identity (`local_id`, `machine_id`, unique index) | `supabase/migrations/017_browser_profile_identity.sql` | read 2026-07-10 | Makes "hire's install is non-compliant" a stable claim across reinstalls |
| Real-time cross-install status (`browser_profile_status`, `pushHeartbeat`, `buildStatusPayload`, `metadata.idle_state` precedent) | `src/background/services/awarenessService.js:31,126-188,204-226` | read 2026-07-10 | Live compliance-visibility channel; `metadata.capture_enabled` follows the exact `idle_state` precedent, no migration |
| Partition function (`partitionOf`) | `src/utils/observationLedger.js:93-95` | read 2026-07-10 | Keeps personal-vs-org split correct under mandate, unchanged |
| Dual retention config shape (`captureRetention` in `DEFAULT_SETTINGS`) | `src/background/constants.js:56` | read 2026-07-10 | Existing personal/org retention split; C12 makes the org side admin-mandatory for covered members |
| Ledger + capture-ref partition/RLS pattern | `supabase/migrations/022_cortex_ledger.sql` | read 2026-07-10 | Storage substrate mandated capture writes into |

## Implementation approach

Follows the pure-logic-first precedent Phase 1 T1 established (`src/utils/captureDecision.js`, `sensitiveDataGuard.js`, `observationLedger.js`, `retentionPolicy.js`) and the pure-helper split `stintReconciliation.js` already proved out for cross-install logic:
- `src/utils/sopDeviation.js` — pure `compareToBaseline(hirePattern, baselinePattern)` → deviation score + suggestion candidates, independently testable against fixture pattern data before wiring to real C5 output.
- `src/utils/capturePolicyCompliance.js` — pure `classifyComplianceForInstall(statusRow, policy)` → `'compliant' | 'noncompliant' | 'not_mandated'`, directly analogous to `classifyInstallForCleanup()` in `stintReconciliation.js` (same "pure classifier over a status row" shape), and independently unit-testable.
- Both slot into thin service shells (`sopObservationService.js`, extending `awarenessService.js`'s existing status-row plumbing rather than duplicating it) following the `captureService.js` shell/logic split.

## Related existing feature specs

Per program spec §3's "Cortex absorbs/relates" reuse map, one pre-Cortex feature draft is directly load-bearing for C12's mandate design:
- **`docs/features/198-privacy-modes.md`** — configurable org visibility tiers (Full/Standard/Private) with the explicit framing "profitability tool, not surveillance tool," and the stated constraint that individuals can't drop *below* the org baseline but can opt into more. C12's capture-on-clock-in mandate is a natural extension of the same tier model: mandate enforcement visibility (open question #1) should almost certainly be gated by, and consistent with, whatever privacy tier the org has set in #198 rather than introducing a second, uncoordinated visibility axis. Implementation planning should treat #198's tier table as the parent control C12's mandate flag composes with, not a separate system.
- `.headbox/sticky-notes/privacy-modes-future.md` (referenced by #198) should be reviewed alongside this file before C12 implementation planning begins — it may already contain relevant prior thinking on org-mandated tracking that predates Cortex.

## Open questions

1. **Does non-compliance ever block clock-in?** No existing Tabatha mechanism refuses a user action based on a policy flag; v1 is visibility-only (manager sees non-compliant installs), but the braindump's word "mandate" implies stronger enforcement may eventually be expected. Needs an explicit decision before Phase 4 implementation.
2. **Where does SOP reference material live?** Flagged as deferred — likely needs its own small schema (`org_sop_notes` or similar) rather than overloading an existing table; not designed in this pass.
3. **Consent/disclosure to the new hire.** The mandate is an org policy decision, but the hire is still a person being observed — does C12 require an explicit onboarding-time disclosure UI (distinct from the personal-profile opt-in flow C1/C2 already have), given this is capture the hire cannot opt out of while clocked in? Not addressed by the program spec's privacy section (§6) as written, which frames opt-out as a personal-profile-only lever.
4. **SOP-deviation false positives for legitimately different-but-valid workflows** — C5's ≥3–4× pattern threshold guards against one-off noise, but a hire finding an equally-good different path shouldn't be flagged as "wrong." C12 should surface deviations as *evidence for manager review*, never as an automatic correctness judgment — worth stating explicitly in implementation, not just implying it.

## Phase & rollout

- **Phase 4** (per program spec §8), alongside C8's proactive/autonomous overnight builds and multi-cadence intraday processing — C12's mandate-enforcement piece specifically is called out in §8 as landing in Phase 4 ("C12 team/SOP mandate enforcement").
- **Sequencing within Phase 4:** SOP-observation/tooling-suggestion behavior (§1–2 above) can ship as soon as C5–C7 exist for an individual (Phase 1–2 substrate) — the only genuinely Phase-4-gated piece is the **mandate + enforcement-visibility** machinery (§3), since it depends on org/team policy plumbing not yet built. Implementation planning should consider splitting C12 into "SOP observation" (earliest-possible) and "mandate enforcement" (Phase 4 proper) sub-slices.
