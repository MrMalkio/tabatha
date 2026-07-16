# Tabatha — Staff Install (v6.7.14)

Two-minute setup. After this, Tabatha survives restarts and auto-updates itself (every 6 hours + at login) — no reinstalling, ever.

## Install

1. **Unzip this folder** somewhere temporary (e.g. your Downloads).
2. **Right-click `install-tabatha-staff.ps1` → Run with PowerShell.**
   (If Windows blocks it: open PowerShell and run
   `powershell -ExecutionPolicy Bypass -File .\install-tabatha-staff.ps1`)
   This copies Tabatha to a stable location (`%LocalAppData%\Tabatha\extension`),
   registers the auto-updater, and runs a first update check.
3. **Load it into Chrome, once:**
   - Open `chrome://extensions`
   - Turn on **Developer mode** (top-right)
   - Click **Load unpacked**
   - Select the folder: `%LocalAppData%\Tabatha\extension`
     (paste that path into the folder dialog's address bar)
4. **Sign in** to Tabatha (Cloud Sync) — your contexts, intents, and time history
   follow your account.

Done. Pin the Tabatha icon to your toolbar if you like.

## What happens after

- **Restarts:** Tabatha loads from the stable path — it will not disappear on reboot.
- **Updates:** the updater checks for new versions every 6 hours and at each login,
  downloads + verifies them, and swaps them in automatically. **New versions take
  effect the next time you restart Chrome** (or hit the ↻ refresh on the Tabatha card
  in `chrome://extensions`).
- Update activity is logged to `%LocalAppData%\Tabatha\update.log`.

## Trouble?

- Extension missing after a restart → re-run steps 2–3; the stable path is self-healing
  and won't leave you with a broken folder.
- Not updating → run `powershell -ExecutionPolicy Bypass -File "%LocalAppData%\Tabatha\tabatha-updater.ps1" -Force`
  and check `update.log`.
- Ping Caspera on Asana with the contents of `update.log` if anything looks stuck.
