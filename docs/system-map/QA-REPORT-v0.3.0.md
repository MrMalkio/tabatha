# QA Report — Tabby Sidecar v0.3.0 (QA blitz)

**Author:** Rook (Cody3) · **Asana task:** [1216678873046118](https://app.asana.com/1/9526911872029/project/1214031898449333/task/1216678873046118) · **Date:** 2026-07-18
**Target:** LIVE https://tabatha.pondocean.co/sidecar + its Supabase backend (project `mtdgoahskcibjbhfvofx`)
**Method:** minted a real user session for mr@duckandshark.com (admin `generateLink` + `verifyOtp`, service-role keys via `supabase projects api-keys`), then drove the app's exact table/column queries (from `sidecar/src/data/*.ts`, `AuthContext.tsx`, `push.ts`) plus direct HTTP invokes of the two edge functions. All mutating tests ran against `[QA TEST]`-tagged rows on Malkio's real account, cleaned up afterward (see Cleanup).

## Scope note — branch moved under me mid-session

This worktree's branch is shared with other concurrently-running agents (Cindra, Cirra, Dex). Partway through this QA pass, three more feature merges landed live (Lane A chunk 1 + chunk 2, Epic 3/5/8 design docs), advancing `app.json`'s version from **0.3.0 → 0.3.1 → 0.4.0** while I was testing. This does not invalidate the results below:

- **Data flows, push pipeline, and feedback-fn tests are backend/schema-level** and unaffected — I diffed `focus.ts` across the range and confirmed the pause/resume/switch/resolve math is byte-for-byte unchanged; the merge only added additive `insertFocusEvent()` calls alongside the existing writes.
- **Static checks (`tsc`, footgun grep, live fetch) were re-run after the merge landed**, so they reflect current HEAD (v0.4.0), not a frozen v0.3.0 snapshot. `ContextView.tsx` changed substantially (170 lines, CV timeline/layout v2) — I grepped the new version for the same footgun classes (clean) but did **not** do a full line-by-line re-review of it; that's outside this task's stated v0.3.0 scope.
- **Bonus:** the new `sidecar/src/data/events.ts` (interval-pairing helpers) landed mid-session and let me write exactly the "interval pairing / dangling open intervals" unit tests the task asked for, more precisely than pure v0.3.0 could have supported.
- **Twice, my own untracked scratch files got swept into other agents' merge commits** in this shared worktree via what looks like broad `git add` sweeps — once for `sidecar/tests/timer-math.test.mjs` itself (landed in `3e42f20` before I'd finished it), once for my entire `.qa-tmp/` scratch directory. Both are resolved (scratch dir removed in `244c3d4`; test file extended + committed as `f6aeb34`). This is the second time this exact pattern has hit the session log (see `a60dda8`'s note) — worth someone tightening commit hygiene (`git add <files>`, not `-A`/`.`) across the concurrent-agent workflow.
- Live-fetch checks confirm the deployed site is healthy and serving `/sidecar/` correctly; I did not attempt to pin the exact deployed build's version string (deploy is a separate step from git HEAD and wasn't part of this task).

## Pass/Fail summary

| Area | Pass | Fail | Notes |
|---|---|---|---|
| 1. Data flows under RLS | 21 | 1 | H2 settings-race probe (see Bugs) |
| 2. Push pipeline (`send-focus-push`) | 15 | 0 | timer_expired / drifted / checkpoint_stale / focus_away all dedup correctly |
| 2. Feedback fn (`feedback-to-asana`) | 8 | 0 | auth, CORS, and origin-echo all correct |
| 3. Static/runtime (tsc + grep + live fetch) | 10 | 0 | 2 pre-existing tsc errors unrelated to v0.3.0/v0.4.0 (see Bugs, P3) |
| 4. Timer-math unit tests | 27 | 0 | committed, see Deliverables |
| **Total** | **81** | **1** | |

## Detailed results

### 1. Data flows under RLS

All queries run through the RLS-scoped, minted-session client (mirroring the app's own `supabase` client: schema `tabatha`, anon key + user JWT).

- **Intent lifecycle** (create → auto-pause-prior-active → switchTo → pause → resume → resolve): **PASS**. `intent_history` write confirmed. `createIntent`'s auto-pause-prior-active-sidecar-focus behavior confirmed.
- **Timer continuity**: **PASS**. Replicated `elapsedMsOf`/`_startedAt`-shift math against real rows — pause freezes `tags._elapsedMs` and it does not advance while paused (checked "3s later" while frozen); resume continues from the frozen value rather than restarting at 0; a `switchTo` mid-session also preserves the paused party's elapsed via the same freeze.
- **Focus tiers**: **PASS**. A paused, non-resolved focus is correctly picked as "current" when no active focus exists (confirmed against the account's real 32 other paused candidates, tier-only, not touching them). Resolving the last QA candidate correctly removes it from tier eligibility.
- **`focus_checkpoints` write/read**: **PASS**.
- **`tasks_registry` CRUD** (create/complete/reopen): **PASS**.
- **`clock_sessions` insert + `browser_profile_status` upsert**: **PASS**.
- **`browser_profiles` registration on `(profile_id, local_id)`**: **PASS** (after fixing an initial test-authoring mistake — see Bugs, P2 "browser_profiles coupling").
- **Settings isolation** (write `settings.sidecar` then `settings.chaperone`, sequential/awaited like the real UI flow): **PASS** — neither clobbers the other, and the pre-existing `pushEnabled` value survived both writes.
- **Settings isolation — concurrent-write race probe**: **FAIL** — see Bugs, P2 "settings write race."

### 2. Push pipeline

`send-focus-push` invoked 3x via HTTP (service-role bearer) against QA-seeded rows (an expired 1-min-timer sidecar focus started 10 min prior, a 40-min-old stale checkpoint on it, a `drifted` focus, and a `browser_profile_status.metadata.focusAway` episode):

- Invoke #1: `timer_expired`, `checkpoint_stale`, and `drifted` each wrote exactly one `push_dedup` row; the `focus_away` episode stamped `metadata.awayNotifiedAt`.
- Invoke #2 (immediately after): **no duplicate dedup rows** for any kind; `awayNotifiedAt` **unchanged** (no re-fire within the same episode) — dedup and the `awaySince`/`awayNotifiedAt` guard both hold.
- New episode (fresh `awaySince`, later than the first): invoke #3 **did** re-stamp `awayNotifiedAt` — a genuinely new walk-off episode correctly re-alerts.
- 0 real `push_subscriptions` exist on this account right now, so `fired: 0` throughout — no actual push landed on Malkio's phone during this test (confirmed via `results.byKind` on every invoke).
- **Side effect worth noting, not a bug**: the function's Pass A/B scans are account-wide, not scoped to test data — invoking it also touched a handful of Malkio's **real** focus items that happened to match the scan criteria (real timer-expired/drifted/stale-checkpoint rows), creating real `push_dedup` rows for them. This is indistinguishable from what the production pg_cron trigger already does every 60 seconds, so no cleanup was needed and no notification was sent (still 0 subscriptions) — flagging only for transparency.

### 2. Feedback fn (`feedback-to-asana`)

- Authed POST from `Origin: https://tabatha.pondocean.co` with a `[QA TEST — ignore]` payload → **201**, `taskGid` returned, CORS echoed the sidecar origin correctly.
- **QA Asana task created: GID `1216679002855862`** — left in place per instructions; CeeCee to archive.
- Unauthenticated POST (no `Authorization` header at all) → **401** at the function-gateway level (`verify_jwt: true` on the deployed function, confirmed via `supabase functions list`).
- Anon-key-only POST (valid gateway JWT, but not a real user) → **401** from the function's own `verifyUser()` check (`"Authentication required"`), confirming the extra anon-key exclusion works independently of the gateway check.
- OPTIONS preflight correctly echoes `Origin` back for both allow-listed origins (`https://tabatha.pondocean.co` and the pinned Chrome extension origin); an unrecognized origin (`https://evil.example.com`) is **not** echoed (falls back to the extension-origin default, per `corsHeaders()`'s design).
- **Doc-only note**: `sidecar/src/lib/feedback.ts`'s header comment says the function is "NOT deployed" and CORS is "pinned to the Chrome extension origin only" — this is stale; both claims are now false (see Bugs, P3).

### 3. Static/runtime

- `npx tsc --noEmit` in `sidecar/`: **2 pre-existing errors**, both unrelated to v0.3.0/v0.4.0 (see Bugs, P3). No new errors introduced by either version.
- Footgun grep across `speech.ts`, `chaperone.ts`, `feedback.ts`, `PhoneFocusMode.tsx`, `ContextView.tsx`, `focus.ts` (plus a spot-check of the newly-merged `events.ts`, `install.ts`, `FocusTimeline.tsx`, `ProgressRing.tsx`, `SimpleScreen.tsx`): all `window`/`navigator`/`document` accesses are properly guarded by `Platform.OS === 'web'` + `typeof x !== 'undefined'` checks; all `.map()` renders in the checked files carry `key=`. Two real findings below (P2): an unhandled-promise-rejection risk in `PhoneFocusMode`→`actions.pause`, and a missing unmount/staleness guard in `useCheckpoints`.
- Live fetch (node fetch, not curl — per instructions, curl has a TLS quirk on this host): `/sidecar/` → 200, `<title>Tabby Sidecar</title>`; `/sidecar/sw.js` → 200 (`text/javascript`); `/sidecar/manifest.webmanifest` → 200, valid JSON with a populated `icons[]`; both `icon-192.png` and `icon-512.png` → 200 (`image/png`). **8/8 pass.**

### 4. Timer-math unit tests

`sidecar/tests/timer-math.test.mjs` — **27/27 passing** via `node --test`. Covers:
- `elapsedMsOf`: active (derives from now−startedAt), paused-with-finite-`_elapsedMs` (frozen, doesn't advance), paused-with-missing/non-finite-`_elapsedMs` (falls back), future-startedAt clock skew (clamps to 0), negative frozen value (clamps to 0).
- Pause→resume continuity, single-cycle and multi-cycle (accumulates correctly across 3 pause/resume cycles), plus a "dangling" always-active-no-freeze case.
- `dayLeft()` (Context View day-countdown): resetHour=0 at various times including exact-midnight wrap, resetHour mid-day before/after it's passed, exact-boundary wrap, near-end-of-day, and text-padding.
- **Bonus** (v0.4.0's newly-landed `computeIntervals`/`totalTrackedMs`/`cumulativeTrackedAt` from `events.ts`): paired start→pause and resume→resolve intervals, multi-cycle pairing, a dangling open interval correctly **discarded** when the focus isn't currently active vs correctly counted **to now** when it is, an orphan closing event with no preceding open (ignored, no garbage interval), out-of-order timestamps clamped to a non-negative interval, and `cumulativeTrackedAt`'s cutoff-truncation behavior.

The formulas are mirrored inline rather than imported — the source modules pull in `react-native`/`expo`/`supabase`/`AsyncStorage` at module scope, and this project has no `tsx`/`ts-node` in `node_modules` to load TS+RN-web under plain `node --test`. Each mirrored function is annotated with its exact source location so drift is easy to catch on review.

**Test file commit:** `f6aeb34` (extended to add the `events.ts` interval-pairing tests once that module landed mid-session). A follow-up cleanup commit `244c3d4` removed scratch scripts that got accidentally swept into another agent's merge (see Scope note above) — neither commit touches anything outside `sidecar/tests/` and `sidecar/.qa-tmp/` (now deleted).

## Bugs found

| # | Area | Severity | Summary |
|---|---|---|---|
| 1 | Settings write race | **P2** | Concurrent (same-stale-base) writes to `settings.sidecar` and `settings.chaperone` can clobber each other |
| 2 | `useCheckpoints` hook | **P2** | No unmount guard / no stale-response guard, unlike the codebase's own `mounted`-ref norm elsewhere |
| 3 | `PhoneFocusMode` → `actions.pause` | **P2** | Unhandled-promise-rejection risk on a network failure at the moment the phone backgrounds |
| 4 | `browser_profiles` coupling | **P2** (latent, not live) | `local_id` and the migration-013 partial-unique `browser` constraint only avoid colliding because they're currently always derived together |
| 5 | `feedback.ts` header comment | **P3** | Stale — claims the fn is undeployed / CORS-restricted to the extension only; both are now false |
| 6 | `tsc --noEmit` (2 errors) | **P3** | Pre-existing CSS-module/side-effect-import type-declaration gaps from the v0.0.1 scaffold; not a regression, not user-visible |

No **P0** (ship-blocker) or **P1** issues found.

### #1 — Settings write race (P2)

**Repro:** `AuthContext.tsx`'s `saveSidecarSettings()` and `saveChaperoneSettings()` both compute their write by merging their own key onto the *component's local* `profile.settings` state (not a fresh DB read), then `.update({settings: nextSettings}).eq('id', profile.id)`. If two such writes are dispatched before either's response updates local state (e.g. the user rapid-taps "Immediate phone-away alert" and then "Personality interrupts" in Settings within the same DB round-trip window), both closures build their patch from the *same* stale `profile.settings` snapshot. I reproduced this directly at the DB layer: two `profiles.update({settings})` calls built from an identical stale base, fired concurrently — the one that lands last wins wholesale, silently dropping the other's key.

**Confirmed NOT an issue** for the normal, sequential single-tap-then-wait flow (tested separately, passes cleanly — each save's local-state update lands before the next save reads it).

**Impact:** narrow (requires near-simultaneous taps across two different Settings toggles) and low-stakes (a dropped settings toggle, not data loss — user can just retoggle and would likely notice the switch didn't visually stick). Recommend either a debounce/queue on the two save functions, or re-reading `profiles.settings` fresh at the start of each save instead of trusting local state.

### #2 — `useCheckpoints` hook gaps (P2, static finding — not exercised live)

`sidecar/src/data/checkpoints.ts`'s `load()` has neither the `mounted` ref guard that `useFocus`/`useTasks`/`useClock` all use, nor any request-ordering protection. Two related risks:
- **Unmount:** if the owning screen (`FocusScreen`, or `ContextView`'s 20s poll) unmounts mid-fetch, `setNotes`/`setLoading` fire on an unmounted component.
- **Stale-response race:** `load` is recreated per `focusClientId`; switching the current focus quickly enough could let an in-flight request for the *old* focus resolve after a newer request for the *current* one, briefly showing the wrong focus's checkpoint notes.

Not reproduced against the live app (would need a timed race under real network latency); flagging because the pattern is a clear, easily-fixed gap relative to this codebase's own established norm in the sibling hooks.

### #3 — Unhandled-promise-rejection risk in Phone Focus Mode pause (P2, static finding)

`PhoneFocusMode.tsx`'s `visibilitychange` handler calls `pauseRef.current(cf.id)` (i.e. `actions.pause` from `useFocus`) fire-and-forget — no `await`, `.then()`, or `.catch()`. `actions.pause` returns `patch(id, ...)`, and `patch()` in `focus.ts` has **no** try/catch around its `supabase.from('focus_items').update(...)` call (unlike most other best-effort writes in this codebase, which do wrap in try/catch). Supabase-js's query builder typically resolves (not rejects) on ordinary Postgrest errors, but a genuine network failure at the exact moment the phone backgrounds — plausible, since navigating away often correlates with a network/connectivity change — would produce a real unhandled promise rejection. Low severity (browsers log a console warning, don't crash), but worth a `.catch(() => {})` for hygiene.

### #4 — `browser_profiles` local_id/browser coupling is fragile, not currently broken (P2, latent)

My first attempt at the `browser_profiles` upsert test used a synthetic `local_id` with `browser: 'tabatha_web'` and hit a real `23505 duplicate key` against the migration-013 partial unique index `uniq_browser_profiles_per_user_per_surface (profile_id, browser) WHERE browser IN (...)`, which the app's `ON CONFLICT (profile_id, local_id)` doesn't target. Investigation showed this is **not currently reachable** by the real app: `registerDevice()` always derives `local_id = sidecar-${surfaceForDevice()}` deterministically from the same 3-bucket surface classification used for `browser`, so the two values can never diverge for the same user today, and the partial index is never hit as a separate conflict. Re-tested correctly with a QA-only surface value and confirmed the real idempotent-collapse-to-one-row behavior works. Flagging only because this correctness currently depends on an implicit coupling between two independently-computed values — if a future change (e.g. genuine multi-device-per-surface support) ever decorrelates them, the upsert would start intermittently failing with a raw Postgres error instead of resolving cleanly.

### #5 — `feedback.ts` header comment is stale (P3, doc-only)

Lines 13-20 of `sidecar/src/lib/feedback.ts` say `feedback-to-asana` is not deployed and that its CORS is pinned to the Chrome extension origin only. Both are now false — confirmed live: the function is `ACTIVE` with `verify_jwt: true`, and `ALLOWED_ORIGINS` in `supabase/functions/feedback-to-asana/index.ts` already includes `https://tabatha.pondocean.co`. No functional impact (the fallback-to-queue logic in `feedback.ts` still works correctly either way), but the comment should be updated or removed so a future reader doesn't waste time on stale context.

### #6 — Pre-existing `tsc --noEmit` errors (P3, not a regression)

```
src/components/animated-icon.web.tsx(5,21): error TS2307: Cannot find module './animated-icon.module.css'
src/constants/theme.ts(6,8): error TS2882: Cannot find module or type declarations for side-effect import of '@/global.css'
```
Both files date to the v0.0.1 Plan 039 scaffold commit (`git blame` confirms), not to v0.3.0 or v0.4.0. Expo's actual web bundler (webpack/metro) resolves these fine — the live site loads and renders correctly (see live-fetch checks) — `tsc` run standalone just lacks the ambient CSS-module type declarations Expo's build pipeline supplies. Cosmetic/tooling gap; not user-visible.

## Cleanup confirmation

All test rows removed via a service-role sweep matching every `[QA TEST]`-labeled / `sidecar-qa*`-prefixed row created by this session, re-verified with a second independent query pass showing **0 remaining** in each of: `focus_items`, `intent_history`, `focus_checkpoints`, `tasks_registry`, `clock_sessions`, `browser_profiles` (+ their `browser_profile_status` rows). `push_dedup` cascades off `focus_items(id) ON DELETE CASCADE` (migration 030) and was confirmed empty for all QA-created focus ids. `profiles.settings` was restored to its exact pre-test value (`{"sidecar":{"pushEnabled":true}}`) and re-verified — no stray `qaMarker`/`raceMarker` keys remain. No `push_subscriptions` were created or touched (0 existed before and after). The feedback-pipeline QA Asana task (**GID `1216679002855862`**) was intentionally left in place per instructions for CeeCee to archive.

## Confidence statement

High confidence in the backend contracts this task targeted: intent lifecycle, timer pause/resume continuity, focus tiers, checkpoints, tasks, clock, device registration, the full push-dedup pipeline (including the `focus_away` per-episode re-alert guard), and the feedback-to-Asana auth/CORS boundary all behave correctly under RLS with a real signed-in session, verified against the live backend rather than mocks. The one real functional bug found (settings write race) is narrow and low-stakes. The three other P2s are static-analysis findings on code paths I did not exercise live (network-failure timing, rapid-unmount timing) — flagged for awareness, not confirmed as live-reproducing bugs. Medium-low confidence on the newest v0.4.0 UI surface (`ContextView.tsx`'s restructured 170-line diff, `FocusTimeline.tsx`, `ProgressRing.tsx`, `SimpleScreen.tsx`) since a full review of that code was outside this task's v0.3.0 scope and only got a shallow footgun grep — recommend a dedicated follow-up pass once v0.4.0 settles.
