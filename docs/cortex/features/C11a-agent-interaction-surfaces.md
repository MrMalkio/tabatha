# C11a — Agent Interaction Surfaces (Manual Controller Signify)

Status: draft (Fable, 2026-07-10)
Parent: [C11 — Cross-Signal Attention Accounting](./C11-cross-signal-attention-accounting.md) · [Program Spec](../00-cortex-program-spec.md) §5 (C11)
Origin: user — verbatim, 2026-07-10: *"We need to include options on intent modals and InBar for agents to interact with or signify when it's an agent and not the human working. This distinction is needed otherwise some context to a user's work efficiency will not be accurate."*
Phase: Phase 5 (v1 slice pulled forward — see Phasing; does not require C13/mobile like the rest of C11)
Plan: Plan 044 T2 (`cortex_phase5_crosssignal`, `.headbox/plan-registry.md` row 45) — T1 shipped `src/utils/controllerAttribution.js` (the pure decision table this file wires up)

## Purpose

C11 defines *automatic* human-vs-agent detection (webdriver flags, process ancestry, input-event absence) and the `attributeController()` decision table already ships as pure logic (`src/utils/controllerAttribution.js`, Plan 044 T1, 6 tests green) — but nothing calls it yet, and automatic detection alone has a hard ceiling: heuristics will always have blind spots (C11 open question #3 — voice control produces no input events either) and false positives/negatives *actively harm* the analytics C11 exists to make honest.

C11a is the **manual, human-in-the-loop half** of controller attribution: surfaces on the intent modal (InPop/gatekeeper), the InBar, and the home/sidebar that let a human explicitly say *"an agent is driving this now, not me"* — and an API contract so an agent can say the same thing about itself. This is not a smaller version of C11; it is the layer C11's own spec calls out as **authoritative when present** ("Explicit self-identification... is authoritative when present and should be preferred over heuristic detection," C11 §2) and the layer that resolves C11's open question #3 (a human can simply confirm they're driving, sidestepping the voice-control misfire risk entirely).

Without this, C11's stated goal — accurate "how well are you leveraging your tools" analytics — cannot ship at all in v1, because the automatic detection surfaces (companion process-ancestry, browser automation fingerprints) are Phase 5/C13-adjacent and largely unbuilt, while manual signify needs nothing but a UI affordance, a message contract, and a storage span. C11a is deliberately scoped to ship **now**, ahead of the rest of C11's Phase 5 timeline.

## Detailed behaviors

### 1. Manual signify — three surfaces, one underlying span

A "controller span" is a time range during which a tab, window, or the whole machine is marked as agent-driven. All three UI surfaces read/write the same underlying state (§3 Data model) through the same two messages: `START_AGENT_SESSION` / `END_AGENT_SESSION`.

**(a) InPop intent modal (`src/content/gatekeeper.js`)**
- Today's modal (read 2026-07-10) renders `focusItems` / `recentIntents` / `persistentIntents` pickers plus an intent text input inside a shadow-DOM overlay (`#tabatha-gatekeeper-host`), built via `chrome.runtime.sendMessage({ type: 'GET_FOCUS_ENGINE' })` and `CHECK_CONTEXT_NEEDED`.
- Add a **"Who's working?"** control near the top of the form, above the intent input — a 3-way segmented control (§4) rather than a checkbox, so the default ("I'm working") is always visually present, not an opt-in toggle a user has to notice.
- Selecting an agent option does two things on submit: (1) writes the intent as normal (existing `SET_INTENT` flow, unchanged), and (2) opens a controller span for the tab (`scope: 'tab'`) via `START_AGENT_SESSION`, so the *whole intent's* recorded time is attributed `controller: 'ai-agent'` from the moment it starts, not just from whenever someone later remembers to flip a toggle.
- If the modal is intercepting a tab that already has an open machine- or window-scoped agent span (§1c), pre-select "Agent working" and show a one-line note (`"Agent session active machine-wide since 2:14 PM — change if this tab is different."`) rather than silently inheriting.

**(b) InBar persistent indicator + toggle (`src/content/inbar.js`)**
- InBar already has a `.badge` family (`badge-focus`, `badge-no-intent`) and a `.bar-btn` icon-button row (✏️ edit, 📋 checkpoint, 🔥 backburner, ⏸ pause, 📝 note) rendered by `buildBarHTML()`. Add a new bar-btn, `🤖`, in the same right-side button cluster, and a badge state.
- **Off (default):** button renders neutral/dim, title `"Mark this tab as agent-driven"`.
- **On:** InBar's whole color scheme shifts to signal agent mode unambiguously (§4) — this must be readable at a glance since the entire point is "the human always knows." The intent label area gains a persistent `badge-agent` chip (`🤖 Agent working` or `🤖 Agent + supervising` per the selected sub-mode) that stays visible even when the bar is collapsed to the nub (`.nub` state, inbar.js §"NUB (collapsed toggle)") — the nub gets a small `🤖` corner dot, mirroring how `badge-no-intent` already demands attention when unset.
- Clicking the 🤖 button opens a tiny inline picker (same visual language as the existing pause-prompt / backburner-prompt overlays already in `inbar.js`) with the same 3 options as the InPop modal (§4) plus a scope choice: **This tab** / **This window** / **Whole session (all tabs)** — because an agent driving a whole browser automation session (e.g. Playwright across multiple tabs) shouldn't require signify-per-tab.
- Un-marking (clicking 🤖 again while active, or picking "I'm working" from the inline picker) calls `END_AGENT_SESSION` and reverts the badge/color immediately — no confirmation dialog; this is a low-stakes, frequently-toggled control by design (agent sessions are often short — a single delegated task — not all-day).

**(c) Home / sidebar (`src/home/index.jsx`, `src/sidebar/index.jsx`)**
- Home and sidebar don't need a new picker UI — they need **visibility** into spans opened elsewhere, mirroring the existing `isLiveConcurrent` filter pattern (`src/home/index.jsx`, `src/sidebar/index.jsx`, shipped for Live Stints/ghost-stint work, migration 017) and the `CompanionStatus.jsx` header badge precedent.
- Add an **"Agent-driven"** chip next to `CompanionStatus` in the home header when any controller span is currently open anywhere in this install (machine-scoped or window-scoped) — clicking it deep-links to a new small panel (reuse the Live Stints panel's card layout in Work Shifts) listing open/recent agent spans: scope, started-at, agent name (if self-announced), and an end-it-now action. This is the one place a human can see "oh, I forgot I marked the whole machine as agent-driven three hours ago" and fix it — the same "reconcile forgotten state" problem Live Stints already solves for ghost clock sessions, same shape of fix.
- Work Shifts' existing time breakdowns (already segmenting by focus/context) get a `controller` facet so a day's hours can be viewed with agent-driven time separated out — this is the shallow front-end half of C11 §"Downstream effect"; the full C6/C7 leverage-analytics surface stays out of scope for C11a (that's C11 §3, unbuilt).

### 2. Agent-facing API — how an agent announces itself

Two channels, matching the two ways an "agent" can exist relative to Tabatha:

**(A) Extension-side message API** (for agents that talk to the extension directly — Tabatha's own future harness integrations, C8 cron-in-harness, a companion-side automation driver):
```js
// content script / background caller → background router
chrome.runtime.sendMessage({
  type: 'ANNOUNCE_AGENT_SESSION',        // already named in C11 §"Interfaces"; C11a defines the payload
  payload: {
    agentName: 'claude-code-cron-<id>',  // free text, shown in UI (§1c panel)
    scope: 'tab' | 'window' | 'machine',
    tabId: <number>,                     // required if scope:'tab'
    windowId: <number>,                  // required if scope:'window'
    supervising: false,                  // true = "agent + supervising" sub-mode (§4)
    until: <ISO8601> | null              // optional auto-expiry; null = open-ended until END_AGENT_SESSION
  }
});
```
This is the same message the manual UI surfaces call internally — `START_AGENT_SESSION` (§1) and `ANNOUNCE_AGENT_SESSION` (C11 §"Interfaces") are **the same handler** with one distinction: spans opened via `ANNOUNCE_AGENT_SESSION` set `attributeController()`'s `agentAnnounced: true` signal (explicit/authoritative, per the decision table), while spans opened via the human-facing UI set a parallel `humanConfirmed: true` signal — both resolve to `controller: 'ai-agent'` but are logged with different provenance (§3) so downstream analytics can tell "the agent said so" apart from "a human said so," which matters for the false-positive-cost open question (C11 open question #3).

**(B) DOM-level convention for browser-driving agents** (for agents that drive the browser *as a user* — Playwright/Puppeteer/CDP tools, Claude-in-Chrome-style tools, any harness that opens/controls a real Chrome window rather than talking to the extension):
- A `data-tabatha-agent-session` attribute on `document.documentElement`, set by the driving tool before or during automation:
  ```html
  <html data-tabatha-agent-session='{"agentName":"playwright","scope":"tab","supervising":false}'>
  ```
- `gatekeeper.js` and `inbar.js` (both already content scripts injected per-tab) add a `MutationObserver` on `documentElement`'s attributes (cheap — one attribute, one element, mirrors the existing `waitForBody` `MutationObserver` pattern already in `gatekeeper.js`) and, on seeing the attribute appear, call the same `START_AGENT_SESSION` path with `scope: 'tab'` and `agentAnnounced: true` provenance.
- This is deliberately a **convention, not enforcement** — same posture as `navigator.webdriver` itself (a page can lie about it), and same posture C11 already takes toward heuristic signals generally (best-effort, positive-evidence-only, never assumed adversarial-proof). It costs nothing to add and gives well-behaved automation tooling (including Tabatha's own future in-browser agent work) a zero-plumbing way to self-identify without needing extension messaging permissions.
- Precedent check: `attributeController()` already has an `agentAnnounced` boolean input (`src/utils/controllerAttribution.js:21`) that short-circuits to `{ controller: 'ai-agent', confidence: 'explicit' }` — both (A) and (B) feed that exact boolean; C11a does not change the decision table, only wires two new sources into its existing `agentAnnounced` slot.

### 3. Data model

**Storage key: `agentSessions`** (`chrome.storage.local`, new key, array of open + recently-closed spans — same shape family as `focusEngine.items`):
```js
{
  id: 'agsess_<uuid>',
  scope: 'tab' | 'window' | 'machine',
  tabId: number | null,       // set when scope:'tab'
  windowId: number | null,    // set when scope:'window'
  agentName: string | null,   // from ANNOUNCE_AGENT_SESSION payload, or null for pure manual-human-marked spans
  supervising: boolean,       // "agent + supervising" sub-mode, §4
  provenance: 'human-marked' | 'agent-announced' | 'dom-convention',
  startedAt: ISO8601,
  endedAt: ISO8601 | null,    // null = still open
  autoExpiresAt: ISO8601 | null,
  intentId: string | null,    // if opened from InPop, the intent it was attached to
  focusId: string | null
}
```
- Capped/pruned the same way `intentHistory`/`activityAuditLog` already are (FIFO cap, e.g. 200 entries) — this is a low-volume key, agent sessions are not a per-second stream.
- **Ledger interaction:** every `recordObservation()` call in `captureService.js` (the function that already produces rows normalized by `normalizeObservation()` in `src/utils/observationLedger.js`) gains one lookup: "is there an open `agentSessions` span covering this tab/window/machine right now?" If yes, the observation is stamped `controller: 'ai-agent'` (plus `controllerConfidence: 'explicit'`, `controllerProvenance: <span.provenance>`); if no open span, controller resolution falls through to whatever automatic `attributeController()` heuristics C11's later tasks wire up (or stays `null`/`unknown` until they exist — C11a does not require the automatic detection surfaces to be built first).
- `normalizeObservation()` (`src/utils/observationLedger.js:36`) gets three new optional output fields (`controller`, `controllerConfidence`, `controllerProvenance`), each `orNull()`-coerced exactly like `focusId`/`intentId` today — same pattern C11 §"Reuse points" already flags this file for.
- **Migration:** `tabatha.cortex_observations` (migration 022) already has no `controller` column yet (C11 §"Data model touchpoints" proposes adding one). C11a's v1 needs this column to exist for the cloud-batch sync path — a new additive migration `024_cortex_controller_attribution.sql` (next number per `.headbox/plan-registry.md`'s numbering convention, mirrors migration 022's `IF NOT EXISTS`/nullable-columns posture):
  ```sql
  ALTER TABLE tabatha.cortex_observations
    ADD COLUMN IF NOT EXISTS controller TEXT CHECK (controller IN ('human','ai-agent','unknown')),
    ADD COLUMN IF NOT EXISTS controller_confidence TEXT,
    ADD COLUMN IF NOT EXISTS controller_provenance TEXT;
  ```
  No default of `'human'` at the column level (unlike C11's own proposal) — C11a's local-first `normalizeObservation()` layer is the one deciding the value before sync, matching how every other observation field is null-until-known rather than defaulted at the DB layer.
- **Partition rules:** a controller span carries no partition of its own — it modifies the `controller` field on observations that are *already* being partitioned personal/org by existing logic (`partitionOf()`, `observationLedger.js:93`, keyed off clock state). An agent-driven span opened while clocked in still produces `partition: 'org'` rows, just with `controller: 'ai-agent'` — this is deliberate: an org needs to know when *their* clocked-in time was agent-delegated at least as much as personal analytics do (arguably more, per C11 §Dependencies' C12 cross-reference), so C11a does not adopt C11's "personal-partition-only" posture for the *manual signify* signal — that posture (C11 §4) is specific to the four new *external* signal classes (phone/email/text/power), not to controller attribution generally. Flagged as Open Question 2 below since it's a judgment call, not a spec citation.

### 4. Intent modal options — concrete UI

Three options, same set on InPop and the InBar inline picker, rendered as a segmented control (not checkboxes — mutually exclusive, always-visible default):

| Option | Label | `supervising` | Effect |
|---|---|---|---|
| Default | **"I'm working"** | n/a | No span opened (or existing span ended). `controller` resolves via automatic detection / defaults to human, same as today. |
| Option 2 | **"Agent working"** | `false` | Opens a `controller: 'ai-agent'` span for the chosen scope. Time recorded is excluded from human "focused work" analytics (C10/C6 downstream, once wired). |
| Option 3 | **"Agent + supervising"** | `true` | Same span, same `controller: 'ai-agent'` stamp, but `supervising: true` is preserved through to analytics so C6/C7 (once built) can report "agent-driven, human-supervised" separately from "agent-driven, unattended" — the C11 example scenario's overnight-cron case is `supervising: false`; a human watching an agent work a task live (pairing) is `supervising: true`. This distinction is *only* recorded, not enforced or acted on in v1 — it exists so v2 analytics don't have to re-derive it from timing heuristics later.

**Defaults:** always defaults to "I'm working" — never pre-selected to an agent option by the UI itself (only pre-*suggested* when an existing span already covers the tab, §1a). This matches C11's own "least-alarming-default" posture (`classifyInstallForCleanup()` precedent, C11 §2) applied to the manual layer: silence means human, escalation requires a positive action.

**InBar visual signify (so the human always knows):**
- Badge: `🤖 Agent working` / `🤖 Agent + supervising` chip, amber-adjacent but visually distinct from the existing paused-state amber (`.mode-strict`/pause colors already use red/amber in `gatekeeper.js` and `inbar.js`) — recommend a violet/purple accent (unused in the current InBar palette per the `.badge-focus` cyan / `.badge-no-intent` red / pause amber inventory) so agent-mode never gets confused with "paused" or "no intent" at a glance.
- The InBar's whole bar background gets a subtle tinted border (same treatment pattern as the `.mode-strict`/`.mode-relaxed` badge already does for InPop) rather than a full color swap — loud enough to notice, not so loud it reads as an error state.
- Nub (collapsed state) gets a small persistent 🤖 corner dot so the signal survives collapse — mirroring how urgent states already need to survive the nub collapse today (the pattern InBar's nub design already assumes for `badge-no-intent`-style urgency).

### 5. Interaction with C10 self-correction and C11 auto-detection

- **Manual mark is always authoritative over auto-detection**, full stop — this is not a new rule, it's C11a implementing what C11 §2 already specified ("Explicit self-identification... is authoritative when present and should be preferred over heuristic detection"). In `attributeController()` terms: an open `agentSessions` span sets `agentAnnounced: true`, which is checked *first* in the decision table (`controllerAttribution.js:21`) before any heuristic marker is even consulted — no new precedence logic needs to be written, C11a only needs to make sure the caller populates `agentAnnounced` correctly from span state before calling `attributeController()`.
- **Conflict case — human marks "I'm working" while automatic heuristics say agent:** e.g. webdriver flag present (maybe a legitimate testing tool the human is using themselves) but the human explicitly selects "I'm working." The manual signal wins per the rule above — `attributeController()` never sees the heuristic markers as a veto once `agentAnnounced`/`humanConfirmed` is set; C11a's caller should pass an explicit "human confirmed human" signal that also short-circuits (this requires a small addition to the decision table — see Open Question 1, since `attributeController()` today only has an explicit *agent* short-circuit, not an explicit *human* one).
- **C10 self-correction:** C10's duration self-correction (open question #4, resolved-by-reference in C10 §Phase & rollout: *"Phase 5 follow-up: once C11 lands, re-run C10's duration-correction logic with human-vs-agent attribution as an additional evidence input"*) should treat `controller: 'ai-agent'` spans as **excluded from** the "was the human still working" recomputation entirely, not merely down-weighted — if a span is explicitly marked agent-driven, C10 has no business inferring the human's continued presence from capture/companion evidence during that window; that evidence is now explained by the agent, not ambiguous. This closes C10's open question #4 for the *manually-marked* subset of agent time; automatic-detection-only agent time (once C11's later tasks ship it) is lower-confidence and C10 should keep treating it as an input rather than a hard exclusion.
- **Stale spans:** an open `window`/`machine`-scoped span left on for hours (human forgot to un-mark) is exactly the "ghost" problem Live Stints already solved for clock sessions (`stintReconciliation.js`) — C11a reuses that posture rather than inventing a new one: the home/sidebar panel (§1c) surfaces long-open spans the same way Live Stints surfaces long-open installs, with a manual dismiss/end action. No automatic timeout in v1 (the optional `autoExpiresAt` field exists for callers that want one, e.g. `ANNOUNCE_AGENT_SESSION` with an explicit `until`, but the UI-opened spans default to `null`/open-ended).

## Data model touchpoints (summary)

- **New storage key:** `agentSessions` (chrome.storage.local, FIFO-capped array) — see §3.
- **Extended:** `normalizeObservation()` (`src/utils/observationLedger.js`) — 3 new optional fields.
- **New migration:** `supabase/migrations/024_cortex_controller_attribution.sql` — adds `controller`/`controller_confidence`/`controller_provenance` to `tabatha.cortex_observations` (additive, nullable, `IF NOT EXISTS`).
- **No new table.** This is deliberately lighter than C11's own proposed `cortex_external_signals` table (C11 §"Data model touchpoints") — C11a only needs a column extension plus a small local span store, not a new signal-ingestion table.

## Dependencies (transformer graph)

**Depends on:**
- `src/utils/controllerAttribution.js` (Plan 044 T1, shipped) — the decision table this file wires into product surfaces.
- C4 Observations Ledger / `src/utils/observationLedger.js`, `captureService.js` — the normalize-then-store path that gains the `controller` fields.
- `src/content/gatekeeper.js` (InPop) and `src/content/inbar.js` (InBar) — the two content-script surfaces getting new UI.
- Migration 022 (`tabatha.cortex_observations`) — the table `024_cortex_controller_attribution.sql` extends.

**Feeds:**
- C11 (parent) — C11a is the manual half of the same `controller` attribution model; the rest of C11's Phase 5 tasks (automatic detection wiring) populate the same fields via heuristics instead of explicit spans.
- C10 Passive Self-Correction — closes open question #4 for the manually-marked subset (§5).
- C6/C7 leverage analytics (unbuilt) — eventual consumer of the `controller` facet on Work Shifts breakdowns (§1c).
- `docs/features/178-agent-context-tracking.md` (#178) — as C11 §"Related existing feature specs" already notes, #178 ("which AI did I consult") and C11/C11a ("is an AI currently driving") are different questions that should share the ledger shape. C11a's `agentSessions.agentName` field and #178's `agentContext.agents[].name` are close enough in intent that a future pass should consider whether InPop's "Agent working" picker and #178's "+ Agent" InBar button collapse into one entry point — flagged as Open Question 4 rather than resolved here, since #178 is about *consultation* (agent as a resource used) and C11a is about *control* (agent as the driver), and conflating them risks losing that distinction.

## Reuse points (VERIFIED)

| Asset | Path | Verified | Reuse |
|---|---|---|---|
| Pure decision table, `agentAnnounced` short-circuit | `src/utils/controllerAttribution.js:20-45` | read 2026-07-10 | The exact function this file wires up; no changes needed except possibly one new explicit-human short-circuit (Open Question 1) |
| `handleMessage(type, message)` router pattern | `src/background/services/captureService.js:491-500`, `cortexService.js` | read 2026-07-10 | Template for a new `agentSessionService.js` (or an extension of `cortexService.js`) handling `START_AGENT_SESSION`/`END_AGENT_SESSION`/`ANNOUNCE_AGENT_SESSION` |
| `normalizeObservation()` optional-field pattern | `src/utils/observationLedger.js:36-71` | read 2026-07-10 | Template for adding `controller`/`controllerConfidence`/`controllerProvenance` the same way `focusId`/`intentId` were added |
| InPop shadow-DOM overlay + `MutationObserver` (`waitForBody`) | `src/content/gatekeeper.js:5-93` | read 2026-07-10 | Insertion point for the "Who's working?" segmented control; `MutationObserver` pattern reused for the DOM-convention attribute watch (§2B) |
| InBar `.badge`/`.bar-btn` component family + inline-picker overlays (pause-prompt, backburner-prompt) | `src/content/inbar.js:168-171, 464-511, 583-623` | read 2026-07-10 | Template for the new 🤖 button, badge-agent chip, and inline controller picker |
| InBar nub persistent-urgency pattern (`badge-no-intent` surviving collapse) | `src/content/inbar.js` ("NUB (collapsed toggle)" section) | read 2026-07-10 | Template for the 🤖 corner dot on the collapsed nub |
| `isLiveConcurrent` filter + Live Stints panel | `src/home/index.jsx`, `src/sidebar/index.jsx`, `src/utils/stintReconciliation.js` | read 2026-07-10 (per Session Log 2026-06-04) | Template for the home/sidebar "open agent spans" panel and stale-span reconciliation posture |
| `CompanionStatus.jsx` header badge | `src/components/CompanionStatus.jsx` | referenced (home header wiring per Session Log) | Placement precedent for the home-header "Agent-driven" chip |
| Migration 022 additive/nullable-column posture | `supabase/migrations/022_cortex_ledger.sql:18-38` | read 2026-07-10 | Template for `024_cortex_controller_attribution.sql`'s `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |
| `#178` agent-context data shape (`agentContext.agents[]`) | `docs/features/178-agent-context-tracking.md` | read 2026-07-10 | Naming/shape precedent for `agentSessions.agentName`; flagged for future reconciliation, not merged in v1 (Open Question 4) |
| FIFO-capped storage key precedent (`intentHistory`, `activityAuditLog`) | `src/background/services/activityAuditService.js` (referenced by C10 §2) | referenced | Precedent for capping `agentSessions` |

## Implementation approach (v1)

Follows the pure-logic-first precedent (`controllerAttribution.js` already exists as the pure core; C11a is the shell + surfaces around it):

1. **`src/utils/agentSessionStore.js`** (new, pure) — `openSession(sessions, {scope, tabId, windowId, agentName, supervising, provenance, now})`, `closeSession(sessions, id, now)`, `findActiveSession(sessions, {tabId, windowId, now})` (scope-priority: tab > window > machine when multiple could match), `pruneExpired(sessions, now)`. Unit-tested in isolation like every other Cortex pure module (`node --test`).
2. **`src/background/services/agentSessionService.js`** (new, shell) — owns the `agentSessions` storage key, wraps `agentSessionStore.js`, exposes `handleMessage()` for `START_AGENT_SESSION` / `END_AGENT_SESSION` / `ANNOUNCE_AGENT_SESSION` / `LIST_AGENT_SESSIONS`, and one lookup helper `getControllerFor({tabId, windowId})` that `captureService.js`'s `recordObservation()` calls before stamping `controller`. Registered in `src/background/background.js`'s `services` array (~line 177-199, alongside `cortexService`).
3. **`src/utils/observationLedger.js`** — extend `normalizeObservation()` with the 3 new optional fields (small diff, existing tests extended not replaced).
4. **`src/content/gatekeeper.js`** — add the "Who's working?" segmented control to the modal HTML/JS, wire submit to also fire `START_AGENT_SESSION` when non-default is picked; add the `MutationObserver` DOM-convention watch.
5. **`src/content/inbar.js`** — add the 🤖 bar-btn, badge-agent chip, inline picker overlay, nub corner-dot; wire to the same messages.
6. **`src/home/index.jsx` / `src/sidebar/index.jsx`** — "Agent-driven" header chip (mirrors `CompanionStatus`) + small open-spans panel (mirrors Live Stints card layout); add `controller` facet to Work Shifts breakdowns.
7. **`supabase/migrations/024_cortex_controller_attribution.sql`** — additive column migration (not applied until user approval, matching migration 022's own "not yet applied" precedent).

**Estimated size:** ~5 new/touched source files + 1 new migration + 1 new pure-logic test file. Comparable to a single Cortex Phase task (e.g. Plan 044 T1's scope, one tier up for the UI surfaces) — roughly a half-day to a day of focused implementation, no companion/Rust changes required, no C13/mobile dependency.

## Phasing

**v1 (this file, shippable now, no dependency on the rest of C11's Phase 5 timeline):**
- Manual toggle on InPop + InBar + home/sidebar visibility (§1).
- `ANNOUNCE_AGENT_SESSION` message API + DOM-convention attribute (§2).
- `agentSessions` storage key + `controller`/`controllerConfidence`/`controllerProvenance` ledger stamping (§3).
- Migration 024 (additive columns).
- C10 exclusion rule for manually-marked agent spans (§5, closes C10 open question #4 for this subset only).

**v2 (gated on C11's automatic-detection tasks + C6/C7 analytics, unscoped here):**
- Automatic detection wiring (`webdriver`/`cdpActive`/`processAncestryAgent`/`inputEventsRecent` signal collection — currently `attributeController()` has the decision logic but no caller supplies real signals for anything but `agentAnnounced`).
- Companion-side process-ancestry detection (`window_monitor.rs` extension per C11 §"Reuse points").
- C6/C7 leverage-analytics surface actually consuming the `controller` split (v1 only adds the facet to existing Work Shifts breakdowns, not a new analytics view).
- Reconciling with #178 agent-context (consultation) — Open Question 4.
- Explicit-human short-circuit in `attributeController()` if Open Question 1 resolves toward needing one.

## Open questions

1. **Does `attributeController()` need an explicit human short-circuit?** Today it has `agentAnnounced` (explicit agent) but no symmetric explicit-human signal — a manual "I'm working" selection currently just *ends* a span (falls through to heuristics/default) rather than *asserting* human control against contrary heuristic evidence. If a heuristic (e.g. webdriver flag from an unrelated legitimate testing tool) is present at the same time, does the human's explicit "I'm working" need to out-rank it in the decision table itself, or is "no span open" sufficient (i.e. C11a never actually needs to touch `controllerAttribution.js`)? Leaning toward the latter (simpler, and heuristics without an open agent span are inherently lower-stakes) but flagging since §5 above assumes it without full certainty.
2. **Partition posture for controller-marked org time.** §3 above takes the position that manually-marked agent spans should NOT be forced into the `personal` partition the way C11's four external signal classes are (C11 §4) — an org-clocked-in agent-driven span should still land as `org` partition, just with `controller: 'ai-agent'`, because the org has a legitimate interest in knowing when clocked-in time was agent-delegated. This is a judgment call that diverges from C11 parent's default posture and needs explicit confirmation from Malkio.
3. **Scope-priority conflicts.** If a `machine`-scoped span is open and a user also opens a `tab`-scoped "I'm working" (ending just that tab's inherited agent state), does the tab-level override persist correctly across tab close/reopen, and does `findActiveSession()`'s tab > window > machine priority (Implementation approach §1) match user intuition, or should the *more specific* override always win regardless of which was opened first? Needs a couple of worked examples reviewed with Malkio before implementation, not just specified in prose.
4. **Merge with #178 Agent Context Tracking?** As flagged in Dependencies above — #178's "+ Agent" InBar button (consultation) and C11a's 🤖 button (control) are adjacent enough in the UI that shipping both separately risks InBar button clutter and user confusion ("which AI button do I click?"). Does v1 ship both as visually distinct buttons, or does C11a's control-marking become a mode *within* #178's picker (an agent entry gets a "driving" flag alongside "primary/supporting/reference")? Recommend resolving before InBar implementation (item 5 in Implementation approach), not after.
5. **Auto-expiry defaults.** Should the InBar-opened `window`/`machine`-scoped spans get a soft default `autoExpiresAt` (e.g. 4 hours) rather than shipping fully open-ended, to reduce reliance on the human/#1c panel to remember to close them? C11a's v1 currently defaults to no auto-expiry (open-ended) for UI-opened spans per §5's "stale spans" handling, but this is worth a product call rather than assuming.
