# Sticky Note: Extension + Companion "Vanished" After Restart — Incident (2026-07-01)

**Left by:** Claude (2026-07-01, live incident response for Malkio on OD)
**For:** Whoever's building companion autostart next, and future-Malkio if this recurs

## TL;DR

Neither the extension nor the companion was actually broken. Conclusive findings:

- **Extension (`hoknmoclnhccpgofpdihmiadmnmejjod`):** enabled, active, service worker running, right now. Not disabled by Chrome, no `disable_reasons`, no dev-mode safety flag tripped.
- **Companion:** running right now (PID confirmed), just not visibly announcing itself (tray icon easy to miss / no window).
- **Windows never actually rebooted.** `Get-CimInstance Win32_OperatingSystem` shows `LastBootUpTime: 2026-06-25 17:25:57` — six days before this incident. Whatever Malkio experienced as "the computer restarted," the OS kernel session did not actually cycle. (A shutdown *was initiated* today at 10:30:53 AM per Event ID 1074 "SlideToShutDown.exe... Other (Unplanned)" — but no matching fresh 6005/109 boot pair followed it before the current uptime check, meaning either the shutdown was aborted/interrupted, or Fast Startup hibernated instead of a true cold boot.)

## Evidence

### Extension — Chrome side (`Secure Preferences`, not `Preferences`)
Chrome moved per-extension `settings` into the MAC-protected `Secure Preferences` file (not the plain `Preferences` file the standard playbook checks — that file only had `pinned_extensions`, `theme`, etc., zero entries under an `extensions.settings` key). Parsed `Secure Preferences` directly (PowerShell's `ConvertFrom-Json` chokes on it — it has duplicate case-collided keys elsewhere in the file — used Node instead):

```
state: <absent>              (absent/undefined = enabled; Chrome only writes state:0 when disabled)
disable_reasons: []          (empty)
has_started_service_worker: true
withholding_permissions: false
last_update_time: 2026-07-01T17:06:21Z (~13:06 EDT today — recently active)
path: C:\Users\mrmal\le dev\Tabatha\dist
```

Also confirmed `hoknmoclnhccpgofpdihmiadmnmejjod` is still in `pinned_extensions` in the toolbar list in the plain `Preferences` file.

**One real discrepancy from the assumed setup:** the extension Chrome has loaded is pointed at `C:\Users\mrmal\le dev\Tabatha\dist` (the workspace build output), **not** `%APPDATA%\Tabatha Desktop\extension\` (the companion-managed canonical path per `installer.rs`). Both folders exist and both have valid manifests with the pinned key + matching version (6.4.0), so this isn't broken today, but it means Chrome's *currently loaded* unpacked extension is the raw dev build, not the one the companion's updater manages. Worth reconciling later so the companion's atomic-replace updater actually governs what Chrome runs.

Chrome itself did not auto-update around the incident: installed `chrome.exe` version (`149.0.7827.201`) exactly matches `last_chrome_version` recorded in the profile. So this was not the classic "Chrome updated -> dev-mode extensions got safety-disabled" trigger — that mechanism never fired.

### Companion
- `tabatha-desktop.exe` (release build, `...\tabatha-desktop\src-tauri\target\release\tabatha-desktop.exe`) **is running**, PID 4076, started 2026-07-01 13:22:59 (before this investigation began — not started by this session).
- It's a tray app with no main window (`MainWindowTitle` empty), so it's easy to mistake for "gone" if you don't check the tray overflow icons.
- Confirmed installed via MSI (present, intact).
- Autostart is genuinely NOT wired for the release build — the known gap. There IS a stale `HKCU\...\Run\TabathaDesktop` registry value, but it points to an old **debug** exe (`target\debug\deps\tabatha_desktop-a02d754f07b6c231.exe`), not the installed release exe, and — moot anyway — since Windows never actually rebooted today, no Run-key entry would have fired regardless.

### Windows Defender
No quarantine, no threat detections, no relevant Defender operational events (`Get-MpThreatDetection`, `Get-MpThreat`, event IDs 1116/1117/1006/1007 all empty). Nothing Tabatha-related was flagged. Defender is not the cause and nothing needed restoring.

## What I fixed

Nothing needed a repair — no quarantine to restore, no Defender exclusion needed (nothing was ever blocked), extension was never actually disabled, and the companion was already running. I did not toggle any Chrome extension state (correctly out of scope/blocked by design) and did not touch autostart (explicitly out of scope — separate known fix in progress).

## What Malkio should do right now

**Nothing is actually broken.** Two low-effort sanity checks before the team call, in case perception still doesn't match reality on his screen:
1. Open `chrome://extensions` and just glance — Tabatha should show as enabled with no banner. If a "developer mode extensions disabled" banner *does* appear (not what the file evidence shows, but Chrome's live UI is the ground truth over cached prefs), click **Keep it** / **Turn back on**.
2. Check the system tray overflow (the `^` arrow near the clock) for the Tabatha icon — the companion has no popup window, so it's invisible unless you check the hidden-icons tray.

If either extension or companion genuinely still looks dead in the live UI after those checks, that means state changed *after* this investigation ran — re-run the same evidence-gathering rather than assuming the old diagnosis still holds.

## Open follow-up (not fixed here, flagged for later)

- Companion autostart is still not configured for the release build (known gap, being fixed elsewhere per existing project notes).
- The stale debug-build Run key (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run\TabathaDesktop`) is dead weight pointing at a debug exe — should be removed or repointed once real autostart is implemented, so it doesn't cause confusion later.
- Chrome's loaded extension path (`Tabatha\dist`) vs. the companion's canonical managed path (`%APPDATA%\Tabatha Desktop\extension\`) diverge. Fine for now, but the companion's updater can't manage what Chrome isn't actually loading from.
