# Tabatha Component Showcase

A polished, on-brand set of static HTML "display" pages covering **every
user-facing surface** of the extension. Three jobs:

1. **Source for the 5 Chrome Web Store screenshots** — each shot page carries a
   `.shot` container of exactly **1280×800**, captured to
   `store-assets/screenshots/0N-*.png`.
2. **A durable, reusable marketing / docs / onboarding asset** — an indexed
   gallery hub plus six category pages that stay brand-faithful to the real
   extension.
3. **A visual regression reference** — `npm run capture:showcase` renders every
   frame and every component card to PNG, so a design change that breaks a
   component shows up in a diff.

Brand-faithful to **Tabatha v6.7.16**.

---

## View it

Open `showcase/index.html` in any browser (double-click, or `file://`). No build
step, no server, no network calls — every page is self-contained (inline CSS,
inline SVG logo, emoji icons). The hub embeds the shot pages as live `iframe`
thumbnails, so the gallery never drifts from the pages themselves. The hub's
filter box is the only script on any page, and it is progressive enhancement:
with JS disabled every card is still listed.

### Surfaces (1280×800 frames)

| # | Page | Surface | CWS |
|---|------|---------|-----|
| 01 | `gatekeeper.html` | The Gatekeeper "Why are you here?" intent overlay | ✅ |
| 02 | `sidebar.html` | Sidebar command center (active focus + tab list) | ✅ |
| 03 | `home.html` | New Tab dashboard (Quick Access, Return to Flow) | ✅ |
| 04 | `settings.html` | Settings → Sync & Account (health chip) | ✅ |
| 05 | `backdating.html` | Checkpoint timeline + start-time / duration editor | ✅ |
| 06 | `popup.html` | The 400×500 toolbar popup (Quick Switch) | |
| 07 | `workshifts.html` | Work Shifts → Analytics (all charts) | |
| 08 | `settings-sections.html` | Settings nav (all 22 sections) + live preview | |

> The five marked **CWS** are linked by the published store listing. Their
> filenames and their exact 1280×800 dimensions are contractual — the capture
> script flags them and validates both. Do not rename or resize them.

### Component library (90 cards across 6 pages)

| Page | Cards | Covers |
|------|-------|--------|
| `components-overlays.html` | 16 | InBar (active · paused · no-intent · agent · nub), sticky note, edit dropdown, backburner prompt, checkpoint card, notes panel, Gatekeeper (strict · relaxed · inherited · agent), BlockGate, Welcome Back, What's New |
| `components-focus.html` | 15 | FocusBar (active · paused · drifted · over-time · edit · checkpoint), FocusInput (empty · pending), FocusQueue, BackburnerDock, FocusHistory, Now Bar, CheckpointTimeline, FlipClock, Shift Controls, StagePicker, priority picker |
| `components-data.html` | 15 | Stat cards, Top Focuses, Time by Category, Context Distribution, ActivityHeatmap (365 days), Daily Hours, Peak Hours, Break Patterns, weekly comparison, Time per Focus, LogsPanel (chips · table · empty), range selector |
| `components-org.html` | 14 | TeamActivityPanel, StatusChip (9 states), invite tokens, orgs & teams, InitiativesPanel tree, ProjectsClientsPanel, Live Stints, AbandonedStintsModal, OtherProfilesStrip, CompanionStatus, Schedule (3 modes), shortfalls & requests |
| `components-settings.html` | 16 | Nav (all 22 sections), sync chip (5 states), SettingsSearch (idle · results · empty), themes (12), swatches, field rows & toggles, funnel stages, URL Rules (3 tabs), Domain Groups, Intent Changes, Developer, retention, Cortex, Webhooks, About |
| `components-primitives.html` | 14 | GlassCard, PopButton (3 sizes), ComboInput, TagPicker, StagePicker, VoiceInput, Tooltip, CommandPalette, KeyboardShortcuts (14), LinkMergeModal, TasksPanel, tab-list rows, PriorityPill, ChangelogView, UnifiedTimeline |

---

## Re-capture the assets

```bash
npm run capture:showcase   # everything: 8 frames + 90 cards (~28s)
npm run capture:shots      # the 8 1280x800 frames only
npm run capture:cards      # the 90 component cards only
```

Launches headless Chrome (standard Windows path, or `CHROME_PATH`). Writes:

- `store-assets/screenshots/0N-<name>.png` — validated to be exactly 1280×800
  and non-blank.
- `store-assets/screenshots/components/<page>--<card>.png` — each `.libcard` at
  its natural size, validated against its measured rect (allowing for the
  display's device-pixel-ratio) and for non-blankness.

Because the pages are static, capture is deterministic — no live extension
needed.

### Two traps worth knowing about (both cost real time)

- **Never use a fixed CDP debug port.** An orphaned headless Chrome still
  holding it means you silently attach to the *wrong* browser: navigations and
  screenshots target a stale page, capture appears ~500× slower, and cards come
  back blank. The script uses `--remote-debugging-port=0` and reads the real
  port back from `DevToolsActivePort`.
- **Card clips use `captureBeyondViewport`, which clips in document space.**
  Scroll-then-clip looks cheaper but loses a race with the compositor and
  intermittently captures blank cards — a *different* subset each run.

---

## Design system (pulled from the real code)

Everything here matches `src/styles/global.css` and the actual component JSX:

- **Palette (Pop-Art default theme):** background `#050505`, accent-primary cyan
  `#00F0FF`, accent-secondary `#FF0055`, accent-tertiary `#FFD700`. The gallery
  chrome uses the logo palette (`#0F1115` / `#00D2FF`, from `public/icons/icon.svg`).
- **Corner radius:** the product's halved scale — `sm 2px`, `md 4px`, `lg 8px`.
  (Content-script overlays hardcode their own: the Gatekeeper card is 16px,
  BlockGate 6px, and `LinkMergeModal` really does mix 4px and 6px. Reproduced
  as shipped.)
- **Type:** Inter for body, JetBrains Mono for timers/numbers, Bebas Neue for the
  FlipClock digits — referenced by name, falling back to the system stack exactly
  as the shipped extension does (it links no font files either).
- **Icons:** emoji. The extension ships **no** icon library, so the showcase
  uses emoji glyphs throughout — this is a defining brand trait, not a shortcut.
- **Funnel stages:** `📥 Unsorted` `#888`, `📋 Todo` `#64b5f6`, `🎯 Focus`
  `#ff9800`, `⚡ Addressing` `#ab47bc`, `🚧 Roadblocked` `#ef5350`, `✅ Resolved`
  `#66bb6a`.
- **Semantic colors:** `#66bb6a` success, `#ffa726` pause/warn/break, `#ef5350`
  over/error, `#ff9800` backburner, `#ab47bc` sub-focus, `#7c4dff`/`#b388ff`
  agent. Chips are `{color}22` background with full-strength text.
- **Sync health chip:** the five real states from `useSyncStatus.js` —
  `● Synced` (green), `◐ Stale`, `⚠ Sync error`, `⚠ Never`, `○ Offline`.

## Faithful vs. approximated

**Faithful, verbatim from code:** the Gatekeeper header "Why are you here?" /
"Define your intent to proceed." and its Strict/Relaxed badges, the Who's-working
control, action labels (Continue / Side Quest / Sugar Box / Park / Later /
Nevermind), the InBar button order and its paused-state note truncation, the
v6.7.12 backdating overlap message, the sync-chip states, the abandoned-stint
modal copy, the full 22-section settings list, all 12 theme names, all 14
keyboard shortcuts, all 13 webhook events, and all 9 log types.

> The concept doc and store listing use the phrase *"What are you down for?"*,
> but the **live** overlay reads *"Why are you here?"* — the showcase follows the
> running code.

**Deliberately reproduced quirks** (these look like showcase bugs but are real):

- **ActivityHeatmap levels 1–3 render blue, not accent-colored, in every theme.**
  The component reads `rgba(var(--accent-rgb, 59,130,246), …)` but `--accent-rgb`
  is never defined anywhere in the codebase, so the fallback always wins. Only
  the top level uses the real accent. Reproduced as shipped, and called out in
  that card's caption.
- **Mixed radii** in the content-script overlays and `LinkMergeModal`, as above.

**Grounded in the concept, lightly composed for a single storytelling frame:**
the home dashboard's *Quick Access* tiles and *Return to Flow* restore prompt
(both are documented product concepts backed by the `topSites` / `sessions`
permissions; the current build surfaces Return-to-Flow as a Welcome-Back
overlay). The sidebar shot shows the active-focus card and tab list together in
one panel. The `popup.html` frame shows the popup anchored under a mock browser
toolbar with explanatory callouts — the popup itself is an exact 400×500, but
the surrounding chrome is staging, not product.

**Demo data** uses generic labels only (Q1 Report, Learning React, Vacation
Planning, Email triage) and invented member/org names (Priya Raman, Tomás
Okafor, Wren Halliday, Northwind) — no internal or client names. Numbers are
internally consistent (e.g. 6 active days × 5h 12m = the 31h 12m headline).

**Two real product bugs** surfaced while building this. Both are logged in
`.headbox/parking_lot.md` rather than fixed here (out of scope): the StagePicker
"unsorted" active chip computes an invalid 5-digit hex (`#888` + `33`), and the
InBar edit dropdown hardcodes the `queued` state class so its active/paused
styles are dead. The showcase renders both components as *designed* rather than
as currently wired, and says so in the captions.
