# Headbox Updates — Operational Rules & Preferences

> **Source:** Conversation `53e2949b` (Follow-Through Engine + Worktree Isolation)  
> **Date:** 2026-05-12  
> **Purpose:** Distilled operational rules, preferences, and workflow protocols expressed by the user during this session that should be institutionalized in `AGENTS.md` and/or headbox configuration.

---

## 1. Branch Discipline: No Direct Master Commits

**User directive (verbatim):**
> "maybe not work from Master anymore. and instead we promote to master."

**Rule to add to Global Rules:**
> All agents work on their own feature/refactor branches. `master` is a **merge-only** target. No direct commits. Promote to master via merge after verification.

**Current state:** Partially covered by Rule #3 ("Never push directly to master — always via PR or explicit human approval"), but that only covers *pushing*. The new rule is broader: **no commits to master at all**, not even local ones. All work is branch-first.

**Suggested wording:**
```
12. **Branch-first workflow** — Never commit directly to `master`. All work happens 
    on feature branches (e.g. `feat/follow-through-engine`) or refactor branches 
    (e.g. `refactor/service-arch`). Merge to master only after build verification. 
    Each agent should have its own branch.
```

---

## 2. Worktree Isolation for Multi-Agent Workflows

**User directive (verbatim):**
> "I've guided them on worktrees too" (referring to instructing Codex to use `git worktree`)

**Context:** When two agents (Antigravity + Codex) worked on the same repo simultaneously, `git checkout` in a shared directory caused file thrashing — Codex's edits would vanish when Antigravity switched branches. The fix: `git worktree` gives each agent its own physical directory.

**Rule to add to Local Rules:**
```
- **Multi-agent isolation** — When multiple agents work on the same repo simultaneously, 
  use `git worktree` to give each agent its own directory. Never `git checkout` in a 
  shared directory. The main `Tabatha\` directory belongs to one agent; others use 
  worktrees (e.g. `Tabatha-service-arch\` for Codex).
```

**Supporting artifact:** `.headbox/sticky-notes/branch-policy.md` (already committed)

---

## 3. Safe-to-Continue Logic During Parallel Refactoring

**User question (verbatim):**
> "Before continuing on, what is the logic of continuing while we are actively refactoring with the decomp?"

**Established principle:** UI-only changes (components, styling, layout) are **safe** during backend refactoring because they only call `sendMessage('TYPE', payload)` and don't care whether the handler is in a monolith or a service module. New **backend handlers** are NOT safe — they'd add code to a file being actively decomposed.

**Rule to add to Local Rules:**
```
- **Parallel refactor safety** — When a monolith decomposition or architecture refactor 
  is in progress, only make UI-only changes (components, styling, layout) that use 
  existing message contracts. Do NOT add new message handlers or modify background.js 
  until the refactor branch is merged.
```

---

## 4. Handoff Prompts Are Required Deliverables

**User directive (verbatim):**
> "Ok create a new Prompt for our Next agent that will pick up and also include any necessary links and nuanced guidance."

**Pattern observed:** The user expects a comprehensive handoff prompt whenever a session ends with pending work. This is more than a session log entry — it's a standalone document with:
- Branch/worktree safety rules
- What's done, what's blocked, what's next
- Links to scope docs, implementation plans, and architecture files (full paths)
- Nuanced implementation guidance (component patterns, hook contracts, terminology)
- Quick-start checklist

**Rule to add to Session Handoff Protocol:**
```
- **Create handoff prompts** when work spans multiple sessions or agents. Include: 
  branch rules, current state, blocked items, scope doc links (full paths), 
  implementation guidance, and a quick-start checklist. Store as an artifact or 
  in `.headbox/sticky-notes/`.
```

---

## 5. Implementation Plans Must Include Full File Paths

**User directive (verbatim):**
> "Ensure existing implementation plan full paths are included in the doc so there is no difficulty."

**Context:** When an implementation plan references scope docs or architecture files, the next agent may not know where to find them. Full absolute paths eliminate ambiguity.

**Amendment to Rule #10 (Version in Implementation Plans):**
```
All references to related documents (scope docs, architecture guides, checklist files) 
must include full absolute file paths so any agent can locate them immediately.
```

---

## 6. Debug Mode & Silent Failure Handling

**Established during diagnostic fix sweep:**
- All system-wide state diagnostics should be gated behind `settings.debugMode`
- Use the `logger` service (`src/services/logger.js`) to capture `sendMessage` errors
- Persist error logs to `chrome.storage` for the Developer Panel
- Position debug UI at the bottom of the home page

**Rule to add to Local Rules:**
```
- **Debug mode gating** — All diagnostic UI and verbose logging must be gated behind 
  `settings.debugMode`. Use the `logger` service for error capture. Never show debug 
  info to non-debug users.
```

---

## 7. Version Discipline Across Multiple Files

**Established pattern:** Every release must include an incremented version string across:
- `public/manifest.json`
- `src/home/index.jsx` (header version display)
- `src/settings/index.jsx` (about section)
- `src/workshifts/index.jsx` (page header)

**Rule to add to Local Rules:**
```
- **Version parity** — When bumping versions, update ALL version strings: 
  `manifest.json`, home page header, settings about section, and workshifts header. 
  Never leave stale version strings.
```

---

## 8. Parking Lot Is for Features AND Architectural Observations

**Pattern observed:** The user described InBar pause/sticky-note features during a conversation about something else. The correct response was to capture them in the parking lot, not act on them immediately. This validates the Valeting protocol but extends it — the parking lot should also capture:
- **Feature requests** mentioned in passing
- **Architectural concerns** noticed during unrelated work
- **UX observations** about existing behavior

Already covered by Valeting protocol, but worth reinforcing in practice.

---

## 9. Terminology Matters — Use Domain Language Consistently

**User directives (across multiple messages):**
- "Shifts are the accumulated work of a day" → shift = daily aggregate
- Clock-in/out sessions → "stints" (not shifts)
- "Self/Me as a client" → personal realm default

**Rule (soft, for Local Rules):**
```
- **Terminology** — Use project-specific terms consistently:
  - **Stint:** A single clock-in/out session
  - **Shift:** All stints in a single day  
  - **Focus:** The current macro-objective (what you're working toward)
  - **Intent:** A tab's purpose within a focus (micro-level)
  - **Realm:** Business vs Personal context
  - **Self:** Default client for personal realm
```

---

## 10. Scope Docs Are First-Class Artifacts

**Pattern observed:** The user provided detailed inline feedback on scope docs (Follow-Through, InBar), treating them as living design documents. They expected:
- **Versioned updates** (v1 → v2) when feedback is incorporated
- **Cross-references** between related scope docs
- **Specific signal lists** (what contributes to progress bars, follow-through)

Not a rule per se, but a best practice to document:
```
- **Scope docs** — When the user provides feedback on a scope document, create a new 
  version (v2, v3) rather than silently editing. Cross-reference related scopes. 
  Store in conversation artifacts with clear titles.
```

---

## 11. Architecture Refactoring Should Be Its Own Track

**User directive (verbatim):**
> "can or should the monolith decomp be its own complete own path, that does not disrupt the current stable version?"

**Established principle:** Large refactors (like decomposing a 2300-line monolith) should:
- Live on their own branch
- Have their own implementation plan and docs (in `docs/architecture/`)
- Include a migration checklist and parity tracker
- Periodically rebase on master to absorb new features
- Merge only when fully verified

**Rule to add to Local Rules:**
```
- **Isolated refactor tracks** — Large architectural refactors get their own branch, 
  implementation plan, and parity checklist in `docs/architecture/`. They rebase on 
  master periodically and merge only after full verification.
```

---

## Summary: Proposed AGENTS.md Changes

### New Global Rules (append after #11):
- **#12** Branch-first workflow (no direct master commits)

### New Local Rules (append):
- Multi-agent worktree isolation
- Parallel refactor safety
- Debug mode gating
- Version parity across all version strings
- Terminology glossary
- Isolated refactor tracks

### Session Handoff Protocol Additions:
- Create handoff prompts with full file paths, branch rules, and quick-start checklists
- All implementation plan references must include full absolute paths

---

> [!IMPORTANT]
> These updates should be reviewed and then applied to `AGENTS.md`, `GEMINI.md`, and `.gemini/agent.md` to maintain sync across all vendor files as required by the Headbox Session Handoff Protocol.
