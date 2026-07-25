
## Backend integrity (CeeCee, verified against prod)

**B1 — Migration 029 has no file anywhere.** It's applied in production, but no file exists in any
of the 33 worktrees. Everything since is now consolidated and ledger-correct (050/058/059/060), so
this is the last gap. Do you remember what 029 was (dashboard-applied change? deleted branch?), or
should we accept prod as truth and write a `029_historical_placeholder.sql` documenting that its
contents are unknown-but-live? **Recommended: placeholder** — it makes the sequence reproducible
and stops future agents re-flagging it.

**B2 — Two undocumented edge functions are ACTIVE in production**: `asana-task-action` (v5) and
`asana-widget` (v3, "Tabatha Asana widget"). Neither has a folder in the repo, so we can't diff
what's actually running. Likely descendants of the old Flux Asana widget server. Do you want them
(a) sourced back into the repo, or (b) decommissioned? Untouched pending your call — they're live
surface and deleting blind would be reckless.

## B3 — Companion auto-updater signing key is lost (needs your memory, or a decision)

Tam traced the whole chain and stopped rather than fabricate a signature — right call. Findings:

- `site/desktop/latest.json` (the **Tauri auto-updater** manifest) is frozen at 0.2.1.
- Updating it requires a **minisign signature** for the 0.3.10 installer. No `.sig` exists, and the
  **private key isn't anywhere** — not in the repo, `$HOME/.tauri`, env, or any worktree. Git
  history shows it lived only in your shell for one session (commit `9492e03` explicitly turned
  updater artifacts back off, calling the key "a pending decision").
- Generating a NEW keypair does not rescue already-released binaries: the public key is compiled
  into each build, so the shipped 0.3.10 can only ever trust the original key.

**Question:** is that key recoverable (password manager, PS machine, shell history)? If genuinely
lost, the only path is a new keypair + a new release built with it — and every existing install
must be replaced manually once.

**Severity is lower than it first looks.** Two different update paths exist and only one is broken:
- **Broken:** Tauri silent auto-download-and-install (needs the signature).
- **WORKING:** the manifest-based notifier that shipped in 0.3.10 reads `companion-latest.json` in
  cloud storage — which I already pointed at 0.3.10 — so companions correctly *detect and announce*
  updates and link to the download. Users just click through and install rather than it happening
  silently. Your original complaint ("no visible activity, doesn't say it's out of date") is fixed;
  this remaining gap is only the silent-install convenience.

**Recommended:** treat the key as lost, mint a new keypair, and fold the new pubkey into the next
companion release rather than cutting one just for this. Say the word and it's a small task.

## B4 — PS (Pondecean-Silver) is reachable but won't authenticate

Status tonight: PS went from fully offline → **network-reachable** (ping replies, port 22 open) part
way through the run. Heimdall accepts and dispatches jobs to it, but they **FAIL** immediately —
consistent with Kael's finding that sshd rejects publickey for `mrmal`, and the Tailscale route
(100.73.84.45:22) times out separately.

So PS has been unusable for compute all night despite being awake. Nothing tonight depended on it —
OD carried the run — but it's dead weight in the fleet until the key is fixed.

**Needs you:** either re-add OD's public key to PS's `authorized_keys`, or confirm you'd rather PS
stay out of the fleet. (Related known issue from earlier: PS's `gh` token is invalid too, so even
once SSH works it's compute-only, not a push target, until you re-auth `gh` on it interactively.)
