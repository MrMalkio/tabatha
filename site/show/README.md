# Tabatha Component Showcase & Public Site

A polished, on-brand set of static HTML pages covering **every user-facing
surface of the whole product family** — the browser extension, the desktop
companion, and the mobile app. It is both an internal reference and the
**public site** deployed to `tabatha.pondocean.co` on Cloudflare Pages. Four jobs:

1. **Source for the 5 Chrome Web Store screenshots** — each shot page carries a
   `.shot` container of exactly **1280×800**, captured to
   `store-assets/screenshots/0N-*.png`.
2. **A durable, reusable marketing / docs / onboarding asset** — an indexed
   gallery hub plus eight category pages that stay brand-faithful to the real
   extension.
3. **A visual regression reference** — `npm run capture:showcase` renders every
   frame and every component card to PNG, so a design change that breaks a
   component shows up in a diff.
4. **A public feedback and roadmap surface** — site-wide search, a per-component
   bug/feature reporter, and a kanban roadmap.

Brand-faithful to **Tabatha v6.7.18**.

---

## The three products

The site covers a family, and each product is at a different maturity. **Status
is stated on every page and every card**, because a gallery that renders a
planned screen identically to a shipped one is lying by omission.

| Product | Repo | Status on the site |
|---|---|---|
| **Browser extension** | `Tabatha` (this repo) | Shipped — 8 surfaces, 90 components |
| **Desktop companion** | `tabatha-desktop` | **Shipped v0.2.0** — 15 surfaces & subsystems |
| **Mobile app** | `tabatha-mobile` | **In development, not installable** — 15 screens & services |

Badges live in `assets/site.css`: `.statusflag` (`live` / `dev` / `planned`) uses
the app's own semantic colors, `.substatus` carries a per-card built-vs-planned
state, and `.devnote` is the page-level notice. They sit **inside** the `.t`
caption, which is why `build-search-index.mjs` strips them out of record names
and folds them into `keywords` instead.

> **Which mobile repo is canonical?** `tabatha-mobile` (Expo/React Native). Its
> own `AGENTS.md` says so outright — *"Do not treat `tabatha-mobile-2` as a
> replacement yet"* — and `tabatha-mobile-2` is a **UI/UX design lab** whose last
> commit is literally `feat(design): pivot AI Studio to UI/UX design lab`. So the
> mobile page takes its **product** from `tabatha-mobile` and its **design
> language** from mobile-2's spec, and says which is which.

Each product's stages render **its own tokens**, not the extension's:

| | Background | Accent | Radius |
|---|---|---|---|
| Extension | `#050505` | `#00F0FF` cyan | 2/4/8 |
| Companion | `#0d0f12` | `#4a9eff` blue | 8/4 |
| Mobile | `#0F1117` | `#6C63FF` indigo | 8/12/16/999 |

---

## The two page classes (important)

| Class | Files | Has site chrome? |
|---|---|---|
| **Real site pages** (10) | `index.html`, the 8 `components-*.html`, plus `roadmap.html` | **Yes** — header search, "Request a feature", per-card actions |
| **Surface frames** (8) | `gatekeeper`, `sidebar`, `home`, `settings`, `backdating`, `popup`, `workshifts`, `settings-sections` | **No, deliberately** |

The surface frames are rendered by `scripts/capture-screenshots.mjs` at an exact
**1280×800 as the whole viewport**. Adding a header, a search box, or purpose
copy to them would appear in the capture and corrupt the five Chrome Web Store
screenshots. **Do not add site chrome to those 8 files.** Their explanatory copy
lives on the hub, where they are presented as cards.

For the same reason, the per-card Report/Request controls are absolutely
positioned and `opacity: 0` until hover/focus: they add **zero layout height**,
so `.libcard` bounding boxes stay identical and the 120 card captures do not
reflow.

---

## View it

**Offline / `file://`** — open `showcase/index.html` in any browser. Every page
is self-contained (inline CSS, inline SVG logo, emoji icons) and renders fully.
Two features need a real origin and will degrade with an explicit message rather
than break: **search** and the **roadmap board**, both of which `fetch` JSON.

**Over http** (needed for search + roadmap):

```bash
npm run site:serve            # → http://localhost:8788
npm run site:serve -- --port 3000
```

That server also stubs `POST /api/feedback` with a **501**, which is exactly
what the deployed Function returns before its token is configured — so the
GitHub-issue fallback can be exercised locally.

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

### Component library (120 cards across 8 pages)

| Page | Cards | Covers |
|------|-------|--------|
| `components-overlays.html` | 16 | InBar (active · paused · no-intent · agent · nub), sticky note, edit dropdown, backburner prompt, checkpoint card, notes panel, Gatekeeper (strict · relaxed · inherited · agent), BlockGate, Welcome Back, What's New |
| `components-focus.html` | 15 | FocusBar (active · paused · drifted · over-time · edit · checkpoint), FocusInput (empty · pending), FocusQueue, BackburnerDock, FocusHistory, Now Bar, CheckpointTimeline, FlipClock, Shift Controls, StagePicker, priority picker |
| `components-data.html` | 15 | Stat cards, Top Focuses, Time by Category, Context Distribution, ActivityHeatmap (365 days), Daily Hours, Peak Hours, Break Patterns, weekly comparison, Time per Focus, LogsPanel (chips · table · empty), range selector |
| `components-org.html` | 14 | TeamActivityPanel, StatusChip (9 states), invite tokens, orgs & teams, InitiativesPanel tree, ProjectsClientsPanel, Live Stints, AbandonedStintsModal, OtherProfilesStrip, CompanionStatus, Schedule (3 modes), shortfalls & requests |
| `components-settings.html` | 16 | Nav (all 22 sections), sync chip (5 states), SettingsSearch (idle · results · empty), themes (12), swatches, field rows & toggles, funnel stages, URL Rules (3 tabs), Domain Groups, Intent Changes, Developer, retention, Cortex, Webhooks, About |
| `components-primitives.html` | 14 | GlassCard, PopButton (3 sizes), ComboInput, TagPicker (incl. **personal realm → client auto-filled to Self**), StagePicker, VoiceInput, Tooltip, CommandPalette, KeyboardShortcuts (14), LinkMergeModal, TasksPanel, tab-list rows, PriorityPill, ChangelogView, UnifiedTimeline |
| `components-companion.html` | 15 | **Desktop companion, shipped v0.2.0.** Tray menu (11 items), tray icon (tracking · paused), Desk Panel, InstallGuide (connected · disconnected · never-installed), window monitor, time clock (out · in · break), today summary, recent activity, categorizer (9 + unknown), WebSocket bridge (10 out / 12 in), SQLite activity log, opt-in screen capture, extension updater, autostart + `tabatha://`, activity report |
| `components-mobile.html` | 15 | **Mobile, in development — every card badged.** *Built:* Dashboard, Settings, bottom-tab nav, persistent notification (partial), native usage monitor, categorizer, hybrid LAN-first sync. *Planned:* Focus Hub, activity timeline, analytics, tasks, shift controls, InBar floating widget, onboarding, Morning Kickstart |

---

## Re-capture the assets

```bash
npm run capture:showcase   # everything: 8 frames + 120 cards (~36s)
npm run capture:shots      # the 8 1280x800 frames only
npm run capture:cards      # the 120 component cards only
```

Launches headless Chrome (standard Windows path, or `CHROME_PATH`). Writes:

- `store-assets/screenshots/0N-<name>.png` — validated to be exactly 1280×800
  and non-blank.
- `store-assets/screenshots/components/<page>--<card>.png` — each `.libcard` at
  its natural size, validated against its measured rect (allowing for the
  display's device-pixel-ratio) and for non-blankness.

No live extension, login, or companion is needed: the pages are static.

> **Capture is NOT byte-deterministic.** This README used to claim it was. It is
> not: capturing the same unchanged `settings.html` twice produces two different
> PNGs (verified — `a9ce54…` then `1e7226…`, the second landing back on the
> committed bytes). Text antialiasing varies between runs. So **a diff in a
> screenshot is not by itself evidence that anything changed**, and re-running
> capture will always churn a few assets. What *is* enforced is the contract the
> script validates: the five CWS shots stay exactly 1280×800 under their pinned
> filenames, and nothing is blank. Do not wire a byte-comparison of these PNGs
> into CI expecting it to be stable.

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

> The concept doc and store listing used to say *"What are you down for?"* while
> the **live** overlay reads *"Why are you here?"*. The showcase followed the
> running code, and as of v6.7.20 the teaser H1 and the store listing were
> corrected to match it, so this drift is closed.

**Deliberately reproduced quirks** (these look like showcase bugs but are real):

- **ActivityHeatmap levels 1–3 render blue, not accent-colored, in every theme.**
  The component reads `rgba(var(--accent-rgb, 59,130,246), …)` but `--accent-rgb`
  is never defined anywhere in the codebase, so the fallback always wins. Only
  the top level uses the real accent. Reproduced as shipped, and called out in
  that card's caption.
- **Mixed radii** in the content-script overlays and `LinkMergeModal`, as above.
- **The mobile Dashboard's "Top app" stat renders a literal `—`.** It is an
  unwired placeholder in the shipped Expo build. Reproduced as shipped.

**Discrepancies found while building the family pages** (code won in each case):

- **The companion's READMEs are stale at v0.1.0** and assert *"Metadata only —
  no screenshots, no keyloggers, no content capture."* The shipped code has a
  full screen-capture engine. It is off by default and fails closed, so the
  honest framing is *"opt-in capture, disabled by default"* — but that README
  line must not be reused, and the card says so.
- **`COMPANION_STATUS.tracking` is hardcoded `true`** in `ws_server.rs`. Pausing
  from the tray does not change what the extension sees over the wire. Not
  advertised as live anywhere on the site.
- **`CATEGORY_RULES` / custom category overrides are dead code** — the message
  variant and `set_override()` both compile, but the categorizer is never wired
  to the ws_server. The message is listed as part of the protocol (it is), but
  custom categories are **not** claimed as a feature.
- **The companion's docs say "50+ app→category mappings"; the real count is ~100.**
- **Companion day boundaries are UTC** while the tray's text report prints local
  time, so they disagree near midnight in a distant timezone. Stated on the card.
- **`FEATURES.md` overstates geofencing** — the checkbox implies a Settings UI for
  region CRUD that does not exist in `src/`; the plan doc confirms the service is
  a stub that was never wired in. **Geofencing is therefore not shown at all.**
- **Two conflicting category palettes exist in the mobile specs.** The page
  renders the one the design language declares, and the card notes the conflict.
- **The shipped mobile app does not use its own declared design language yet**
  (it draws an older ad-hoc palette). The page renders the declared language and
  the `.devnote` says exactly that.

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

---

## Deploying to Cloudflare Pages

The site is deployed at **`tabatha.pondocean.co`**.

| Setting | Value |
|---|---|
| **Build command** | `npm run build:search-index` |
| **Build output directory** | `showcase` |
| **Root directory** | *(repo root)* |
| **Functions directory** | `functions` (picked up automatically) |

The build command only regenerates `search-index.json` (185 records). There is no bundler:
the site ships as flat static files exactly as they sit in `showcase/`. If you
prefer to commit the index (it is committed today), the build command can be
set to `echo noop` and the site will still deploy correctly.

`showcase/_headers` sets the security headers and the CSP. The CSP allows no
external origins at all — no CDNs, no external fonts, no third-party scripts —
because the site genuinely has none. `frame-src 'self'` is required: the hub
embeds the surface frames as live iframes.

### `/api/feedback` environment variables

Set these in **Pages → Settings → Environment variables**. The Function reads
them from its `env` binding at request time; **nothing is ever hardcoded**.

| Variable | Required | Notes |
|---|---|---|
| `ASANA_TOKEN` | yes | Asana personal access token. Mark it **Encrypted**. |
| `ASANA_PROJECT` | yes | GID of a **dedicated public-intake project**. Never point this at the internal development board. |
| `ASANA_WORKSPACE` | no | Workspace GID. Only needed if the token can see more than one workspace. |

**Until these are set the endpoint returns `501` by design** and the client
silently falls back to opening a **prefilled GitHub issue** against
`MrMalkio/tabatha`. That fallback is also what runs on `file://` and on any
upstream failure, so the reporter's words are never lost. The feature is
therefore fully usable before the backend exists — wiring the token is an
upgrade, not a prerequisite.

---

## Updating the roadmap

The board reads **`showcase/roadmap.json`**. It is **hand-curated on purpose**:
the internal Asana board is never wired to this page, because internal task
names, client names and teammate names must not leak to a public site.

An entry looks like:

```json
{
  "id": "smart-deferral",
  "title": "Smart deferral and task splitting",
  "blurb": "Defer a task to a future stint and let Tabatha size the slot.",
  "stage": "todo",
  "version": "6.6.0"
}
```

- `id` — stable slug; it is the deep-link anchor (`roadmap.html#smart-deferral`)
  and what search links to. Do not recycle ids.
- `stage` — must be one of the six `stages[].id` values. Those mirror the app's
  own `FUNNEL_STAGES` (`src/hooks/useFocusEngine.js`): `unsorted`, `todo`,
  `focus`, `addressing`, `roadblocked`, `resolved`. **Keep them in sync with the
  source** — the whole point is that the roadmap speaks the product's language.
- `version` — only on `resolved` items; it renders as the green shipped badge.

After editing, regenerate the index so the new items are searchable:

```bash
npm run build:search-index
```

### What may go on this page

Be conservative. **If you are unsure an item is public-safe, leave it out.**

- ✅ Features already announced in `Tabatha_Changelog.md`.
- ✅ Product-facing work described in plain user language.
- ❌ Internal task names, plan numbers, client names, teammate names.
- ❌ Backend vendor, infrastructure, project or host names; anything from
  `.local` files, keys or credentials.
- ❌ Unannounced or confidential programs.
- ❌ Delivery dates. Stages communicate intent; they are not commitments.
