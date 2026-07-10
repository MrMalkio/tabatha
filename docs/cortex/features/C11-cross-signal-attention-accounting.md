# C11 — Cross-Signal Attention Accounting

> 🔗 Google Doc: https://docs.google.com/document/d/1AR27g54pEakTIXQL_NdHGZKIuSC0IutEskv1D1hsl0k/edit?usp=drivesdk&ouid=104108780460431833741

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5 (C11)
Origin: user — Dump 2 (`SOURCE-braindumps.md`)
Phase: Phase 5

## Purpose

Everything Tabatha measures today lives inside one browser install. C11 is the acknowledgment that "attention" is bigger than that: a person's actual working day includes phone calls, texts, email replies, stretches where the computer itself was off, and — increasingly — stretches where a *browser or window is being driven by an AI agent rather than the human*. Dump 2, verbatim: *"knowing when an AI agent is the one controlling a browser/window/computer so attention and activity is attributed to the right entity — so Tabatha provides better info on how well the user is optimizing and leveraging their resources and tools."*

C11 is not a bigger surveillance net for its own sake — it exists to make the "how well are you leveraging your tools?" analytics (§1 mission, §5 C6/C11) **honest**. Without it, an AI agent grinding through a background task inside a Tabatha-tracked browser window would silently inflate the human's "focused work" numbers, and Tabatha would recommend the wrong optimizations because it thinks the human did work an agent actually did.

## Detailed behaviors

### 1. Signal classes ingested
Per the braindump and program spec §5 (C11), four new signal classes join the existing telemetry:
- **Phone/call logs** — call start/end timestamps, direction (in/out), duration. Source TBD (mobile companion, per C13, or a manual/API integration — no phone-side capture exists in Tabatha today).
- **Email reply latency** — time between an inbound email landing and the outbound reply, not full email content. Requires a mail-provider integration (out of scope for this file; C11 defines the *attribution use*, not the connector).
- **Text-message reply latency** — same shape as email, SMS/iMessage/etc., mobile-side.
- **Computer on/off windows** — machine power-state transitions, distinct from Chrome-idle (already tracked) and companion-process-alive (already tracked via the WS heartbeat). This is the "was the machine even running" signal underneath both.

These are explicitly **not** full-content capture (no call recordings, no message bodies) — C11 ingests **timing and metadata**, consistent with the privacy spine (§6): only derived observations, never raw content, flow into the ledger.

### 2. Human-vs-AI-agent attribution (first-class requirement)
This is the braindump's most specific ask inside C11 and must not be diluted into a generic "more signals" cluster:
- **Detection surfaces:**
  - **Browser automation fingerprints** — `navigator.webdriver`, CDP-attached session markers, headless/automation flags Chrome already exposes to extensions in some contexts; known agent user-agent strings (Claude Code browser tools, Playwright, Puppeteer) where identifiable.
  - **Companion-side process ancestry** — the desktop companion's `window_monitor.rs` already polls the active window/app at 1s resolution (per program spec §3); C11 extends this to also record **which process spawned/owns** the window when determinable, so an agent-driven automation window (e.g. a CLI harness driving a browser instance) is distinguishable from a human-opened one.
  - **Input-event absence** — a window receiving programmatic navigation/clicks with no corresponding physical mouse/keyboard input over a sustained window is a strong agent-control signal. This does *not* require keystroke *content* capture — only presence/absence of input events, which is a much lower privacy bar than the currently-inert `keystrokeAnalytics` toggle (program spec §3) implies for its own separate purpose.
  - **Explicit self-identification** — when Tabatha's own future agent/harness integrations (C8 cron-in-harness, or a Claude-in-Chrome-style tool) drive a browser, they can announce themselves via a first-party signal (e.g. a marker written to the ledger at session start: `controller: 'agent', agentId: '...'`), which is authoritative when present and should be preferred over heuristic detection.
- **Attribution write:** every observation in the ledger (C4, `tabatha.cortex_observations`) gets a `controller` field (`'human' | 'agent' | 'unknown'`) alongside existing `surface`/`kind`. Default is `'human'` until a detection surface positively identifies otherwise — mirroring the existing pattern of defaulting to the least-alarming classification and only escalating on positive evidence (same posture `classifyInstallForCleanup()` in `stintReconciliation.js` takes toward "self" vs "live" vs "reconcile").
- **Downstream effect:** C6's optimization analytics and C10's duration self-correction (see C10 §Dependencies, open question #4) must exclude or separately bucket `controller: 'agent'` time so "how long did you actually work on X" isn't inflated by agent-driven sessions.

### 3. Leverage/optimization analytics
- C11's fused signal set (reply latency + call activity + machine-on windows + human-vs-agent split) feeds a new analytics surface answering: *are you actually using the tools you pay for / have available, and is your "response time" reputation backed by real behavior or agent delegation you haven't accounted for?*
- This is explicitly framed as **informational, not judgmental** — same posture as existing Tabatha analytics (Work Shifts, Logs) — surfaced through C7's Recommendation Dashboard, not a new punitive UI.

### 4. Privacy weight (heavily opt-in, personal partition)
C11 carries materially higher privacy weight than any other cluster shipped so far in Cortex:
- **Off by default, per-signal opt-in** — not a single master toggle. Phone/call logs, email latency, text latency, and computer on/off are four independent consents; enabling one does not enable the others.
- **Personal partition only in v1** — per the privacy spine (§6, rule 6), these signals are inherently personal-device signals (a person's phone, their personal email/text reply behavior) and should default into the `personal` partition of the ledger even when the org has otherwise mandated capture-on-clock-in (C12). An org mandating C11 signal capture specifically (not just screen capture) is a distinct, heavier policy decision than C12's baseline mandate and is **not** assumed granted by C12 — flagged as an explicit open question below.
- **No content, only timing/metadata**, as above — this is the single biggest lever for keeping this cluster acceptable to ship at all.
- **Human-vs-agent detection heuristics** (webdriver flags, input-absence) operate on signals Tabatha or the companion already has access to for other reasons (active-window polling, capture decisioning) — C11 does not require a new capture surface for attribution itself, only new *classification logic* over existing surfaces, plus the four genuinely new external signal classes above.

## Example scenario

A user has a Claude Code harness running an overnight cron job (C8) that opens a Chrome window to check a dashboard and screenshot it every 30 minutes, unattended. Without C11, that window's activity lands in the same ledger as the user's own browsing — category "dashboard/analytics," several visits, no drift-detector complaints since the pattern is consistent — and C6's optimization loop might conclude the user is spending real focused hours on that dashboard, recommending a hotkey to "speed up" a workflow the user never actually performs by hand.

With C11: the harness announces itself at session start (explicit self-identification signal, §2), so every observation from that window carries `controller: 'agent', agentId: 'claude-code-cron-<id>'`. C10's duration self-correction (its own open question #4) excludes agent-controlled time when recomputing "how long something was actually worked on," and C6/C7's leverage analytics can instead report the *useful* fact: "an agent is checking this dashboard for you every 30 minutes — here's what it's finding" rather than miscrediting the human with dashboard-monitoring hours they didn't spend.

## Interfaces (proposed message contracts)

Following the `handleMessage(type, message)` router pattern already used by `captureService.js`/`autoFocusService.js`:

| Message | Direction | Purpose |
|---|---|---|
| `GET_CROSS_SIGNAL_CONSENT` | settings → background | Read the four independent per-signal opt-in flags |
| `SET_CROSS_SIGNAL_CONSENT` | settings → background | Toggle one signal class (calls/email/text/power-state) |
| `RECORD_EXTERNAL_SIGNAL` | mobile companion / integration → background | Ingest one timing/metadata event into `cortex_external_signals` |
| `ANNOUNCE_AGENT_SESSION` | harness/agent tool → background | First-party `controller: 'agent'` self-identification (preferred over heuristic detection, §2) |
| `GET_LEVERAGE_ANALYTICS` | dashboard → background | Read the fused "how well are you using your tools" summary |

## Data model touchpoints

- **Ledger extension:** `tabatha.cortex_observations` (migration 022) gains a `controller TEXT CHECK (controller IN ('human','agent','unknown')) DEFAULT 'human'` column, or (Phase 5, additive) a new migration `02X_cortex_cross_signal.sql`.
- **New tables (proposed, Phase 5):**
  - `tabatha.cortex_external_signals` — `{ id, profile_id, partition ('personal' only in v1), signal_type ('call'|'email_reply'|'text_reply'|'power_state'), occurred_at, latency_ms (nullable), metadata jsonb }`. No message/call content columns — timing/metadata only, mirroring `cortex_capture_refs`'s "never a pixel blob" posture for `storage_uri`.
  - Per-signal consent flags, likely alongside existing settings (`DEFAULT_SETTINGS` already has a `captureRetention`-style nested-object precedent) rather than a new table — e.g. `crossSignalConsent: { calls: false, emailLatency: false, textLatency: false, powerState: false }`.
- **RLS:** mirrors migration 022's own-profile-only policy pattern; these are personal-partition-only in v1, so no manager/org read policy (unlike migration 012's manager scoping) is added yet.

## Dependencies (transformer graph)

**Depends on:**
- C4 Observations Ledger — where cross-signal events and the new `controller` field are fused.
- C1 Adaptive Capture Engine / companion (`window_monitor.rs`, `companionBridge`) — supplies device/window-control signals the attribution heuristics run over.
- C14 Agent Data Map & Governance — must catalog these four new external signal classes and the `controller` field before they ship (DATA-MAP.md currently has no row for any of them — confirmed gap, see program spec cross-reference below).
- C2 Sensitive-Data Guard / privacy spine (§6) — governs the heavier opt-in posture.

**Feeds:**
- C10 Passive Self-Correction — consumes `controller` attribution to avoid crediting agent-driven time as human focus (see C10's open question #4).
- C6 Optimization Loop / C7 Recommendation Dashboard — "leverage your tools" analytics surface.
- C12 Team/SOP Mode — indirectly: an org evaluating a new hire's SOP execution needs to know if a fast turnaround was the hire or an agent they're delegating to, though C11 signal capture is not assumed part of C12's baseline mandate (see C11 open question #2).

## Reuse points (VERIFIED)

| Asset | Path | Verified | Reuse |
|---|---|---|---|
| Active-window poll incl. app/title/category/idle @1s | `tabatha-desktop/src-tauri/src/window_monitor.rs` | referenced in program spec §3, not modified this pass | Base surface to extend with process-ancestry detection |
| Companion WS bridge, `isRecentlyActive()` | `src/background/services/companionService.js:441` | read 2026-07-10 | Existing device-activity signal; precedent for a "recently active" style check reusable for power-state gaps |
| Ledger normalization (`normalizeObservation`, `dedupeKey`, `partitionOf`) | `src/utils/observationLedger.js` | read 2026-07-10 | `controller` field slots into the existing normalized record shape as an additional optional field, same pattern as `focusId`/`intentId` |
| Least-alarming-default classification posture | `src/utils/stintReconciliation.js` (`classifyInstallForCleanup`) | read 2026-07-10 | Precedent for defaulting `controller` to `'human'` and escalating only on positive evidence |
| Migration 022 partition + RLS pattern | `supabase/migrations/022_cortex_ledger.sql` | read 2026-07-10 | Template for the proposed `cortex_external_signals` table and personal-only RLS |
| `keystrokeAnalytics` inert toggle (precedent for input-presence-only, no-content capture framing) | program spec §3 | referenced | Distinguishes "input event presence" (low privacy bar, usable for agent-detection) from "keystroke content" (the toggle's actual, much heavier, unshipped scope) |

## Implementation approach

Follows the pure-logic-first precedent Phase 1 T1 established (`src/utils/captureDecision.js`, `sensitiveDataGuard.js`, `observationLedger.js`, `retentionPolicy.js`, each unit-tested via `node --test`). C11's attribution logic is the highest-risk-of-bugs piece (false-positive agent detection actively harms the user, per open question #3) and should get the same treatment:
- `src/utils/agentAttribution.js` — pure `classifyController({ webdriverFlag, processAncestry, inputEventPresence, selfAnnounced })` returning `'human' | 'agent' | 'unknown'` plus a confidence/reason, independently testable against synthetic evidence fixtures before it ever touches a real window.
- `src/utils/externalSignalNormalize.js` — mirrors `observationLedger.js`'s `normalizeObservation()` shape for the four new signal classes, so `cortex_external_signals` rows are produced by the same normalize-then-store discipline as the main ledger.

## Related existing feature specs

Per program spec §3's "Cortex absorbs/relates" reuse map, two pre-Cortex feature drafts overlap C11 and should be reconciled rather than re-specified from scratch:
- **`docs/features/166-off-device-tracking.md`** — manual/inquiry-based off-device time attribution ("You were away 45 minutes, what were you doing?"). This is a *lighter, human-confirmed* version of what C11's phone/call/text signals aim to do *automatically*. C11 should treat #166 as the fallback UX when an automatic signal isn't available/consented, not a competing feature — if C11 ships phone/call-log ingestion, the off-device inquiry prompt in #166 can be skipped for windows C11 already has real evidence for.
- **`docs/features/178-agent-context-tracking.md`** — user-*manual* attribution of which AI chat/agent assisted a focus ("Track which AI chat, AI agent... helped the user"). This is the opt-in, self-reported cousin of C11's automatic human-vs-agent *control* detection. They are not the same thing: #178 answers "which AI did I consult," C11 answers "is an AI currently driving this browser window without me." Both should write into the same ledger `controller`/agent-context shape so downstream analytics don't have to reconcile two separate agent-attribution models.

## Open questions

1. **Phone/text signal transport** — no mobile companion exists yet (C13 is also unshipped, Phase 5). Does C11's phone/call/text ingestion wait on C13, or does it accept a lower-fidelity v0 via a manual import / third-party API (e.g. a carrier export, a Google Voice/iMessage bridge)? Not resolved by the program spec.
2. **Does an org's C12 capture-on-clock-in mandate ever extend to C11 signals?** The program spec's privacy spine (§6 rule 2) says personal capture during org time stays separate; this file takes the position that C11's four signal classes default to personal-only regardless of C12 mandate status, but this is a judgment call, not a spec citation — needs explicit confirmation from the program owner.
3. **False-positive cost of agent-detection heuristics** — webdriver-flag and input-absence detection will misfire (e.g. a human using voice control — C9 — produces no keyboard/mouse events either, and could be misclassified as agent-controlled). C9's own hotkey/dictation activity must be whitelisted as a `controller: 'human'` signal, not accidentally treated as agent evidence.
4. **Retention for external signals** — do phone/call/text timing records follow the same C3 time+space retention as screen captures, or do they need their own (likely shorter, given sensitivity) default?

## Phase & rollout

- **Phase 5** (per program spec §8), alongside C13 Environment & Mobile — C11 is explicitly the last cluster to ship, gated on both the privacy posture being proven out over four earlier phases and (per open question #1) likely on C13's mobile surface existing.
- No Phase 1–4 work is blocked on C11; C10 (Phase 3) ships with the documented blind spot (open question #4 in C10) until C11 lands.
