# Onboarding Demo Walkthrough — Design Spec

**Date:** 2026-07-20 (rev. 2026-07-23)
**Current version:** 6.7.47
**Status:** Approved design, pre-plan (implementation plan will register as Plan 046)
**Related:** #168 (Help & Docs Page), `useWhatsNew` hook, TEAM-ONBOARDING.md, #211 (Voice), #182 (Chaperone), Cortex program (Plans 039–044), Tabby Sidecar/Watch/Companion

---

## 1. Goal

New users land in Tabatha with zero context and a dense product. Build a **modular, interactive onboarding system** that:

1. Temporarily seeds **dummy data** so every surface looks alive on first open.
2. Walks the user through top features with a natural feature-to-feature flow, starting by having them **actually log a real Intent** — literally typing "Tabatha Introduction" into the Gatekeeper and watching it become their first Focus.
3. Runs a **universal intro**, then **branches by avatar** ("What brings you to Tabatha?").
4. Ends with a **"what you skipped" menu** — every module not in their branch, launchable on demand.
5. Makes **every feature's onboarding an independent, on-demand module**, so new tours = reordering module lists, not writing code.
6. Is **host-portable**: the same module definitions run live in the extension (real saves) and, later, on a sandboxed demo site.
7. **Stays current automatically** via changelog-driven lint + a scheduled maintenance agent, wired into the release runbook (§13).
8. Includes a **guided settings interview** (§12): the assistant turns the settings surface into plain-language questions and applies the user's answers directly.
9. Spans **all surfaces** — extension, Sidecar (mobile), Watch, Desktop Companion — and can be **driven by voice** and **personalized by Cortex** observational data (§14).

## 2. Avatars

Derived from the full feature catalog (docs/features/161–214 + shipped surfaces), not assumed up front.

**Primary (full-product):**
| # | Avatar | Core needs |
|---|--------|-----------|
| 1 | Solo power user | Focus engine, queue, analytics, follow-through |
| 2 | Team member (invited) | Clock in, state intent, sync context, presence |
| 3 | Team owner/admin | Org setup, invites, team activity, aggregate visibility |
| 4 | Agency/client biller | Client/project attribution, IN/ON taxonomy, profitability, QBO |

**Subset/single-feature entry points:**
| # | Avatar | Core needs |
|---|--------|-----------|
| 5 | ADHD / executive-function | Gatekeeper friction, BlockGate, Side Quest, Sugar Box, checkpoints, routines — externalized executive function, not reports |
| 6 | Time-tracker-only | Clock in/out, shifts, weekly total; wants the Gatekeeper *quiet* |
| 7 | Tab hoarder / browser hygiene | Park, Sugar Box, groups, session recall, cleanup; may never clock in |
| 8 | Personal / non-professional | Hobby/study tracking, persistent focuses, streaks; no "work/client/billable" language |
| 9 | Distraction blocker | BlockGate and nothing else |
| 10 | AI-context user | Markdown export, agent context tracking, MCP bridge |

Avatars 5–10 are different **subsets of the same module library** — the architectural argument for modularity.

## 3. Feature tiers

- **Tier 1 — irreducible core** (every journey): Intent capture via Gatekeeper · Focus start/resolve + timer · InBar.
- **Tier 2 — high-value, high-frequency** (most journeys): Focus Queue & priority · Clock in/out & shifts · Side Quest · Park · Sugar Box · Checkpoint progress notes · Tab↔focus linking.
- **Tier 3 — high-value, avatar-gated**: BlockGate · Analytics/heatmap/follow-through · Tasks & funnel stages · Client/project tags · Cross-device awareness & team activity · Backburner · Privacy modes · Desktop companion · Sync & org.
- **Tier 4 — discoverable later** (on-demand modules only, never in an intro): URL rules · Webhooks · Markdown export · Command palette · Themes · Calendar · Logs panel · Initiatives.

## 4. Architecture

### 4.1 Module registry

One file per feature module under `src/onboarding/modules/`, exporting a plain declarative object:

```js
{
  id: 'focus-queue',
  feature: 'Focus Queue',
  tier: 2,
  surface: 'home',                       // home | sidebar | popup | settings | workshifts | content
  avatars: ['solo', 'team-member', 'adhd', 'personal'],
  prerequisites: ['first-intent'],       // module ids that must complete first
  hostCapabilities: ['seed', 'awaitAction'],
  introducedIn: '6.7.46',
  verifiedAgainst: '6.7.46',
  estimatedSeconds: 45,
  seed: [ /* demo records for this module */ ],
  steps: [ /* step vocabulary below */ ],
}
```

Journeys are ordered arrays of module IDs (`src/onboarding/journeys/`). Building/altering a tour = editing a list.

### 4.2 Step vocabulary (7 types)

| Type | Purpose |
|------|---------|
| `say` | Narration bubble/card |
| `highlight` | Spotlight a semantic anchor |
| `awaitAction` | Block until a real domain event fires (e.g. `INTENT_SUBMITTED`); carries a `hint` and `timeout → nudge` |
| `seed` | Inject demo records mid-tour |
| `navigate` | Move the tour across surfaces (new tab → Gatekeeper → home → sidebar) |
| `assert` | Verify expected state; branch/recover if the user went off-script |
| `custom` | Escape hatch — render function, for anything the vocabulary can't express |

### 4.3 Semantic anchors

Components opt in with `data-tour-anchor="focus-queue"`. No CSS selectors — selector drift is what kills tours. An anchor registry enables the lint check in §9.

### 4.4 Host adapter

Narrow interface implemented twice:

```
seed(batch) · purge(batchId) · getState(key) · dispatch(msg) ·
subscribe(event, cb) · navigate(surface) · resolveAnchor(id)
```

- **ExtensionHost** — real background services + `chrome.storage`; user input saves for real, in real time.
- **SandboxHost** — in-memory store, mocked services; powers the future standalone demo site.

Modules declare `hostCapabilities`; a sandbox journey can only include modules the sandbox supports, preventing silent divergence.

### 4.5 Engine

`OnboardingProvider` overlay mounted on each surface. Journey position (`journeyId`, `moduleIndex`, `stepIndex`, `avatar`, `demoBatchId`) persisted to `chrome.storage.local` → survives cross-surface navigation, exit, and browser restart. Visual layer borrows spotlight/tooltip polish from driver.js-style overlays but the engine is ours (third-party tour libs can't await real user actions or seed state).

## 5. Demo data lifecycle

- Every seeded record carries `_demo: true` + `_demoBatch: <id>`.
- **`syncService` MUST skip `_demo` records** — demo data never reaches Supabase.
- **Analytics MUST exclude `_demo` records** — heatmap, follow-through score, streaks. No fake streaks.
- Real user input during the tour (their "Tabatha Introduction" intent, first focus) is written **untagged** and survives.
- On completion/exit the user chooses: **"Keep the sample data to explore"** or **"Clear it."** A permanent **Settings → Clear demo data** control exists as fallback.
- Purge = delete-by-batch-id across all stores (focuses, tasks, stints, logs, clients/projects, heatmap sources).

## 6. Journeys

### 6.1 Universal intro (~3 min, everyone)

1. Welcome card → seed demo batch (queue of 3 focuses, a resolved stint yesterday, 2 tasks, 1 parked tab, 1 sugar-box item, sample client/project).
2. `navigate` new tab → Gatekeeper appears → `awaitAction`: user types **"Tabatha Introduction"** and submits. (Real record.)
3. `highlight` FocusBar: their intent is now an active **Focus** with a live timer.
4. `navigate` a page → InBar spotlight (current intent, timer, pause, checkpoint button).
5. Clock concept: highlight Shift controls, explain stints (demo stint visible in history).
6. **Branch point:** "What brings you to Tabatha?" — avatar picker (single-select, "just exploring" defaults to Solo).

### 6.2 Branch module lists (initial)

| Avatar | Modules after intro |
|--------|--------------------|
| Solo power | `focus-queue` → `priority` → `side-quest` → `park` → `sugar-box` → `checkpoints` → `analytics` |
| Team member | `clock-shifts` → `sign-in-sync` → `presence-chips` → `checkpoints` |
| Owner/admin | `sign-in-sync` → `org-create` → `invites` → `team-activity` → `privacy-modes` |
| Agency/biller | `client-tags` → `taxonomy-in-on` → `projects-panel` → `clock-shifts` |
| ADHD | `gatekeeper-deep` → `side-quest` → `sugar-box` → `blockgate` → `checkpoints` → `streaks` |
| Time-tracker-only | `clock-shifts` → `shifts-page` → `auto-clock-in` → `quiet-the-gatekeeper` |
| Tab hoarder | `park` → `sugar-box` → `tab-groups` → `session-recall` |
| Personal | `persistent-focuses` → `streaks` → `heatmap` → `privacy-realm` |
| Distraction blocker | `blockgate` → `blockgate-settings` |
| AI-context | `markdown-export` → `integrations` |

(Branch lists are data — expected to be tuned continuously without code changes.)

### 6.3 Completion screen

- Recap: what you did (real records created), what was covered.
- **Keep/clear demo data** choice (§5).
- **"What you skipped"** — all modules not in the taken branch, grouped by tier, each launchable now or later. Persistent home: **Settings → Tours** (full module catalog, per-module replay, completion checkmarks).

## 7. Triggers

| Trigger | Mechanism |
|---------|-----------|
| Fresh install | No stored onboarding marker (mirrors `useWhatsNew` seed pattern) → auto-start |
| Exit/resume | Skippable at any step; persisted position powers a "Resume onboarding" chip |
| Replay | Settings → Tours, anytime, per-module or full journey |
| New feature released | Changelog entry carries optional `moduleId` → What's New modal gains a per-feature **"Take the tour"** button |
| Contextual re-offer | Observation-gated (requires observation features on): e.g. 40+ unresolved tabs → offer Park tour; repeated popup snoozing → offer Freeform/quiet tour; N days without touching a Tier-2 feature → offer its module. Frequency-capped (max 1/week), single settings toggle to silence |

## 8. Demo-site portability (designed now, built later)

The step vocabulary + host adapter is the portability layer. The demo site ships later as: SandboxHost + a web build of the surfaces + the same module registry. Out of scope for v1 **except**: the adapter interface, `hostCapabilities` declarations, and no direct `chrome.*` calls inside module definitions are v1 requirements.

## 9. Maintenance automation (stays current)

1. **Version stamps** — every module: `introducedIn`, `verifiedAgainst`. A module whose `verifiedAgainst` lags the current minor or whose anchors vanished is **stale** and demoted from auto-offers.
2. **Build-time lint** — `npm run tour:check` (CI + pre-commit): every referenced `data-tour-anchor` exists in source; every feature-flagged changelog entry since last audit maps to a `moduleId` or an explicit `no-tour` mark; emits committed `onboarding-coverage.json`.
3. **Scheduled maintenance agent** — weekly cron: diffs `Tabatha_Changelog.md` against `onboarding-coverage.json`, flags coverage gaps + stale modules, files parking-lot/Asana items with drafted module stubs for human review.

## 10. Testing

- Pure-function unit tests: journey resolution (avatar → module list, prerequisites), step-machine transitions, demo-batch purge completeness, sync/analytics `_demo` exclusion.
- SandboxHost doubles as the test harness: full journeys run headless in Vitest without Chrome.
- Browser regression: fresh-profile install → full solo journey → keep/clear both paths → assert no `_demo` rows in sync payloads.

## 12. Guided settings interview

The last leg of onboarding (offered after the branch, before the completion screen; also replayable from Settings → Tours). Instead of dropping the user into 20+ settings sections, the assistant **interviews** them and applies answers directly. This is roadmap — a later phase of Plan 046, after the core walkthrough ships.

### 12.1 Settings-as-questions registry

Each interview question is a declarative object generated from the existing settings schema, so the interview stays in lockstep with real settings (and is covered by the same lint in §13):

```js
{
  id: 'gatekeeper-intensity',
  section: 'intent-popup',          // maps to a real settings section
  question: 'When you open a fresh tab with no plan, how much should Tabatha step in?',
  kind: 'single',                   // single | multi | scale | toggle | text
  options: [
    { label: 'Always ask what I\'m doing', apply: { gatekeeper: 'always' } },
    { label: 'Only when I seem to be drifting', apply: { gatekeeper: 'smart' } },
    { label: 'Stay out of my way', apply: { gatekeeper: 'off' } },
  ],
  avatars: ['adhd', 'solo', 'time-tracker-only'],   // whose interview this belongs in
  writes: ['settings.intentPopup.mode'],            // for lint + audit
  reversible: true,
}
```

- **Answers write real settings live** (via `settingsService`), the same as any manual change — no separate apply step, and every write is auditable/reversible (`activityAuditService`).
- Questions are **avatar-scoped**: a time-tracker gets clock/auto-clock/quiet-Gatekeeper questions; a biller gets client/taxonomy/rounding questions; an ADHD user gets friction/blocking/routine questions. The interview is a filtered pass over the question registry, not a fixed script.
- **Plain language, not setting names** — "how much should Tabatha step in?" not "Intent-Popup mode." Copy lives beside the question.
- **Skippable per question and as a whole**; every answer has a sensible default so skipping is safe. A short summary card at the end shows exactly what changed with one-tap undo.
- **Coverage, not exhaustiveness** — the interview surfaces the high-impact settings for the user's avatar; the full settings surface remains for power users. Lint (§13) tracks which settings are interview-reachable and flags high-impact ones that aren't.

### 12.2 Voice mode

When voice (#211) / Chaperone (#182) is available, the interview can be **spoken**: the assistant asks each question aloud and parses the reply into the same `apply` payload. Falls back to tap/type silently when voice is off or unsupported. The question registry is unchanged — voice is a delivery adapter, mirroring the host-adapter pattern (§4.4).

## 13. Runbook integration (onboarding never goes stale)

The maintenance automation in §9 is only reliable if it's a **release gate**, not a good intention. Tabatha has no formal runbook file today (release discipline lives in the pre-commit `version:sync --check` hook and the `changelog:check` drift gate). Plan 046 adds:

1. **`docs/RUNBOOK.md`** — a first-class release runbook. Its "every release" checklist includes an **Onboarding coverage** step: run `npm run tour:check`; if it reports an uncovered feature-flagged changelog entry, either author/extend a module or mark it `no-tour` with a reason. The build fails otherwise.
2. **Pre-commit + CI gate** — `tour:check` joins `version:check` and `changelog:check` in `.git/hooks/pre-commit` and in CI, so a commit that ships a user-facing feature without an onboarding decision **cannot land**. This is the mechanism that makes "onboarding components are always updated whenever new features are released" enforced rather than aspirational.
3. **Changelog contract** — a lightweight convention: a changelog entry that introduces user-facing behavior carries a trailing tag — `[tour: <moduleId>]` or `[tour: none]`. `tour:check` parses these; `changelog:build` already parses the file, so this is an additive field. The weekly maintenance agent (§9.3) reads the same tags to draft stubs for any `[tour: TODO]` left behind.
4. **TaskRun hook** — the existing `docs/taskrun/*` overnight queues gain a standing "onboarding coverage sweep" item so drift is caught even between releases.

Net: the release runbook, the pre-commit gate, the changelog contract, and the weekly agent form one loop — a feature can't ship without an onboarding decision, and anything that slips is swept up within a week.

## 14. Surface & AI advancements (2026-07-23 revision)

Onboarding is no longer an extension-only, typed-only, un-personalized flow. Three shifts fold into the same module registry:

### 14.1 Multi-surface

Tabatha now spans the **extension**, **Tabby Sidecar** (mobile web, v0.11 line), **Tabby Watch**, and the **Desktop Companion** (0.3.1, a real Windows download). The `surface` field on each module (§4.1) already anticipates this; the additions:

- **Per-surface host adapters** — Sidecar and Companion each implement the §4.4 adapter (mobile gets a `MobileHost`; the Companion drives its own tray/panel steps). A module declares which surfaces it supports; a journey only includes surface-appropriate modules.
- **Cross-device handoff moment** — a first-class intro step: after the user logs their first intent in the extension, the tour surfaces "see it on your phone" — the same focus appears live in Sidecar (realtime already ships), teaching the sync value proposition at the exact moment it's most legible.
- **Companion install** is woven into the owner/team-member and time-tracker journeys rather than living only in TEAM-ONBOARDING.md.

### 14.2 Voice / Chaperone

Voice input (#211) and Chaperone mode (#182) become both **a tour module** (teaching the feature) and **a delivery adapter** for the tour itself (narration spoken, replies parsed) — see §12.2. Adapter pattern keeps the module content identical across typed and spoken delivery.

### 14.3 Cortex personalization

The Cortex program (capture, self-correction, agent context) gives the assistant real **observational data** to personalize onboarding:

- **Smarter avatar inference** — instead of only asking "what brings you here?", Cortex signals (app/site categories, clock patterns) can pre-select the most likely avatar, which the user confirms or overrides. Fail-open: no Cortex data → fall back to the plain picker.
- **Data-driven contextual re-offers** — the §7 re-offer triggers upgrade from simple thresholds to Cortex-observed patterns (e.g. "you've had 5 unfinished focuses this week" → offer the follow-through/checkpoint module).
- **Interview priming** — the guided interview (§12) can pre-fill likely answers from observed behavior, shown as "we noticed X — sound right?" rather than a blank question. Always user-confirmed, always reversible, never silently applied.

Privacy stance is unchanged: Cortex personalization is **opt-in and local-first**; onboarding degrades gracefully to the non-personalized flow when capture is off.

## 15. Out of scope (v1)

- The standalone demo website itself (adapter-ready only).
- Localization of tour copy.
- Native Watch onboarding steps (glanceable surface; Watch enters via the multi-surface registry later).
- Contextual re-offer ML/heuristics beyond simple threshold rules (Cortex-driven re-offers are §14.3 roadmap, not v1).
- Full voice-driven interview (§12.2 is roadmap; v1 interview is tap/type).

## 16. Open questions

- Copy voice/tone pass — who writes final narration and interview text? (Draft copy ships with v1 modules.)
- Avatar picker wording — "profiles" vs "goals" framing; needs a quick design pass.
- Whether the intro's clock step is skipped entirely for the Distraction-blocker avatar (leaning yes).
- Interview depth — how many questions is too many before fatigue? (Leaning: ≤6 per avatar, hard cap.)
- Changelog tag enforcement — soft-warn for one release before hard-failing the gate, to avoid blocking unrelated work during rollout.
