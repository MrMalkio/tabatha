# Tabatha v6.4.x Fix Batch — Findings Brief for Koda's Assessment

You are **Koda** (Codex), doing an independent pre-implementation review. Nine read-only
investigation agents diagnosed 12 issues Malkio hit dogfooding Tabatha v6.4.0. For EACH
issue below, assess the proposed fix and give a verdict. NOTHING has been implemented yet —
your review gates whether we build it as proposed.

## Repos (read-only)
- Extension (MV3 React): `C:\Users\mrmal\le dev\Tabatha` (branch `staging`)
- Companion (Tauri 2 Rust + React): `C:\Users\mrmal\le dev\tabatha-desktop` (branch `master`)

## What to produce
For each FIX-NN, output a block:
```
FIX-NN — VERDICT: <Approve | Approve-with-changes | Revise>
- Root cause correct? <yes/no + why, verify the cited file:line if you can>
- Fix sound & complete? <gaps, edge cases, regressions>
- Better/safer approach? <only if materially better>
- Notes for implementer: <concrete, e.g. tests to add, ordering/dependencies>
```
Then a final section "CROSS-CUTTING" for ordering/dependencies across issues and any shared
util or regression risk. Be concise and concrete; cite file:line. Prefer the smallest correct
change. Flag anything that could break the pinned extension ID, chrome.storage durability,
the companion's %APPDATA% data folder, or Supabase RLS.

---

## FIX-01 — Integrations card shows "Companion: Not configured" though it's connected
- Root cause: `src/settings/index.jsx:1845-1848` renders the card from `settings.companionEnabled`, a key **never written anywhere** (grep: 3 hits, all reads) → always "Not configured". The live signal is `chrome.storage.local.companionConnected`, written by `src/background/services/companionService.js:376-380` and already consumed by `CompanionStatus.jsx:16-18` and `UnifiedTimeline.jsx:76-78`.
- Proposed fix: wire the card to `companionConnected` (storage read + onChanged, or useChromeStorage), relabel badge "Connected / Not connected" (live link state, not a config toggle).

## FIX-02 + FIX-05 — companion→extension clock sync never reaches Home (tray AND debug panel)
- Root cause (one defect, two symptoms): companion side is fine (tray `main.rs:566-591`; debug `clock_in` `main.rs:222-229`) — both broadcast `ClockState`. Extension `_handleClockState` (`Tabatha/src/background/services/companionService.js:331-335`) writes key `companionClock` and emits an event, but Home reads clock state ONLY from `clockSession` (`Tabatha/src/home/index.jsx:1579`, owned by `src/background/clock.js`). Also a shape mismatch: companion snake_case `{active,on_break,clocked_in_at,...}` (`activity_log.rs:30-35`) vs extension camelCase `clockSession` (`clock.js:17-24`).
- Proposed fix: extend `_handleClockState` to map the companion payload into the `clockSession` shape and persist via a new writer `clock.setSessionFromCompanion()` in `clock.js`. Echo path is idempotent (no loop).

## FIX-03 — tray "Activity Log" opens broken terminal ("filename/directory syntax incorrect")
- Root cause: `main.rs:641-648` writes a report to `std::env::temp_dir()` then runs `cmd /c "type \"{path}\" & pause"` as a single interpolated arg; Rust's Windows arg-quoting re-wraps it and cmd mis-parses the nested quotes / `&`. Fragile `%TEMP%` worsens it. NOTE: this block does NOT itself panic (`let _ =`, `.is_ok()`-guarded) — the "companion disappears" symptom is the FIX-06 mutex cascade, not this. Fix here is just the broken open.
- Proposed fix: open the file via the OS default handler (tauri_plugin_shell already present) or `start`; log the spawn Result.

## FIX-04 — tray "Check for Updates" gives no visible feedback
- Root cause: `main.rs:650-670` only emits `log::info!`/`warn!`, invisible under `#![windows_subsystem="windows"]` (`main.rs:1`). `updater::check_and_apply` returns a full `UpdateOutcome` (`updater.rs:50-56,310-357`) that's dropped.
- Proposed fix: surface the outcome via a notification / tray tooltip (pattern at `main.rs:557-562`) / debug window.

## FIX-06 — random / post-action companion crashes
- Root cause: `std::sync::Mutex` fields in `AppState` accessed via `.lock().unwrap()` everywhere; one panic while holding a lock poisons it → every later handler's `.lock().unwrap()` panics → hard exit. High-risk: monitor loop `main.rs:779` & `:830` (no catch_unwind), tray locks `:202,:542,:554,:578,:705,:723-726`. Low-risk (audited clear): WS loop (`ws_server.rs:225-322`, tokio async mutex), updater (map_err), autostart/registry (Result-guarded).
- Proposed fix: non-poisoning locks / poison recovery, `catch_unwind` around the monitor loop body, a global panic hook, and file-based logging (env_logger invisible under windows subsystem).

## FIX-07 — companion UI copy + version (user-facing strings only)
- "Debug Panel"→"Desk Panel" (`main.rs:448`). "Tabatha Desktop"→"Tabby Desk" (`App.jsx:139`, tooltips `main.rs:523/558/561`, title `main.rs:681`, `index.html:6`). "Tracking"→"Tabbing" (`main.rs:446/545/547`, `App.jsx:144/184`). Version: `App.jsx:140` hardcoded `v0.1.0` → read dynamically via `@tauri-apps/api/app` `getVersion()`.
- HARD CONSTRAINT: DO NOT rename `productName` in `tauri.conf.json` — it drives the install dir + `APP_DATA_FOLDER="Tabatha Desktop"` (`installer.rs:25`); renaming orphans `%APPDATA%\Tabatha Desktop\` and breaks the updater. Copy-only pass.

## FIX-08 — intent queue hidden when no active intent
- Root cause: `src/sidebar/index.jsx:575` gates the whole Queue section on `allItems.length > 0` with no empty state; `allItems` = engine items minus `activeFocusId` (`src/hooks/useFocusEngine.js:72-83`), so a lone active intent or no active intent → empty → section removed.
- Proposed fix: always render the Queue container; list when non-empty, muted empty state otherwise. Pure render-gating change.

## FIX-09 — Sync & Account org/team/invite "greyed out" (+ redeem bug)
- Findings: not a disabled-flag; org/team are read-only lists with NO Create control; mint panel role-gated (`TeamActivityPanel.jsx:257` returns null for non-owners). Create cloud org/team NOT WIRED — `useOrgData.addOperation` writes only local `tabathaOrg` storage, not cloud `tabatha.organizations`/`teams`. **Redeem BUG**: `src/services/supabaseClient.js:229` calls `rpc('redeem_invite_token')` WITHOUT `.schema('tabatha')` → PostgREST looks in `public` → PGRST202 not found (function only in `tabatha`, migrations 003/018). Mint (`supabaseClient.js:241`) is correctly schema-qualified.
- Proposed fix: (A) schema-qualify the redeem RPC (one line); (B) add a "Create Organization" control + `tabatha.create_organization` SECURITY DEFINER RPC so an owner bootstraps without touching Supabase; (C) show a note instead of `null` when mint is hidden. Assess whether pre-creating Reggie/Po in the DB is the right near-term unblock given (A).

## FIX-10 — see other devices'/profiles' intent queue (read-only)
- Findings: per-device queue is ALREADY synced — `syncService.buildFocusRows` (`src/background/services/syncService.js:233`) pushes every engine item to `tabatha.focus_items` (RLS `migrations/001:157`, `browser_profile_id` `009:22`). Awareness layer (`awarenessService.js`, `useOtherProfiles`, `OtherProfilesStrip`) surfaces only the single active focus, not the queue. Only a READ path is missing.
- Proposed fix: bounded read in `awarenessService` (piggyback `rebuildOtherProfilesCache` or a lazy `GET_OTHER_QUEUE`) querying `focus_items` for other `browser_profile_id`s, non-completed, joined to `browser_profiles` for names; read-only expandable lists under each device chip. Caveat: `buildFocusRows` doesn't persist `item.priority` — remote view lacks P-priority unless that field is added.

## FIX-11 — "What's New" popup + changelog in Settings + auto-refresh
- Findings: auto-refresh ALREADY works — `_handleUpdateReady` (`companionService.js:233-274`) → semver guard → `chrome.runtime.reload()`; pinned `key` (`manifest.json:5`) preserves storage. `Tabatha_Changelog.md` is the SSOT; `.headbox/sticky-notes/2026-07-01-fix-batch-process-rules.md` mandates the popup read it. No popup/`_lastSeenVersion` exists yet.
- Proposed fix: `scripts/build-changelog.mjs` parses `Tabatha_Changelog.md` → `public/changelog.json` (wired into prebuild with a --check drift guard); `WhatsNewModal.jsx` (mirrors `LinkMergeModal.jsx`) + `useWhatsNew.js` comparing `getManifest().version` vs stored `_lastSeenVersion` (show once, mark seen, seed silently on fresh install), mounted on `src/home/index.jsx`; Settings changelog view in the About section (`src/settings/index.jsx:1755-1765`); extract semver comparator to `src/utils/semver.js`.

## FIX-12 — configurable toolbar-icon click (side panel vs tab-list popup) + default side panel + hotkey
- Findings: `public/manifest.json:54-62` sets `action.default_popup="popup.html"` → click ALWAYS opens the popup. Side panel is configured (`manifest.json:47-49`, `sidebar.html`) but no `setPanelBehavior` → icon never opens it. No `action.onClicked` / `commands.onCommand` handler exists; the only command is the reserved `_execute_side_panel`. Settings allow a new top-level key with no schema change (`settingsService.js:17-51`, `DEFAULT_SETTINGS` `constants.js:7`).
- MV3 constraints: `default_popup` and `action.onClicked` are mutually exclusive per click; `sidePanel.open()` needs a user gesture; no reliable API to force-open the popup (`action.openPopup()` Chrome ~127+, gesture-bound, flaky).
- Proposed fix: drop hardcoded `default_popup`; `onClicked` routes by new `settings.toolbarClickAction` (`'sidepanel'` default | `'popup'`) — sidepanel→`sidePanel.open()`, popup→`setPopup({popup})` toggling; re-apply on SW startup + setting change. Hotkey: new `commands` entry `open_tab_list` + `onCommand`→`openPopup()` with a `windows.create({type:'popup'})` fallback. Assess the `setPopup`-toggling + `openPopup` reliability and the fallback.
