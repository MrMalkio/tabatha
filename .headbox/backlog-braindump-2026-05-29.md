# Tabatha — Vision & Backlog Brain-Dump (2026-05-29)

> Captured verbatim-intent from the user during the v6.3.x QA session, so nothing is lost.
> **Status:** none of this is started. This is a capture + light analysis doc. Each item gets a real plan/feature spec when prioritized. IDs (BD-N) are stable references.
> Analysis/questions from Claude are marked **[C]**.

---

## Distribution & Release (the cluster of questions)

### BD-1 — Companion-managed distribution & updates for testers
Idea: use the **desktop companion** to manage installing/updating the Tabatha extension for a small set of testers before (and alongside) a marketplace release. Push fixes/updates out-of-band. A non-marketplace build could carry features that Chrome Web Store (CWS) rules wouldn't allow.

**[C] Technical reality:**
- **Unpacked (dev-mode) installs** (what we do now via the `dist` folder) can be freely overwritten by anything on disk — including the companion. The companion *can* download a new build and replace the folder. **Caveat:** Chrome can't be forced to *reload* an unpacked extension programmatically; the user clicks reload, OR the companion shows them a "update ready, click reload" nudge. Also Chrome periodically re-warns about dev-mode extensions.
- A non-CWS build **can** include capabilities CWS would reject (since it's never reviewed). This is real and viable for a private tester group.
- **Self-hosted auto-update (.crx + `update_url`)** is the "clean" version but Chrome **blocks self-hosted extensions on consumer Chrome** unless force-installed via enterprise policy (`ExtensionInstallForcelist`). So for non-enterprise testers it's effectively unavailable outside CWS.
- **Best path for a few testers now:** ship a zip of `dist/` + load-unpacked, OR a companion-driven installer that drops the folder and walks them through dev-mode. CWS "unlisted" listing is the cleanest medium-term for auto-updates without enterprise policy.

### BD-2 — Can a CWS-installed extension be expanded via the companion / by editing its folder?
**[C] Answer: No to editing files; Yes to extending via the bridge.**
- CWS-installed extensions live in a Chrome-managed dir with **integrity verification**. Editing those files **disables** the extension. So you cannot "update the dist folder" of a marketplace install — that workflow is unpacked-only.
- You **can** extend a CWS extension's capabilities through the **companion native bridge** (the WebSocket/native-messaging link we already use): the extension calls out to the companion for OS-level things it can't do itself. That's additive capability without modifying extension code. So the model is: marketplace extension = the sandboxed UI/logic; companion = the OS-privileged co-process.

### BD-3 — Distribute to testers now (private repo, non-GitHub users)
Testers: 1 solo founder (Mike, likely **not** a GitHub user, independent/non-team), 2 team members (GitHub users, rely on sync + team management).

**[C] Options:**
- Private repo + collaborator = each needs a GitHub account & repo access. Fine for the 2 team users.
- For Mike: don't make him clone. Easiest = **send a zip of `dist/`** (Drive/email) + a one-page "Load unpacked" guide, or a companion installer. Alternatively a separate **public `tabatha-dist` repo** with just builds (no source) so anyone can grab it.
- Provide an **agent-install prompt** (a paste-into-their-coding-agent command) for the technical testers.

### BD-4 — Sync / team-management audit before sending out
Before testers (esp. the 2 team users) get it, **audit what sync + team features actually work today** and lock them down. Also support the "personal, non-synced, independent" mode for testing on a personal browser.
**[C] Question:** which exact team features are in-scope for the tester cohort (awareness chips, clock-stacking warning, invite mint, Team Activity panel all exist per plans 027/028)? Worth a dedicated "sync hardening" pass — this is the riskiest area for multi-user testing.

### BD-5 — Chrome Web Store eligibility analysis
Two-part: (1) analyze the **current** build's CWS acceptance odds + required modifications with ~zero changes; (2) evaluate how the **roadmap features** (esp. advanced training / page-content reading, broad host permissions) affect CWS eligibility.
**[C]** This is a real pre-submission task. Key risk areas to pre-audit: `<all_urls>`/broad host perms, remote code, data-use disclosure, the desktop companion native-messaging, privacy policy. Should produce a CWS-readiness checklist.

---

## Onboarding, Help & Adoption

### BD-6 — Onboarding flow v1 + help documentation
Introduce a complex/robust extension to a normal user without it feeling like training. Role-based setup (what to turn on/off based on how they work). Progressive disclosure — reveal features as they're used day-to-day. Tooltips exist (good) but be deliberate about *what* is introduced first.
**[C]** Pairs tightly with BD-10 (notification matrix) and BD-1's tester rollout. Strong candidate to build right before/with the tester release.

### BD-7 — Mike's day-1 use case: "just track everything"
Mike's first intent: passively track every URL / all browsing work. Data is saved as we upgrade, so features that *use* the data can come later. For now, frictionless capture is the product for him.
**[C]** This is a clean wedge — it maps directly onto BD-9 (passive/random InPop modes) + BD-3 distribution. The persistent domain store (Plan 038 P1, just shipped) already supports the "data is being captured for later" promise.

---

## Time-Tracking Accuracy & Lifecycle

### BD-8 — Auto-break → auto-clock-out (forgot-to-clock-out recovery)
After an auto-break with **zero activity** (no motion, no switching, PC slept/off) for a configurable X minutes, treat it as a **clock-out** retroactive to ~when the break/inactivity began. Use the **companion** to know real activity + wall-clock gap. If confidence is low, **confirm with the user** ("should this break have been a clock-out?") and offer to **log offline activity** for that gap. Mobile app (future) can confirm in real time; when the PC wakes it reconciles using the last known info.
**[C]** High-value + directly extends the idle/clock engine we just built. Ties to the existing `idle-auto-break` alarm. Needs: a configurable `autoClockOutAfterMinutes`, companion last-activity timestamp, a confirmation prompt, and a retroactive clock-session edit. **This is the most "ready to spec" item here.**

### BD-13 (BUG) — Homepage top-left hours mislabeled / wrong
Top-left of home shows ~470 (hours?) framed as **"this week"**, which is impossible. Likely showing lifetime/total elapsed but labeled weekly.
**[C]** Confirmed-sounding real bug. Small but visible — **fix candidate right after merge** (kept off the current PR to not disturb RT). Likely a label + a missing time-window filter on the aggregation.

### BD-14 — Accurate, non-double-counted time breakdown
Analytics + homepage should show **today / this week / etc.** Overlapping focuses/tabs/intents must **not double-count** live worked time. Separately compute an **aggregate "tracked element time"** (sum across all simultaneously-tracked things). The **ratio of live time : aggregate tracked time** = a focus/signal-to-noise signal (e.g. 8h live vs 8h45m tracked = hyper-focused; 8h live vs 14h tracked = lots of open/forgotten things).
**[C]** Meaty + valuable. Needs a clear time model: a single "wall-clock worked" timeline (deduped/union of active intervals) vs the existing per-element sums. The ratio is a genuinely novel metric. Pairs with BD-15.

### BD-15 — Auto-pause inattentive tabs + context-note prompt
Tabs not getting attention (not reopened/interacted) should auto-pause more aggressively than focuses. Soft-prompt the user: *"Do you remember why this tab was open / what you were doing? I'll pause it for you."* User drops a note → Tabatha pauses the tab (preserving context).
**[C]** Extends the existing auto-park/paused-tab + InBar note machinery. Lower-risk, nice UX win. Ties to BD-14 (forgotten tabs inflate tracked time).

---

## Interaction Models & Notifications

### BD-9 — InPop modes: add **Passive** and **Random** (beyond strict/relaxed)
- **Passive**: labeling tab intents is optional, never required. Emphasis shifts to just *connecting* tabs for a purpose.
- **Random**: a mix of strict+passive — surfaces the InPop occasionally based on a pattern (or pseudo-randomly), otherwise stays out of the way. More reactive.
**[C]** Clean settings extension to the existing gatekeeper modes. Low-risk, high adoption value (directly serves Mike's "don't make me label everything" stance, BD-7).

### BD-10 — Master Notification Matrix (the big cross-cutting one)
A single authoritative list of **every** popup / toast / notification / user prompt, each with:
- the notification name/id
- what triggers it
- which surfaces it can appear on (Chrome / desktop companion / mobile)
- the copy
- merge tags / variables it uses
- its options/actions
- the journey + a visual (image, stubbed mock, GIF/SVG) — reused on website/help/onboarding/settings

Plus a **settings matrix** controlling *which surface(s)* each notification fires on, with **escalation** (e.g. "still on task?" → if not in Chrome, fire on companion; if no response, push to mobile; some notifications fire on all three at once). The list must be kept updated as features are added.
**[C]** This is foundational infrastructure, not just a doc — it should drive a notification-routing layer. Recommend: build the registry/data-model first (it also feeds onboarding BD-6 + help docs), then the routing/escalation engine. Highest-leverage organizational item here.

### BD-12 — In-app feedback / feature-request / bug-tracker / voting
Make it dead-easy to submit feedback from inside the app (sidebar, home footer, InBar): text + **audio note + screenshots/images + video links**. Built-in **bug tracker / roadmap page + public voting surface**. Submissions flow via webhooks → become tickets/tasks in **Asana**.
**Agent-first triage pipeline:** submissions go to an agent (Claude Code/Codex) → agent drafts a **feature outline** → sent back to submitter(s) to confirm "is this what you mean?" → a **second round of clarification** with voters/submitters → agent finalizes → added to the board for *consideration* (not guaranteed). Humans largely out of the loop until consideration; lots of communication, high-fidelity understanding before any build.
**[C]** Strong flywheel. We already have webhooks → Asana is straightforward. The agent-triage loop is novel and very on-brand. Phase it: (1) capture widget + webhook→Asana, (2) public roadmap/voting, (3) agent triage pipeline.

---

## Cross-Product / Long-Horizon

### BD-11 — Headbox / Agency Vault context ingestion
Separate tool the user built: **Agency Vault** (likely merging with **Head Box**) at `LeDev\Agency Vault` — tracks a user's activity across agent harnesses (Codex, Claude Code, Cowork Claude, Antigravity, etc.) on the machine, with timestamped messages/threads/artifacts.
Vision: Tabatha **pulls context from any available source** (incl. Agency Vault) so work done *inside another harness* becomes part of a focus's timeline. AI maps that activity to the right focus, **improves timeline accuracy retroactively**, and **surfaces findings for user confirmation** to close the loop.
**[C]** Big, AI-era feature. Depends on: (a) an ingestion/connector layer, (b) AI reconciliation over the timeline, (c) a confirm-changes UX (the timeline edit infra from Plan 037 is a building block). Long-horizon; capture the Agency Vault data shape when we get there. **Question:** is Agency Vault's data queryable via an API/DB, or files on disk?

---

## Suggested sequencing (Claude's take — not binding)
1. **After merge, quick wins:** BD-13 (hours bug), BD-9 (InPop passive/random) — small, visible, help tester adoption.
2. **Tester-enablement track:** BD-4 (sync/team audit) + BD-3 (distribution) + BD-6 (onboarding v1) — gate before sending to Mike + team.
3. **Accuracy track:** BD-14 (time model) + BD-15 (inattentive-tab pause) + BD-8 (auto-clock-out) — these reinforce each other.
4. **Infrastructure:** BD-10 (notification matrix) — do early-ish; it feeds onboarding + help + every future prompt.
5. **Growth loop:** BD-12 (feedback/voting + agent triage).
6. **Compliance:** BD-5 (CWS eligibility) — before any public listing.
7. **Long-horizon:** BD-1/BD-2 (companion distribution model), BD-11 (Agency Vault ingestion).

---

# Addendum 2026-06-02 — Dogfooding insights (BD-16 … BD-19)

> Context: user is using Tabatha to track the work of building Tabatha. The friction of manually creating a sub-focus to track "run the 015 RLS fix in the SQL editor" surfaced these. The meta-insight: **the agent telling the human to go do a thing should instead push that thing into Tabatha as a ready-to-go focus.**

### BD-16 — Agent-directed focus injection ("take direction from an agent" mode)
An agent (via **any** channel — CLI / API / MCP / skill / plugin / companion bridge) can **create a focus + associated tasks for the human to execute**, fully pre-populated: description/steps, links, and even **auto-open the tab(s)** the user needs. A user-enable setting: *"only take direction from an agent"* (e.g. during a tutorial, or while an agent orchestrates a work session). Because Tabatha already knows the user's live context, the agent can decide **how/when to interrupt** (silent queue vs InBar chip vs popup) and ensure everything needed is inside the focus details. The user just clicks **OK → Tabatha switches focus → they jump straight in.**
**[C] Feasibility (high):** Tabatha already has `START_FOCUS` / `ADD_FOCUS` / `SWITCH_FOCUS` message handlers and a desktop-companion WebSocket bridge. Exposing a thin, authenticated local endpoint (companion bridge or a localhost/native-messaging hook) that maps to those handlers is very tractable — an agent could literally post `{type:'ADD_FOCUS', label, description, tabs, tasks}` today with minimal new surface. This is a genuine differentiator and a natural extension of the existing architecture. Pairs with the "OK → switch" UX from BD-19.
**[C] Guardrails to design:** auth/trust for who can inject; interruption policy (the Notification Matrix BD-10 governs surface/escalation); rate-limiting; an audit trail of agent-created focuses.

### BD-17 — User-to-user baton passing (delegated/pre-approved interruptions)
Same mechanism, **staff-to-staff**: hand off a task with full context ("passing the baton"). It's task management with **predefined, pre-approved interruptions under configured circumstances** — so a teammate (or manager) can drop a focus into your queue/flow under rules you've agreed to. Needs per-user configuration of who can interrupt, when, and how loudly.
**[C]** Builds directly on BD-16 + the team/sync layer (plans 027/028) + Notification Matrix (BD-10). The "pre-approved interruption" config is the key new primitive.

### BD-18 — Reconcile the focus / sub-focus / task / subtask model (focus = epic/master-task)
Dogfooding confirms a focus is effectively a **master task / epic**, and **sub-focuses ≈ subtasks**. We also have a separate `tasks` concept. Need a **cleaner, more efficient model** that avoids unnecessary duplication **and** avoids over-aggregation/over-consolidation. Expand the editable detail available on a focus (description, steps, links, checklist) to match epic-level richness.
**[C]** This is a data-model rationalization — worth a dedicated design doc before building. Question to resolve: do `tasks` and `sub-focuses` merge into one hierarchy, or stay distinct with clear roles (e.g. tasks = external/Asana-linked work items, focuses = time-tracked attention sessions)? The Plan 037 timeline/checkpoint infra and the focus item schema are the building blocks.

### BD-19 — Sidebar: show focus description/steps inline (collapsible)
When working with the sidebar open, show **not just the focus title but its description/steps inline** (e.g. the 3 SQL steps from the 015 fix), so the user doesn't window-switch to read them. Collapsible: user can open/close it; **auto-collapsed when there's no description (title-only)**.
**[C] Small, high-value, build-ready.** The sidebar already renders the active focus card (we just added 📊/📱/📌 there). Adding a collapsible description block is a contained change. Direct quality-of-life win, and it makes BD-16's "agent put the steps in the focus" actually visible where the user works. **Good quick-win candidate.**
