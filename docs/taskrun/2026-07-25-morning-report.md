# Nightly Bug-Fix TaskRun — 2026-07-25/26 — Morning Report

**Lead:** CeeCee (night-shift orchestrator, direct execution — no builders dispatched).
**Shape:** the vetted queue was empty, so this was a short run. What follows is one
significant find, verified end to end, plus one recurring-drift fix.

---

## The one thing to know

**Your fleet had silently rolled back to 6.7.76, losing the 6.7.78 clamp release.
It is restored and live-verified.**

Last night's report told you 6.7.78 was live on the fleet channel. It *was* — and then
it wasn't. A later site deploy from the `staging` tree put every managed Chrome back on
6.7.76. Nothing failed, nothing logged, and the staff channel stayed correctly on 6.7.78,
so the two channels quietly disagreed all day.

That means the sync-integrity work Koda cleared — the unclamped elapsed fix, the 37h
billing corruption, the cross-surface elapsed disagreement — **was not reaching the
managed fleet today**, whatever the report said.

Now: `update.xml` → 6.7.78, crx serves `Cr24` at 556,353 bytes, 6.7.76 retained for
rollback. Verified with cache-busted reads after deploy.

**I did not cause it.** I took a cache-busted baseline *before* deploying anything: the
channel already read 6.7.76 and `tabatha-6.7.78.crx` already returned the 404 HTML
fallback. The rollback predates tonight.

---

## Why it happened (structural, not a slip)

The jbdka channel's entire state is files in the site tree — `update.xml` plus the `.crx`
beside it — and `site:deploy` publishes a **full snapshot**. So a site deploy from any
tree that predates the newest release downgrades the fleet as a side effect. The 6.7.78
release was made from the `fix/sync-integrity-cluster` worktree; `staging` never carried
those two files; the next site deploy from `staging` reverted them.

This will happen again for as long as a release lives in one tree and site deploys come
from another — which, given how this repo works, is the normal case.

**Guard shipped:** `scripts/check-enterprise-channel.mjs`, wired into `site:deploy`,
fail-closed. It rejects a dangling crx reference, a non-CRX3 file (a 404 page saved as
`.crx` looks exactly like this), a wrong signing id, an inner-version/`update.xml`
mismatch, and a tree that would publish a **lower** version than the live channel serves.

I proved the guard against the real incident rather than asserting it: re-pointing the
tree at 6.7.76 with 6.7.78 live produces
`✘ ROLLBACK: live fleet channel serves 6.7.78, this tree would publish 6.7.76` and exit 1.

---

## Shipped and live-verified

| What | Proof | Commit |
|---|---|---|
| **Fleet channel restored to 6.7.78** | cache-busted `update.xml` = 6.7.78; crx `Cr24` 556,353 bytes (byte-identical to the branch artifact); 6.7.76 kept | `c429abe` |
| **Enterprise preflight guard** | passes clean on the real tree; blocks the simulated rollback with exit 1 | `c429abe` |
| **`/show` version badge automated** | live `/show/` badge moved v6.7.73 → v6.7.76; `/docs/` unchanged; `/`, `/download`, `/sidecar/` all 200 | `4b5bd4a` |
| **Ops runbook: rollback hazard + guard** | §2.2b | `06b1122` |
| **Pair-watch evidence artifacts committed** | untracked from last night; no secrets (env-var names only, verified) | `4ef6155` |

Re-verified before publishing, per OPERATIONS §2.2b step 3: crx_id
`jbdkacccpknbiphigeabcdojemnhacjj`, inner manifest version `6.7.78`.

Gates: 768/768 tests, `site:build` green, working tree clean, no version bump (site/ops
only — see below), no `Co-Authored-By`.

---

## The `/show` badge fix (the small one)

`site/docs` was automated on 2026-07-24 after the audit found 15/16 pages stale. `site/show`
was left hand-maintained — commit `9ee9039` hand-synced 19 badges to v6.7.73 that same
night, and they were stale again within a day. Same defect class, second occurrence, so I
automated it the same way rather than hand-patching a third time.

Deliberately **not** stamped: the mock UI inside the showcase demos (`Tabatha v6.7.16-α`,
the release-notes overlay, the version-history list) are period-accurate props, and
"brand-faithful to vX" is a curated claim about which release the mockups reproduce — it
should move when the mockups are actually redrawn, not automatically. Left at v6.7.73.

The stamper now also **fails the build** on a page carrying a version badge with no
marker, which is precisely how both directories drifted silently.

---

## No version bump — reasoning stated, since the standing rule is bump-every-commit

All four commits are site/ops only; no extension source changed. Precedent is `9ee9039`
(site-only, no bump). More importantly, bumping would mint a **6.7.77 on staging that
collides with the existing unmerged 6.7.77** on `fix/sync-integrity-cluster`, and would
make the public badge advertise a version with no CRX behind it. Flagging explicitly
rather than letting it look like an oversight.

---

## Queue status

**Empty — and that is the correct state, not a miss.** `docs/taskrun/nightly-bugfix-queue.md`
does not exist because the 6-hourly triage agent writes nothing when there is nothing new,
and there was nothing new: the only feedback submission since the last triage is
`1216867448639741` "[E2E test] Vail platform review", an agent-generated test from last
night's own run. The real prior item (`1216832543077901`) was fixed as TR-20. TR-01–TR-19
were closed on 2026-07-23.

I verified this against Asana directly rather than trusting the file's absence.

Per the charter this was a "skip quietly" night. I worked the one genuinely unworked
leftover — TR-19's version-drift half — and the fleet finding surfaced from verifying
last night's release claims rather than taking them at face value.

---

## Open for you

`docs/taskrun/2026-07-25-questions.md` — two items, both decisions rather than
investigations. The load-bearing one is whether `fix/sync-integrity-cluster` (6.7.78
source) merges to `staging`: the fleet now runs a CRX whose source is not on the main
line, which is stable but not a state to leave sitting.
