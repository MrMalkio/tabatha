# Morning Questions — 2026-07-25/26 Nightly TaskRun

Two items. Both are decisions, not investigations — the work around each is already done.

---

## Q1 ⭐ Merge `fix/sync-integrity-cluster` (6.7.78 source) into `staging`?

**The decision:** approve the merge (or tell me to hold), so the shipped fleet binary and
the main source line stop disagreeing.

**Why it needs you:** branch integration is a Global Rule 3 human-approval gate, so I did
not do it.

**Current state, precisely:**

| Surface | Version |
|---|---|
| Fleet enterprise channel (jbdka, managed Chromes) | **6.7.78** (restored tonight) |
| Staff channel (`latest.json`, GitHub release) | **6.7.78** |
| Your local `dist/` | **6.7.78** |
| `staging` **source** | **6.7.76** |
| `fix/sync-integrity-cluster` (the 6.7.78 source) | not merged |

So every distribution channel serves 6.7.78 while the source line that builds it sits on
an unmerged branch. That is stable — the CRX is signed, verified, and live — but it means
`staging` cannot currently rebuild what your fleet is running, and the next release cut
from `staging` would regress the clamp fixes unless the merge happens first.

**What I already did around it:** restored and live-verified the fleet channel, re-ran the
§2.2b id/version verification on the artifact, retained 6.7.76 for rollback, and shipped a
preflight that now blocks this class of rollback outright. Nothing here is blocked on the
merge — the merge is about getting the source line honest.

**Note:** `fix/sync-integrity-cluster` also carries 6.7.77 (Koda's BLOCK remediation), so
merging brings 6.7.77 + 6.7.78 together. That is also why nothing tonight bumped the
version: a staging bump would mint a colliding 6.7.77.

---

## Q2 "brand-faithful to v6.7.73" on `/show` — refresh the mockups, or restate the claim?

**The decision:** one of three, whenever convenient — (a) leave it, (b) let me auto-stamp
it with the nav badge, or (c) I reword it to something that does not rot (e.g. "brand
tokens from the shipped extension").

**Why I did not just fix it:** it appears 7 times on `/show` and reads as a claim about
*which release the mockups actually reproduce*. Auto-stamping it to the current version
would make the page assert freshness the mockups may not have — a content-accuracy claim,
not chrome — so I stamped only the 12 nav badges and deliberately left this alone.

Low stakes, purely public-copy accuracy. No work is blocked on it.

---

## Not a question, just so you see it

The nightly queue was legitimately empty (verified against Asana, not just the missing
file). The fleet rollback was found by re-verifying last night's "shipped and verified"
claims against the live surfaces rather than trusting the report — the report was written
in good faith and was true when written; a later deploy undid it.
