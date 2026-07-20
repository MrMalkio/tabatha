# Onboarding Demo Walkthrough — Design Spec

**Date:** 2026-07-20
**Current version:** 6.7.46
**Status:** Approved design, pre-plan (implementation plan will register as Plan 046)
**Related:** #168 (Help & Docs Page), `useWhatsNew` hook, TEAM-ONBOARDING.md

---

## 1. Goal

New users land in Tabatha with zero context and a dense product. Build a **modular, interactive onboarding system** that:

1. Temporarily seeds **dummy data** so every surface looks alive on first open.
2. Walks the user through top features with a natural feature-to-feature flow, starting by having them **actually log a real Intent** — literally typing "Tabatha Introduction" into the Gatekeeper and watching it become their first Focus.
3. Runs a **universal intro**, then **branches by avatar** ("What brings you to Tabatha?").
4. Ends with a **"what you skipped" menu** — every module not in their branch, launchable on demand.
5. Makes **every feature's onboarding an independent, on-demand module**, so new tours = reordering module lists, not writing code.
6. Is **host-portable**: the same module definitions run live in the extension (real saves) and, later, on a sandboxed demo site.
7. **Stays current automatically** via changelog-driven lint + a scheduled maintenance agent.

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

## 11. Out of scope (v1)

- The standalone demo website itself (adapter-ready only).
- Localization of tour copy.
- Mobile Sidecar onboarding (future journey over the same registry).
- Contextual re-offer ML/heuristics beyond simple threshold rules.

## 12. Open questions

- Copy voice/tone pass — who writes final narration text? (Draft copy ships with v1 modules.)
- Avatar picker wording — "profiles" vs "goals" framing; needs a quick design pass.
- Whether the intro's clock step is skipped entirely for the Distraction-blocker avatar (leaning yes).
