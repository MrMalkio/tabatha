# Cross-Surface Sync — Forensic Audit (2026-07-24/25)

**Agent:** Sable (Opus 5) · **TaskRun:** 2026-07-24 night · **Asana:** [1216882088851799](https://app.asana.com/1/9526911872029/project/1214031898449333/task/1216882088851799)
**Scope:** extension ↔ Tabby Sidecar ↔ desktop companion, focus + clock axes.
**Sources:** extension `staging` @ **6.7.73** (`C:\Users\mrmal\le dev\Tabatha`), Sidecar `claude/tabby-sidecar-mobile-46c612` @ **0.13.9**.
**Prod observation:** read-only, Mgmt API, profile `4abda377-a63c-45cc-991c-99bd5153b767`, all timestamps UTC, snapshot taken **2026-07-25T03:22:27Z**.

---

## 0. The answer CeeCee needs

> **Is there a single root cause, or is "sync feels off" N unrelated small things?**

**Neither. It is two structural root causes, two independent data-integrity bugs, and one fix that was never actually running.** That is precisely why three rounds of piecemeal fixes (6.7.45 live-ingest, 0.12.0 arbitration, 6.7.73 elapsed-drift) each felt like progress and none of them closed it: every round fixed one *symptom* of Root Cause A or B without touching A or B.

| | Root cause | Falls out of it | Disposition |
|---|---|---|---|
| **A** | **No shared notion of "who wrote this last."** `focus_items` has no `updated_at`; the extension re-upserts its *entire* local engine on a timer regardless of cloud state; and its only adjudicator is gated on **authorship** (`tags._src === 'sidecar'`) rather than **recency**. Authorship is a wrong proxy for recency — the Sidecar legitimately writes extension-authored rows. | S1, S3, S8 | **Architecture item → Plan 046.** Not patchable. |
| **B** | **The two surfaces do not share a vocabulary.** "Running", "done", and "last clock event" each have two incompatible definitions. | S2, S3, S5 | **Fixable now** (shared constants + normalizing view). Do this before 046. |
| **C** | **Unclamped elapsed accounting** (both surfaces). | S4 | Independent bug. Fix now. |
| **D** | **Clock adoption duplicates shift records.** | S6, S7 | Independent bug. **Blocks org-hours v1.** |
| **E** | **The 6.7.73 elapsed-drift fix is built but not running.** | the live 47-min gap below | Ops, one action. |

**If CeeCee only does one thing tonight:** E (reload the extension) and B. A is a Plan 046 item and should be scoped as one.

---

## 1. The intended model

### 1.1 Authoritative table

| Fact | Intended source of truth | Writers | Arbiter | Tie-break |
|---|---|---|---|---|
| **Which focus is current** | the `active` row with the latest `tags._startedAt`, **any source** | ext `syncService.buildFocusRows` (5-min alarm + debounce, **full-table upsert**); Sidecar `focus.ts` `patch()` (immediate) | ext `focusIngestService.runLiveIngest` (60 s alarm + post-push); Sidecar `useFocus` derived `currentFocus` | strict `>` on `_startedAt`; ties keep incumbent (`shouldAdoptFocus`, `liveIngestArbitration.js:81-85`) |
| **Elapsed time of a focus** | active → `now − tags._startedAt` (anchor back-dated by accumulated elapsed); paused → frozen `tags._elapsedMs` | ext `buildFocusRows` (`syncService.js:438-455`); Sidecar `pause`/`switchTo`/`resume` | **none — each surface computes independently** | n/a |
| **Which shift is current** | the `browser_profile_status` row with the latest `last_clock_event_at` | ext `awarenessService.buildStatusPayload`; Sidecar `clock.ts:99-115` | ext `shouldAdoptClock` (`liveIngestArbitration.js:208-219`); **Sidecar is display-only, never adopts** | strict `>` **plus** a state-differs guard |
| **Device liveness** | `last_heartbeat_at` | ext `awarenessService` 60 s `setInterval`; Sidecar `PhoneFocusMode` 60 s while visible | `OFFLINE_THRESHOLD_MS` = 5 min — **awareness UI only, not the ingest path** | n/a |
| **Is this focus done** | *(undefined — see S3)* | three fields, no constraint | each surface reads a different subset | — |

### 1.2 The stated invariants

1. **Non-ping-pong** (`liveIngestArbitration.js:22-27`): adoption never stamps a fresh `now` — it carries the remote's own timestamp, so the adopter's next push reproduces the identical timestamp it just read. *Verified honoured on the focus axis (`adoptRemoteActive`, `focusService.js:374-389`) and on the clock axis (`applyRemoteClockState`). **Broken from the other end by S5.***
2. **Ingest writes locally only** (`focusIngestService.js:15-19`): propagation back to the cloud rides the existing debounced push. *Verified.*
3. **Cross-surface arbitration is source-agnostic** (`focus.ts:56-64`, `liveIngestArbitration.js:11-15`). ***False in practice — see S1.***

---

## 2. Divergences found

### S1 — HIGH · The extension's full-table push has no adjudicator against Sidecar writes on extension-authored rows

`reconcileKnownFocusRow` early-returns for any row that is not Sidecar-authored:

```js
// src/utils/liveIngestArbitration.js:105
if (!isSidecarSourced(row.tags)) return { item: localItem, changed: false };
```

Meanwhile `buildFocusRows` (`syncService.js:398-460`) maps **every item in `engine.items` plus `engine.history`** and upserts all of them on **every** sync cycle — 5-minute alarm plus debounced-on-mutation. Nothing consults the cloud row first.

**Consequence:** any Sidecar mutation of an **extension-authored** focus — pause, backburner, stage change, timer extend, tag edit — is reverted within one push cycle. `tags._backburner` is especially unconditional (`syncService.js:441`: `_backburner: !!item.backburnered`), so backburnering from the phone is guaranteed to bounce.

The single Sidecar action that *does* survive is "start a **new** intent", because that path reaches the extension through **arbitration** (a brand-new `active` row with a newer `_startedAt`), not through reconcile. This is exactly why the feature feels "half-synced": creating works, editing doesn't.

**Blast radius, measured:** of the 38 non-completed rows on this profile, **37 have `_src = null`** (extension-authored). Only one is Sidecar-authored. So this defect covers essentially Malkio's entire working set.

**Owner:** `src/utils/liveIngestArbitration.js` (the gate) + `src/background/services/syncService.js` (the unconditional push).
**Fix:** add `updated_at` to `focus_items` (trigger-maintained) and switch reconcile from authorship to recency; have the push skip rows whose cloud `updated_at` is newer than the local mutation. This is the Plan 046 architecture item.

---

### S2 — HIGH · `drifted` is a running state in the extension and invisible to the Sidecar

The extension treats `drifted` as a **running** state in at least eight places — `focusService.js:427, 526, 584, 643, 681`; `useFocusEngine.js:54` (it ticks); `home/index.jsx:230` (renders it as the current focus, "⚠️ DRIFTED"); `CheckpointTimeline.jsx:49`.

The Sidecar's arbitration recognises only two states:

```ts
// sidecar/src/data/focus.ts:67   — active tier
const actives = items.filter((f) => f.focus_state === 'active');
// sidecar/src/data/focus.ts:469  — paused tier
const pausedCandidates = nonBB.filter((f) => f.focus_state === 'paused');
```

A `drifted` focus is in **neither tier**, so the moment the extension drifts the current focus, the Sidecar and Context View drop it and fall back to an older paused intent — while still listing it in the queue (`notDone` doesn't exclude it). The Sidecar has a *label* for drifted (`FocusScreen.tsx:168`) but can never select one as current.

**This is the real cause of the "old intents in view" report of 2026-07-21.** The 0.13.1 fix re-ranked the AsyncStorage pin within the paused tier; it never asked why the *active* tier was empty. Drift is a core Tabatha behaviour, so this fires routinely.

**Currently:** 3 rows in state `drifted` on this profile.

**Second-order (extension side):** `activeCandidatesFromEngine` (`focusIngestService.js:171`) and the pause loop (`:259`) both filter `focusState === 'active'` only. A locally-drifted focus is therefore neither an arbitration candidate nor paused by an adoption — permitting **two concurrently running local focuses**.

**Owner:** `sidecar/src/data/focus.ts` + `src/background/services/focusIngestService.js`.
**Fix:** a shared `RUNNING_STATES = ['active', 'drifted']` honoured by both surfaces. *(Sidecar half is small and safe — see §5.)*

---

### S3 — HIGH · No canonical "done" predicate; a Sidecar resolve can never reach the extension

Four different definitions of the same fact:

| Site | Predicate |
|---|---|
| Sidecar `notDone` (`focus.ts:433`) | `focus_state !== 'completed' && funnel_stage !== 'resolved'` |
| Sidecar `history` (`focus.ts:482`) | `focus_state === 'completed' \|\| funnel_stage === 'resolved'` |
| Ext light sweep (`focusIngestService.js:149`) | `.neq('focus_state', 'completed')` |
| Ext push (`syncService.js:403`) | `item.focusState \|\| (endedAt \|\| completedAt ? 'completed' : 'paused')` |

**The structural consequence:** there is **no query in the extension that can ever deliver a Sidecar resolve.** The light sweep explicitly excludes `completed` rows, and the new-row query is watermarked on `created_at` — a column that never changes on UPDATE. So a focus resolved on the phone stays live in the extension forever, and the extension's full-table push then writes its stale `focus_state: 'paused'` back over the cloud row.

**Evidence — three rows in mutually contradictory state right now:**

| client_id | label | focus_state | funnel_stage | completed_at | src | synced_at |
|---|---|---|---|---|---|---|
| `sidecar-9e6f8a2819b1423bbaf7` | Turning over 60 North | **paused** | resolved | set | sidecar | **2026-07-25 03:19:53Z** |
| `sidecar-9c524ff4b1de4aaa9ef5` | Freaking the fuck out a little. | **drifted** | resolved | set | sidecar | 2026-07-22 09:55:01Z |
| `sidecar-e5422de2df4f4ef3acbe` | ss Demo at Flagship | **paused** | resolved | set | sidecar | 2026-07-18 21:48:42Z |

Note the first row's `synced_at`: the extension re-pushed a *resolved* focus as `paused` **tonight**, days after it was resolved on the phone. Because the Sidecar hides it (`funnel_stage === 'resolved'`) and the extension shows it, the same intent is simultaneously done on one surface and live on the other — permanently.

**Owner:** `src/background/services/focusIngestService.js` (`pullFocusRows`) + a schema decision on which field is canonical.

---

### S4 — HIGH (data integrity) · Elapsed accrues wall-clock time with no clamp, on both surfaces

The Sidecar freezes elapsed on pause as a raw wall-clock difference, with no ceiling:

```ts
// sidecar/src/data/focus.ts:223 (pauseOtherActives) and :313 (pause)
_elapsedMs: Math.max(0, Date.now() - startedAtOf(f))
```

This is correct **only** if the focus was genuinely running for that whole span. It is not — a focus left `active` in the cloud while the browser is closed keeps accruing.

**Proof, to within 80 milliseconds.** Row `f_1784676002315_yo37y` ("Tabby work", extension-authored) carries:

```
tags._startedAt = 2026-07-22T01:17:41.274Z
tags._elapsedMs = 134,048,116 ms  =  37 h 14 m 08.1 s
```

`_startedAt + _elapsedMs` = **2026-07-23T14:31:49.47Z**.
Row `sidecar-9e6f8a2819b1423bbaf7` ("Turning over 60 North") has `tags._startedAt = 2026-07-23T14:31:49.390Z` — **80 ms earlier**.

`createIntent` awaits `pauseOtherActives(null)` immediately before inserting the new row (`focus.ts:245-247`, insert at `:271`). So the arithmetic is airtight: **creating that intent on the phone silently attributed 37 hours 14 minutes of "focus time" to an intent that had merely been left `active` overnight.**

The extension has the same hole on its own pause path — `addElapsedSinceResume` (`focusService.js:331-336`) does `elapsedMs += Date.now() - lastResumedAt`, unbounded. The `wallClockMax` ceiling (`focusService.js:1064`) exists but is wired **only** to manual `adjustFocusTime`, never to `pauseItem`.

**Owner:** `sidecar/src/data/focus.ts` + `src/background/services/focusService.js`.
**Fix:** clamp pause-elapsed to `min(now − _startedAt, wallClockSinceCreated)` and, better, to observed liveness (`last_heartbeat_at`) — never bill focus time to a window in which no device was alive.

---

### S5 — HIGH · Break-end regresses `last_clock_event_at` and can drag an install back onto break

```js
// src/background/services/awarenessService.js:139
last_clock_event_at = clockSession.breakStartedAt || clockSession.clockedInAt || null;
```

`clock.js:63` nulls `breakStartedAt` when a break ends, so the published event timestamp **jumps backwards to the shift start**. Concretely: shift 09:00, break 10:00 (publishes 10:00), resume 10:30 → this install now publishes `last_clock_event_at = 09:00`. Any sibling row still reading `on_break` at 10:00 is strictly newer *and* describes a different state, so `shouldAdoptClock` returns true and **the install that just resumed is pulled back onto break**. It then converges wrongly and stays there — silent and sticky, not an oscillation you'd notice as flapping.

Clock-in, break-start and clock-out all advance the timestamp. Break-end is the only event that doesn't. `deriveLocalClockEvent` reproduces the same regression (`liveIngestArbitration.js:175`).

**Compounding:** the Sidecar stamps `last_clock_event_at = new Date().toISOString()` unconditionally on every `pushStatus` (`clock.ts:108`). So the two surfaces do not even mean the same thing by that column — one derives it from session fields, the other uses wall-clock now.

**Owner:** `src/background/services/awarenessService.js` + `src/utils/liveIngestArbitration.js`.
**Fix:** add an explicit `breakEndedAt` to `clockSession` and take the max of all four event timestamps.

---

### S6 — HIGH (data integrity) · Clock adoption duplicates shift records; hours are inflated ~2.5×

`applyRemoteClockState` (`clockService.js:396-410`) overwrites `clockSession` with the remote's `clocked_in_at` **without archiving the local session to `clockHistory`** — unlike the normal clock-out path (`clock.js:43-46`), which does. Each install then later archives its *own* row carrying the *same* `clocked_in_at`.

**Evidence — one shift, five rows, four devices:**

| clocked_in_at | clocked_out_at | browser_profile_id | total_h |
|---|---|---|---|
| 2026-07-21 16:35:14.356Z | 18:58:46.589Z | `e428bd2a…` | 2.39 |
| 2026-07-21 16:35:14.356Z | 21:27:33.086Z | `e428bd2a…` | 4.87 |
| 2026-07-21 16:35:14.356Z | 18:41:00Z | `4fe9142a…` | 2.10 |
| 2026-07-21 16:35:14.356Z | 18:58:00Z | `00741d2e…` | 2.38 |
| 2026-07-21 16:35:14.356Z | 16:50:00Z | `b268c4a6…` | 0.25 |

**11.99 h recorded for one ~4.87 h shift.** Two adjacent artifacts in the same table: `fc826d37…` is a **23.50 h** session (2026-07-20 17:03 → 2026-07-21 16:34, closed only by the next clock-in — a ghost stint), and `ca4c3612…` has `clocked_in_at == clocked_out_at` exactly (0.00 h).

**This blocks org-hours v1** (T1), which is about to ship a UI summing this table.

**Owner:** `src/background/services/clockService.js` (`applyRemoteClockState` must archive), plus a reversible dedup script for existing rows.

---

### S7 — MEDIUM-HIGH · Dead devices win clock arbitration — no freshness cutoff on the ingest path

`pullClockCandidates` (`focusIngestService.js:161-165`) selects only `browser_profile_id, clock_state, clocked_in_at, on_break_since, last_clock_event_at` — it never fetches `online` or `last_heartbeat_at`. `pickLatestClockCandidate` filters only on `clock_state` being truthy. **A device that died months ago while `clocked_in` remains a candidate forever**, and it beats a fresh install automatically (undefined `clockSession` → `clockEventMs` = 0).

The 5-minute `OFFLINE_THRESHOLD_MS` (`awarenessService.js:42`) is applied **only** in the awareness UI / `isLiveConcurrent` path, never in ingest.

**Evidence:** device "Deskview on OD" — `last_heartbeat_at` **775 minutes stale (12.9 h)** yet `online = true`.

Related: the 5-minute threshold is also aggressive against MV3 — the extension heartbeat is a plain `setInterval` with no `chrome.alarms` backing (`awarenessService.js:231-233`), so a browser that is open but whose service worker was evicted for >5 min is classified `reconcile` and can have its live shift force-closed by `CLEAR_ALL_OFFLINE`.

---

### S8 — MEDIUM · Sidecar writes whole `tags` objects from a snapshot up to 15 s stale

`mergeTags`, `pause`, `resume`, `switchTo`, `updateFocus` (`focus.ts:187-205`, `288-324`, `390-403`) all rebuild the entire `tags` object from the local `items` array, which refreshes on a 15 s poll. Any tag key written by another surface inside that window is silently dropped — no JSONB merge, no optimistic concurrency. Same family as S1, different mechanism.

---

### S9 — LOW now, MEDIUM soon · `browser_profile_status.focus_elapsed_ms` publishes stored-only elapsed

```js
// src/background/services/awarenessService.js:159
focus_elapsed_ms = Number.isFinite(Number(af.elapsedMs)) ? Number(af.elapsedMs) : 0;
```

This omits the live `(now − lastResumedAt)` portion that the extension's own `liveElapsed()` adds (`focusService.js:1056-1060`) — so the published value freezes during a run and only jumps at pause. Note the very next block (`:165`) *does* add the live portion when deriving `focus_timer_ends_at`, so the two are internally inconsistent.

**Currently low-impact:** grep confirms **no surface renders this column** — not the Sidecar, not the Context View. It is a trap laid for the org-hours / Team Activity UI that T1 is about to build on top of it.

---

### S10 — MEDIUM · Remote clock-out command is clobber-prone and can re-fire

The remote clock-out command is stored inside `metadata` (`awarenessService.js:542-547`), but both `buildStatusPayload` (`:186`) and the Sidecar's `PhoneFocusMode.signal` (`PhoneFocusMode.tsx:105`) write `metadata` as a **whole object**. Any full upsert between the command write and its realtime delivery silently drops it. Conversely, `clock_out_requested_at` persists in the row while the dedupe guard `lastHandledClockOutReq` is module-level (`awarenessService.js:38`) and resets on every MV3 service-worker restart — so a later heartbeat-only UPDATE can re-fire the handler and **clock out a new, legitimate shift with a stale command.**

---

## 3. The live three-way snapshot — the headline

At **2026-07-25T03:22:27Z**, for the single `active` focus `f_1784922681836_y21dv` ("TGC meeting 2 prep"), three surfaces reported three different elapsed times **simultaneously**:

| Surface | Value | Where it comes from |
|---|---|---|
| Extension, internal | **≈ 451 min** | `liveElapsed()` = stored `elapsedMs` (249.2 min) + live run (201.9 min) |
| Sidecar / Context View | **201.9 min** | `now − tags._startedAt`, anchor `2026-07-25T00:00:33.577Z` |
| `browser_profile_status.focus_elapsed_ms` | **249.2 min** | stored `elapsedMs` only (S9) |

That is the felt bug, captured with timestamps: **a 47-minute visible gap between the browser and the phone, and a 249-minute gap between the browser and its own published status.**

### 3.1 …and the 6.7.73 fix is not the code that produced it

`tags._startedAt = 2026-07-25T00:00:33.577Z` is the **raw** resume instant. Under the 6.7.73 back-date rule (`syncService.js:442-454`, `_startedAt = lastResumedAt − elapsedMs`) it should have been written as **2026-07-24T23:13:16Z** — 47.3 minutes earlier.

Verified:
- `C:\Users\mrmal\Le Dev\Tabatha\dist\manifest.json` → **6.7.73** ✅
- the built `dist\assets\background.js` **does** contain the back-date arithmetic — `_startedAt:(()=>{if(e.focusState===\`active\`&&e.lastResumedAt){let t=new Date(e.lastResumedAt).getTime()-(e.elapsedMs||0)…` ✅
- `dist` was rebuilt **2026-07-24T23:09 local** — but Chrome does not reload a service worker on rebuild, and the row it wrote at 03:19:53Z still uses the old formula.

**Conclusion: the running service worker predates the fix.** The elapsed-drift fix Malkio was told shipped has never executed on his machine. This alone explains why 6.7.73 "didn't feel fixed" — and it is one click (`chrome://extensions` → reload) to verify.

---

## 4. Ranked bugs

| # | Bug | Sev | Fix size | Owning file |
|---|---|---|---|---|
| 1 | Extension full-table push reverts all Sidecar edits to extension-authored rows (S1) | HIGH | **L — Plan 046** (needs `updated_at` + recency arbitration) | `src/utils/liveIngestArbitration.js`, `src/background/services/syncService.js` |
| 2 | `drifted` invisible to Sidecar arbitration → "old intents in view" (S2) | HIGH | **S** (sidecar) / **S** (ext) | `sidecar/src/data/focus.ts`, `focusIngestService.js` |
| 3 | Sidecar resolve can never reach the extension; no canonical "done" (S3) | HIGH | **M** | `focusIngestService.js` `pullFocusRows` + schema decision |
| 4 | Unclamped elapsed → 37 h attributed to one intent (S4) | HIGH | **S–M** both sides | `sidecar/src/data/focus.ts`, `focusService.js` |
| 5 | Break-end regresses `last_clock_event_at`; install dragged back onto break (S5) | HIGH | **S** | `awarenessService.js`, `liveIngestArbitration.js` |
| 6 | Clock adoption duplicates shifts; hours inflated ~2.5× (S6) | HIGH | **M** + data cleanup | `clockService.js` `applyRemoteClockState` |
| 7 | Dead devices win clock arbitration; no freshness cutoff in ingest (S7) | MED-HIGH | **S** | `focusIngestService.js` `pullClockCandidates` |
| 8 | Sidecar whole-`tags` clobber from stale snapshot (S8) | MED | **M** | `sidecar/src/data/focus.ts` |
| 9 | `focus_elapsed_ms` publishes stored-only elapsed (S9) | LOW→MED | **XS** | `awarenessService.js:159` |
| 10 | `metadata` clobber / stale clock-out command re-fire (S10) | MED | **M** | `awarenessService.js` |

**Gating note:** #6 and #9 both sit directly under **org-hours v1** (T1). Shipping that UI before they are fixed will render inflated hours to org members.

---

## 5. Fixed tonight

**S2, Sidecar half only** — provably safe and tiny, per charter. `pickMostRecentActive` and the paused-tier filter in `sidecar/src/data/focus.ts` now recognise `drifted` as a running state, so a focus the extension has drifted stays the current focus on the phone and Context View instead of falling back to an older paused intent. Pure comparator change, mirrored in `tests/arbitration.test.mjs`. Committed on `claude/tabby-sidecar-mobile-46c612`, version-bumped, **not deployed** — CeeCee ships.

Nothing else was changed. Every other item above touches the extension, the schema, or prod data and is out of scope for an unattended pass.

---

## 6. Questions for Malkio

These need his observation to pin down — each is phrased to be answerable in one line.

1. **Reload check.** When you next sit down, open `chrome://extensions`, confirm Tabatha reads **6.7.73**, and click **Reload**. Then watch the phone and the browser side by side for ten minutes: **does the elapsed number still disagree?** (§3.1 predicts the gap disappears. If it *doesn't*, the back-date fix is wrong, not just unshipped — and that changes the ranking.)
2. **"Tabby work", 2026-07-23 ~14:31.** You started "Turning over 60 North" on the phone at that moment. **Was the browser closed / the machine asleep between 2026-07-22 01:17 and then?** (§S4 assumes yes. Confirming it distinguishes "abandoned-active accrual" from "the extension genuinely thought it was running".)
3. **The pause-that-came-back.** When you've pulled out your phone and paused/backburnered something and it reappeared — **was the intent one you originally created in the browser, or on the phone?** (§S1 predicts: browser-created ones bounce, phone-created ones stick. If phone-created ones also bounce, there's a second mechanism I haven't found.)
4. **Break-end.** After you end a break in the browser, **has the app ever put you back on break by itself within a minute or two?** (§S5. A yes makes this a top-3 fix rather than a theoretical one.)
5. **"Deskview on OD"** has been heartbeating `online: true` for 12.9 h with no clock state. **Is that screen actually running right now, or is it a ghost?** (Decides whether S7's fix needs a liveness cutoff or a device-dedup pass.)
6. **Shift hours.** Do you look at Work Shifts totals and trust them? (§S6 says 2026-07-21 is recorded as ~12 h across duplicate rows for a single ~4.9 h shift. If you've been mentally discounting those numbers, that's independent confirmation.)

---

## 7. Method note

All prod reads were `SELECT`-only via the Mgmt API using the token in `.env.cortex.local`; no writes, no schema changes, no data mutated. The three-way comparison in §3 was obtained **without driving Malkio's browser** — `browser_profile_status` carries the extension's own published view of itself, so the browser's opinion, the phone's computation, and the stored row could be compared at one instant with no risk of touching a live focus modal.
