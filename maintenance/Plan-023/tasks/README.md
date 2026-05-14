# Plan 023 — Task Files

Each task file is self-contained: dependencies, branch name, expected diff scope, verification steps, parallelizability.

> **Reading order:** start at `00-pre-decomp.md` and follow the dependency graph below.

## Dependency graph

```
00 (pre-decomp, docs, version script, branch cleanup)
   │
   ▼
01 (foundation: constants/helpers/storage/archive/bootstrap + router skeleton)
   │
   ├──► 02 (notification + settings)        ┐
   │                                         │
   ├──► 03 (tabTracking + category + session)│  parallel after 01
   │                                         │
   └─── all three converge ─────────────────►┘
                          │
                          ▼
        ┌─────────── 04a tabService ──────────┐
        │                                      │  4a / 4b / 4c / 4d
        ├─────────── 04b focusService ─────────┤  can run in parallel
        │                                      │  (different files,
        ├─────────── 04c taskService ──────────┤   different cases)
        │                                      │
        └─────────── 04d clockService ─────────┘
                          │
                          ▼
              05a groupService + blockgateService (parallel pair)
              05b companionService
              05c alarmService   (depends on 05b)
                          │
                          ▼
                    06 router finalization
                          │
                          ▼
                  full regression → PR to main
```

## Parallel vs sequential summary

| Task | Can start when | Parallel with |
|---|---|---|
| 00 | Now | — |
| 01 | 00 done | — (foundation must be solid first) |
| 02 | 01 done | 03 |
| 03 | 01 done | 02 |
| 04a | 02 + 03 done | 04b, 04c, 04d |
| 04b | 02 + 03 done | 04a, 04c, 04d |
| 04c | 02 + 03 done | 04a, 04b, 04d |
| 04d | 02 done | 04a, 04b, 04c |
| 05a | 04 integration | 05b |
| 05b | 04 integration | 05a |
| 05c | 05b done | — (needs companion service in place) |
| 06 | All 05 done | — |

Three-agent allocation that minimizes wall-clock time:
- **Agent A:** 02 → 04a → 05a
- **Agent B:** 03 → 04b → 05b → 05c
- **Agent C:** 04d → 04c → 06

Phase 0, 1, and 6 are sequential and best handled by whoever's leading.

---

## Mandatory pre-merge step

Every PR merging into `refactor/decomp-v2` (and the final PR to `main`) **must append rows to** [../semantic-changes.md](../semantic-changes.md) for each semantic change introduced. Per user direction (2026-05-13): the version bump is computed in Phase 6 from this ledger. No phase ships its own version number.

## Decisions locked in (2026-05-13)
- **Merge strategy:** router-thread (see [../parallel-merge-strategy.md](../parallel-merge-strategy.md)). `refactor/decomp-v2` is the long-lived integration branch.
- **Branch cleanup:** complete. `refactor/service-arch`, `feat/follow-through-engine`, `feat/v3-ux-overhaul` archived as `archive/*` tags and deleted (local + origin).
- **Version bump:** deferred to Phase 6. Pre-Phase-1 baseline is `3.34.5`.
- **Phase 0:** in flight on `chore/plan-023-pre-decomp`. Phase 1 starts after Phase 0 merges to `master`. Phases 2+ parallelize per the graph above.
