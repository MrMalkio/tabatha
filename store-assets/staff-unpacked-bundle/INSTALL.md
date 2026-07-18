# Tabatha — Staff Install (interim, until the Chrome Web Store listing is live)

This bundle carries the **pinned key**, so your extension ID stays
`hoknmoclnhccpgofpdihmiadmnmejjod` and all existing data/settings survive.

## 3 steps

1. **Run the installer** (PowerShell, no admin needed) from this folder:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\install-extension-persistence.ps1 -Source .\extension
   ```

   It seeds a stable copy at `%LocalAppData%\Tabatha\extension` and registers a
   logon self-heal so Chrome never "loses" the extension after a restart.

2. **Load unpacked**: open `chrome://extensions`, enable *Developer mode*, click
   **Load unpacked**, and pick the folder `%LocalAppData%\Tabatha\extension`.
   (Skip this if Tabatha is already loaded from that exact path — just hit ↻ Reload.)

3. **Sign in** to Cloud Sync from Tabatha's Settings page so your data follows
   your account.

## Later: moving to the Web Store version

The store version installs under a **different extension ID** (the store strips
pinned keys). Your data migrates via Cloud Sync: install the store version, sign
in, then remove this unpacked one.
