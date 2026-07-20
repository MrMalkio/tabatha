# Tabatha — Deployment Process

How a change gets from a commit to a person's browser. Two audiences, two channels.

| | **Team / staff** | **Demo users** |
|---|---|---|
| Channel | Self-hosted update channel (live today) | Chrome Web Store, **unlisted** (pending review) |
| Install | Staff bundle zip + one script + one-time "Load unpacked" | Click an unlisted store link |
| Updates | Automatic — every 6h + at login | Automatic — Chrome's native extension updater |
| Extension ID | `hoknmoclnhccpgofpdihmiadmnmejjod` (pinned `key`) | **Different ID** — the store strips the key |
| Requires dev mode | Yes | No |
| Gated by Google | No | Yes — manual review (days) for our permission set |

---

## Channel 1 — Team / staff (live now)

The extension loads from a **stable path** (`%LocalAppData%\Tabatha\extension`) that is decoupled
from the git working tree. This is what killed the "Tabatha uninstalls on restart" bug: Chrome
re-validates an unpacked extension's folder on every startup, and the old setup pointed it at
`dist/`, which `npm run build` legitimately empties.

### Cutting a release (you, from the repo)

```bash
# 1. land the change, bump the version (every change bumps — headbox rule)
#    public/manifest.json is the source of truth
npm run version:sync          # fans the version out to package.json, AGENTS/CLAUDE/GEMINI docs
#    add a Tabatha_Changelog.md entry — it feeds the in-app What's New modal
npm run changelog:build

# 2. verify
npm test && npm run build

# 3. publish to the staff channel
npm run publish:update
```

`publish:update` builds **with** the pinned key, zips, computes a sha256, publishes a GitHub
Release tagged `ext-v<version>`, and updates the channel pointer:

- Pointer: <https://raw.githubusercontent.com/MrMalkio/tabatha/update-channel/latest.json>
- Releases: <https://github.com/MrMalkio/tabatha/releases>

### What staff do (once)

1. Unzip `store-assets/tabatha-staff-v<version>.zip`
2. Run `install-tabatha-staff.ps1` — seeds the stable path, registers the updater
   (logon Run key + a 6-hourly Scheduled Task), runs a first update check
3. `chrome://extensions` → Developer mode on → **Load unpacked** → `%LocalAppData%\Tabatha\extension`
4. Sign in (Cloud Sync) — their data follows the account

### What staff do after that

Nothing. The updater polls `latest.json`, compares semver against the installed manifest,
downloads, **verifies sha256** (aborts and leaves the current install untouched on mismatch),
validates the payload, then atomic-swaps it in. Logs to `%LocalAppData%\Tabatha\update.log`.

> **The one caveat:** Chrome only picks up swapped files on **next Chrome restart** (or a manual ↻
> on the extension card). So updates land silently and apply on their next browser restart.

### Local dev machine (OD) is different

OD mirrors from the local `dist/` instead of the remote channel, via
`npm run mirror:extension` (`scripts/mirror-extension.ps1`) — so your own builds appear
immediately without going through a release. Same stable path, same never-empty guarantees.

---

## Channel 2 — Demo users (Chrome Web Store, unlisted)

**Status: fully packaged, not yet submitted.** Everything is ready — key-stripped zip, real
multi-res icons, promo tile, 5 screenshots, listing copy, permission justifications, and a live
privacy policy at <https://github.com/MrMalkio/tabatha/blob/main/PRIVACY.md>.

### Why unlisted

Unlisted = anyone with the link installs it; it never appears in store search. Right for demo
users and external staff: no dev mode, no scripts, native auto-update, but not a public launch.

### Cutting a store release

```bash
npm run build:store    # → store-assets/tabatha-store-v<version>.zip
```

This strips the `"key"` field from the staged manifest (the store rejects uploads carrying one)
and validates the payload (entry pages present, no sourcemaps, no dotfiles).

Then either:
- **API (preferred, zero-touch):** `npm run cws:publish` — see `scripts/cws-auth.mjs` for the
  one-time OAuth setup, then uploads + publishes without any clicking.
- **Manual:** dev console → the item → Package → Upload new package → Submit for review.

### The two things to know

1. **Store installs get a different extension ID.** The store strips the pinned key and assigns
   its own. A person moving from the staff bundle to the store build gets a *fresh* install —
   their data returns by **signing in to Cloud Sync**, not by local carry-over. Don't run both
   at once; remove one first.
2. **Review takes days, not hours.** `identity` + `<all_urls>` + `scripting` is the profile
   Google flags for manual review. Every update goes through review too — so the store is not
   the channel for a same-day fix. Channel 1 is.

---

## Which channel for whom

- **Staff who need today's build / same-day fixes** → Channel 1. It's live, it's instant, and
  it's under our control.
- **Demo users, execs, anyone external, anyone you don't want running dev mode** → Channel 2,
  once approved.
- **Both can coexist** — different IDs, different update paths. Just not in the same profile.
