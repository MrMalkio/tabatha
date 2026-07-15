# Tabatha Component Showcase

A polished, on-brand set of static HTML "display" pages for every key Tabatha
surface. Two jobs:

1. **Source for the 5 Chrome Web Store screenshots** — each shot page carries a
   `.shot` container of exactly **1280×800**, captured to
   `store-assets/screenshots/0N-*.png`.
2. **A durable, reusable marketing / docs / onboarding asset** — a gallery hub
   plus a component library that stays brand-faithful to the real extension.

Brand-faithful to **Tabatha v6.7.14**.

---

## View it

Open `showcase/index.html` in any browser (double-click, or `file://`). No build
step, no server, no network calls — every page is self-contained (inline CSS,
inline SVG logo, emoji icons). The hub embeds the five shot pages as live
`iframe` thumbnails, so the gallery never drifts from the pages themselves.

Individual surfaces:

| # | Page | Surface |
|---|------|---------|
| 01 | `gatekeeper.html` | The Gatekeeper "Why are you here?" intent overlay |
| 02 | `sidebar.html` | Sidebar command center (active focus + tab list) |
| 03 | `home.html` | New Tab dashboard (Quick Access, Return to Flow) |
| 04 | `settings.html` | Settings → Sync & Account (health chip) |
| 05 | `backdating.html` | Checkpoint timeline + start-time / duration editor |

The hub's **Component library** section additionally renders: the InBar in-page
indicator, BlockGate, TagPicker, tab-list rows, analytics/heatmap, and the
abandoned-stint modal.

---

## Re-capture the screenshots

```bash
node scripts/capture-screenshots.mjs
```

Launches headless Chrome (found at the standard Windows path, or `CHROME_PATH`),
renders each shot page in a 1280×800 window at device-scale-factor 1, and writes
`store-assets/screenshots/01-gatekeeper.png` … `05-backdating.png`. Each PNG is
validated to be exactly 1280×800 and non-blank before the script reports success.
Because the pages are static, capture is deterministic — no live extension needed.

---

## Design system (pulled from the real code)

Everything here matches `src/styles/global.css` and the actual component JSX:

- **Palette (Pop-Art default theme):** background `#050505`, accent-primary cyan
  `#00F0FF`, accent-secondary `#FF0055`, accent-tertiary `#FFD700`. The gallery
  chrome uses the logo palette (`#0F1115` / `#00D2FF`, from `public/icons/icon.svg`).
- **Corner radius:** the product's halved scale — `sm 2px`, `md 4px`, `lg 8px`.
  (Content-script overlays like the Gatekeeper hardcode their own 16px card, so
  that one is reproduced at 16px.)
- **Type:** Inter for body, JetBrains Mono for timers/numbers, Bebas Neue for the
  FlipClock digits — referenced by name, falling back to the system stack exactly
  as the shipped extension does (it links no font files either).
- **Icons:** emoji. The extension ships **no** icon library, so the showcase
  uses emoji glyphs throughout — this is a defining brand trait, not a shortcut.
- **Priority colors:** P1–P2 red `#ff6b6b`, P3–P4 amber `#ffa726`, P5 green
  `#66bb6a`; funnel-stage `Focus` pill amber `#ff9800`.
- **Sync health chip:** the five real states from `useSyncStatus.js` —
  `● Synced` (green), `◐ Stale`, `⚠ Sync error`, `⚠ Never`, `○ Offline`.

## Faithful vs. approximated

- **Faithful, verbatim from code:** Gatekeeper header "Why are you here?" /
  "Define your intent to proceed.", the Who's-working control, action labels
  (Continue / Side Quest / Sugar Box / Park / Later / Nevermind), the v6.7.12
  backdating overlap message ("…overlaps "…" by 18m (both keep their time)"),
  the sync-chip states, the abandoned-stint modal copy, settings section list.
  > Note: the concept doc and store listing use the phrase *"What are you down
  > for?"*, but the **live** overlay reads *"Why are you here?"* — the showcase
  > follows the running code.
- **Grounded in the concept, lightly composed for a single storytelling frame:**
  the home dashboard's *Quick Access* tiles and *Return to Flow* restore prompt
  (both are documented product concepts backed by the `topSites` / `sessions`
  permissions; the current build surfaces Return-to-Flow as a Welcome-Back
  overlay). The sidebar shot shows the active-focus card and tab list together
  in one panel for the shot.
- **Demo data** uses generic labels only (Q1 Report, Learning React, Vacation
  Planning, Email triage) — no internal or client names.
