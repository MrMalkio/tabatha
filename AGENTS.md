# Agent Instructions — Tabatha

> This project uses **Headbox** for standardized agent instructions.
> All agents (Claude, Gemini, Codex, Cursor, Copilot, etc.) follow the same rules below.

---

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- HEADBOX v0.1.0 | Main: v0.1.0 | Uses: 0 | Status: active          -->
<!-- Owner: Malkio | Workspace: c:\Users\mrmal\Le Dev\Tabatha            -->
<!-- ═══════════════════════════════════════════════════════════════════ -->

## Project State

- **Current version:** 1.0.0-alpha
- **Current focus:** Phase 2 — Rapid Access & Management (React migration complete, building on new architecture)
- **Architecture:** React 19 + Vite 8 + TailwindCSS 4, Chrome MV3 Extension, Framer Motion
- **Dev command:** `npm run dev`
- **Build command:** `npm run build`
- **Port:** 5173 (Vite default)

---

## Mission

Tabatha is a **Context-Driven Tab Manager** — an "Attention Operating System" for the browser. It enforces intentional browsing by assigning Context and Intent to every tab, tracking time, and providing focus tools. Part of the Flux ecosystem.

---

## Workspace Map

See `.headbox/workspace-map.md` for the full project file tree.

---

## Critical Files

| File | Purpose | When to read |
|------|---------|-------------|
| This file (`AGENTS.md`) | Project state, rules, session log | Always — first thing |
| `.gemini/agent.md` | Gemini-specific instructions (known bugs, architecture, message types) | When working with Gemini |
| `docs/progress.md` | Session progress log | Before starting work — check last session's next steps |
| `ROADMAP.md` | 6-phase feature roadmap | When planning features |
| `Tabatha_Concept.md` | Core philosophy — "Attention Operating System" | When making architecture decisions |
| `Tabatha_Changelog.md` | Version history | When tracking what's changed |
| `src/App.jsx` | Main React entry | When touching app structure |
| `public/manifest.json` | Chrome MV3 manifest | When changing permissions/pages |
| `vite.config.js` | Multi-page build config | When adding pages or changing build |

> 📎 More files added as they become frequently used. Reviewed at 20th-use.

---

## Approach Protocol

1. **Read this file first.** Check project state, current focus, session log.
2. **Check `.headbox/sticky-notes/`** for notes from other agents.
3. **Check `.headbox/workspace-map.md`** if you need structural context.
4. **Check `docs/progress.md`** for last session's next steps.
5. **Work incrementally.** Small commits, testable changes.
6. **Practice progressive disclosure.** Read what you need, drill deeper only when necessary.

---

## Global Rules

1. **Always commit before ending a session** — use `wip:` prefix if incomplete. Before closing, **ask the user if the session is over** so nothing is left uncommitted.
2. **Follow Conventional Commits** — `{type}({scope}): {description}`
3. **Never push directly to `master`** — always via PR or explicit human approval.
4. **When in doubt — always ask.** Surface ambiguity early, propose a direction, confirm before acting.
5. **Stay on task.** If you notice something unrelated, **Valet it** (see Valeting below).
6. **On `checkpoint`** — update any known task(s) with progress and reference artifacts.
7. **Practice progressive disclosure.** Do NOT read every file. Read what you need.
8. **Check `.headbox/sticky-notes/`** at session start for notes left by other agents or humans.

---

## Local Rules

- **Update `docs/progress.md`** at the end of every session with: date, goal, what was done, key findings, decisions, next steps.
- **Update `Tabatha_Changelog.md`** when shipping version changes.
- **Legacy code in `v0_legacy/`** — reference only. Do not modify. All new work happens in `src/`.
- **Multi-page build** — Tabatha has separate HTML entry points: `index.html`, `home.html`, `popup.html`, `sidebar.html`, `settings.html`. Changes to build config affect all of them.
- **Chrome extension context** — always test changes by loading unpacked at `chrome://extensions` and checking the Service Worker console.

---

## Valeting (Parking Lot Protocol)

When you notice something that is **not part of your current task**, do not act on it unless it's obligatory. Instead, **append** an entry to `.headbox/parking_lot.md`:

```
## {date} — {brief_title}
- **Noticed while:** {task}
- **What:** {observation}
- **Why it matters:** {impact}
- **Options:**
  1. {option_a}
  2. {option_b}
  3. {option_c} ← **suggested**
```

**Mechanics:**
- **Append only.** Never rewrite the parking lot.
- Before appending, scan existing headers only to check for duplicates.

---

## Checkpoint Protocol

When the user says **`checkpoint`** or you reach a natural stopping point:

1. Update all known task(s) with a progress comment.
2. Include: what was done, what's next, references to artifacts with file paths.
3. If no task is known, ask the user if there's one to associate.

---

## Session Handoff Protocol

**After every session, update the Session Log below.**

- **Append** a new entry. **Never delete** previous entries.
- **Increment the usage counter** in the headbox header by 1.
- **On every 20th use**: ask the user if anything should be updated.
- You MAY update `Current version` and `Current focus` in Project State.

---

## Session Log

| Date | Agent | Focus | Work Done | Next Steps |
|------|-------|-------|-----------|------------|
| 2026-04-27 | Antigravity | Headbox install | Pilot install — scaffolded .headbox/, appended headbox section to AGENTS.md and .gemini/agent.md | Begin Phase 2 feature work |

<!-- ═══════════════════════════════════════════════════════════════════ -->
<!-- END HEADBOX                                                        -->
<!-- ═══════════════════════════════════════════════════════════════════ -->
