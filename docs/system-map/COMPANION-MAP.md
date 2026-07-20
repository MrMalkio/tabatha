# Companion State Survey — Desktop Companion Branches, Runtime, Release Path

> Author: Argus (AG1) — read-only survey. Asana task `1216679069896234`.
> Snapshot time: **2026-07-18 ~12:51 ET**. Note: `"C:/Users/mrmal/le dev/Tabatha"` (main dir) changed branch
> and entered a live merge conflict (`UU Tabatha_Changelog.md`, branch flipped to
> `feat/site-sidecar-promo-clean`) *while this survey was running* — another agent is actively working
> there. Numbers below for that dir are a snapshot, not a guarantee of current state.
>
> This file does **not** touch `SYSTEM-MAP.md` (Hermes-owned) and was not committed (CeeCee reviews+commits).

---

## 1. `tabatha-desktop` repo — `"C:/Users/mrmal/le dev/tabatha-desktop"`

### 1.1 Remote / backup state — **#1 RISK, CONFIRMED**

```
git remote -v   →  (empty, no output)
git branch -vv  →  no branch shows a [origin/...] tracking ref
```

**Confirmed: this repo has no remote configured at all.** The entire Desktop Companion codebase —
4 branches, all Rust source, the Cortex capture work, the hardening/updater work, the code-signing
pipeline — exists on **exactly one machine** (this one) with zero off-machine backup. A disk failure,
accidental `rm`, or corrupted `.git` here is unrecoverable data loss for the whole companion product.
This is the single highest-priority action item in this survey.

### 1.2 Branches

| Branch | Version (Cargo.toml / tauri.conf.json) | Last commit | Ahead / behind `master` | Worktree | Uncommitted/untracked |
|---|---|---|---|---|---|
| `master` | 0.2.0 | 2026-07-16 20:04:02 -0400 | baseline | — (not checked out) | n/a |
| `feat/hardening-and-updater` **(checked out)** | **0.2.1** | 2026-07-17 18:05:55 -0400 | 3 ahead, 0 behind | `"C:/Users/mrmal/le dev/tabatha-desktop"` | none (clean) |
| `feat/code-signing` | 0.2.0 | 2026-07-17 14:13:19 -0400 | 1 ahead, 0 behind | not checked out | n/a |
| `feat/cortex-capture` | 0.2.0 | 2026-07-10 12:35:00 -0400 | 0 ahead, 2 behind (fully merged into master) | not checked out | n/a |

Graph (newest first):
```
* 3e08144 (hardening-and-updater) test: offline updater-signature verification example
* 3780a27 build: emit updater artifacts + drop dead sep4/PathBuf
* 76a4017 fix: origin-gate :9147 socket, honest tracking, live category rules, local day-roll
| * a4fc95b (code-signing) feat: wire Windows Authenticode signing pipeline (cert-gated no-op)
|/
* 18cbe5c (master) docs: correct false "no screenshots" claim + stale 0.1.0 version (v0.2.0)
*   dbf8cd7 merge: feat/cortex-capture (already folded into master)
```
`feat/cortex-capture` is fully absorbed into `master` (0 unique commits) — it's a historical branch tip,
not pending work. `feat/code-signing` and `feat/hardening-and-updater` both branch off the same point
(`18cbe5c`) and have **not** been merged into each other or into `master` yet — they will need a rebase/
merge reconciliation before a combined release build.

### 1.3 Build health (on checked-out `feat/hardening-and-updater`, Rust 1.96.1 / cargo 1.96.1)

- `cargo check` → **passes clean**, `Finished 'dev' profile ... in 30.17s`.
- `cargo test --no-run` → **compiles clean**, both `tabatha_desktop_lib` and `tabatha_desktop` test
  binaries build successfully.
- Test count: **87** `#[test]`-annotated functions in `src/` (grep count of the attribute; did not execute
  the suite, per read-only scope).
- Branch is buildable and testable as of this snapshot.

### 1.4 Release artifacts

`src-tauri/target/release/` contains a built `tabatha-desktop.exe` (16.2 MB, timestamped **2026-07-16
19:52**, i.e. built from `master` at 0.2.0 — predates the `feat/hardening-and-updater` 0.2.1 work) plus a
`bundle/` with:
- `bundle/msi/Tabatha Desktop_0.2.0_x64_en-US.msi`
- `bundle/nsis/Tabatha Desktop_0.2.0_x64-setup.exe` (+ `.sha256`)

**These installers are stale (0.2.0)** relative to the currently checked-out 0.2.1 hardening/updater
branch — no 0.2.1 `.msi`/setup.exe has been built yet. Per Plan 019, a fresh release build off
`feat/hardening-and-updater` (or a merged `master`+hardening+code-signing branch) is needed before this
can ship to team machines.

---

## 2. Runtime on this machine (snapshot)

| Check | Result |
|---|---|
| Tabatha Desktop process running (`Get-Process`) | **Not running** — no `tabatha*` process found |
| WS `:9147` listening (`Test-NetConnection`) | **Not listening** — `TcpTestSucceeded: False` |
| Startup entry (`HKCU...\Run`) | Present: `TabathaDesktop` → `"C:\Users\mrmal\le dev\tabatha-desktop\target-deploy\debug\deps\tabatha_desktop-1b517e50aaafe9d7.exe"` — **points at a debug build**, not a release/installed binary, and the target isn't currently running despite the Run-key entry. |
| `%APPDATA%\Tabatha Desktop\extension\` | Present, populated (`manifest.json`, `popup.html`, `home.html`, `sidebar.html`, `settings.html`, `workshifts.html`, `activity.html`, `changelog.json`, `.tabatha_version`) |
| Extension version served by companion | **`6.7.21`** (both `manifest.json` `"version"` and `.tabatha_version` agree), last written 2026-07-17 11:11 / 2026-07-16 14:42 |

**Version drift, confirmed and worse than the task brief assumed:**
- Companion-served extension: **6.7.21**
- `update-channel` branch `latest.json`: advertises **6.7.23** (published 2026-07-17T18:10:19Z)
- `staging` (Tabatha repo) HEAD: **6.7.27** (moved to 6.7.28 mid-survey, see §3)
- Fixed Chrome-load `dist` at `"C:\Users\mrmal\Le Dev\Tabatha\dist"`: **6.7.28** (not 6.7.24 as the task brief assumed — someone has rebuilt/mirrored dist since that assumption was written)

So the companion is currently serving an extension **7 versions behind** the current `dist`/staging tip,
and even the *advertised* update-channel manifest (6.7.23) is 5 versions behind. There is also a second,
unrelated self-heal mechanism — a `TabathaExtensionMirror` startup task running
`"C:\Users\mrmal\AppData\Local\Tabatha\mirror-extension.ps1"` — that mirrors `dist` into
`%LOCALAPPDATA%\Tabatha\extension` for Chrome's unpacked-load stability. That mirror path is **separate**
from the companion's `%APPDATA%\Tabatha Desktop\extension\` — the two extension copies are not the same
file tree and can drift independently. Worth flagging as a second source of "which version is actually
running" confusion, distinct from the companion swap-fix path.

- SQLite activity DB present at `%APPDATA%\com.flux.tabatha-desktop\tabatha_activity.db`, plus a
  `tabatha_activity.corrupt-2026-07-10_124103.db` — a prior corruption/recovery artifact from before the
  FIX-06 crash-hardening commit (`d2ac45d`) landed on `master`.

---

## 3. Companion-adjacent Tabatha-repo state

Main dir: `"C:/Users/mrmal/le dev/Tabatha"` (currently on branch `feat/site-sidecar-promo-clean`,
mid-merge with an unresolved conflict on `Tabatha_Changelog.md` — **another agent is actively working
here right now**; treat everything in this section as a snapshot, not current truth).

| Branch/worktree | State vs `staging` | Notes |
|---|---|---|
| `feat/companion-release` (worktree `"C:/Users/mrmal/le dev/Tabatha/.claude/worktrees/companion-release"`) | **0 ahead, 30 behind** — fully merged into `staging` already, 0 unique commits | Worktree is clean (no uncommitted changes). This is stale/fully-absorbed, not pending work — **prunable**. |
| `fix-updater` worktree (`"C:/Users/mrmal/le dev/Tabatha/.claude/worktrees/fix-updater"`, branch `fix/updater-swap`) | Merged into `staging` via **PR #28** (`419e7df Merge pull request #28 from MrMalkio/restore/ext-6.7.24`, confirmed via `git merge-base --is-ancestor 69d9399 staging` → yes) | Worktree clean, no uncommitted changes. **Confirmed prunable** as the task suspected. |
| `feat/companion-update-manifest-clean` (main dir's branch as of survey start) | Was 2 ahead / 0 behind `staging`; merged into `staging` via **PR #32** partway through this survey (`97e2d31 Merge pull request #32 from MrMalkio/feat/companion-update-manifest-clean`) | Contains `feat(site): add desktop companion updater manifest (v0.2.1)` + `chore(release): bump version to 6.7.28`. Now fully absorbed into `staging`. |
| `feat/companion-update-manifest` (Koda's carve-out, task `1216679069945012`) | 30 ahead / 6 behind `staging` (as of snapshot) | **Reference only per instructions — not acted on.** Diverged from `feat/companion-release`'s tip with 6 extra commits (updater manifest + headbox restore + Asana widget/task-mirror features), i.e. broader in scope than just the manifest work. |
| `update-channel` ref | `latest.json` → `{"version":"6.7.23", "zipUrl": ".../ext-v6.7.23.zip", "published":"2026-07-17T18:10:19Z"}` | Stale vs. current `staging`/`dist` (6.7.27→6.7.28) and even vs. the companion-served 6.7.21 sits below it in the wrong direction (channel is *ahead* of what's deployed, *behind* what's built). |

---

## 4. Action table

Per-branch/worktree recommendation:

| Item | Recommended action | Status |
|---|---|---|
| `tabatha-desktop` repo — add a remote | **Add a GitHub remote + push all 4 branches now** | **OPEN — highest priority, no owner assigned** |
| `tabatha-desktop: feat/cortex-capture` | Delete local branch (fully absorbed into `master`, 0 unique commits) | OPEN |
| `tabatha-desktop: feat/code-signing` vs `feat/hardening-and-updater` | Merge/rebase one onto the other before next release build — both branch off `master@18cbe5c` and don't contain each other's work | OPEN |
| `tabatha-desktop: master` | Merge in `feat/hardening-and-updater` once reconciled with code-signing | OPEN |
| `tabatha-desktop` 0.2.1 release artifacts | Build fresh `.msi`/setup.exe off the merged branch (current bundle is stale 0.2.0) | OPEN |
| Tabatha repo: `feat/companion-release` worktree+branch | **Prune** (fully merged, 0 unique commits, clean worktree) | OPEN, safe |
| Tabatha repo: `fix-updater` worktree+branch (`fix/updater-swap`) | **Prune** (merged via PR #28, clean worktree) | OPEN, safe — confirms task's suspicion |
| Tabatha repo: `feat/companion-update-manifest-clean` | No action needed — merged via PR #32 during this survey | **DONE** (as of 2026-07-18 ~12:5x ET, by someone else, mid-survey) |
| Tabatha repo: `feat/companion-update-manifest` (Koda's) | No action — reference only, Koda's active carve-out | N/A — do not touch |

### End-to-end path: deliver the swap-fix to team machines

| Step | Status | Owner |
|---|---|---|
| 1. Build extension release zip at target version | **Open** — current `dist` is 6.7.28, no zip built from it yet that this survey found | unassigned |
| 2. Upload zip to Supabase Storage / GitHub Release | **Open** — last published release artifact referenced by `update-channel` is `ext-v6.7.23.zip` (2026-07-17) | unassigned |
| 3. Bump `update-channel` `latest.json` to the new version | **Open** — channel still reads 6.7.23; needs bump to match whatever gets built/published in step 1-2 | unassigned |
| 4. Companion swap (companion picks up new zip via updater, replaces `%APPDATA%\Tabatha Desktop\extension\`) | **Open** — `fix/updater-swap` (the code path for this) is merged to `staging`, but companion itself isn't running on this machine right now (§2) and is still serving 6.7.21, so no swap has occurred here | unassigned |
| 5. Verify team machines actually receive it | **Open** — no evidence surveyed of any machine beyond this one | unassigned |

This is the same gap SYSTEM-MAP §7.3 step 5 already flags as open — this survey confirms it is **still
open, and the gap is wider than previously recorded**: dist/staging have moved to 6.7.28 while the
update-channel manifest (6.7.23) and the actually-deployed companion extension (6.7.21) have not moved
in step with it.

---

## 5. Summary — top findings

1. **`tabatha-desktop` has no git remote at all — single point of failure.** Every branch (master +
   3 feature branches, all Rust source) lives only on this one machine with zero backup. Highest-risk
   item in this survey.
2. **Version drift is worse than assumed:** companion serves ext **6.7.21**, update-channel manifest
   advertises **6.7.23**, `dist`/`staging` are actually at **6.7.28** (not 6.7.24 as the task brief
   assumed) — a 7-version gap between what's built and what team machines run, plus a second independent
   mirror path (`%LOCALAPPDATA%\Tabatha\extension`) that can drift on its own.
3. **Companion is not running on this machine right now** — no process, WS `:9147` not listening, and the
   one Run-key startup entry points at a stale debug build path, not a release binary.
4. **Two of the three suspected-stale worktrees are confirmed safe to prune**: `feat/companion-release`
   (fully merged, 0 unique commits) and `fix-updater` (`fix/updater-swap`, merged via PR #28) — both
   clean, no uncommitted work lost by removing them.
5. **`feat/code-signing` and `feat/hardening-and-updater` diverged from the same point and don't contain
   each other's work** — will need reconciliation before a combined 0.2.1(+signing) release build; current
   release artifacts on disk are stale 0.2.0 installers.

Environment note: the main Tabatha repo dir was mid-merge (branch `feat/site-sidecar-promo-clean`,
unresolved conflict on `Tabatha_Changelog.md`) during this survey, and `staging` advanced by a merged PR
(#32) while the survey was running — confirms other agents are concurrently active on companion-adjacent
work.
