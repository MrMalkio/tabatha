# Workspace Map

> Auto-generated at headbox install. Agents update this when significant
> structural changes occur (new directories, major file moves).
> Last generated: 2026-04-27 · Last touched: 2026-07-10 (Cortex Phase 1 T1-T3/T6 — docs/cortex/**, cortex utils/services, migration 022 added; rest of tree unchanged from 2026-06-30 pass)

## Directory Structure

```
Tabatha/
├── .gemini/                    (1 file)
│   └── agent.md                — Gemini agent instructions
├── docs/                       (3 files + cortex/ + plans/ subtrees — see below)
│   ├── design.md
│   ├── progress.md             — Session progress log
│   ├── user-manual.md
│   ├── cortex/                 (21 files — Cortex AI Observation & Optimization layer, Plan 039/040)
│   │   ├── 00-cortex-program-spec.md — program master spec (5-layer arch, 15 capability clusters)
│   │   ├── SOURCE-braindumps.md — verbatim Malkio design source (do not lose)
│   │   ├── DATA-MAP.md         — Agent Data Map (C14) — authoritative signal/storage/retention/access catalog, populated 2026-07-10
│   │   ├── API-KEYS.md         — API key storage/routing decisions
│   │   ├── README.md
│   │   ├── features/           (15 files — CXX-*.md, one per capability cluster C1-C15)
│   │   └── prompts/            (2 files — README.md + economize-workflow.v1.md, versioned master optimization prompts, C8)
│   └── plans/
│       └── plan-040-cortex-phase1.md — Cortex Phase 1 implementation plan (T1-T6; current version 6.5.0 → target 7.0.0)
├── public/                     (7 files)
│   ├── icons/                  (4 files — extension icons)
│   ├── favicon.svg
│   ├── icons.svg
│   └── manifest.json           — Chrome MV3 manifest
├── src/                        (25 files)
│   ├── assets/                 (3 files — hero, react, vite svgs)
│   ├── background/             (1 file + services/ — background/services/ has grown well past this snapshot; only Cortex additions logged here, rest not re-audited)
│   │   ├── background.js       — Service worker
│   │   ├── cortexPrompt.js     — Cortex C8: versioned master "economize workflow" prompt (PROMPT_VERSION/PROMPT_TEXT)
│   │   └── services/
│   │       ├── captureService.js — Cortex C1-C4 capture shell: cortexLedger/cortexCaptureState keys, frame I/O (chrome.tabs.captureVisibleTab → redact → chrome.downloads), dwell + nightly-export alarms
│   │       └── cortexService.js  — Cortex C6-C8 tier-①: cortexRecommendations store (approve/dismiss dashboard) + cron-in-harness bundle generator
│   ├── components/             (6 files)
│   │   ├── clock/              — FlipClock.jsx, FlipClock.css
│   │   └── ui/                 — GlassCard, PopButton, TagPicker, Tooltip
│   ├── content/                (2 files)
│   │   ├── blockgate.js
│   │   └── gatekeeper.js
│   ├── home/                   (2 files)
│   │   ├── index.jsx           — New Tab page
│   │   └── SessionList.jsx
│   ├── hooks/                  (2 files)
│   │   ├── useChromeStorage.js
│   │   └── useFocusEngine.js
│   ├── popup/                  (1 file)
│   │   └── index.jsx
│   ├── settings/               (2 files)
│   │   ├── index.jsx
│   │   └── CortexPanel.jsx     — Cortex settings UI (capture master toggle, retention/redaction config, recommendations dashboard)
│   ├── sidebar/                (1 file)
│   │   └── index.jsx
│   ├── styles/                 (1 file)
│   │   └── global.css
│   ├── utils/                  (12 files — includes Cortex C1-C4 pure decision core, added Plan 040 T1)
│   │   ├── taskUrlResolver.js
│   │   ├── formatTime.js
│   │   ├── focusTimeValidation.js
│   │   ├── semver.js
│   │   ├── stintReconciliation.js
│   │   ├── captureDecision.js   — Cortex C1: when + which surface to capture (pure, unit-tested)
│   │   ├── sensitiveDataGuard.js — Cortex C2: per-site/app suppress + redact rule evaluation
│   │   ├── observationLedger.js — Cortex C4: normalizeObservation / dedupeKey / partitionOf (personal↔org)
│   │   ├── retentionPolicy.js   — Cortex C3: planRetention (age + space-cap deletion planner)
│   │   ├── captureArtifacts.js  — Cortex C1/C2/C3: redaction-rect math + partitioned filename/path builders
│   │   ├── ledgerExport.js      — Cortex C4/C6: nightly export envelope + pruneLedgerByAge
│   │   └── harnessCron.js       — Cortex C8: cron-in-harness bundle generator (tier-① routing)
│   ├── App.css
│   ├── App.jsx                 — Main application entry
│   ├── index.css
│   └── main.jsx                — React root mount
├── supabase/                   (migrations 001–022 + config)
│   └── migrations/             — Schema migrations (001–021 applied to live Flux; 022_cortex_ledger.sql = Cortex observations ledger + capture refs, NOT YET APPLIED — Phase 1 is local-first, see docs/cortex/DATA-MAP.md)
├── test/                       (node:test unit tests — Cortex additions Plan 040 T1: captureDecision.test.js, sensitiveDataGuard.test.js, observationLedger.test.js, retentionPolicy.test.js, captureArtifacts.test.js, ledgerExport.test.js, harnessCron.test.js; pre-existing test/ files not re-audited this pass)
├── v0_legacy/                  (26 files — pre-React legacy code)
│   ├── components/
│   ├── docs/
│   ├── recon/
│   ├── site/
│   └── (raw JS files — background, sidebar, home, popup)
├── .gitignore
├── AGENTS.md                   — Agent instructions (headbox)
├── eslint.config.js
├── home.html                   — New Tab override page
├── index.html                  — Main entry HTML
├── package.json                — React 19, Vite 8, TailwindCSS 4
├── popup.html                  — Extension popup
├── README.md
├── ROADMAP.md                  — 6-phase feature roadmap
├── settings.html               — Settings page
├── sidebar.html                — Side panel
├── Tabatha_Changelog.md        — Version history
├── Tabatha_Concept.md          — Core philosophy doc
└── vite.config.js              — Build config (multi-page Chrome ext)
```

## Key Files

| File | Type | Purpose |
|------|------|---------|
| `package.json` | Config | React 19, Vite 8, TailwindCSS 4, Framer Motion |
| `vite.config.js` | Config | Multi-page build for Chrome extension |
| `public/manifest.json` | Config | Chrome MV3 extension manifest |
| `src/App.jsx` | Entry | Main React application component |
| `src/main.jsx` | Entry | React root mount point |
| `src/background/background.js` | Core | Chrome service worker |
| `src/content/gatekeeper.js` | Core | Content script for tab interception |
| `src/background/services/captureService.js` | Cortex | C1-C4 capture shell — cortexLedger/cortexCaptureState, frame I/O, dwell + nightly-export alarms |
| `src/background/services/cortexService.js` | Cortex | C6-C8 recommendation store + cron-in-harness bundle generator |
| `src/background/cortexPrompt.js` | Cortex | Versioned master "economize workflow" optimization prompt |
| `src/settings/CortexPanel.jsx` | Cortex | Settings UI — capture toggle, retention/redaction config, recommendations dashboard |
| `docs/cortex/00-cortex-program-spec.md` | Docs | Cortex program master spec (Plan 039/040) |
| `docs/cortex/DATA-MAP.md` | Docs | Agent Data Map (C14) — authoritative signal/storage/retention/access catalog |
| `docs/plans/plan-040-cortex-phase1.md` | Docs | Cortex Phase 1 implementation plan (T1-T6) |
| `supabase/migrations/022_cortex_ledger.sql` | Config | Cortex observations ledger + capture-ref tables (schema staged, NOT YET APPLIED) |
| `.gemini/agent.md` | Agent | Gemini-specific agent instructions (rich context) |
| `AGENTS.md` | Agent | Agent instructions (headbox installed) |
| `docs/progress.md` | Docs | Session progress log |
| `ROADMAP.md` | Docs | 6-phase feature roadmap |
| `Tabatha_Concept.md` | Docs | Core philosophy — "Attention Operating System" |
| `Tabatha_Changelog.md` | Docs | Version history |
