# Feature #221 — Clock Backdating & Shift Recovery

> **Status:** 📋 Planned · **Version:** v0.5.0
> **Depends On:** #195 Retroactive Log Editing, NB-05 Abandoned Stints (`AbandonedStintsModal`), NB-09 Time-Editing Overhaul (`SET_FOCUS_START_TIME`), Work Shifts page, `clockService` / `clock.js`, `awarenessService` (`CLOCK_OUT_INSTALL`), `syncService.buildClockRows`
> **Created:** 2026-07-25
> **Source:** User, 2026-07-25
> **Category:** Time Integrity / Recovery

## User Context (Quotes)

> "Add the ability to backdate clocking in, or edit clock-out. I forgot to clock in today (I forget often) and I have no way of fixing it to my knowledge — even when I logged some time tracking. I should be able to start clock-in with recommendations based on whatever it tracked up to that point."
> — User, 2026-07-25

## Status Check (what exists today — verified)

The user's belief is **literally correct, not a discoverability problem.** There is no code path anywhere that lets you set your own clock-in or clock-out to a time other than "now."

| Claim | Verdict | Evidence |
|---|---|---|
| Clock-in always stamps `now` | **True** | `src/background/clock.js:19` — `clockedInAt: new Date().toISOString()`. `clockIn()` takes **no arguments**. |
| Clock-out always stamps `now` | **True** | `src/background/clock.js:38` — `clockedOutAt: new Date().toISOString()`. `clockOut()` takes **no arguments**. |
| A handler accepts an explicit clock timestamp | **False** | `src/background/services/clockService.js:897-961` — `CLOCK_IN` / `CLOCK_OUT` / `TOGGLE_BREAK` ignore `message` entirely except for the webhook `label`. There is **no** `UPDATE_CLOCK_SESSION` / `EDIT_SHIFT` handler in the router. |
| Work Shifts can edit a past shift | **False — it is a disabled stub** | `src/workshifts/index.jsx:262` — `<button disabled>✏️ Edit Shift <span>SOON</span></button>`, alongside a disabled `🗑 Delete`. The only editable thing on a shift row today is a **break note** (text only, `src/workshifts/index.jsx:595`). |
| NB-09's time editor can fix a shift | **False — it edits focuses, not shifts** | `SET_FOCUS_START_TIME` (`src/background/services/focusService.js:185`, impl `:1192`) moves `item.startedAt` on a **focus/intent**. It never touches `clockSession` or `clockHistory`. |
| Something can set an end time retroactively | **Partly — but only for *other* installs** | `awarenessService.clockOutInstall(...endTime)` (`:531`) accepts a user-picked `end_time` and reconstructs a `clock_sessions` row `source: 'reconstructed'` (`:560-575`). For **this** install it falls through to `deps.requestClockOut()` — which stamps `now` (`:532-535`). The `datetime-local` picker exists (`src/workshifts/index.jsx:809`, `AbandonedStintsModal`) but is unreachable for your own live session. |

**The compounding bug:** `setFocusStartTime` clamps a backdated focus start to `[clock-in, now]` (`focusService.js:1201-1207`, `validateStartTime`). So on a day you forgot to clock in until 11:00, you **also cannot** backdate a focus to 08:42 — the clamp silently pulls it to 11:00 and reports `clampedBy: 'clockIn'`. Fixing the clock-in is the prerequisite that unblocks the focus editor the user already has.

`fix/backdate-overlap-clamp` is **already merged** (branch tip `a258868` is an ancestor of `staging`; landed at v6.7.25 via `0b49c41` / PR #29). It shipped *focus* start-time backdating with overlap **reporting** (never silent resolution) and the elapsed re-clamp. The 6.7.77/6.7.78 "clamp saga" then fixed *elapsed accrual* ceilings (Koda K1/K2) — that is settled and this spec does not re-open it. Both are prior art to **reuse**, not repeat.

---

## What It Does

Makes the clock editable the way focuses already are: a shift's start and end become **user-correctable facts** with validation and an audit mark, and Tabatha **proposes** the correct start from evidence it already collected while you were working un-clocked.

### 1. Backdated clock-in

New `CLOCK_IN` accepts an optional `clockedInAt`; `clock.js:clockIn(at)` uses it instead of `now`.

| Validation | Rule |
|---|---|
| No future | `clockedInAt <= now` |
| No overlap | must not fall inside any `clockHistory` shift's `[clockedInAt, clockedOutAt]`, nor any live sibling install's open shift (reuse `fetchInstalls`) |
| Max backdate window | setting `maxBackdateHours` (default **24**, max 168) — beyond that, route to "add a past shift" instead of backdating the live one |
| Day boundary | respects the existing `dayResetHour` setting rather than midnight |
| Overlap policy | **report, don't silently clamp** — mirrors `setFocusStartTime`'s `overlaps` contract (`focusService.js:1247-1258`) |

### 2. Edit / fix clock-out

- **Past shift:** `EDIT_SHIFT { clientId, clockedInAt?, clockedOutAt?, reason }` rewrites one `clockHistory` entry, recomputes `totalMs`/`workMs`/`breakMs`, and clamps breaks into the new span. Replaces the disabled stub at `workshifts/index.jsx:262`.
- **Forgot to clock out overnight:** the abandoned-stint path already knows how to do this for *other* installs — extend `clockOutInstall`'s self-branch (`awarenessService.js:532`) so that when the target **is** self, an `end_time` is honoured instead of being discarded for `now`. This makes `AbandonedStintsModal`'s existing end-time picker work on your own machine.
- **Never-clocked-out live session:** if `clockSession.active` and `clockedInAt` is older than `maxShiftHours` (default 16), offer "end it at 〈last evidence〉" rather than crediting the whole overnight.

### 3. The recommendation engine

When the user clocks in and evidence shows activity *before* now, Tabatha offers a start time. Ranked, first available wins; all candidates are shown so the user can pick a different one.

| Rank | Evidence source | Where it lives | Why this rank |
|---|---|---|---|
| 1 | Companion OS window activity (first non-idle window today) | desktop companion activity DB → `companionRecentSessions` (`companionService.js:498`) | OS-level: proves the machine was in use even outside Chrome |
| 2 | First focus/intent started today | `focusEngine.items[].startedAt`, `focusHistory` | strongest *intent* signal — the user declared work |
| 3 | First capture frame today | `cortexCaptureState.lastCaptureAt` + day index (`captureService.js:160`) | frames only exist while working; precise but capture may be off |
| 4 | Earliest tracked tab activity today | `timeTracking.byTab[].openedAt` (`tabService.js:149`) | broad but noisy — a tab can be open without you |
| 5 | First calendar meeting today | `calendarService` `GET_CALENDAR_EVENTS` | good for meeting-first mornings; weakest (meetings get skipped) |

**Presentation (never silent):**
- Home clock bar, on clock-in: *"You've been active since **8:42 am** (desktop activity). Start your shift then?"* → **[Start at 8:42] [Now] [Pick a time…]**.
- The chosen source is named in the confirmation and stored on the record — an unattributed proposal is not acceptable.
- If sources disagree by >30 min, show the two nearest candidates side by side rather than picking for the user.
- **Nothing applies without confirmation.** A dismissed proposal falls back to `now` and is not re-offered that day.

### 4. Surfaces

| Surface | Actions | Why |
|---|---|---|
| **Home clock bar** | Backdate proposal on clock-in; "fix start" on the live shift | The moment of the mistake — the only place that catches it same-day |
| **Work Shifts → shift row** | Edit start/end/breaks; delete; add a missing past shift | Where the user goes when they notice days later; the stub already sits here |
| **Work Shifts → Live Stints / `AbandonedStintsModal`** | Set the real end time for your own abandoned shift | The picker already exists — only the self-branch is missing |
| **Sidebar** | Surface the proposal banner only; deep-link to Work Shifts | Sidebar is narrow — full editing belongs on the page |
| **Sidecar (phone)** | View + confirm a pending proposal; **no** free-form shift editing in v1 | Phone is the surface most likely to be used *away* from the evidence; and every extra writer widens sync Root Cause D |
| **Companion** | Evidence provider only — never writes a shift | Keeps a single writer for `clockHistory` |

### 5. Audit

- Every backdate/edit calls `logAudit` (`activityAuditService.js:15`) with a new action set: `BACKDATE_CLOCK_IN`, `EDIT_SHIFT`, `RECONSTRUCT_CLOCK_OUT`, carrying `previousState` (the pre-edit `{clockedInAt, clockedOutAt, breaks}`), `newState`, and `metadata: { reason, evidenceSource, proposedMs, acceptedMs }`. `previousState` makes the edit **revertible**, matching `selfCorrectionService`'s pattern.
- The shift record itself gains `edited: true`, `editedAt`, `editedBy: 'user'`, and `source: 'user_edited'` (or `'reconstructed'` when derived from evidence). `buildClockRows` (`syncService.js:662`) already passes `session.source` straight through — so the mark reaches `clock_sessions` with no schema fight.
- Work Shifts renders an "edited" chip on any such row with a hover showing original → new.

---

## Implementation Notes

- **`clock.js` stays pure.** `clockIn(at)` / `clockOut(at)` take an optional ISO string defaulting to `new Date().toISOString()`. All validation lives in `clockService` so `clock.js` remains trivially testable (it is the only module with no injected clock today).
- **Stable `client_id` is the sync hazard.** `buildClockRows` falls back to `makeClientId('clock', clockedInAt, clockedOutAt)` (`syncService.js:681`) — so **editing a shift's times changes its `client_id` and inserts a duplicate row** instead of updating. This is exactly the shape of **sync forensics Root Cause D** (clock adoption duplicating shifts, hours inflated ~2.5×; 2026-07-21 stored as ~12h across five rows for one ~4.9h shift — `docs/taskrun/2026-07-24-morning-report.md:86`). **Mandatory:** mint an immutable `session.id` at clock-in and always prefer it, so edits UPDATE. Backfill ids for existing history on first run.
- **Watermark regression.** `buildClockRows` skips any session whose `clockedOutAt <= lastClockSync` (`syncService.js:673`). An edited *older* shift would never re-upload. Editing must bump a dirty-set or rewind `lastClockSync` to the edited shift's out-time.
- **Reuse `validateStartTime`.** The overlap-interval machinery in `focusService.js:1210-1227` is the same problem in a different table; extract it to a shared pure helper (`src/utils/timeValidation.js`) rather than writing a second one. Keep the "overlaps are **reported**, the user's chosen time stands" contract that shipped at v6.7.10.
- **Unblock the focus clamp.** Once clock-in moves earlier, `setFocusStartTime`'s `clockInMs` lower bound moves with it — after a backdate, offer "re-apply your earlier focus start?" for any focus that was `clampedBy: 'clockIn'` today.
- **Do not touch elapsed clamping.** The 6.7.77/6.7.78 ceilings are settled and Koda-cleared; shifts and focus-elapsed are separate ledgers. Backdating a shift must not retro-credit focus `elapsedMs`.
- **Companion evidence is read-only over the existing bridge** — no new permission, no new WS message type if `companionRecentSessions` already carries first-activity timestamps.

## Open Questions

1. Should a backdated clock-in **also** auto-create a placeholder focus for the un-tracked span ("Untracked — 8:42–11:00"), or leave the span as shift-only time with no intent attached?
2. `maxBackdateHours` default — 24h (today + yesterday's tail) or 72h (covers "noticed on Monday")? Anything past the window becomes "add a past shift," which needs its own no-overlap check.
3. Should the proposal fire **proactively** (a nudge at first activity: "not clocked in — want to start at 8:42?") or only reactively at clock-in? Proactive catches more, but #210/#194 nudge budget is already contested.
4. Team/role gating — #195 asks for "admin can restrict members from editing their own logs." Ship v1 self-only and defer the role gate to #138 Team Auth?
5. Does an edited shift need to notify other signed-in installs (a `CLOCK_SESSION_EDITED` broadcast), or is the next sync cycle sufficient?

## Related Features

- **#195** Deep Edit / Retroactive Log Editing — the parent ask ("I was working but forgot to clock in — add 2 hours here"); this feature is its clock-side slice
- **NB-05** Abandoned Stints — the existing reconstruct-with-`end_time` path this extends to self
- **NB-09 / #156 / #157** Time-Editing Overhaul — focus-side equivalent; source of `validateStartTime` and the overlap contract
- **#187** Auto Clock-In on Startup — reduces how often the mistake happens; `maybeAutoClockIn` (`clockService.js:216`) already refuses to clock in over unresolved abandoned shifts
- **Sync forensics Root Cause D** — clock adoption duplicating shifts; the `client_id` rule above is the guard against re-creating it
