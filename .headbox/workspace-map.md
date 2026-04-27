# Workspace Map

> Auto-generated at headbox install. Agents update this when significant
> structural changes occur (new directories, major file moves).
> Last generated: 2026-04-27

## Directory Structure

```
Tabatha/
├── .gemini/                    (1 file)
│   └── agent.md                — Gemini agent instructions
├── docs/                       (3 files)
│   ├── design.md
│   ├── progress.md             — Session progress log
│   └── user-manual.md
├── public/                     (7 files)
│   ├── icons/                  (4 files — extension icons)
│   ├── favicon.svg
│   ├── icons.svg
│   └── manifest.json           — Chrome MV3 manifest
├── src/                        (25 files)
│   ├── assets/                 (3 files — hero, react, vite svgs)
│   ├── background/             (1 file)
│   │   └── background.js       — Service worker
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
│   ├── settings/               (1 file)
│   │   └── index.jsx
│   ├── sidebar/                (1 file)
│   │   └── index.jsx
│   ├── styles/                 (1 file)
│   │   └── global.css
│   ├── utils/                  (1 file)
│   │   └── taskUrlResolver.js
│   ├── App.css
│   ├── App.jsx                 — Main application entry
│   ├── index.css
│   └── main.jsx                — React root mount
├── supabase/                   (1 file)
│   └── migrations/             — Schema migrations
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
| `.gemini/agent.md` | Agent | Gemini-specific agent instructions (rich context) |
| `AGENTS.md` | Agent | Agent instructions (headbox installed) |
| `docs/progress.md` | Docs | Session progress log |
| `ROADMAP.md` | Docs | 6-phase feature roadmap |
| `Tabatha_Concept.md` | Docs | Core philosophy — "Attention Operating System" |
| `Tabatha_Changelog.md` | Docs | Version history |
