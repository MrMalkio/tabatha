
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

---

## Cross-surface sync forensics (Sable) — 6 observation questions

Full audit: `docs/audits/2026-07-24-sync-forensics.md`. Headline: "sync feels off" is **not** one bug —
it's two structural root causes, two independent data-integrity bugs, and **one fix that was built but
never actually ran**. Each question below is one line to answer and each one changes the fix ranking.

1. **Reload check (do this first).** Open `chrome://extensions`, confirm Tabatha reads **6.7.73**, click
   **Reload**. Then watch phone vs browser for ~10 min: **does the elapsed number still disagree?**
   We measured a live **47-minute** gap at 03:22Z, and proved the running service worker predates the
   6.7.73 back-date fix (the `dist` has it; Chrome never reloaded it). If the gap *survives* a reload,
   the fix is wrong rather than merely unshipped — that changes everything.
2. **"Tabby work", 2026-07-23 ~14:31.** You started "Turning over 60 North" on the phone then. **Was the
   browser closed / machine asleep between 2026-07-22 01:17 and that moment?** That action silently
   billed **37 h 14 m** of focus time to "Tabby work" (arithmetic matches to within 80 ms).
3. **The pause-that-came-back.** When you've paused/backburnered something from your phone and it
   reappeared — **was that intent originally created in the browser, or on the phone?** We predict
   browser-created ones bounce and phone-created ones stick. If phone-created ones *also* bounce,
   there's a second mechanism we haven't found.
4. **Break-end.** After ending a break in the browser, **has the app ever put you back on break by
   itself** within a minute or two?
5. **"Deskview on OD"** has been heartbeating `online: true` for **12.9 h** with no clock state. **Is that
   screen actually running, or is it a ghost?**
6. **Shift hours.** Do you trust the Work Shifts totals? 2026-07-21 is stored as **~12 h across five
   duplicate rows** for a single ~4.9 h shift. If you've been mentally discounting those numbers,
   that's independent confirmation.

**Gate flagged:** items 6 and the `focus_elapsed_ms` defect both sit directly under **org-hours v1** (T1).
Shipping that UI before they're fixed will render inflated hours to org members.

## ⭐ TOP OF LIST — one click, and it may explain a lot

**Reload the extension at `chrome://extensions`.**

Sable proved tonight that your `dist` **is** 6.7.73 and **does** contain the elapsed-drift fix — but
Chrome never reloaded the service worker, so **that fix has never once executed on your machine.**
Live capture at 03:22:27Z, one focus, three surfaces, three different numbers at the same instant:

| Surface | Elapsed |
|---|---|
| Extension (internal) | ~451 min |
| Sidecar / Context View | 201.9 min |
| `browser_profile_status` | 249.2 min |

`tags._startedAt` was being written *without* the 6.7.73 back-date correction, which is only possible
if the old worker is still running. So an unknown share of what you've experienced as "sync is off"
may simply be **a shipped fix that isn't running**. Reloading distinguishes "we haven't fixed it"
from "it was never live" — please do that before judging the sync work.

(Agents cannot do this for you: `claude-in-chrome` is blocked from `chrome://extensions` by Chrome's
own isolation guard — see OPERATIONS §5.y.)

## ORG-HOURS — needs your decision, not a patch

Koda REJECTED it and I revoked execute on both RPCs (leak closed — details in the Asana umbrella).
Two things make this a redesign rather than a fix:

1. **An aggregate over a 3-person org is not anonymous.** Any member computes `aggregate − their own
   hours`. The UI shipped that subtraction *as a labelled feature*, so declining to share is what
   exposes you.
2. **The underlying hours are wrong anyway** — Sable's bug #6: clock adoption duplicates shifts and
   inflates totals ~2.5×. 2026-07-21 is stored as ~12 h across five duplicate rows for one ~4.9 h
   shift. Shipping the UI would have shown your team inflated numbers.

**Options:** (a) org-level totals only, no per-person anything, no subtraction affordance; (b) explicit
mutual opt-in — hours visible only between members who have BOTH opted in; (c) shelve until the
#221 Lanes/shared-focus model lands and do it properly there. My recommendation: **(c), with (a) as
an interim if you need something now** — the data isn't trustworthy until #6 is fixed regardless.

## B4 (UPDATED) — PS: SSH fixed by me, Heimdall dispatch still broken

I fixed two genuine config faults tonight, both backed up (`~/.ssh/config.bak-2026-07-25`):

1. The `ps` alias pointed at the **Tailnet IP 100.73.84.45, which times out**. A stale comment claimed
   the LAN address broke during a subnet move — no longer true; it answers in 4ms. Repointed.
2. Heimdall dispatches to PS by its **registry hostname `Pondecean-Silver`**, not the `ps` alias — so
   it never used the `ps_auto` key and died on **host-key verification**. Added a matching entry.

**Result: `ssh ps` and `ssh Pondecean-Silver` both work now** (return `Pondecean-Silver`, key auth, no
prompt). So PS is usable for compute *directly over SSH* today.

**Still broken: `heimdall run --on ps` fails** even though the underlying SSH now succeeds — so the
remaining fault is inside Heimdall's own dispatch/daemon layer (its registry lists PS ONLINE with
node v26.4.0 and openssh 9.5p2, so it can see the machine; it just can't execute). Its `job status`
surfaces no error text, which is what makes this slow to chase.

**Needs you (small):** either run Heimdall's daemon/enroll step on PS so dispatch works
(`heimdall daemon start` / `heimdall enroll` on that box), or confirm you're happy for agents to use
plain `ssh ps "<cmd>"` for fleet compute and I'll write that into OPERATIONS as the sanctioned path.
Nothing tonight was blocked by this — OD carried the whole run — and honestly the bottleneck has been
review gates and human-only actions, not compute.
