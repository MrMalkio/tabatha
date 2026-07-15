# Sticky Note: Self-hosted remote update channel for unpacked staff installs (2026-07-15)

**Left by:** Claude (Sonnet 5)
**Branch:** `feat/self-hosted-update` (worktree `.claude/worktrees/update-channel`, NOT merged), v6.7.13
**Builds on:** `2026-07-15-stable-extension-load-path.md` (stable path fix for OD, the dev box).

## Why this exists

The stable-path fix solved persistence for the ONE machine that builds Tabatha
from source (OD). It gave every OTHER staff machine (e.g. PS) no way to ever
receive an update — nothing on those machines builds from git. Chrome Web
Store review is days out and cannot be the dependency for staff updates
today. This is the guaranteed, CWS-independent remote-update channel.

## How the channel works, end to end

1. **Cut a release** (on the dev box, after a normal commit + version bump):
   ```
   npm run publish:update
   ```
   `scripts/publish-update.mjs`:
   - Runs `npm run build` (the normal build — **keeps the pinned `key`**; this
     is deliberately NOT `build:store`, which strips the key for the Chrome
     Web Store's own ID assignment. This channel needs every staff install to
     keep the SAME extension id — `hoknmoclnhccpgofpdihmiadmnmejjod` — release
     over release, so Cloud Sync / local storage is never orphaned).
   - Zips `dist/` → `store-assets/tabatha-<version>.zip`, computes its sha256.
   - Publishes a GitHub Release tagged **`ext-v<version>`** (a distinct tag
     scheme from the project's own `v<version>` release tags — no collision)
     with the zip attached, via `gh release create` / `gh release upload
     --clobber` if the tag already exists (idempotent re-publish, e.g. to fix
     a bad cut without bumping version again).
   - Writes `latest.json` = `{ version, zipUrl, sha256, published }` and
     commits+pushes it to a dedicated orphan branch, **`update-channel`**,
     which has no relationship to any code branch (no package.json/scripts —
     it exists purely to hold that one file, so the commit uses
     `git commit --no-verify`; the repo's shared pre-commit hook checks
     version-sync, which is meaningless on a branch with no source tree).

2. **Stable pointer URL** (this is the one thing that must never change):
   ```
   https://raw.githubusercontent.com/MrMalkio/tabatha/update-channel/latest.json
   ```
   Chosen over GitHub Pages because it needs zero setup/build step and updates
   the instant the branch commit lands — Pages adds a CDN publish delay that
   works against "the moment you cut it, it's live."

3. **Staff machine polls it** — `scripts/tabatha-updater.ps1`:
   - GETs `latest.json` (cache-busted query param).
   - Compares `version` (semver-aware, handles Chrome's up-to-4-part versions)
     against the installed `%LocalAppData%\Tabatha\extension\manifest.json`.
     No-op if already current or newer (`-Force` to reinstall anyway).
   - If newer: downloads the zip to a temp file, **verifies sha256** — on ANY
     mismatch, aborts immediately and leaves the current install completely
     untouched (no partial state, no swap attempted).
   - Extracts to a temp dir and validates it (manifest parses, `key` present,
     all 4 entry HTML pages + the background service worker file present)
     BEFORE touching anything live.
   - Atomic swap into `%LocalAppData%\Tabatha\extension` — same rename-based,
     never-empty-mid-swap pattern as `mirror-extension.ps1` (stage → validate
     staged copy → rename old aside → rename new into place → delete old).
     Rolls back automatically if any step throws.
   - Logs every run to `%LocalAppData%\Tabatha\update.log`.
   - **Chrome does not hot-reload unpacked file changes for a running
     session.** The update takes effect on the next Chrome restart, or
     immediately if the user clicks ↻ reload on the Tabatha card at
     `chrome://extensions`. This is expected/acceptable — it's what the staff
     bundle's INSTALL.md tells users.

4. **One-time staff onboarding** — `scripts/install-tabatha-staff.ps1`
   (supersedes `install-extension-persistence.ps1` for any machine that is
   NOT the dev box; that script is kept as-is for OD):
   - Seeds `%LocalAppData%\Tabatha\extension` from a bundled `.\extension`
     payload (first run only — leaves an existing valid install alone).
   - Copies `tabatha-updater.ps1` to the stable dir (self-contained; doesn't
     depend on wherever the installer/bundle folder ends up).
   - Registers BOTH an HKCU Run key (fires at logon) AND a Scheduled Task
     `TabathaUpdateCheck` (every 6 hours) running the updater — falls back to
     Run-key-only silently if Scheduled Task creation needs elevation the
     machine doesn't have (same fallback pattern as the OD persistence
     installer).
   - Runs the updater once immediately, so a stale seed payload self-corrects
     on the spot.
   - Prints the one-time "Load unpacked from `%LocalAppData%\Tabatha\extension`"
     instruction (Chrome can't be re-pointed by script).

5. **Staff bundle** — `store-assets/tabatha-staff-v<version>.zip` =
   `.\extension` (the built, WITH-key dist) + `tabatha-updater.ps1` +
   `install-tabatha-staff.ps1` + `INSTALL.md` (3-step install + the
   every-6h/at-logon auto-update note). This is what actually gets handed to
   a new staff machine.

## What is LIVE right now (curl-verified)

- **latest.json** (200, correct JSON):
  `https://raw.githubusercontent.com/MrMalkio/tabatha/update-channel/latest.json`
  → `{ "version": "6.7.13", "zipUrl": "https://github.com/MrMalkio/tabatha/releases/download/ext-v6.7.13/tabatha-6.7.13.zip", "sha256": "d89cf58ec07aa13188e6f5cdfff264061ed70a5b8e05a3f5b4aa76094bafda8a", "published": "2026-07-15T19:14:31.667Z" }`
- **Release**: https://github.com/MrMalkio/tabatha/releases/tag/ext-v6.7.13
- Downloaded the release zip independently and confirmed its sha256 matches
  the value in `latest.json` (788,162 → hash confirmed via `certutil`/`sha256sum`).
- Staff bundle built: `store-assets/tabatha-staff-v6.7.13.zip`.

The whole channel is reachable and functional from any machine with plain
internet access — no CWS dependency, no auth needed (repo is public).

## PS-machine validation procedure (do this to prove the loop closes)

1. Copy `store-assets/tabatha-staff-v6.7.13.zip` to the PS machine, unzip it.
2. Run `.\install-tabatha-staff.ps1` from inside the unzipped folder.
3. `chrome://extensions` → Developer mode → Load unpacked →
   `%LocalAppData%\Tabatha\extension`. Note the version shown (should be
   6.7.13).
4. Back on the dev box (OD): bump the patch version, commit, run
   `npm run publish:update` again. Confirm the new version/sha256 land in
   `latest.json` (curl the raw URL).
5. On PS: either wait for the next 6h scheduled run / next logon, OR force it
   immediately: `powershell -File "$env:LOCALAPPDATA\Tabatha\tabatha-updater.ps1" -Force`.
   Check `%LocalAppData%\Tabatha\update.log` for the "OK: stable path now at
   v<new version>" line.
6. Reload the Tabatha card at `chrome://extensions` (or restart Chrome) and
   confirm the new version is what's actually running (Settings → About, or
   the manifest version shown by Chrome on the card itself).

## Known non-issue observed while building this

The zip produced by `tar.exe -a -c -f` is not byte-identical across two runs
of the SAME source tree (timestamps embedded in the archive), so its sha256
differs run-to-run even with no code changes. This is harmless — the shipped
`latest.json.sha256` always matches the shipped zip's actual bytes (computed
from the same file right after zipping, before upload) — but don't expect
`ext-v<version>` reruns to be reproducible byte-for-byte; only the recorded
sha256/zipUrl pairing matters and it is always kept consistent.

## Follow-ups / not done here

- No cleanup of old `ext-v*` releases/zips over time — fine for now (staff
  headcount is small), revisit if release list grows unwieldy.
- `publish-update.mjs` always creates a **fresh** `update-channel` worktree
  and tears it down each run (`git worktree add/remove` around
  `.update-channel-work`) rather than keeping a persistent local checkout —
  simpler and avoids any stale-branch drift, at the cost of a few extra
  seconds per publish.
- Did not attempt any Scheduled-Task elevation workaround beyond the existing
  Run-key fallback pattern — if a given staff machine truly can't create
  scheduled tasks, it only gets update checks at logon, which is still an
  improvement over "never."
