# TaskRun 2026-07-24/25 — Morning Report

**Lead:** CeeCee (Fable 5, direct orchestration). **Executors:** Opus 5 / Sonnet 5 / Haiku by job.
**Adversarial review:** Koda. **Asana umbrella:** `1216867368858873`.
**Read first:** `docs/taskrun/2026-07-24-questions.md` — the top item is a one-click action that may
explain a large share of what you've been experiencing.

---

## The one thing to do first

**Reload the extension at `chrome://extensions`.** Your `dist` is 6.7.73 and *contains* the
elapsed-drift fix, but Chrome never reloaded the service worker — so **that fix has never executed on
your machine.** Live capture at 03:22:27Z, one focus, three surfaces, three numbers: extension
~451 min, Sidecar 201.9 min, published status 249.2 min, with `_startedAt` written without the
6.7.73 correction. Agents cannot do this (Chrome blocks `chrome://extensions` from the browser
tools). Until it's reloaded we cannot tell "not fixed" from "never ran."

---

## Shipped and live-verified

| What | Version | Proof |
|---|---|---|
| **Sidecar: `drifted` treated as running** | 0.13.10 | Live bundle grep + 148/148 tests |
| **Site: CSP fix — invite gate works again** | — | Single CSP header live; real invite minted → `{"valid":true}` from the site origin → cleaned up |
| **Site: docs version stamps** | — | All 16 pages now v6.7.73 (15 were stale at 6.7.41/6.7.48) |
| **Org-hours RPCs revoked** | — | ACLs verified: `postgres` + `service_role` only |
| **Migration ledger repaired + consolidated** | — | 050/058/059/060 files on staging; ledger shows all four |
| **Regina device dedup** | — | 18/18 removed, backup table retained |
| **OPERATIONS.md restored** | — | 279 lines recovered + §5.1–5.4 added |

### The big one: your tester onboarding was silently broken
`/download`'s invite-key check has been **CSP-blocked for every visitor since it shipped**.
Cloudflare Pages sends both the global and page-specific policies; browsers enforce the
**intersection**, so the global `connect-src 'self'` won and the request never left the page — no
console error, no network entry. Anyone you invited hit a dead end. Fixed, deployed, and proven end
to end with a real disposable invite.

---

## Security: one live leak closed, one live vector queued

**Org-hours v1 — REJECTED and revoked.** Koda proved it against your real org: calling
`get_org_hours_summary` **as regina (role `user`, not a manager, zero opt-ins in the database)**
returned your exact worked time for 2026-07-21 (~10h across 5 sessions), and a `generate_series`
sweep reconstructed the org's whole history because the RPC clamps neither window nor lookback.
His decisive point: **narrowing to managers fixes nothing** — an aggregate over three people is not
an aggregate, because any member computes `aggregate − their own hours`. The UI shipped that
subtraction *as a labelled feature*, so declining to share is exactly what exposes you. Migration 060
was already applied, so holding the UI was not a mitigation. **I revoked EXECUTE from `authenticated`
and `anon` on both RPCs.** Reversible; nothing user-facing breaks. See questions doc for redesign
options — my recommendation is (c) shelve until the shared-focus model lands, because the underlying
hours are wrong anyway (below).

**Pairing — root-caused; fix built, Koda-gated.** The code never expired, it was **burned**: redeem
sets `consumed_at` *before* minting the session, the mint hit a transient `403` during your project's
JWT-signing migration, and the retry then read "invalid or expired." Dex proved the deployed function
works today (live mint → redeem → real session), correcting my own stale-credential hypothesis —
**nothing was rotated.** The corollary is uncomfortable: Koda's brute-force finding is **not** masked
— redeem is unauthenticated, 6-digit, returns session tokens, and its 5-attempt lock is dead code
(hash lookup means wrong codes match no row, so `attempts` never increments). Measured exposure:
**0 live codes right now, 9 ever minted in 5 days**, so the window is the ~5 minutes after you mint
one. Fix built (atomic lease, real attempt counting, fail-closed limits, honest client errors),
awaiting Koda before deploy.

---

## Cross-surface sync — the definitive answer

Not one bug, not fifty: **two structural causes, two data bugs, and a fix that never ran.** That is
why 6.7.45, 0.12.0 and 6.7.73 each felt like progress and none of them closed it.

- **Structural (→ Plan 046):** nothing records *who wrote last*. `focus_items` has no `updated_at`,
  the extension re-uploads its entire local state each cycle, and its only adjudicator gates on
  *authorship* rather than *recency*. **37 of your 38 open intents are extension-authored**, so any
  edit made on the phone is reverted within a sync cycle — while creating a *new* intent survives,
  because that path goes through arbitration. Hence "half-synced."
- **Vocabulary (fixed):** surfaces disagreed on "running" — `drifted` is running to the extension in
  eight places but was invisible to the Sidecar, so a drifted focus fell through *both* tiers and the
  phone reverted to an older intent. **This was the real cause of "old intents in view"**; the two
  earlier fixes treated symptoms. Shipped as 0.13.10 with 4 regression tests it arrived without.
- **Fixed, awaiting Koda:** unclamped elapsed (37h14m billed to one intent), break-end regressing the
  clock event, dead devices winning clock arbitration, stale published elapsed — extension 6.7.75
  (791/791) and Sidecar 0.13.12 (159/159), both independently re-verified by me.
- **Known-bad data:** clock adoption duplicates shifts, inflating hours ~2.5× (2026-07-21 stored as
  ~12h across five rows for one ~4.9h shift). Another reason org-hours must not ship as built.

---

## Mistakes made tonight — stated plainly

1. **I clobbered `docs/OPERATIONS.md`.** I appended with `cat >>` in a tree that didn't carry the
   file; `>>` creates rather than fails, so the 279-line runbook became a 39-line stub for several
   hours. A records agent caught it, not me. Restored from `8c92cde`, with §5.3 codifying the rule.
2. **An agent dismissed your real focus gate twice.** I briefed the fleet to use `localhost` believing
   it isolated — but content scripts match `<all_urls>`, *including* localhost, so your real
   gatekeeper rendered over the harness with your real intents. Wren stopped on realizing and
   disclosed it. Briefing error was mine; §5.4 now forbids the pattern. **It did surface a real bug:**
   the 6.7.69 `[object Object]` self-heal misses `gatekeeper.js`'s direct read of
   `intentHistory`/`intentPresets` — so that corruption can still appear. Fix in progress.
3. **My stale-credential hypothesis for pairing was wrong** — Dex disproved it with a live test before
   anything was rotated. The gate worked as intended.

---

## Open for you

`docs/taskrun/2026-07-24-questions.md` — extension reload (⭐), org-hours redesign decision,
migration 029's missing file, two undocumented edge functions, the lost companion signing key
(notify path works; only silent auto-install is dead), and PS.

**PS:** I fixed two real SSH faults (dead Tailnet address; missing host-key entry for the hostname
Heimdall actually uses) — `ssh ps` works now. Heimdall's own dispatch still fails for a separate
reason inside its daemon. Nothing tonight was blocked by it.

**Production promotion: NO-GO** (Koda). The ledger couldn't reproduce prod (since repaired) and
extension E2E covered 3 of 15 checks because Chrome blocks browser tools from any other extension's
pages. Not promoted.

---

## Late addendum — the clamp saga (the night's best argument for review gates)

**Koda BLOCKED Corin's sync-integrity clamp**, with both defects reproduced against real modules:

- **K1:** the structural clamp measured a focus's life from `createdAt || startedAt` — the *later*
  anchor. But your **"I was working before I created this focus"** button deliberately sets
  `startedAt` EARLIER than `createdAt` (that IS the feature; `validateStartTime` pointedly does not
  bound by creation). Probe: created 14:00, backdated to 09:00, 5h credited → at 14:05 it reported
  **5 minutes**, and the next pause **banked** that. 295 minutes destroyed on disk, via a shipped
  button, silently.
- **K2:** the 12h ceiling was fed `now − lastResumedAt` for adopted focuses — but adoption sets that
  anchor from a **back-dated** `_startedAt` (the 6.7.73 fix), so it's *lifetime*, not a run. A 14h
  cross-surface intent would lose 2h05m on its first pause, and since `liveElapsed` clamps the
  display too, it would read 12h in the browser and 20.69h on the phone — the exact disagreement the
  work existed to eliminate.
- **P1:** the "we always record what we tried to write" safety stamp was being **nulled by the
  sanitizer** before it ever reached the database. The loss would have been genuinely silent.

**Remediation (6.7.77 ext / 0.13.13 sidecar, verified by me: 827 and 164 tests green, not deployed):**
Corin reproduced both as failing tests *before* fixing, rather than taking the verdict on faith. K1 is
now `min(createdAt, startedAt)` with a `life > 0` guard. For K2 he rejected the suggested offset hack
and fixed the data model instead — adoption banks the remote's accumulated time and starts a genuine
run at `now`, so the ceiling only ever sees real run time — then flagged the substitution to Koda
rather than quietly diverging.

**And the part that matters most:** applying Koda's K2 lens to his *own* Sidecar code, Corin found the
same defect there — worse, because that surface has no run anchor at all, so **any focus with >12h
accumulated would have been truncated on its next pause.** Nobody asked him to look. That's the
behaviour to keep.

**One judgement call, flagged not buried:** he did not implement liveness-based clamping (my stated
preference) — no synchronous liveness source exists on the pause path, and he judged a second
unbudgeted redesign inside an unblock commit to be the greater risk. It's written up for Plan 046,
and he asked Koda for an explicit verdict on whether the interim 12h ceiling is safe, committing to
escalate rather than ship if the answer is no.

**Status: still gated.** Nothing from this cluster is deployed. Extension **6.7.76** (Nell's
`[object Object]` sanitize fix + two crash-risk read sites) IS live on your machine and the fleet.

### Clamp saga — RESOLVED AND SHIPPED

Koda's re-review returned **SHIP WITH FIXES** and caught one more, worth its own line: Corin's Sidecar
recovery formula (`run = lifetime − banked`) was correct, but **active rows never published their
banked time**, so the subtraction got zero and collapsed straight back to lifetime — the same defect
recurring a *third* time, now across the wire, on the 37-of-38 row population. A 14h cross-surface
intent would have read **12h on the phone against 14h05m in the browser**, freezing the truncated
value if you paused from the phone. Fix was publishing one field already being computed. He also
caught the clamp anchor *receding* on repeated pushes (the function defaulted to `Date.now()` instead
of a frozen instant), making elapsed appear to grow at 2× real time for legacy-corrupt rows.

**Shipped and independently verified by me:**

| Surface | Version | Verification |
|---|---|---|
| Extension | **6.7.78** | fleet `update.xml` + staff channel + local dist all read 6.7.78; CRX id verified before publish; 6.7.76 kept for rollback |
| Tabby Sidecar | **0.13.14** | live bundle serves 0.13.14 with the clamp constant present |

833 extension tests, 166 Sidecar tests. Closes forensics #4/#5/#7/#9 plus ten defects raised across
two adversarial rounds.

**S4 is described honestly, in Koda's own wording:** closed for both pause paths on both surfaces now
that N1 landed, with the two *edit* paths (extension `setFocusStartTime`, Sidecar `updateFocus`) named
as the residual. Nothing claims S4 is fully closed.

**Deferred to Plan 046 with Koda's endorsement:** liveness-based clamping via `last_heartbeat_at`,
acceptance criteria taken from the audit's §S4 wording ("never bill focus time to a window in which no
device was alive"). His reasoning for allowing the 12h ceiling in the interim: now that both surfaces
measure a genuine continuous run, the ceiling only fires past 12h of *uninterrupted* running, where
the error direction is over-credit rather than loss.

**Corin's own retrospective, unprompted:** the same conceptual error — treating a back-dated anchor as
a run — recurred three times in his work, and each instance took an adversarial pass to surface. He
flagged that pattern himself for whoever scopes the Plan 046 liveness work.

Still untouched and out of scope: S1 (full-table push reverting Sidecar edits), S3, S6 (duplicate
shift adoption inflating hours ~2.5×), S8, S10.
