# Tabatha Cortex — AI Observation & Optimization Layer

> 🔗 Google Doc (source of truth): https://docs.google.com/document/d/1KC52k_RAebemkFQqk8UHGDuMCEnxuZwYnAc_YgVe9Ww/edit?usp=drivesdk&ouid=104108780460431833741

> **Program master spec.** This is the anchor document. Every capability cluster below has (or will have) its own independent feature file in `docs/cortex/features/` so it can be expanded and delegated to a separate agent, then reassembled ("like a transformer"). Each per-feature file links back here.

- **Program:** Tabatha Cortex (the AI intelligence tier of the Attention OS)
- **Plan registry:** Program = Plan **039**; Phase 1 = Plan **040** (see `.headbox/plan-registry.md`)
- **Current version:** 6.5.0 → **target 7.0.0** on Phase 1 completion (MAJOR — first AI integration)
- **Google Drive (source of truth for docs):** `Tabatha / Cortex` — link added on creation; local `.md` mirrors carry the Drive link in their header.
- **Status:** DRAFT (v0.1, authored 2026-07-09). Scheduled for Fable autonomous expansion + implementation-plan authoring the night of 2026-07-09 ~22:00 ET.
- **Origin:** Scoped from Nick Saraev's "AI that watches my screen / Fable screenshot processing" video (in the Tabatha NotebookLM) + two design brain-dumps from Malkio (captured verbatim in §11).

---

## 1. Mission & framing

Tabatha is the **Attention Operating System** for the browser. Cortex is the layer that makes it *intelligent*: it **watches the telemetry Tabatha already collects**, **captures screenshots/audio only when context says it's worth it**, distills a repeating record of behavior into an **Observations Ledger**, finds **patterns of waste (repeat ≥3–4×)**, and runs an **optimization loop** that surfaces — and increasingly *executes* — fixes: hotkeys, tool replacements, custom scripts/extensions, consolidated digests, and autonomous overnight builds.

This is a **program, not a feature** — ~15 capability clusters across 5 architectural layers. It ships in **phases**; not all of it lands at once (explicit user constraint). Phase 1 is deliberately the cheapest, local-first, no-backend slice.

**Design principles**
- **Reuse first.** Tabatha already has the observation substrate (see §3). Cortex adds intelligence, not duplicate plumbing.
- **Passive by default, escalating on config.** For most users Tabatha should be "almost invisible," self-correcting its own records, assuming the human neglects manual upkeep. Power users can opt into heavier interaction.
- **Local-first, opt-in, redacted.** Raw pixels/audio stay on-device by default; only derived observations sync unless the user opts in. Cloud batch is a *backup* path, not the default.
- **Personal ≠ organizational.** A user's personal capture never flows to their org. Org capture (when clocked in) is governed by admins. Separate storage, separate retention.
- **Two-way.** Cortex isn't just eyes; it has a **voice** and **ears** — it can speak in place of a modal and listen for the user's reply.

---

## 2. Concept extraction — every idea from the source video

| # | Video concept | Cortex home |
|---|---------------|-------------|
| V1 | High-frequency screen capture (~every 5s) into a daily folder/db | C1 Adaptive Capture |
| V2 | ~8,640 metadata lines/day = full digital trail | C4 Observations Ledger |
| V3 | Vision-only model samples ~20 frames where text metadata is insufficient | C4 + C5 (vision-on-demand) |
| V4 | Observations Ledger = central db of repeated behaviors | C4 |
| V5 | Pattern validation — flag only if it repeats **3–4×** | C5 Pattern Engine |
| V6 | Automated optimization loop, timed to session limits (daily / before sleep) | C6 Optimization Loop |
| V7 | Query: "how can I economize my workflow based on this ledger?" | C6 (master prompts) |
| V8 | Recommendations: hotkeys, replace paid tools w/ free-local, write custom code | C7 Recommendation & Action |
| V9 | Kill polling loops → single consolidated **morning digest** | C7 (digest) |
| V10 | Hotkey/script integration (Raycast command; hotkey → dictate → API) | C7 + C9 Voice |
| V11 | Tool replacement (paid transcription → local: $15/mo saved, 250ms→50ms) | C7 + C9 |
| V12 | Custom tool creation (auto-wrote a Chrome extension to open a page-set) | C7 + C8 Autonomy |
| V13 | Extend to physical env: desk camera every 5–10s over 3–7d → ergonomic feedback | C13 Environment |
| V14 | OS accessibility/screen-recording permission management (Mac/Win) | C1 + C2 |
| V15 | Lightweight, low-cost tokens; scalable to teams | C6 + C12 |
| V16 | Manager applies to new hires → learn SOPs faster; tailored hotkey/ext suggestions | C12 Team/SOP |

---

## 3. What already exists in Tabatha (reuse map)

| Existing asset | Path | Cortex reuse |
|---|---|---|
| Rust companion: active-window poll @1s (app, title, category, idle) | `tabatha-desktop/src-tauri/src/window_monitor.rs` | C1 OS capture trigger; C4 ledger source |
| Companion SQLite (`app_sessions`, `clock_sessions`) | `…/activity_log.rs` | C4 ledger; C3 storage |
| Companion WS server (port 9147, APP_SWITCH/IDLE_STATE/…) | `…/ws_server.rs` | C1 browser⇄OS handoff signal |
| Categorizer (app→category) | `…/categorizer.rs` | C4 enrichment |
| Extension logger (chrome.storage `tabathaLogs`, cap 500) | `src/services/logger.js` | C4 |
| Activity audit trail (focus lifecycle) | `src/background/services/activityAuditService.js` | C4; C10 self-correction |
| Behavioral telemetry: intentHistory, focusState, clock/clockHistory, tab events, domain visits, companion app/session | `src/background/services/*` (tabTracking, domainHistory, clock, focus…) | C4 (the "8,640 lines" already partly exist) |
| Companion bridge (WS lifecycle, events, mirror to storage) | `src/background/services/companionService.js` (`companionBridge`) | C1; C11 |
| Sync (debounced push, watermark upserts) | `src/background/services/syncService.js` | C3 cloud-batch backup; C4 |
| Service router (DI, `services[]`) | `src/background/background.js` | New `cortexService` / `captureService` / `voiceService` register here |
| **Inert** capture toggles (`screenshotCapture`, `keystrokeAnalytics`) | `src/settings/index.jsx` "Privacy & Capture" | C1/C2 — wire these up |
| Settings defaults / persistence | `src/background/constants.js` (`DEFAULT_SETTINGS`), `settingsService.js` | All config |
| Supabase migrations (latest **021**) | `supabase/migrations/` | Next = **022** for ledger + capture refs |
| Related feature specs already drafted | `docs/features/190,197,178,198,166,167,169,207,208,210-214` | Cortex absorbs/relates (see per-feature files) |
| **Mobile repos (existing, separate)** | `C:\Users\mrmal\le dev\tabatha-mobile` (Expo/RN scaffold + planning docs — scaffold only, no source tree yet per DATA-MAP verification) + `tabatha-mobile-2` (Android variant, unverified) | C13 mobile parity + C11 call-log signals — extend these repos, do NOT start a third *(gap closed by Fable 2026-07-10; was missing from this map)* |

**Gap:** zero AI/LLM code, zero prompt infra, zero API-key storage, no screenshot/audio capture today. Cortex builds all of that.

---

## 4. Reference architecture (5 layers)

```
① SENSE   Adaptive Capture Engine (C1) — context-driven screenshots (browser⇄companion
          handoff, multi-screen, per-window), existing telemetry, Voice/dictation (C9),
          manual screen+audio recording. Sensitive-Data Guard (C2) filters/redacts BEFORE persist.
② STORE   Storage & Retention Fabric (C3) — local-first → external archive (Drive/OneDrive/HDD),
          personal⇄org partition, retention by time AND free-space.
③ LEDGER  Observations Ledger (C4) — one normalized store fusing all signals. Vision samples
          frames only when text is insufficient.
④ THINK   Pattern Engine (C5, repeat ≥3–4×) → Optimization Loop (C6, intraday-low / EOD-high).
⑤ ACT     Recommendation Dashboard (C7, yes/no) → Action/Agent layer (C8): hotkeys,
          tool-replacement, custom-code/extension gen, morning digest, autonomous overnight builds.
```
**Cross-cutting:** Privacy & Governance spine (C2 + org policy), Voice/Audio two-way (C9), Self-correction (C10), Cross-signal attention accounting (C11), Team/SOP (C12), Environment/Mobile (C13), and the **Agent Data Map** (C14) so every downstream agent knows what Cortex now captures.

---

## 5. Capability catalog (15 clusters)

Each cluster → its own `docs/cortex/features/CXX-*.md` (expanded by Fable). Summary here.

### C1 — Adaptive Capture Engine  *(video V1; user-expanded)*
- **Context-driven timing**, not blind interval. Use existing signals (tab switch, window switch, focus/intent change, idle) to decide *when* a frame is worth taking. Fixed interval (5–10s, configurable) only as a fallback while the user *dwells* in one window.
- **Browser⇄OS handoff:** extension captures the visible tab on tab-switch + dwell-interval; when Chrome loses focus, the **companion** takes over OS capture. No double-capture.
- **Multi-monitor / aspect-ratio aware:** capture (a) full virtual desktop, (b) each screen as a separate timestamped image, or (c) a **specific window** in isolation (critical for ultrawide + mixed-ratio setups where full-desktop shots confuse vision models). Configurable.
- **Manual screen recording:** on-demand video + system audio + mic, from both extension (Chrome `getDisplayMedia`/`tabCapture`) and desktop companion (OS capture). PC first; Mac accounted for later.
- Reuse: `companionBridge` focus signal, `chrome.tabs.captureVisibleTab`, companion window_monitor.

### C2 — Sensitive-Data Guard  *(user; privacy spine)*
- **Global opt-out** (wire the inert `screenshotCapture` toggle). Per-user control on personal profile.
- **Per-site/app suppression:** when a designated app/site is the *focused* window (e.g. QuickBooks), skip capturing **that** frame — but keep capturing other tabs/windows when it's not focused.
- **Capture-time auto-redaction:** blur a configurable region (e.g. bottom 80% of a QuickBooks tab) *before* the image is written, preserving "which page/client" context while removing the client's private/identifying data. (The privacy risk is client-ID + private-info *together*, not "which client.")
- **Sensitive workstyle profiles:** finance/legal presets that auto-deactivate capture for known-sensitive contexts.

### C3 — Storage & Retention Fabric  *(user)*
- **Local-first:** all raw frames/audio on-machine by default, at a **configurable path**.
- **External archival:** auto-archive to Google Drive / OneDrive / external HDD when available; configurable target; graceful fallback to local path.
- **Personal ⇄ Org partition:** personal captures archived separately and **never** sent to the org. Org-level capture = everything while clocked in.
- **Dual retention plans:** personal retention user-controlled; org retention admin-controlled, driven by **both time and free disk space**.

### C4 — Observations Ledger  *(video V2/V4)*
- One **normalized event/observation store** fusing telemetry (window titles, categories, intent, tabs, domains, clock) + capture references + vision/audio extractions. The equivalent of the video's "8,640 lines/day," much of which Tabatha already records.
- Nightly **plain-file export** the harness/agents can read (feeds C6 cron-in-harness).
- Migration **022** adds ledger + capture-reference tables (personal vs org partition).

### C5 — Pattern Engine  *(video V3/V5)*
- Detects **repeated behaviors**, flags a "pattern" only at **≥3–4 repetitions** in a window (kills one-off noise).
- **Vision-on-demand:** samples ~N frames only when text metadata is insufficient to explain a pattern.

### C6 — Optimization Loop  *(video V6/V7/V15)*
- **Multi-cadence:** low-level passes *throughout the day*, a high-level pass at **end-of-day** to guide tomorrow (and feed an autonomous agent overnight).
- **Master optimization prompts** ("how do I economize this workflow?"). Timed to model/session limits for cost efficiency.

### C7 — Recommendation & Action Layer  *(video V8/V9/V10/V11/V12)*
- **Recommendation Dashboard** — surfaces suggestions; user **approves/dismisses** (yes/no). Phase 1 = read-only.
- Suggestion types: keyboard shortcuts, **tool replacement** (paid→free/local, latency wins), **custom code / Chrome-extension generation**, **consolidated morning digest** (replaces manual polling loops).
- On approval, Cortex **generates the prompt/script/extension** using whatever AI it has access to and triggers it as a task (reactive) — or hands to autonomous mode (proactive).

### C8 — Agent Orchestration & Routing (Autonomy Ladder)  *(user)*
- **Routing options (escalating):** ① **cron-in-harness** (Tabatha writes a scheduled task/script into the user's existing Claude Code / Codex / etc. harness, reading the local ledger) → ② **backend proxy** (Supabase edge fn / flux-asana-widget server holds the key, enables team billing/batch) → ③ **Vercel AI Gateway** (fallbacks, observability, zero-retention) → ④ **BYOK** (user pastes own key in settings).
- **Headbox integration:** leverage Headbox's understanding/governance of the harnesses installed on the machine; companion can read harness folders to place/inspect scheduled tasks.
- **Proactivity config:** reactive (dashboard yes/no) ↔ proactive (agent acts overnight and presents results next morning: a built extension, a dashboard, completed knowledge work).
- **Master system prompts** for the optimization task are a first-class artifact set (versioned in `docs/cortex/prompts/`).

### C9 — Voice / Audio (two-way)  *(user — see §7 for full detail)*
- **Output:** Tabatha has a *voice*. Where a modal would interrupt, Tabby may instead **wake and speak** — short, soft, contextual, not pre-recorded — preceded by an **audible tone**; the mic opens so the user can say "hold off" → "ok, I'll come back later." If no response / user absent → fall back to a modal. Configurable.
- **Input — three hotkeys:** (1) **Transcription** into a field (cheap/local model), (2) **Speak to Tabby** (transcribe + think; real-time convo ↔ process-then-reply ↔ silent context/Flux update), (3) **Voice note** stored to Flux context. Different models per hotkey for cost control.
- **Dictation engine:** WhisperFlow-style — either integrate/extend an open-source dictation tool or build our own wrapper; **everything dictated also feeds the Cortex ledger/context.**
- **Universal audio-input replacement** *(gap closed by Fable 2026-07-10 — Dump 2)*: beyond the three hotkeys, the user can replace **virtually every button/input in Tabatha with an audio button** — speak what's going on and Tabby decides what to do — while manual controls remain available for working styles that want them. The C15 interaction-density dial governs how far this goes per user/org.

### C10 — Passive Self-Correction  *(user)*
- Tabatha continuously **repairs its own records** from observation: fixes tab↔intent links, corrects what an intent *really* is, recomputes how long something was *actually* worked on — assuming the human is always behind on manual upkeep. Reuses `activityAuditService` + ledger.

### C11 — Cross-Signal Attention Accounting  *(user)*
- Ingests broader signals to attribute attention accurately: phone/call logs, email/text **reply latency**, computer **on/off** windows — and critically, **distinguishes human vs AI-agent control** of a browser/window/machine so activity is attributed to the right entity. Powers honest "how well are you leveraging your tools?" analytics.

### C12 — Team / Onboarding SOP Mode  *(video V16)*
- Managers apply Cortex to **new hires** to learn SOPs faster; after observing a hire's workflow, Cortex suggests tailored extensions/hotkeys → org-scale time savings.
- **Org mandate:** admins can *require* capture-on-clock-in for team members; enforced via org policy + `browser_profiles`/awareness.

### C13 — Environment & Mobile  *(video V13; user)*
- **Ergonomic camera:** optional desk-cam capture every 5–10s over 3–7 days → posture/glare/monitor-height feedback.
- **Mobile:** phone-side screenshot + audio tracking (future) with the same ledger/redaction model.

### C14 — Agent Data Map & Governance  *(user — mandatory)*
- Update `.headbox/workspace-map.md` + a **new data catalog** (`docs/cortex/DATA-MAP.md`) documenting every signal Cortex now captures, where it's stored (personal vs org, local vs cloud), retention, redaction state, and **access contracts** for downstream agents. Every prior data source is folded in so agents have one authoritative map.

### C15 — Config & Interaction-Density Model  *(user)*
- A cross-cutting **configuration surface**: capture cadence/scope, redaction rules, storage targets, retention, routing tier, proactivity level, and an **interaction-density dial** (invisible/passive ↔ high-touch/manual) so each user or org tunes how present Tabby is.

---

## 6. Privacy & governance spine (normative)

1. Capture is **off by default**, opt-in per personal profile.
2. **Org can mandate** capture-on-clock-in; personal capture during org time is separate and never shared upward.
3. Raw frames/audio are **processed then handled per retention**; only derived observations leave the device unless the user opts into cloud batch.
4. **Redaction happens at capture time**, before write.
5. **Sensitive-context suppression** (per-site/app, workstyle profiles) always wins over capture rules.
6. Separate **personal vs org** storage + retention, org retention admin-set (time + space).

---

## 7. Voice & audio subsystem (detail)

**Output / "Tabby speaks":**
- Trigger: a moment that would otherwise raise a modal. Cortex decides speak-vs-modal by config + context + presence.
- UX: audible tone → brief mic-open window (user can interject "hold off") → short, soft, *generated* (not canned) spoken line contextual to the modal type. If the user interjects → "ok, I'll come back later." If silent/absent → modal fallback.
- Always-available hotkey to summon Tabby's voice.

**Input / three hotkeys:**
| Hotkey | Purpose | Model tier | Destination |
|---|---|---|---|
| 1. Transcribe | dictate into the focused input/field | cheap/local transcription | the field |
| 2. Speak to Tabby | converse / command | transcription **+ thinking** | Tabby acts; sub-modes: real-time convo · process-then-reply · silent context/Flux update |
| 3. Voice note | freeform note to context | transcription only | Flux context store |

**Dictation engine:** open-source WhisperFlow-style base or in-house wrapper; all dictation also mirrors into the ledger/context. Relates to feature #211 (Audio Input & Voice Control).

---

## 8. Phasing roadmap

**Phase 1 (Plan 040) — first AI layer, local-first, cheapest path. Target v7.0.0.**
1. C1 Adaptive Capture v1 (browser tab capture on switch + dwell-interval; companion OS-capture on Chrome-blur handoff; context decides *when*).
2. C2 Sensitive-Data Guard v1 (per-site suppression + capture-time region redaction; wire the opt-out toggle).
3. C3 Storage Fabric v1 (local, configurable path; personal/org partition; basic time+space retention; external-archive interface stub).
4. C4 Observations Ledger v1 (migration 022; normalize existing telemetry + capture refs; nightly file export).
5. C5+C6 v1 via **cron-in-harness** (Tabatha writes an optimization cron into the user's Claude Code/Codex harness; runs the master "economize" prompt over the ledger export; ≥3× validation; writes back recommendations).
6. C7 Dashboard v1 (read-only; approve/dismiss).
7. C14 Agent Data Map v1 (workspace-map + DATA-MAP.md updated).

**Phase 2** — Routing tiers ② backend proxy + ③ Vercel Gateway; C7 action execution (generate scripts/extensions on approval); morning digest; C15 config surface.
**Phase 3** — C9 Voice (two-way + 3 hotkeys + dictation engine); C10 passive self-correction.
**Phase 4** — C8 proactive/autonomous overnight builds; C12 team/SOP mandate enforcement; multi-cadence intraday processing.
**Phase 5** — C11 cross-signal accounting (human-vs-agent attribution); C13 environment camera + mobile; Mac parity.

*(Sequencing is a proposal; Fable to refine per dependency analysis and the parallel-development workflow.)*

---

## 9. Data model & Agent Data Map

- **Migration 022** (`supabase/migrations/022_cortex_ledger.sql`): observations ledger + capture-reference tables, personal/org partitioned, RLS mirroring existing patterns (see `syncService.js` conventions). Latest existing = 021.
- **`docs/cortex/DATA-MAP.md`** — authoritative catalog of all Cortex + pre-existing signals, storage location, partition, retention, redaction, and agent access contracts.
- Update **`.headbox/workspace-map.md`** to include `docs/cortex/**`, capture storage locations, and the new services.

---

## 10. Multi-agent delegation model ("transformer")

Each capability cluster is an **independently expandable unit** with a defined interface + dependencies, so work can be split across agents and reassembled:
- `docs/cortex/features/CXX-*.md` — one file per cluster (own task, own owner, cross-links to dependencies).
- `docs/cortex/prompts/` — master optimization system prompts (versioned).
- `docs/cortex/DATA-MAP.md` — shared contract all agents read.
- Every file: local `.md` + a Google Doc mirror in `Tabatha/Cortex`; **Google Doc is source of truth**, local is a synced download (avoids double-authoring; also lets us drop the same docs into NotebookLM).

---

## 11. Design brain-dumps (verbatim source, do not lose)

The two Malkio brain-dumps that generated this spec are preserved verbatim in `docs/cortex/SOURCE-braindumps.md` (capture surface + routing + privacy + voice + operational asks). Fable: reconcile the spec against them before expanding; anything in the dumps not yet reflected is a gap to close.

---

## 12. Related board items (tracked separately)

- **`.pem` / extension persistence:** a recently-added `.pem` may be why the unpacked extension disappears on machine restart, forcing reinstall. Need a no-`.pem` build that persists indefinitely (until Chrome Web Store deploy) **without losing history tied to the extension ID** — verify whether the Supabase sync already makes ID-loss a non-issue (login → rehydrate). See parking_lot + Asana task.
- **Desktop companion deploy backlog:** latest companion changes not yet deployed; Headbox integration work in flight. See parking_lot + Asana task.

---

## 13. Decisions log

| Decision | Choice |
|---|---|
| Name | Tabatha Cortex |
| Capture surface | Hybrid (browser + companion + telemetry-driven timing) |
| Routing | All tiers; **start cron-in-harness** (easiest, local-data) |
| Privacy v1 | Local-first opt-in + cloud batch backup; no local model in v1 |
| Deliverable shape | Full catalog + phased; ship Phase 1 |
| Docs | Google-Drive-first, local mirror w/ link; per-feature files |
