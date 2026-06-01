# Tabatha Changelog

All notable changes to the **Tabatha** extension will be documented in this
file.

---

## [v6.1.0] - Plan 037 Focus Time Editing + Plan 036 QA fixes - _2026-05-29_

### Added

- **Focus time editing** (Plan 037): the checkpoint timeline (📊) gains a "🛠 Adjust tracked time" row — quick deltas (−5m/−1m/+1m/+5m), a set-exact-minutes input, and **Remove last pause** (restores the time a pause ate and reactivates the focus). New handlers `ADJUST_FOCUS_TIME`, `SET_FOCUS_ELAPSED`, `REMOVE_LAST_PAUSE`, all clamped to wall-clock time and audit-logged.
- **Auto-pause master toggle** (`autoPauseEnabled`): Settings → Focus Lifecycle. When off, going idle never mutates any focus — not even a prompt.

### Fixed

- **Off-device focuses are no longer paused by idle.** Both `handleIdleStateChanged` and `hardPauseActiveFocus` now exempt `offDevice` focuses, fixing the time-data corruption where an off-device focus was silently paused while the user worked outside Chrome.
- **Tooltips no longer clip off-screen.** Tooltip x-position is clamped to the viewport and long text wraps (max 280px) — fixes the cut-off tooltips in Settings and everywhere else.
- **Meeting-domain editor**: the textarea now splits on newlines only (not commas), shows a format placeholder + Enter hint, and stops host-page keyboard shortcuts from intercepting input.

---

## [v6.0.0] - Plan 036 Intelligent Focus Lifecycle — Smart Idle + Auto-Focus + Drift - _2026-05-29_

Absorbs Plans 026 (Auto Focus) and 029 (Auto-Pause Overhaul). Resolves bugs B05/B08 and addresses features #149–#152, #187. Incorporates the challenge-audit resolutions (multi-profile sync race, meeting detection, drift false-positives, prompt-storm mitigation).

### Added

- **Smart Idle Engine** (`clockService`): before pausing the global focus, `collectIdleSuppressors()` consults (a) other browser profiles via the awareness cache, (b) desktop-companion activity within a configurable grace window, and (c) a hardened 3-layer `isUserInMeeting()` scan (all open tabs + companion app), so muted/backgrounded meetings and cross-profile activity no longer trigger false pauses. When idle is genuine, an `IDLE_PROMPT` is shown ("Yes, on task" / "I diverged" / "Pause focus") instead of a silent hard-pause; an unanswered prompt falls back to a hard pause after 5 minutes. Legacy hard-pause is still available via the "Prompt before pausing" toggle.
- **Multi-profile idle state** (`awarenessService`): each profile now publishes its Chrome idle verdict in the `browser_profile_status.metadata` jsonb (no schema migration) and surfaces it in the `_otherProfiles` cache, fixing the multi-profile sync-override hazard where an unattended profile could pause an actively-worked focus account-wide.
- **Auto-Focus heuristic engine** (`autoFocusService`): when no focus is active, tab activations/navigations are matched against URL rules (explicit auto-create), category/domain groups (high confidence), and the companion app category (medium), surfacing a non-blocking InBar chip that auto-fades after 8s. A per-domain exponential decay engine (30→60→120→240→480m) suppresses repeat prompts after dismissal.
- **Context drift detection** (`autoFocusService`): a 5-layer association hierarchy (direct association, companion overrule, URL-rule intent, category/domain-group, hostname) plus a localhost/chrome:// whitelist decides whether a tab counts as drift. A wandering→drifted state machine (armed by the `auto-focus-drift` alarm at `driftThresholdMinutes`) raises `FOCUS_DRIFT_DETECTED` with "Still working / Switching / Just checking" options and emits a `context_drift` webhook.
- **Auto clock-in (#187)**: optional, with a configurable trigger — "When Chrome opens" (default, via `runtime.onStartup`) or "On OS unlock" (via the desktop companion's idle→active transition).
- **Companion bridge helpers** (`companionService`): `lastHeartbeat`, `getActiveApp`/`getActiveAppCategory`, and `isRecentlyActive(grace)` for the idle and drift engines.
- **Settings → 🧠 Focus Lifecycle** panel: idle behaviour (prompt toggle, thresholds, companion grace, meeting-domain editor), auto-focus (enable, confidence, dismissal-history viewer/clear), drift detection (enable + thresholds), and auto clock-in (enable + trigger). URL Rules gain a per-rule **🎯 Auto-create focus** toggle.

### Changed

- Idle handling no longer mutates the global focus when the user is active on another profile, in another desktop app, or in a meeting — it only updates this profile's own status.

---

## [v5.8.0] - Plan 031 Gap Completion — Auto-Checkpoint + SectionNav + Sub-Focus + Backburner Fixes - _2026-05-28_

### Added

- **Auto-Checkpoint System** (`focusService.autoCheckpoint`): Lifecycle transitions (started, paused, resumed, completed, backburnered) now automatically generate system checkpoint entries. These appear in the Checkpoint Timeline with ⚙️ prefix at 60% opacity, distinguishable from manual user-submitted notes. System entries do not count toward the badge number or trigger stale-nudge timers.
- **Sub-Focus Button** (FocusBar): `📌 Sub-focus` button in the FocusBar action row. Creates a child focus under the currently active parent. Queue items with a parent now display a purple `child` badge.
- **SectionNav Sidebar Refactor**: Homepage navigation sidebar is now hover-expandable (44px icons → 160px icon+title on hover). Smart click logic: clicking an active section collapses it; clicking a different section navigates to it and auto-expands. Collapsed sections drop to the bottom of the sidebar with a divider and line-through styling. Collapsed section headers no longer render in the page body (zero-height anchor only), saving vertical real estate.
- **Feature Spec #209** (`docs/features/209-focus-resolution-tab-cleanup.md`): Documented the Focus Resolution & Tab Cleanup feature for future implementation.

### Fixed

- **Backburner create-new-focus skeleton** (Critical): When backburnering a focus and choosing "Create New", the replacement focus object was missing 12 fields (`funnelStage`, `timerMinutes`, `createdAt`, `pausedAt`, `endedAt`, `overMs`, `parentFocusId`, `contextSwitchCount`, `priority`, `offDevice`, `lastCheckpointAt`, `checkpointSnoozedUntil`). These undefined values broke the priority dropdown, funnel stage picker, and timer display. Now uses the canonical field set matching `startFocus`.
- **Backburner tab association inheritance**: Create-new-focus during backburner now inherits `associatedTabIds` from the backburnered focus and cross-links via `backburnerTransitionFocusId` for audit trail.
- **`addFocus` missing priority**: The `addFocus` function (used when adding to queue) was missing the `priority` field, causing the priority selector in FocusQueue to render undefined. Now defaults to P5.
- **Checkpoint badge count inflation**: The `📋 (N)` badge on the FocusBar was counting all checkpoint entries including system auto-entries, inflating the number. Badge now filters to user-only; timeline visibility uses total count.
- **Video call idle suppression**: Idle detection now checks both audible meeting tabs (existing) AND the active tab's URL against meeting domain patterns (Meet, Zoom, Teams, WebEx). Prevents premature auto-pausing during muted calls or meeting waiting rooms.
- **Regression RT-2**: LogsPanel type column added (replaces colored badge in details column).
- **Regression RT-7**: Category override logic for domain-specific patterns (Meet → Communication, Scholar → Research).

---

## [v5.3.0] - Plan 028 Phase D₂ — companion as a first-class install + clock-stacking warning + invite revocation - _2026-05-19_

### Added

- **Desktop companion proxy-registers as a `browser_profiles` row** (`browser='desktop_companion'`). On every WebSocket connect the extension SELECTs-or-INSERTs the companion's row and caches its id locally as `_companionBrowserProfileId`. Migration 013 adds a partial unique index `(profile_id, browser)` WHERE `browser IN ('desktop_companion', 'mobile_ios', 'mobile_android', 'tabatha_web')` so concurrent races resolve cleanly.
- **`companionInstallService`** heartbeats the companion's `browser_profile_status` row every 60 seconds while WS is connected; pushes immediately on `CLOCK_STATE` messages from the companion; flips `online=false` on disconnect. The awareness chip strip and Team Activity panel now render the companion alongside browser profiles (💻 icon).
- **Clock-stacking warning.** Home dashboard and sidebar `CLOCK_IN` paths consult the cached `_otherProfiles` awareness data; if any other non-personal install is currently `clocked_in` or `on_break`, a confirm dialog lists them before allowing a second concurrent shift to start. Personal installs are excluded from the check because they have no clock.
- **Pending Invites list** in Settings → Sync & Account → Team Activity. Org owners and managers see all unredeemed, unexpired tokens for their orgs with a per-row Revoke button (direct `DELETE` against `invite_tokens` — RLS gates server-side). The Generate Invite flow auto-refreshes the pending list on mint.

### Changed

- **Desktop activity attribution.** `syncService.buildDesktopRows` now stamps `desktop_activity` rows with the companion's `browser_profile_id` instead of the extension's whenever a companion install exists. Existing rows pre-D₂ remain attributed to the extension — that's acceptable; future companion activity is correctly scoped.
- **Awareness chip icons** prefer `BROWSER_ICON[row.browser]` over `CLASSIFICATION_ICON[row.classification]` so the companion (💻), future mobile (📱), and web (🌐) installs are visually distinct from Chrome profiles.

### Migration

Run `supabase/migrations/013_companion_install_uniqueness.sql`. The unique index is partial — Chrome browser_profiles stay free-form so users with multiple Chrome profiles on one machine continue to work.

### Out of scope (still parked for Phase D₃+)

- Multi-machine companion support (today: one companion per user). A stable per-machine identifier on `profile_path` is the next step.
- Mobile app(s) (iOS / Android) registering their own `browser_profiles` rows. The schema and unique index are already in place; the mobile clients need to do the upsert themselves.
- Auto-update distribution via Chrome Web Store / signed CRX (Plan 019).

---

## [v5.2.0] - Plan 028 first slice — Team Activity + Invite Mint + profile realtime - _2026-05-19_

### Added

- **Team Activity panel** (Settings → Sync & Account) for org owners and team managers. Lists each member you can see, with their browser-profile installs and live awareness chips. Refreshes via Supabase Realtime on every status change.
- **Generate Invite Token** mint UI. Org owners and team managers/sub-managers can mint tokens directly from Settings — pick org, optionally a team, role, and expiry hours; copy the resulting token. Pairs with the existing redemption flow.
- **Manager RLS scoping** (migration 012) for `tabatha.browser_profiles`, `tabatha.browser_profile_status`, and `tabatha.profiles`. Org owners can read all members in their orgs; team owners/managers/sub-managers can read their team members. Insert/update/delete remain own-row.
- **`tabatha.profiles` realtime subscription** in `useAuth` — `display_name`, `avatar_url`, `default_realm` etc. update live across browsers without a page reload.

### Fixed

- **`useChromeStorage.update` race condition.** The `valueRef`-based update path could be one render stale, letting rapid concurrent writes overwrite each other (the lingering "Profile Name doesn't save on one of my browsers" report). Replaced with functional `setValue(prev => …)` so `prev` is guaranteed to be the latest committed state. Universal fix — covers every callsite, not just the install identity.

### Migration

Run `supabase/migrations/011_add_profiles_to_realtime.sql` then `012_manager_scoping_and_invite_mint.sql` before relying on Team Activity or live profile updates.

### Out of scope (still parked for Phase D₂+)

- Desktop companion registers as a `browser_profiles` row (`browser='desktop_companion'`).
- Mobile app(s) follow the same identity pattern.
- Auto-update distribution via Chrome Web Store / signed CRX (Plan 019).

---

## [v5.1.1] - Phase A race fix + classification explainer + invite-token note - _2026-05-19_

### Fixed

- **Classification picker stuck on Professional / wouldn't save.** The eager-init useEffect's storage write was racing the user's first edit — `valueRef.current` could still be the stale DEFAULT, and the second write clobbered `localId` back to null. New self-healing `writeIdentity` ensures `localId` + `createdAt` exist on every write, so the race is impossible. Same fix covers profile-name edits.

### Added

- **Per-classification explainer** beneath the Classification picker, updates live with the selection. Covers what each of Business / Professional / Work / Personal *means* in terms of clock visibility, default realm, and cross-profile presentation.
- **Per-option tooltips** on each Classification dropdown option.
- **Invite Token clarification.** Added a small explainer above the Team Invite Token input noting that redemption works end-to-end but token *creation* doesn't have UI yet — admins generate tokens directly in the cloud console. The mint UI ships with the manager dashboard.

---

## [v5.1.0] - Multi-Profile Awareness Sync Phase C + Phase A polish - _2026-05-19_

### Added

- **Cross-profile awareness substrate** (`tabatha.browser_profile_status`). Each install upserts its own row with clock state + active focus state on every transition; refreshes a `last_heartbeat_at` on a 60-second tick. Other installs subscribe via Supabase Realtime and render compact chips on the home dashboard ("Personal 🏠 · 🎯 Slack · 6m").
- **`awarenessService.js`** — manages heartbeat, debounced state pushes, realtime subscription, and the `_otherProfiles` local cache.
- **`OtherProfilesStrip` component** + **`useOtherProfiles` hook** — render the awareness chips with stale/offline dimming when no heartbeat in 5 minutes.
- **Eager Install ID initialisation** in the `useInstallIdentity` React hook so the UI is responsive immediately, not blocked on the first sync.
- **Save feedback** in Settings → Browser Profile: "saving… / ✓ saved / save failed" pill next to the section header.
- **Immediate cloud push on Classification change** (no longer waiting for the next sync alarm).

### Changed

- **Verbiage:** "Supabase" replaced with "cloud" / "Account" / "database" in user-facing copy. The settings sidebar entry "☁️ Sync & Supabase" is now "☁️ Sync & Account"; the re-pull dialog says "re-pull from the cloud"; the workshifts export stub says "Sync to Cloud".

### Migration

Run `supabase/migrations/010_add_browser_profile_status.sql` before the cross-profile awareness chips will populate. Adds the status table, RLS policies, and adds the table to the `supabase_realtime` publication.

### Known limitations / out of scope

- The desktop companion does not yet register a `browser_profiles` row (`browser = 'desktop_companion'`); awareness chips for the companion will arrive in Phase D.
- Clock-stacking warnings (when multiple non-personal profiles clock in simultaneously) are visualised by the chips but not yet inline-blocked. Deliberate — we want to observe stacking patterns before deciding the UX.
- Manager-scoped views over org_members' profiles still rely on a future RLS expansion.

---

## [v5.0.0] - Multi-Profile Awareness Sync Phase A+B - _2026-05-19_

### Added

- **Per-install browser-profile identity** stored locally in `_browserProfile` (chrome.storage.local). Each Chrome profile on each machine gets a stable `localId` on first run and a `supabaseId` on first sync.
- **`tabatha.browser_profiles` is now active.** Every install upserts a row carrying its classification, profile name, and `last_seen_at`. The table has been present since migration 001; this release wires it up.
- **Classification axis** (per-install): Business / Professional / Work / Personal. Distinct from the user-level `profiles.default_realm`. Picker lives in Settings → Appearance → "This Browser Profile".
- **Bootstrap pull of org registry.** On first sync after sign-in, every `tabatha.{operations,initiatives,clients,projects,tasks_registry}` row for the user is fetched and merged into local `tabathaOrg` by name (case-insensitive). Prevents duplicate clients/projects/tasks when signing in on a second browser profile or machine.
- **`↻ Re-pull registry`** button in Settings → Sync — clears the bootstrap watermark and re-runs the merge on demand.
- **Stamp `browser_profile_id`** on every push: `focus_items`, `intent_history`, `clock_sessions`, `desktop_activity`, `operations`, `initiatives`, `clients`, `projects`, `tasks_registry`. The server can now attribute every row to the install that produced it.
- **`useInstallIdentity()` React hook** exposes `{ identity, isPersonal, isReady, setClassification, setProfileName }` to UI surfaces.

### Changed

- **Personal-classified profiles hide clock-in / clock-out / break controls** in the home dashboard's Shift Controls section, the sidebar header, and the Command Palette. Time-and-attention breakdowns (UnifiedTimeline, AnalyticsDashboard, workshifts) remain visible everywhere.
- **`applyDefaultRealm` (focusService)** now reads `_browserProfile.classification` first, falling back to the legacy `tabathaSettings.defaultRealm`. New focuses created on a Personal profile default to `realm=personal` independent of the user-level default.
- Settings → Appearance → Browser Profile rebuilt into a "This Browser Profile" card: Install ID (last-12 of supabaseId), editable Profile Name, Classification picker.

### Migration

Run `supabase/migrations/009_add_browser_profile_stamp.sql` before relying on the new stamping behaviour. Until 009 is applied, push diagnostics will report column-missing errors for `browser_profile_id`.

### Required next steps after install

1. Set the **Classification** for this browser profile in Settings → Appearance.
2. Hit **↻ Sync now** in Settings → Sync to register the install in `tabatha.browser_profiles`.
3. When signing in on a second browser profile or machine, the bootstrap pull runs automatically on the first sync. Use **↻ Re-pull registry** to re-run it manually.

### Out of scope (deferred to next plan)

- Realtime awareness pings (cross-profile focus/clock chips).
- Clock-stacking warnings when multiple non-personal profiles are clocked in.
- Personal-profile "see-all-my-activity" aggregated dashboard.
- Manager-scoped views over employees' browser profiles.

---

## [v4.7.6] - Supabase sync Batch 1 durable data coverage - _2026-05-18_

### Added

- Added Supabase migration 008 for durable local data: operations, initiatives, clients, projects, task registry, clock sessions, and desktop activity.
- Extended `syncService` to push `tabathaOrg`, completed focus history, `clockHistory`, `companionRecentSessions`, and `desktopActivity`.
- Added watermarks for clock and desktop activity sync (`lastClockSync`, `lastDesktopActivitySync`) and storage-change sync triggers for direct page writes.

### Changed

- Focus sync now includes `focusEngine.history` as completed rows in `tabatha.focus_items`, not only active/queued items.
- Clock-out now explicitly queues a Supabase sync in addition to the regular storage-change/alarm paths.

### Required Supabase migration

Run `supabase/migrations/008_add_batch1_sync_tables.sql` before relying on Batch 1 sync tables. Until migration 008 is applied, the Sync Status panel will report table-specific upsert failures.

---

## [v4.3.0] - Plan 025: Popup Harmony + Checkpoint Progress Notes + Context-Link - _2026-05-17_

### Added

- **Singleton Popup Coordination** (#185): FTE/WBP overlays no longer stack across tabs. A `_activePopup` storage key tracks the active overlay; all other tabs skip rendering. Actions taken on any surface (home, sidebar, InBar) broadcast `POPUP_DISMISSED` to auto-clear stale overlays everywhere.
- **Enhanced FTE CTAs**: Focus Timer Expired card expanded from 2 buttons to 6: ⏱️ Extend 5m, 🔄 Switch Focus (inline picker), ⏸ Pause, ☕ Step Away (break), ✅ Complete, 📝 Add Note.
- **Combo Popup** (FTE + WBP): When the focus timer expires while the user is away, a single merged `FOCUS_RETURN_COMBO` card shows idle duration (with seconds) + all FTE CTAs + Resume. Replaces the previous two-popup stack.
- **Configurable WBP Thresholds**: `welcomeBackMinIdleMinutes` (default 5) and `welcomeBackShowAfterBreak` (default true) in Settings → Follow-through Support.
- **Off-Device Tag**: Boolean on focus items — when true, suppresses FTE/WBP/nudge popups and Chrome notifications. Toggle in home FocusBar and sidebar.
- **Checkpoint Progress Notes** (#184): Timed auto-prompts at configurable intervals (`checkpointIntervalFraction`, default ⅓ of focus timer). Progress levels: `stuck` (0), `none` (0), `little` (1), `lot` (3), `almost_done` (4). Each CPN stored with `progressValue` for future scoring.
- **CPN Snooze**: "Remind me in 5 min" on checkpoint prompt defers re-prompt.
- **CPN Smart Suppression**: Auto-prompt skipped when a subtask/linked task was recently completed (only checked when subtasks exist).
- **InBar Manual Checkpoint** (📋): Amber-highlighted button when no checkpoint logged in 30+ minutes. Opens inline CPN overlay with progress-level buttons.
- **InBar Staleness Signal**: Pulsing amber dot on the checkpoint button when `lastCheckpointAt` exceeds `checkpointStaleMinutes` (default 30).
- **Sidebar Checkpoint**: 📋 button in sidebar focus panel with inline textarea + progress-level buttons.
- **Home CPN Timeline**: Collapsible checkpoint history in the FocusBar with timestamped entries.
- **Follow-through Support Settings**: New settings section with toggles for checkpoint prompts, interval fraction slider, staleness threshold, WBP min idle, and Asana auto-post.
- **Context-Link Indicator** (#186): InBar center label shows 🔗 (linked) or ⚡ (unlinked) icon based on whether the current tab is in `activeFocus.associatedTabIds`.
- **Window Counts** (#186): Home FocusBar and sidebar focus card now display unique window count alongside tab count (e.g. "3 tabs · 2 windows").
- **CPN → Follow-Through Heatmap**: ActivityHeatmap's "Follow-Through" view now counts both focus completions and checkpoint note submissions per day.

### Changed

- **`GET_INBAR_DATA` response** expanded with `isTabLinked` (boolean) and `windowCount` (computed via `chrome.tabs.get` across associated tabs).
- **`focusService` alarm routing**: `checkpoint-prompt-{focusId}` alarm created on `startFocus()`, cleared on complete/pause/switch.

### Feature Docs

- `docs/features/184-checkpoint-progress-notes.md` — CPN data model, behavior spec, settings
- `docs/features/185-popup-harmony.md` — Singleton coordination, combo popup, WBP thresholds
- `docs/features/186-context-link-indicator.md` — Link indicator, window counts

---

## [v4.0.0] - Cumulative release: v3.0 → v4.0 + Plan 023 service decomposition - _2026-05-14_

This is the first cumulative release going to `staging` since `v3.0.0`. It carries
**~35 intermediate development versions** (v3.12.4-α → v3.34.5) that lived on the
integration branch but never landed on `staging`, plus the Plan-023 background
service decomposition (v3.34.5 → v4.0.0). The version was bumped to MAJOR as a
marker for the magnitude of the drop, not because of any individual breaking
change in the ledger sense.

> **Action required after install:** apply [`supabase/migrations/005_add_profile_defaults.sql`](supabase/migrations/005_add_profile_defaults.sql) in the Supabase SQL Editor. Without it, your profile select fails silently and Supabase sync never pushes any data. See **Required Supabase migration** below.

---

### 🚀 Added — Major features delivered in this window

- **Intent-to-Focus Bridge** (v3.34.5): typing an intent on a tab can auto-queue/auto-create a matching focus item, configurable via `intentBridgeMode` (`manual` / `smart_dedup` / `always`).
- **Create Focus from Tab** + **Browser Profile Identity** (v3.34.5): each browser profile gets a stable ID stored in `chrome.storage.local.browserProfileId` for cross-device routing.
- **Sidebar edit parity + InBar create focus** (v3.31.5): edit dropdown, refresh button, focus queue mutations from sidebar match home parity.
- **Project / Client tag editing** (v3.30.5): live edit of focus tags (`realm`, `client`, `project`, `task`) on the active focus.
- **Activity Editor + Timeline breaks + Webhook intervals** (v3.29.5): per-entry trim/split/merge, manual break insertion on the timeline, configurable webhook firing cadence.
- **Desktop Activity editor** (v3.25.2): trim/clear tools for desktop activity captured via companion bridge.
- **Sidebar intent creation with timer parity** (v3.24.2): new-focus input now lives in sidebar too.
- **Timeline today-filter** (v3.23.2): desktop activity timeline scoped to current day by default.
- **InBar layout overhaul + URL pause matching** (v3.21.0): paused-intent state survives URL changes when the new URL still matches the pattern.
- **Task storage migration + funnel stage state machine** (v3.20.0): legacy `tasks[]` array → structured `tabathaOrg.tasks` registry. Funnel stages canonicalized: `unsorted → todo → focus → addressing → resolved → roadblocked`. One-time, flag-gated migration runs once per profile.
- **Multi-task picker + auto-fill cascade + business attribution + task CRUD** (Tier-3): hierarchy-aware task selection, parent → child tag inheritance.
- **Org hierarchy + stage editing + resolution tracking** (Tier-3): full org-tree view with stage editor.
- **Initiatives panel** (Tier-3): roll-up of focuses by initiative across the org tree.
- **AnalyticsDashboard** (post-3.12.4): 5 stat cards (focuses today, focus time, completion rate, streak, open tasks), top-focuses bar chart, category-time breakdown, context distribution.
- **ActivityHeatmap** ×3 (v3.12.4-α): GitHub-style 365-day contribution graph with three views — Browser, Overall, Follow-Through.
- **ProjectsClientsPanel + InitiativesPanel** (v3.12.4-α): full client/project view.
- **KeyboardShortcuts + VoiceInput** (v3.12.4-α): expanded keyboard chords and voice intent capture.
- **InBar Edit Dropdown** (v3.12.4-α): ✏️ inline panel for intent edit, focus assignment, new focus creation.
- **InBar Intent/Focus Split** (v3.12.4-α): tab intent and central focus shown separately with divider.
- **Focus Pause/Resume + Focus Edit + Side-Quest Auto-Pause** (v3.12.4-α): paused focuses move to queue with amber styling; resume reactivates timer.
- **Auto-Park paused tabs on close** (v3.12.4-α): paused tabs auto-park with their sticky-note preserved.
- **Tab label editing + Link Tab to Intent** (v3.12.4-α): inline rename, tab-picker dropdown for intent linking.
- **Collapsible homepage sections** (v3.12.4-α): persisted collapse state for every section.
- **Data Retention Alarm** (v3.12.4-α): daily prune of companion/desktop activity older than configurable threshold (default 90d).
- **LogsPanel overhaul** (v3.12.4-α): 8 log types with toggleable filter chips and pagination (50/load).

### 🆕 Added — v4.0.0 quality-of-life

- **Editable display name** in Settings → Account: click your name to edit. Writes through to `tabatha.profiles.display_name`.
- **Manual `Export Markdown` button** in Settings → Export & Agents: downloads a snapshot of active tabs, contexts, closed sessions, and time tracking on demand. The auto-export alarm continues to work as before.
- **Sync Status panel** in Settings → Account: shows last successful sync time and a recent-events log of any sync diagnostics (no profile row, missing columns, upsert errors, etc.). Surfaces failures without needing the Service Worker DevTools console.

### 🔧 Internal — Plan 023 service decomposition

- **Background service decomposition**: `background.js` collapsed from 2,920 lines (staging) → 169 lines (orchestrator only). Runtime message routing, listener registration, and alarm dispatch now live in dedicated services: `tabService`, `focusService`, `taskService`, `clockService`, `clockTickService`, `tabTrackingService`, `categoryService`, `sessionService`, `notificationService`, `settingsService`, `groupService`, `blockgateService`, `companionService`, `alarmService`, `syncService`.
- **Alarm consolidation**: three `chrome.alarms.onAlarm` listeners merged into a single dispatcher in `alarmService`; `supabase-sync` is auth-guarded before dispatch (skipped when no Supabase session, no longer enters `syncToSupabase` and bails inside).
- **Storage caps**: `intentHistory`, `closedContexts`, `sessions`, `sugarBox`, and `focusEngine.history` archived through `archiveBeforeCap` instead of being silently truncated.
- **Settings → Storage** block: `settings.storage.*` with additive migration. New tunables: `sugarBoxCap`, `snapshotIntervalMinutes`, `archivedTasksColdAfterDays`, `parkedTabsWarnAt`, `pendingTimeLogsWarnAt`, `focusHistoryCap`, `closedContextsCap`, `intentHistoryCap`.
- **Companion reconnect** is now exponential-backoff capped at 30s instead of constant fast retry.
- **`COMPANION_IDLE_STATE`**: transitional broadcast — companion-detected idle is now mirrored to all extension pages.
- **`clockTickService`**: shared 1Hz tick broadcaster (`TICK_SUBSCRIBE`, `TICK_UNSUBSCRIBE`, `GET_TICK_STATUS`) so extension pages can stop running per-component intervals.
- **`PARKED_TABS_WARNING` broadcast**: one-shot when parked tabs hit `settings.storage.parkedTabsWarnAt`.
- **`STORAGE_CAP_WARNING` broadcast**: emitted when sugarBox entries fall off the cap.

### 🐛 Fixed — Critical pre-Plan-023 fixes

- **Critical: data loss + break/focus sync + funnel reorder**: prior to v3.13 a race in clock+focus state machines could discard active-focus state on break end.
- **Critical: TDZ + API consistency**: temporal dead-zone errors during boot caused unpredictable startup state.
- **InBar `SET_INTENT` was silently dropped** (v3.22.1): handler was missing entirely from the background router until this fix.
- **Drifted-focus timer extension preserved elapsed time** (v3.22.1): previously reset to zero on extend.
- **Duplicate notification listeners** (v0.2.5-α): merged into single handler; eliminated service-worker unpredictability.
- **`activeTabId` ReferenceError** in welcome-back notification — replaced with `WINDOW_ID_CURRENT`.
- **`triggerSync` excessive firing** (v0.2.5-α): auth-session guard added.
- **`useChromeStorage` stale closure** (v0.2.5-α): `update` callback now uses `useRef` to avoid capturing stale `value`.
- **`patternToRegex` double-escape** (v0.2.5-α): rewrote to split on `*` first, escape segments individually.
- **Status normalization** (v3.17.24): inconsistent display of `complete` vs `completed` across UI surfaces.
- Stage pills, palette nav, task delete, InPop nesting, stage-state sync, paused→resolved transitions, T2.1/T2.3/T4.2 surface fixes (v3.17.13 → v3.17.24): cluster of post-merge user-testing fixes.
- **`logEvent` was used before it was defined** in background.js — defined.
- **Timeline tooltip clipping** (v3.0.0-α): portal'd to `document.body` to escape backdrop-filter containing block; max z-index applied.
- **Corner radius / InBar label fallback / responsive FlipClock / task delete confirm**: UI polish.

### 🐛 Fixed — v4.0.0 cleanup pass (this release)

- **Completed-focus counter never incremented**: AnalyticsDashboard read `intentHistory` for resolved counts, but `completeFocus()` moves items into `engine.history`. Two storage keys, never crossed. The dashboard now sources resolved focuses from `focusHistory` directly. ([src/home/AnalyticsDashboard.jsx](src/home/AnalyticsDashboard.jsx))
- **Streak counted only queue items**: extended to include `engine.history` and the currently-active focus, so a day where you only completed focuses still counts in the streak. ([src/home/AnalyticsDashboard.jsx](src/home/AnalyticsDashboard.jsx))
- **Supabase sync silently bailed forever**: `tabatha.profiles` was missing the `default_org_id` and `default_team_id` columns that both `useAuth.fetchProfile` and `syncService.syncToSupabase` were selecting. The error was thrown away, sync logged "No profile found for user" misleadingly, and nothing ever made it to Supabase. Fixed by:
  - New [`supabase/migrations/005_add_profile_defaults.sql`](supabase/migrations/005_add_profile_defaults.sql) adds both columns (nullable, FK to organizations/teams).
  - `syncService` and `useAuth` now use `maybeSingle()`, capture the error, and fall back to a minimal `SELECT id` so the rest of the flow still works pre-migration.
  - Every silent bail now writes a row to `chrome.storage.local._syncDiagnostics`, surfaced in Settings → Account.
- **Display name stuck at "Tabatha User"**: until now there was no UI to change it. Profile rows auto-provisioned without an OAuth `full_name` (e.g. from magic-link or password sign-up) had no way to be fixed. Added inline editor in Settings → Account.
- **No on-demand markdown export**: the `EXPORT_MARKDOWN` handler existed in `sessionService` but nothing in the UI called it. Auto-export still worked. Added a button in Settings → Export & Agents.
- **Transitional `serviceFlags.focus.ready` stub removed** from `tabService`: PR #11 left a dormant feature flag and dead fallback bodies for `autoQueueFromIntent` / `linkTabToFocus`. Both call sites now delegate directly through the injected `focusService` deps.

### ⚠️ Schema notes

- **`intentChangeLog` removed** — merged into `intentHistory` with a union shape (one-time, flag-gated migration via `_intentLogMigrated`). External readers must read `intentHistory`.
- **Legacy `tasks[]` migrated** to `tabathaOrg.tasks` registry (one-time, flag-gated via `_tasksMigrated`). The legacy `tasks` key is set to `[]` after migration; a snapshot is briefly stored in `_legacyTasksBackup` then removed by tabService's one-shot cleanup.
- **Archived tasks** older than `settings.storage.archivedTasksColdAfterDays` (default 90d) move from `tabathaOrg.tasks` to `_archivedTasks` (internal cold-store key).
- **`settings.storage` block** added with additive migration — user-tuned values preserved, missing fields back-filled from `DEFAULT_SETTINGS.storage`.

### 🛠 Required Supabase migration

Run [`supabase/migrations/005_add_profile_defaults.sql`](supabase/migrations/005_add_profile_defaults.sql) in the Supabase SQL Editor:

```sql
ALTER TABLE tabatha.profiles
  ADD COLUMN IF NOT EXISTS default_org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL;
ALTER TABLE tabatha.profiles
  ADD COLUMN IF NOT EXISTS default_team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS profiles_default_org_idx ON tabatha.profiles(default_org_id);
CREATE INDEX IF NOT EXISTS profiles_default_team_idx ON tabatha.profiles(default_team_id);
```

The extension boots and operates without this migration (sync falls back to a minimal profile select that omits org/team scoping), but no rows reach `focus_items` / `intent_history` until the columns exist.

### 📦 Upgrade procedure (existing v3.34.5 unpacked install)

Data is preserved by chrome.storage migrations — `intentChangeLog`, legacy tasks, and additive settings backfill all run flag-gated and idempotently. The key thing is to upgrade **in-place** so Chrome keeps the same extension ID:

1. Back up your data first (open any Tabatha page DevTools console → `chrome.storage.local.get(null, d => copy(JSON.stringify(d)))` → paste to a `.json` file).
2. Apply the Supabase migration above.
3. Overwrite the contents of your existing `dist/` directory with the new v4.0.0 build (do NOT load v4.0.0 from a new path — that creates a second extension ID with empty storage).
4. In `chrome://extensions`, hit "Reload" on the same Tabatha extension card.
5. Open the Service Worker (or any Tabatha page) once so bootstrap migrations fire.
6. Settings → Account → confirm `Sync Status` shows a recent successful sync.

### 🔁 Known limitations (not blockers, planned follow-up)

- Supabase sync is currently one-directional (local → cloud). Tabs/focuses created on Browser A don't auto-pull to Browser B.
- `tabathaOrg` (clients/projects/tasks/operations/initiatives) is local-only; not synced to Supabase yet.
- Tab groups created via Chrome's built-in UI are tracked by Tabatha's `groupService` but not surfaced in any Tabatha panel — no per-group view yet.
- Companion bridge has no profile scoping; running Tabatha in two browser profiles simultaneously will cause both to share companion events. Stop the companion app before regression-testing in a second profile.

---

## [v3.34.5] - Intent-to-Focus Bridge + Browser Profile Identity - _2026-05-12_

### Added
- **Intent-to-Focus Bridge**: typing an intent on a tab can auto-queue/auto-create a matching focus item, configurable via `intentBridgeMode` (`manual` / `smart_dedup` / `always`).
- **Create Focus from Tab**: new-focus flow accessible directly from tab cards, pre-filled with the tab's URL and title.
- **Browser Profile Identity**: each Chrome profile gets a stable `browserProfileId` stored in `chrome.storage.local` for future cross-device routing.

`fc9882c`

---

## [v3.31.5] - Sidebar Edit Parity + InBar Create Focus - _2026-05-12_

### Added
- **Sidebar edit dropdown**: full intent/focus editing from sidebar matches home parity.
- **InBar create focus**: create a new focus item directly from the content bar.
- **Refresh button**: manual data refresh in sidebar header.

`8cd185e`

---

## [v3.30.5] - Focus Tag Editing - _2026-05-12_

### Added
- **Project/Client tag editing** on active focus: live edit of `realm`, `client`, `project`, and `task` tags from the FocusBar edit panel.

`6a70047`

---

## [v3.29.5] - Activity Editor + Webhooks - _2026-05-12_

### Added
- **Activity Editor**: per-entry trim/split/merge on timeline entries.
- **Timeline break insertion**: manual break markers on the activity timeline.
- **InBar sync indicator**: visual feedback when InBar data is stale.
- **Webhook intervals**: configurable firing cadence for webhook integrations.

`481f0fb`

---

## [v3.25.2] - Desktop Activity Editor - _2026-05-12_

### Added
- **Desktop Activity editor** in Settings: trim and clear tools for desktop activity captured via companion bridge.

`f4dd6b3`

---

## [v3.24.2] - Sidebar Intent Creation - _2026-05-12_

### Added
- **Sidebar intent creation** with full timer parity — new-focus input now lives in the sidebar alongside home.

`942524e`

---

## [v3.23.2] - Timeline Today Filter - _2026-05-12_

### Added
- **Desktop activity timeline scoped to current day** by default.

### Fixed
- **InBar `SET_INTENT` was silently dropped** — handler was missing entirely from the background router. (`a91f361`)

`a0370d1`

---

## [v3.22.1] - Timer Fix + Version Sync - _2026-05-12_

### Fixed
- **Drifted-focus timer extension** now preserves elapsed time instead of resetting to zero on extend. (`9f7fbf8`)

`9b09fcc`

---

## [v3.21.0] - InBar Layout Overhaul - _2026-05-12_

### Added
- **InBar layout overhaul**: restructured content bar with intent lifecycle display.
- **URL pause matching**: paused-intent state survives URL changes when the new URL still matches the pattern.

`34f0371`

---

## [v3.20.0] - Task Migration + Funnel State Machine - _2026-05-12_

### Added
- **Task storage migration**: legacy `tasks[]` array → structured `tabathaOrg.tasks` registry. One-time, flag-gated migration runs once per profile.
- **Funnel stage state machine**: stages canonicalized as `unsorted → todo → focus → addressing → resolved → roadblocked` with transition rules.
- **Task stage management** in sidebar with stage picker.
- **Sidebar pause** for active focuses.

### Schema
- New storage key: `tabathaOrg.tasks` (migrated from `tasks[]`)
- Migration flag: `_tasksMigrated`
- Backup key: `_legacyTasksBackup` (removed after one-shot cleanup)

`0c40b1c`, `185ef9e`

---

## [v3.17.24] - Status Normalization - _2026-05-12_

### Fixed
- **Status normalization**: inconsistent display of `complete` vs `completed` across UI surfaces resolved with canonical status mapping.
- Display precedence fixes for funnel stage vs focus state.

`2f7147e`

---

## [v3.17.22] - Palette + InPop Fixes - _2026-05-12_

### Fixed
- **Palette navigation** edge cases.
- **Task delete** confirmation missing for some paths.
- **InPop nesting** — nested overlays no longer stack incorrectly.
- **Stage-state sync** between sidebar and home views.

`b00de1d`

---

## [v3.17.18] - Stage Pills + Paused State - _2026-05-12_

### Fixed
- **Stage pills** rendering consistency.
- **Task-per-char** input regression (character-by-character task creation).
- **Palette break** handling edge case.
- **Paused → Resolved** transition now requires confirmation.

`d2cecac`

---

## [v3.17.14] - Tier 2/4 Surface Fixes - _2026-05-11_

### Fixed
- **T2.1** stage pills alignment and color mapping.
- **T2.3** task status not reflecting actual completion state.
- **T4.2** Command Palette selection not applying.

`8cc6649`

---

## [v3.17.13] - Post-Merge Bug Fix Sweep - _2026-05-11_

### Fixed
- 8 bug fixes from live user testing feedback covering focus resolution, timer display, intent association, and sidebar rendering.

`eae1e86`

---

## [v3.12.4-alpha] - InBar, Focus Controls, Heatmap, Logs & Activity Overhaul - _2026-05-11_

### Added
- **InBar Edit Dropdown**: ✏️ button opens inline panel for intent editing, focus assignment, and new focus creation — all from the content bar.
- **InBar Intent/Focus Split**: Bar now shows tab intent and central focus separately with a visual divider.
- **Focus Pause/Resume**: ⏸ button on FocusBar freezes timer, moves focus to queue with amber styling. FocusInput reappears for new focus.
- **Focus Edit**: ✏️ button on FocusBar for inline rename, timer adjust, and funnel stage changes.
- **Side-Quest Auto-Pause**: Starting a side quest automatically pauses the current active focus and resumes it when the side quest ends.
- **Auto-Park on Close**: Paused tabs auto-park with their sticky note preserved when closed.
- **Tab Label Editing**: ✏️ rename button on each tab card in the Tabs panel. Custom titles persist with original shown on hover.
- **Link Tab to Intent**: 📄 Link Tab button in IntentsPanel with inline open-tab picker dropdown.
- **Collapsible Sections**: All homepage sections collapsible with persisted state (Shift Controls, Now Bar, Focus Engine, Activity, Nav Tabs).
- **Activity Heatmaps (×3)**: GitHub-style contribution graph with 3 views — Browser, Overall, Follow-Through. Theme-aware colors, hover tooltips, 365-day range.
- **Context Activity Bar**: Renamed from "Desktop Activity" to include browser + desktop + mobile (future) segments.
- **Data Retention Alarm**: Daily chrome.alarm prunes companion/desktop activity older than configurable threshold (default 90 days).
- **Data Retention Setting**: Configurable in Settings → Time Tracking with description text.
- **Parked Tab Notes**: Parked tabs display context badge, auto-park source indicator, and preserved sticky notes.

### Changed
- **LogsPanel Overhaul**: Now supports 8 log types (Tab Activity, Intent Change, Focus Session, Clock Stint, Break, Context Set, Blocked Site, Task Update) with toggleable filter chips and pagination (50 per load). Desktop activity excluded — reserved for Context Activity Bar.
- **Header Spacing**: Reduced padding above/below header. Clock wrapper fixed-height prevents layout shift at different scales.
- **Version**: Bumped to 3.12.4-alpha across manifest.json, settings, and homepage.

---

## [v0.2.5-alpha] - Diagnostic Fix Sweep - _2026-05-09_

### Fixed
- **Critical: Duplicate notification listeners** merged into single handler; eliminated service worker unpredictability.
- **Critical: `activeTabId` ReferenceError** in welcome-back notification handler — replaced with `WINDOW_ID_CURRENT`.
- **Critical: `export` keyword on `triggerSync()`** removed — prevented potential service worker module loading failure.
- **Clock-In/Out race condition** — eliminated double-writes to `clockSession` storage key; UI now relies on reactive `useChromeStorage` listener.
- **Focus actions fragility** — `completeFocus()` and `extendTimer()` now receive explicit `focusId` in home and sidebar.
- **Time tracking shows 0s** — added `updateTimeTrackingAggregates()` to bridge `pendingTimeLogs` and the `timeTracking.byTab` storage key the UI reads.
- **Gatekeeper Sugar Box/Park/Later** — buttons now close overlay and tab as tooltips promised.
- **`useChromeStorage` stale closure** — `update` callback uses `useRef` to avoid capturing stale `value`.
- **Popup `new URL()` crash** — wrapped in try/catch for `chrome://` and malformed URLs.
- **`triggerSync` excessive firing** — added auth session guard to skip Supabase calls when unauthenticated.
- **`patternToRegex` double-escape** — rewrote to split on `*` first, escape segments individually.

### Changed
- **Shared `formatTime` utility** — extracted from 3 duplicate definitions into `src/utils/formatTime.js`.

---


## [v0.2.4-alpha] - Phase 3/4 Refinements - _2026-04-28_

### Added
- **Logs Panel**: Replaced simple Time view with deep filtering (Date, Intent, Category, Duration) for historical activity tracking.
- **Link/Merge Modal**: Universal modal to link Tabs to Intents, or merge Intents into Tasks.
- **Settings Walkthrough**: In-app educational tooltips describing "When", "How", and "Affects" for all configuration options.
- **Theme Expansion**: High contrast corporate theme, plus 5 new distinct themes (Neo-Brutalism, Glass Ocean, Retro Pixel, Solarized Warm, High Contrast Dark).
- **Background Handlers**: Automated logic for `CLOCK_IN`, `CLOCK_OUT`, and `TOGGLE_BREAK`.

### Changed
- **Gatekeeper Parked Tabs**: Automatically restores session context for parked tabs, preventing redundant Gatekeeper prompts.
- **Dashboard Refinement**: Renamed "Contexts" to "Sessions" and added "Link/Close" actions to tab listings.

---

## [v0.1.5] - Phase 1.5 (User Enhancements) - _2026-02-12_

### Added

- **Gatekeeper Overlay**: A new interception mechanism for empty tabs. Instead
  of a redirect or modal, a dark, immersive overlay appears on new tabs asking
  for context/intent.
  - Options: "Continue" (set context), "Side Quest" (5m timer), "Sugar Box"
    (save for later), "Park" (save for later).
- **Quick Access**: "Speed Dial" on the Welcome Page. Clicking a top site
  immediately launches it with the context typed in the "New Session Intent"
  box, bypassing the Gatekeeper.
- **Welcome Page Parity**: The "New Tab" page (`home.html`) is now a
  full-featured dashboard mirroring the Sidebar.
  - Features: Tab list, Context view, Groups management, Time tracking, Restore
    Session.
  - Design: "Mission Control" desktop layout with wider UI elements.
- **Time Tracking Logic**:
  - Added "Active Time" tracking per tab (persists across sessions).
  - Added "Open Duration" display.
  - Added Pomodoro timer constraints.
- **Sugar Box & Parked Tabs**: Stub storage implementations for saving
  distractions (Sugar Box) and keeping tabs for later (Parked).

### Changed

- **Welcome Page UI**: Completely overhauled `home.html` and `home.css` to use a
  glassmorphism "Mission Control" aesthetic, sharing styles with the Sidebar.
- **Tab Restore**: Improved "Return to Flow" logic to better handle session
  restoration with priorities.
- **Manifest**: Added `topSites` permission for Quick Access feature.

### Fixed

- **Empty Sidebar Bug**: Fixed an issue where the sidebar would be empty on
  extension reload because existing tabs weren't re-synced to storage.
- **Layout Issues**: fixed CSS conflicts between `sidebar.css` and `home.css`.

---

## [v0.1.0] - Phase 1 (Core Foundation) - _2026-02-10_

### Added

- **Extension Scaffold**: MV3 Manifest, Service Worker (`background.js`), Side
  Panel, Content Scripts.
- **Context Engine**:
  - Data structure for Tabs, Contexts, Intents, and Priorities.
  - Logic for inheriting context from parent tabs.
- **Sidebar UI**: Rich, interactive sidebar replacing the native vertical tabs.
  - Sections: Intent Dashboard, Tab List, Batch Updates, Groups, Time Tracking.
- **Tab Analysis**:
  - **Categories**: Auto-detection of "Work", "Media", "Social", etc. based on
    URL.
  - **Priority System**: Critical (Red), High (Orange), Medium (Yellow), Low
    (Green).
- **Tab Groups**:
  - Integration with native Chrome Tab Groups.
  - **Sub-Groups**: "Project" layer above Chrome groups.
- **Tab Locking**:
  - **Lock**: Prevent accidental close.
  - **URL Lock**: Prevent navigation away from a specific domain (e.g., lock a
    tab to Asana).
- **Markdown Export**: Auto-generates `Tabatha/context.md` for AI agents to
  understand user context.
- **Idle Detection**: Detects when user leaves Chrome and asks for off-screen
  context upon return.

### Core Philosophy Implementation

- Established the "Context-First" data model where every tab must have a purpose
  or inherit one.
