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
