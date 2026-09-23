# Surface Parity Audit — Sidebar / Sidecar vs Desktop Companion (Tabby Desk)

Date: 2026-07-19 · Branch: staging (ext 6.7.76) · Companion repo: `C:\Users\mrmal\le dev\tabatha-desktop`

Surfaces compared:
- **Extension sidebar** — `src/sidebar/index.jsx` (panels: focus / tasks / tabs / groups / stash, `index.jsx:371-377`)
- **Tabby Sidecar** (mobile web) — `sidecar/src/screens/*` + `sidecar/src/components/*`
- **Desktop companion** (Tauri "Tabby Desk") — `tabatha-desktop/src/App.jsx`, `src/components/CompanionMenu.jsx`

**What the companion has today:** active-window card + pause/resume tracking (`App.jsx:329-387`), window→intent assignment (`App.jsx:363-375, 510-517`, `AssignIntentModal.jsx`), clock in/out/break (`App.jsx:389-431`), today summary + top apps (`App.jsx:433-476`), recent activity sessions (`App.jsx:478-523`), extension pairing + install guide (`App.jsx:325-327, 527-531`, `CompanionMenu.jsx:93-125`), screen-capture toggle (`CompanionMenu.jsx:79-83, 170`), activity log (`:174`), start-on-login (`:189`), update check/badge (`:195`, `UpdateBadge.jsx`), exit (`:206`), WS server pill (`App.jsx:534`).

## Table 1 — Sidebar options missing from the companion

| Option (sidebar evidence, `src/sidebar/index.jsx`) | In companion? |
|---|---|
| Active focus display w/ countdown timer + drifted state (`:486-513`) | No — companion only shows the OS window, not the current intent |
| Start focus / new intent creator (`:622-650, 379-381`) | No |
| Resolve / Pause / Resume focus (`:515-520`) | No |
| +5m extend timer (`:523`) | No |
| Backburner focus + dock (resume / snooze / dismiss) (`:522, 722-741`) | No |
| Edit focus: label, timer, funnel stage, tags, backdate start (`:543-582`) | No |
| Checkpoint note w/ progress levels (none→stuck) (`:525, 599-618`) | No |
| Timeline view / tracked-time editing (NB-09) (`:527, 586-597, 700-702`) | No |
| Off-device toggle (idle suppression) (`:528-530`) | No |
| Sub-intent creation + nested queue render (`:531-533, 657-720`) | No |
| Queue w/ P1–P5 priority select, switch-to, resolve (`:681-704`) | No |
| Funnel stage picker (`:536-538`) | No |
| Focus history (`:743-756`) | No |
| Tasks panel: create / complete / reopen (`:91-147`) | No |
| Clock: break toggle + elapsed HH:MM:SS | **Yes** (`App.jsx:389-431`) |
| Abandoned-stint modal + concurrent-shift guard at clock-in (`:162-182, 847-853`) | No — companion `clock_in` is unguarded (`App.jsx:238-244`) |
| Sync-health chip → Sync & Account settings (`:397-405`) | No |
| Feedback widget (`:410`) | No |
| Device-paused banner / self-rescue (`:420-422`) | No |
| Quick links: settings / Work Shifts / dashboard (`:406-416`) | No |
| Tabs search+focus, tab groups, parked/Sugar Box stash (`:765-842`) | n/a-ish — browser-tab concepts; companion's Recent Activity is the desktop analog |

## Table 2 — Sidecar options missing from the companion

| Option (sidecar evidence, `sidecar/src/`) | In companion? |
|---|---|
| Full focus lifecycle: set/start, resolve, pause/resume, +5m (`screens/FocusScreen.tsx:186-192, 261`) | No |
| Off-computer toggle per focus (`FocusScreen.tsx:193, 472`) | No — ironic gap: the companion is the authority on "at computer" |
| Backburner + dock (resume/snooze/dismiss) (`FocusScreen.tsx:194, 271-273`) | No |
| Edit focus incl. backdate-minutes pills (`FocusScreen.tsx:336-342`) | No |
| Checkpoint notes + progress levels + note history (`FocusScreen.tsx:406-441`) | No |
| Sub-intents (create, switch, resolve) (`FocusScreen.tsx:199, 215, 226-227`) | No |
| Queue priority badges + switch/resolve (`FocusScreen.tsx:461-473`) | No |
| Voice input (mic on label + notes) (`FocusScreen.tsx:246, 406`, `lib/speech.ts`) | No |
| Voice check-ins (spoken nudges) (`screens/SettingsScreen.tsx:512-542`, `components/VoiceCheckIn.tsx`) | No |
| Clock screen "Your shift" w/ break (`screens/ClockScreen.tsx:62-66`) | **Yes** |
| Tasks: Asana-synced + local, blocked/tracked chips, connect Asana (`screens/TasksScreen.tsx:206-246`, `SettingsScreen.tsx:642-694`) | No |
| Simple quick-capture notes w/ mic (`screens/SimpleScreen.tsx:108`) | No |
| Recent/history screen (`screens/RecentScreen.tsx`) | Partial — app sessions only, no focus history |
| Context View (big-screen landscape display) (`screens/ContextView.tsx`, settings `:480-510`) | No |
| Phone Focus Mode (`components/PhoneFocusMode.tsx`) | n/a — phone-specific (page-visibility) concept |
| Push notifications + timer/drift/checkpoint-stale toggles (`SettingsScreen.tsx:372-380`, `lib/push.ts`) | No — companion has no native notifications for focus events |
| Work schedule + nudges + quiet hours (`SettingsScreen.tsx:548-629`) | No |
| Defaults for new intents (realm etc.) (`SettingsScreen.tsx:397-427`) | No |
| Timer mode: Simple / Pomodoro (`SettingsScreen.tsx:432-474`, `lib/pomodoro.ts`) | No |
| Devices / invites / pair-watch cards (`components/DevicesCard.tsx`, `InvitesCard.tsx`, `PairWatchCard.tsx`) | Partial — pairing exists but only extension-token, no device roster |
| Feedback (`lib/feedback.ts`) | No |
| PWA install prompt (`SettingsScreen.tsx:357-362`) | n/a — companion is already an installed app |

## Table 3 — Consolidated: what to add to the desktop companion

| # | Option | Rationale | Effort |
|---|---|---|---|
| 1 | **Current-focus card** (label, countdown, drifted state) | Companion shows *what app* you're in but not *why*; it already receives focus labels for assignment (`list_known_focuses`) | M |
| 2 | **Focus lifecycle controls**: start/set, resolve, pause/resume, +5m | Turns the desk panel into a usable control surface when the browser is closed/minimized; extension WS bridge already exists (:9147) | M |
| 3 | **Off-computer toggle** | Companion literally knows you left the computer (idle/window data) — natural home for this toggle and for auto-suggesting it | S |
| 4 | **Checkpoint note + progress levels** | Highest-value capture moment is mid-desktop-work, outside the browser | S |
| 5 | **Backburner (send + dock: resume/snooze/dismiss)** | Round-trip parity already solved sidebar↔sidecar; companion is the last surface without it | S |
| 6 | **Queue view w/ priority + switch-to** | Complements #2; "what's next" glance without opening the browser | M |
| 7 | **Sub-intent quick-add** | Cheap once #2's create path exists | S |
| 8 | **Abandoned-stint / concurrent-shift guard on clock-in** | Companion clock-in currently bypasses the double-count protection both other surfaces have | M |
| 9 | **Native notifications for timer-over / drift / checkpoint-stale** | OS-level toasts beat browser notifications when Chrome isn't focused; sidecar push proves demand | M |
| 10 | **Quick-capture note (Simple parity)** | Global hotkey + tray capture is a classic desktop-app strength | S |
| 11 | **Sync/connection health chip** | One glance: paired + cloud-synced; extension-state pill exists, cloud state doesn't | S |
| 12 | **Feedback widget** | TR-14a parity; trivial webhook reuse | S |
| 13 | **Tasks read-only list (Asana + local)** | Useful "start focus from task" springboard; full CRUD can wait | M |
| 14 | **Desktop Context View mode** (borrow sidecar ContextView for the always-on-top "desk view") | Tray already has a "desk view / always-on-top" concept (`CompanionMenu.jsx:5-12`) — feed it the big focus+timer layout | M |
| 15 | **Voice check-ins / voice input** | Desktop mic access is easy, but gate on C9/#211 schema reconciliation | L |
| 16 | Pomodoro timer mode, work schedule/nudges/quiet hours, intent defaults | Should read the same synced settings rather than grow its own UI first — settings *respect* (S) before settings *editing* (L) | S→L |
| 17 | Tabs / groups / parked / Sugar Box panels | **n/a** — browser-tab concepts; companion's Recent Activity + assignment covers the desktop analog |
| 18 | Phone Focus Mode, PWA install | **n/a** — phone/web-specific mechanics |

**Suggested order:** 3, 4, 5 (small, high leverage) → 1, 2 (core parity) → 8, 9 → the rest.
