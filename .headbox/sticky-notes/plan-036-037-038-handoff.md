# Handoff — Plans 036 / 037 / 038 (Focus Lifecycle + Time Editing + URL Rules)

> **From:** Claude (Opus 4.8), 2026-05-29
> **Branch:** `feat/plan-036-focus-lifecycle` (off `staging`, in a dedicated worktree). **NOT yet pushed or PR'd.**
> **Live build:** `dist-v…` convention — the user loads `C:\Users\mrmal\Le Dev\Tabatha\dist` (their original path-derived extension ID). I update that folder in place each release. Versioned `dist-vX.X.X` folders are archives only — do NOT tell the user to load them (new folder = new extension ID = empty storage; this confused them once already).

---

## Current version: v6.2.0

Stacked, all on the one branch:
- **v6.0.0** — Plan 036 Intelligent Focus Lifecycle (smart idle, auto-focus, drift, settings/InBar)
- **v6.1.0** — Plan 037 Phase 1 (focus time editing) + Plan 036 QA fixes
- **v6.2.0** — Plan 038 Phase 1 (persistent domain store)
- (uncommitted-at-write-time) Plan 037 Phase 2 (timeline edit mode) — see below

## ⚠️ Version discipline (learned the hard way)
The user lost confidence when builds kept saying 6.0.0 across multiple changes. **Bump `public/manifest.json` version on every user-facing change**, run `npm run version:sync`, and **prove the new code is in the loaded bundle** with `Select-String` against `dist\assets\*.js` (the user can't trust source — show it's in the build). Always refresh the live `dist` folder after building.

## Verification commands
- `npm test` — 38 node:test regression tests (in-process `chrome` mock at `testutils/chromeMock.js`). All green.
- `npm run build` + `npm run version:check`.

---

## Plan status (see `.headbox/plan-registry.md`)

- **036** — completed (v6.0.0). Still needs full in-browser manual matrix; companion-dependent paths untested without the desktop companion.
- **037** — Focus Time Editing. Phase 1 + Phase 2 done. Backend in `focusService.js`: `ADJUST_FOCUS_TIME`, `SET_FOCUS_ELAPSED`, `REMOVE_LAST_PAUSE`, `EDIT_CHECKPOINT`, `DELETE_CHECKPOINT`. UI in `src/home/index.jsx` FocusBar checkpoint timeline (the `tlEdit` edit-mode toggle).
- **038** — URL Rules Intelligence & Training Mode. `partial (1/4)`. Phase 1 done (`domainHistoryService.js` persistent store + DomainsTab rebuild). **Remaining:**
  - **Phase 2** — proactive rule suggestions when the user hits a `targeted` domain + configurable prompt frequency. The Target button (⭐) already sets `status:'targeted'` on a domain; nothing consumes it yet. Hook into `autoFocusService` suggestion chip mechanism. Add `ruleSuggestionFrequency` setting.
  - **Phase 3** — Training Mode (guided per-domain Q&A overlay in `inbar.js` + new `trainingService.js`).
  - **Phase 4** — Visual field picker (`fieldPicker.js` content script, CSS selector capture → merge tags → auto-intent/focus templates). The QuickBooks-style automation Mike referenced.
  - Full spec: `docs/plans/plan-038-url-rules-intelligence.md`.

---

## Open user feedback NOT yet addressed (candidate next work)
From the 2026-05-29 QA + feature session:
1. **URL Rules "coming soon" stubs** in DomainsTab (`+ Create Rule`, `🚫 Block Domain`) are still disabled placeholders — wire them up (Create Rule from a domain is a natural Plan 038 Phase 2 item).
2. **`matchedRules`** in `UrlRulesSection` is computed only from open-tab domains, so rule counts show 0 for offline persistent domains. Improve to match against the persistent store.
3. The user wants the **"upload my training to the community / developer"** path (Plan 038 Phase 3 export) — secure submission endpoint is a future infra task.

## Pre-PR self-review (2026-05-29) — findings

Done a full self-review of the ~2500-line branch diff before PR. Results:
- **FIXED (v6.3.1):** `isUserInMeeting()` treated any meeting-domain tab open >2min as an active call → a forgotten Zoom/Meet tab disabled idle detection all day. Now bounded to `meetingIdleGraceMinutes` + an active-tab signal. Guarded by 2 new tests.
- **Follow-up (not blocking):** `recordDomainVisit` does a full read-modify-write of the whole `domainHistory` object on EVERY navigation, fire-and-forget. (a) wasteful for large stores — consider debounce/batch; (b) two rapid navigations can race and lose a visit-count increment. Minor; fine for single-user now.
- **Follow-up (minor UX):** the `idle-auto-break` clock break still fires after 5min of Chrome idle even if the user answered the IDLE_PROMPT with "Yes, on task". Confirming on-task should arguably suppress the clock auto-break. Decide with user.
- Verified the inbar `onMessage` listener is NOT async and has no top-level `await` (drift handler uses `.then`) — OK.
- **Build-proof caveat:** `Select-String` against `dist/assets/*.js` only finds **string literals** (e.g. message-type constants like `EDIT_CHECKPOINT`), NOT minified local variables/logic. Use it to confirm string-bearing features; for pure-logic fixes rely on tests + version bump.

## Next steps for whoever picks this up
1. Decide with the user: keep stacking on this branch, or **push + PR `feat/plan-036-focus-lifecycle` → `staging`** now (it's a lot of value already; the branch is getting long-lived).
2. If continuing: Plan 038 Phase 2 is the most natural next increment (makes ⭐ Target actually do something).
3. Tier-1 release gate (separate, out of these plans): rotate Supabase password, apply migrations 008-013.
