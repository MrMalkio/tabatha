# C8 — Agent Orchestration & Routing (Autonomy Ladder)

> 🔗 Google Doc: https://docs.google.com/document/d/10DSO-D9urZWzH6c_L4_ajlnuxAT3Wt54lkCWAefCPKs/edit?usp=drivesdk&ouid=104108780460431833741

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: user · [SOURCE-braindumps.md](../SOURCE-braindumps.md) Dump 2 (routing/autonomy — most relevant)
Phase: Phase 1 (cron-in-harness only) / Phase 2+ (higher tiers)

## Purpose
The routing/execution backbone: decides *which* AI runs Cortex's optimization work and *how autonomously*. An escalating ladder — start at the cheapest, most local, most manual tier and climb toward hosted, team-billable, fully-proactive tiers. Per Dump 2: "let's have all of them honestly... start with the easiest one first... have the others as escalating levels — think in terms of both personal and professional, individual and teams."

## Detailed behaviors (numbered, testable)

1. **Four escalating tiers:**

   | Tier | Name | Who holds the key/quota | Data locality | Personal / professional | Individual / team | Ships |
   |---|---|---|---|---|---|---|
   | ① | cron-in-harness | user's own Claude Code / Codex / etc. CLI auth | fully local — reads local ledger export only | personal, most manual | individual only (each user's own harness) | **Phase 1** |
   | ② | backend proxy | Supabase edge fn / `flux-asana-widget` server | ledger batch-synced to Supabase first | professional-leaning (org pays) | enables team billing/batch across a team's profiles | Phase 2 |
   | ③ | Vercel AI Gateway | Flux's Gateway key | routed through Gateway; zero-retention configurable | professional | team-wide fallback + observability | Phase 2 |
   | ④ | BYOK | user's own pasted key (Settings) | user's account, user's data policy | personal power-user OR professional (org lets members bring their own) | individual, opt-in even inside a team | Phase 2+ |

2. **Tier ① mechanics (the only tier Phase 1 ships).**
   - The desktop companion — not the extension — writes the scheduled task/script, since it has filesystem access the browser sandbox doesn't.
   - The task's job is exactly C6's nightly high-level pass: read the local ledger export, run `economize-workflow.v1.md` via the harness's own model access, write recommendations back to `cortexRecommendations` (+ optional Supabase batch sync).
   - Testable via: a companion-side integration test asserting a scheduled-task file exists and its content references the current prompt version.

3. **Harness detection reuses Headbox, not a new detector.**
   - Headbox already "does a good job of understanding what's going on inside the different harnesses somebody has installed" (Dump 2).
   - Tabatha/the companion should read the same signals Headbox already indexes for this repo (e.g. `.headbox/`, `.claude/`, `.codex/`-style project markers) rather than hand-rolling detection.
   - Testable via: a fixture repo with known harness markers, asserting detection output matches Headbox's own inventory for the same repo.

4. **Placement of the scheduled task.**
   - At the project/worktree level the user is actively working in (or a Tabatha-owned dedicated folder if none).
   - Must be clearly labeled/commented as Cortex-owned so a human or Headbox can distinguish it from the user's own automation.
   - Testable via: asserting the written task file contains a recognizable `# tabatha-cortex` marker comment.

5. **Escalation is explicit config, never automatic.**
   - Moving from ① to ②/③/④ is a user- or org-set routing-tier setting (C15) — Cortex never silently upgrades tiers or starts spending an org's money.
   - Default for a new personal profile = tier ①.
   - Testable via: asserting `cortexRoutingTier` never changes value except through an explicit settings-write message.

6. **Tier ② — backend proxy.**
   - The existing `flux-asana-widget` Express server or a new Supabase edge function holds the real provider key (per `API-KEYS.md` golden rule: extension never calls a provider directly).
   - Unlocks **team billing** (org pays once, all members' runs bill centrally) and **batch** processing (many profiles' nightly passes run server-side on schedule instead of N local crons).
   - Testable via: a proxy contract test asserting the extension never receives or logs a raw provider key.

7. **Tier ③ — Vercel AI Gateway.**
   - Sits in front of / replaces tier ②'s proxy — adds provider fallback, observability, zero-retention.
   - Requires `AI_GATEWAY_API_KEY` (per `API-KEYS.md`: currently "Need," Phase 2, Malkio's Vercel free-tier key).
   - Testable via: a fallback-simulation test once the Gateway is wired (out of scope for Phase 1).

8. **Tier ④ — BYOK.**
   - The user pastes their own provider key into Settings (new field — likely a dedicated `AI & Routing` settings section, or nested under the proposed `recommendations` section from C7).
   - Storage follows `API-KEYS.md` golden rules exactly: never `VITE_`-prefixed, never in a tracked file; if held client-side at all it must live in `chrome.storage.local` (unsynced) or be forwarded immediately to a backend proxy rather than persisted long-term client-side.
   - This is the only tier using the *user's own* account/billing directly.
   - Testable via: asserting a pasted BYOK key never appears in `chrome.storage.sync`, logs, or any Supabase-synced payload.

9. **Proactivity config is an independent axis from routing tier.**
   - `reactive` (default) = C7 dashboard yes/no only, nothing executes unattended.
   - `proactive` = the active tier's agent may act overnight per C6's EOD hand-off, presenting completed work (a built extension, a dashboard, finished knowledge work) next time the user opens Tabatha.
   - Proactive mode requires a tier capable of unattended execution — tier ① works today since it's just a cron; ②-④ need C7's Phase 2 execution wiring first.
   - Testable via: asserting `proactive` mode is rejected by settings validation while `cortexRoutingTier` lacks unattended-execution capability.

10. **Headbox integration is two-directional.**
    - Headbox governs/observes installed harnesses (visibility + governance); Tabatha is a *consumer* asking "what harnesses exist, where do I place a scheduled task."
    - Cortex does not duplicate Headbox's own governance UI.
    - Testable via: a contract test asserting C8's harness query and Headbox's own inventory query return the same result for a fixture repo.

11. **Master system prompts (shared with C6) are C8's routing target, not its authoring responsibility.**
    - Prompt content is model-agnostic markdown in `docs/cortex/prompts/`.
    - C8's job is "given this prompt + this tier, produce a call/task the tier can execute" — for ① that's writing the prompt reference into a harness-native scheduled-task file; for ④ that's a raw provider API call using the user's key.
    - Testable via: asserting the same `economize-workflow.v1.md` content produces a valid dispatch payload under each of the four tiers' dispatch functions.

12. **Team/individual framing (explicit, per Dump 2's ask).**
    - Tier ① is inherently individual (each machine/user's own harness).
    - Tiers ②-③ are where "team" first becomes possible (shared backend, org billing, batch runs across profiles).
    - Tier ④ stays individual even inside a team context (opt-in per member, never org-mandated).
    - Testable via: asserting an org-level settings write can force tiers ②/③ for all members but can never force tier ④ (BYOK) on an individual.

13. **Test-observable routing log.**
    - Each routing attempt (any tier) logs `{ id, tier, at, target: 'C6-high'|'C6-low', outcome: 'dispatched'|'failed'|'skipped-no-harness', detail }`.
    - So tier ①'s "did the scheduled task actually get placed" is verifiable without manually inspecting the filesystem.

## Data model touchpoints
| Store | Key / table | Written by | Read by |
|---|---|---|---|
| chrome.storage.local (settings) | `cortexRoutingTier: 'cron-harness'\|'backend-proxy'\|'ai-gateway'\|'byok'` (NEW) | Settings UI | C6 (which prompt-runner to target), C8 |
| chrome.storage.local (settings) | `cortexProactivity: 'reactive'\|'proactive'` (NEW) | Settings UI | C6, C7, C8 |
| chrome.storage.local | `cortexByokKey` (NEW, unsynced, tier ④ only) | Settings UI | C8 tier ④ dispatch only — never logged, never synced |
| chrome.storage.local | `cortexHarnessCache` (NEW — detected harnesses + their scheduled-task location) | C8 detection step | C8 dispatch, debug |
| chrome.storage.local | `cortexRoutingLog` (NEW, per behavior #13) | C8 | C7 health banner, debugging |
| `.env.cortex.local` (gitignored, root) | tier ②/③ provider keys | manual procurement (per `API-KEYS.md`) | backend proxy / edge function |
| `flux-asana-widget/.env` | tier ② key (if that server is reused as the proxy) | manual | Express proxy |

No client-bundled (`VITE_`-prefixed) secret is ever introduced by C8 — this is a hard constraint carried over from `API-KEYS.md` golden rule #1.

## Dependencies

**Depends on:**
- C4 (Observations Ledger) — tier ①'s nightly export is what gets read inside the harness.
- C6 (Optimization Loop) — the workload/prompt being routed; C8 doesn't generate it.
- C15 (Config & Interaction-Density Model) — the actual UI surface for selecting routing tier + proactivity level.
- `docs/cortex/API-KEYS.md` — authoritative credential status per tier (K5 Anthropic "Need" for tier ②, K7 Vercel Gateway "Need" for tier ③); C8 must reference this file, not restate its own procurement status.
- `.headbox/` substrate (workspace-map.md, sticky-notes/, plan-registry.md) — the existing harness-governance data Headbox already maintains for this repo.

**Feeds:**
- C6 — provides the execution surface C6's prompt runs against.
- C7 — Phase 2+ approved recommendations become C8's task input (reactive) or overnight input (proactive).
- C9 (Voice & Audio) — a future tier-agnostic input channel (out of scope here).
- C12 (Team/Onboarding SOP Mode) — org-mandated capture rides tiers ②/③'s team-billing capability.

## Reuse points (VERIFIED)
- `docs/cortex/API-KEYS.md` — golden rules + full tier-to-key mapping already authored (K5 Anthropic, K7 Vercel AI Gateway are the exact ②/③ blockers). C8 must cross-reference this file, never duplicate/restate its procurement table.
- `.env.cortex.local` (gitignored, root) — already the designated store for any Cortex secret Phase 2+ needs; C8 reads/writes here by convention, never a new ad hoc file.
- `flux-asana-widget/.env` + its Express server — existing precedent for "a backend proxy holding a key," directly reusable as tier ②'s literal implementation instead of standing up a new service.
- `.headbox/` directory (`workspace-map.md`, `sticky-notes/`, `plan-registry.md`) — the existing Headbox substrate this repo already uses for cross-agent coordination; C8's "read harness folders" behavior should follow the same discovery convention Headbox itself uses, not invent a new one.
- `src/background/constants.js` `DEFAULT_SETTINGS` — same convention C6/C7 reuse; routing/proactivity defaults belong here alongside `screenshotCapture`, `cortexLedgerCap`, etc.
- **Not a direct reuse path, but a reference shape:** this Cowork session's own `schedule` skill and `mcp__scheduled-tasks__*` tools operate a *different* system (this session's cloud scheduler, not the user's locally-installed Claude Code/Codex CLI that Dump 2 describes) — but their cron-expression + prompt + target shape is a useful reference when designing tier ①'s actual scheduled-task file format.

## Open questions
1. What does "read the folders of those different harnesses" concretely resolve to on this Windows machine — literal directory walks (`.claude/`, a Codex-specific dir), or does Headbox already expose an API/file Tabatha can query instead? Needs a Headbox-integration spike before T5.
2. Does tier ① write a literal OS-level scheduled task (Windows Task Scheduler, since this machine is win32 — there's no native cron) or rely on the harness's own internal scheduler (e.g. this environment's `schedule` skill, if the user's installed CLI has an equivalent)? Dump 2 says "creating cron jobs inside a user's active harnesses," which suggests the latter, but needs resolution — this is the single biggest unresolved implementation question blocking T5.
3. BYOK key storage (behavior #8): `chrome.storage.local` (device-only, and per the `.pem`/persistence board item in the program spec §12, potentially lost on extension reinstall) vs. proxy-immediately-never-persist? Security posture undecided.
4. Tier-escalation UX — a single settings dropdown (C15), or does the system proactively *recommend* escalation (e.g. "your cron-in-harness runs are hitting quota, consider backend-proxy")?
5. **Proactive-mode safety rails are unspecified.** Nothing yet defines what an autonomous overnight agent is *allowed* to touch (write files outside a Tabatha-owned sandbox? push code? open PRs?) — a real gap given the spec explicitly targets "building a new extension" unattended. This should be resolved before Phase 4, not deferred silently.

## Phase & rollout
- **Phase 1 (Plan 040, T5):** tier ① only, reactive-only (proactive mode isn't usable yet since C7 has no execution path). A Headbox harness-detection spike is a prerequisite — see open question #1. Target v7.0.0.
- **Phase 2:** tiers ②/③ come online (pending Anthropic + Vercel Gateway key procurement per `API-KEYS.md`); BYOK (④) settings field added; C7's execution wiring unlocks true proactive mode.
- **Phase 4:** proactive overnight autonomous builds fully live end-to-end (C6 EOD hand-off → C8 tier-appropriate dispatch → C7 surfaces "new things" next morning) — contingent on resolving open question #5 (safety rails) first.
