# Parallel Merge Strategy — Evaluation

> **Your proposal:** *"Is there a world where on different branches we write all of the new services in batches on different branches pulling out the old code from the monolith, merging only the services to main and not the edited background, and then add the edited background to main last? Is this stupid, is there a better idea or should I just let you go with what you've decided already?"*

**Verdict: not stupid — but only ~70% of the way to the safest strategy.** Below: your version, what's risky about it, and the version I'd recommend.

---

## Your strategy, restated

1. Spawn N branches (one per service or batch).
2. Each branch extracts a service's logic from `background.js` **into a new file** and leaves `background.js` untouched.
3. Merge all service-file branches into `master`. The new files exist alongside the still-monolithic `background.js`.
4. Last, merge a single `background.js` rewrite that switches the router over to use the services.

### What works about this

- ✅ Service files can be reviewed in isolation — no merge conflicts on `background.js` between agent branches.
- ✅ Each service ships independently — partial regressions are easier to bisect.
- ✅ Three agents can work truly in parallel without blocking each other on the monolith.
- ✅ Master keeps shipping during the refactor — service files exist but are dead code until the final switch.

### What's risky about it (as stated)

1. **Dead code in master is invisible to verification.** The service file isn't wired up, so loading the extension never executes it. You don't know it works until the final switch — at which point conflicts/regressions show up in one big bang.
2. **The final `background.js` PR is huge.** It deletes ~2,800 lines and rewires every handler at once. That's the worst PR to review and the worst to roll back.
3. **The contracts can drift silently.** If `tabService.js` returns `{ ok: true }` but the old in-`background.js` handler returned `{ success: true }`, no caller breaks until the switch flips. Then everything that depended on `success` breaks at once.
4. **Cross-service orchestration is hidden.** Cases like `RESUME_FOCUS` calling into `clockService.endBreakIfActive()` can't be tested until both services are wired — but the wiring is the last PR.

---

## Recommended adjustment: "router-thread" pattern

Same parallel work, with the router converted in **the first PR**, not the last, plus per-service feature-flag cutover.

### Step 1 — Phase 0 + Phase 1 (sequential, on `refactor/decomp-v2`)

- Pre-decomp docs + version sync script land on master.
- Foundation (`constants.js`, `helpers.js`, `storageService.js`, `archiveService.js`, `bootstrap.js`) lands on master.
- **Router skeleton lands on master**: a `chrome.runtime.onMessage.addListener` that iterates over `[]` of services, falling through to the existing inline `switch` in `background.js` when no service handles the message. **Behavior identical to today**, but the extension is now structurally ready for services.

### Step 2 — Phase 2–5 (parallel, one branch per service)

Each agent branch:
1. Creates `services/<name>Service.js` and copies the relevant handlers in.
2. **Deletes those handlers from `background.js`'s inline `switch`.**
3. **Registers the new service in the router's array** (one-line change).
4. Adds a row to `docs/architecture/message-contracts.md` freezing the response shapes for the handlers it owns.

Because the router falls through to the inline switch for unowned message types, each service branch is **independently shippable and independently revertable**. Each merge to the integration branch shrinks `background.js` by another ~300 lines.

### Step 3 — Phase 6 (sequential, on integration branch)

Once every handler is owned by a service, `background.js` is already at ~300 lines — the inline switch is empty. The "final" PR is just: delete the now-empty switch and verify the router still works.

### Step 4 — One PR to `main`

Integration branch merges to `main` after a full regression pass.

---

## Comparison

| Property | Your strategy | Recommended ("router-thread") |
|---|---|---|
| Parallel work | ✅ Yes | ✅ Yes |
| Dead code in master between merges | ❌ Yes (until final switch) | ✅ No — every merge is live |
| Conflicts on `background.js` | ✅ Avoided | 🟠 Small per-service edit (one `switch` block + one router array entry) — usually no conflict because each service touches different cases |
| Contract drift detection | ❌ Late (final switch) | ✅ Early (caught on first integration test after each merge) |
| Size of final PR | ❌ Massive (full router rewrite) | ✅ Trivial (delete empty switch) |
| Rollback per-service | ❌ All-or-nothing | ✅ Revert any single service merge |
| Time to first shippable improvement | ❌ End of decomp | ✅ After Phase 2 first merge |
| Integration branch needed? | Optional | ✅ Yes (`refactor/decomp-v2` as long-lived) |

---

## Conflict math (why the per-service edits don't fight each other)

The current `background.js` `switch` has ~79 `case` blocks. Each service branch deletes a contiguous subset of cases (e.g. `tabService` removes the ~17 tab-related cases). Git can usually merge non-overlapping deletions from the same file as long as line ranges don't overlap, which is true here because each service owns disjoint cases.

The single line that **does** conflict between branches is the router's service array:

```js
const services = [tabService, focusService, taskService, clockService, ...];
```

Each branch adds one entry. Resolution is trivial (alphabetize). Worst case: the integrator does it once during merge.

---

## When your original strategy is actually better

- If you don't trust the router-skeleton to be stable (you want zero changes to the dispatch path until the very end), your "service files as dead code" approach wins on isolation.
- If the team is large and you want each agent to ship a fully self-contained PR without coordinating on the router array, dead-code first is simpler to coordinate.
- If `background.js` is being **completely rewritten** (not refactored), waiting to swap it makes sense.

None of those apply here. The router is small (~50 lines), the dispatch contract is simple, and the rewrite is mechanical.

---

## Final recommendation

**Use the router-thread pattern.** It preserves every benefit of parallel work while removing the "big bang" final PR and surfacing contract bugs at the earliest moment.

---

## Decision (2026-05-13)

**Selected: router-thread pattern.** `refactor/decomp-v2` is the long-lived integration branch; service PRs merge into it, not master. Final PR `refactor/decomp-v2 → main` happens after Phase 6.
