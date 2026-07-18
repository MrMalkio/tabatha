# Sticky Note: Stable extension load path — permanent fix for "uninstalling on restart" (2026-07-15)

**Left by:** Claude (Opus 4.8, live-fix on OD for Malkio)
**Supersedes the "open follow-up" in** `2026-07-01-extension-companion-vanish-incident.md`
**Branch:** `fix/restart-persistence` (worktree `.claude/worktrees/fix-restart-persist`, NOT merged), v6.7.9

## The bug, root-caused

Chrome loaded the unpacked extension directly from the **git build folder**
`C:\Users\mrmal\le dev\Tabatha\dist`. Unpacked extensions are pinned by absolute
path and re-validated on every Chrome startup; if that folder is missing / empty
/ has an unparseable manifest at a validation moment, Chrome **permanently drops
the entry** (it does not reinstall unpacked extensions like it re-fetches
webstore ones).

`dist` is legitimately emptied/rewritten by `npm run build`. Three triggers hit
that window:
1. **Fast Startup is ENABLED** (`HiberbootEnabled = 1`) → frequent, unattended
   restarts, each re-validating the extension.
2. **Chrome's startup extension-GC** after an unclean exit / crash / force-kill
   deletes unpacked entries whose dir looks invalid (see build-constraint rule 6).
3. A build / interrupted swap that leaves `dist` transiently invalid.

The atomic dist-swap (commit f5ff7a7) shrank #3's window but couldn't remove the
structural cause: **the load path was the volatile git tree itself.**
(Ruled out: git branch checkout — `dist` is gitignored, so `git checkout` never
touches it. Only `npm run build` mutates `dist`.)

## The permanent fix — STABLE, decoupled load path

Chrome now loads from a path no build or git op ever touches:

    %LOCALAPPDATA%\Tabatha\extension     (C:\Users\mrmal\AppData\Local\Tabatha\extension)

- `scripts/mirror-extension.ps1` — atomically mirrors a **valid** `dist` build
  into the stable path (validates manifest + pinned key + entry HTML before
  swapping; if the source is missing/mid-build it leaves the last-known-good
  copy untouched → Chrome always sees a complete folder). Idempotent (skips when
  versions match). Self-heals.
- `scripts/install-extension-persistence.ps1` — one-time machine setup: seeds the
  stable path, copies the mirror script to `%LOCALAPPDATA%\Tabatha\`, and registers
  a **logon autostart** that re-mirrors before Chrome. Prefers a Scheduled Task;
  falls back to an HKCU `Run` key when not elevated (that is what is installed on
  OD today: `HKCU\...\Run\TabathaExtensionMirror`).
- `npm run mirror:extension` — refresh the stable path on demand after a build.

**Installed on OD (2026-07-15):** stable path seeded at v6.7.7 (byte-identical to
what Chrome was already running), Run-key autostart active, mirror script in place.

## ONE-TIME manual step Malkio must still do (cannot be automated)

Chrome has no API to relocate an already-loaded unpacked extension's path, and
toggling extension state is out of scope. So ONCE:
1. `chrome://extensions` → Developer mode on.
2. **Remove** the current "Tabatha" card (loads from `…\Tabatha\dist`).
3. **Load unpacked** → select `C:\Users\mrmal\AppData\Local\Tabatha\extension`.
The pinned `key` keeps the id `hoknmoclnhccpgofpdihmiadmnmejjod`, so all data/
settings carry over. After this, Chrome loads the stable path forever.

## Notes / recommendations

- **Recommended (optional):** disable Windows Fast Startup to remove trigger #1
  entirely (elevated): `powercfg /hibernate off`, or uncheck it in Control Panel →
  Power Options → "Choose what the power buttons do". The stable-path fix already
  makes the extension survive Fast Startup, so this is hardening, not required.
- **Run key `TabathaDesktop`** now points at an **existing** release exe
  (`…\tabatha-desktop\src-tauri\target\release\tabatha-desktop.exe`) — it is NOT
  the dead debug exe the 2026-07-01 note described, so it was left in place
  (removing it would kill companion autostart). It still points at a git-tree
  build path (same volatility class) — reconcile when the companion ships.
- **Do NOT** point the companion's `%APPDATA%\Tabatha Desktop\extension\` (its own
  updater target, currently stale at v6.5.0) at Chrome — that path is managed by
  the Norton-blocked companion and would re-introduce volatility. The fix
  deliberately uses a separate `%LOCALAPPDATA%\Tabatha\extension` that only the
  mirror script owns.
- **Build constraint update:** `npm run build` / `swap-dist.mjs` only ever touch
  `dist`; they never touch the stable load path. After a build, run
  `npm run mirror:extension` (or just wait for next logon) to push the new build
  into the stable path. Chrome should be loaded from the stable path, not `dist`.
