# Plan 023 — Response to Inline Feedback

> **Author:** Claude (taking over for Antigravity)
> **Date:** 2026-05-13
> **Source feedback:** [user_feedback_on_plan_023.md](file:///C:/Users/mrmal/.gemini/antigravity/brain/47da1695-c16f-43ea-b1ef-676d205320f4/user_feedback_on_plan_023.md)
> **Plan being amended (not overwritten):** [implementation_plan.md](file:///C:/Users/mrmal/.gemini/antigravity/brain/47da1695-c16f-43ea-b1ef-676d205320f4/implementation_plan.md)

This is an addendum. Where your feedback contradicts the plan, **your direction wins** and the plan is treated as patched per the sections below.

---

## 1. Storage Key Explainer

You said:
> "I now understand the storage caps... But I actually don't know what each of these Keys are for and if I want them to be pruned at all before certain actions are taken... For some data... I think we should have some parsed into new files before being deleted from a bloating position. Or setting up a local archive for users and they decide what data to keep."

Here is what each key actually stores and where its value lives on the **user → future-AI** spectrum:

| Key | What it stores (per entry) | Why it exists | Replayable? | Recommend to user |
|---|---|---|---|---|
| `tabathaLogs` | Internal debug/event log lines | Diagnostics, not insight | Yes (regeneratable) | **Safe to FIFO drop.** Pure debug telemetry. |
| `closedContexts` | Context+intent+duration snapshot for every closed tab | Reconstructs lost context, fuels recall | **No** — gone if dropped | **Archive before drop.** Highest value for "what was I doing." |
| `intentHistory` | Intent transitions (`action`, `context`, `focusId`, `url`, `domain`, `timestamp`) | Per-tab intent timeline | **No** | **Archive before drop.** Core training data for future AI categorizer. |
| `intentChangeLog` | Same shape: domain + old/new intent + old/new context per change | Originally added as a "URL Rules" feed | **No** (but ~90% overlap with `intentHistory`) | Merge into `intentHistory` — see §2. |
| `sessions` | Periodic snapshots of full extension state | Crash recovery, rewind | Yes (extension state regenerates) | **Drop is OK once interval/cap is user-tunable.** See §6. |
| `focusEngine.history` | Completed focus items + duration + tab IDs touched | Long-arc productivity record | **No** | **Archive before drop.** This is "what I actually accomplished." |
| `parkedTabs` | Tabs the user manually parked (often with notes) | User-curated holding pen | **No** | **Never drop silently.** Warn at threshold, let user purge. |
| `timeTracking.byTab` | Active time per tab ID | Source for category/group rollups | Aggregateable | **Aggregate into `byCategory`/`byGroup` on tab close**, then drop the per-tab row. |
| `pendingTimeLogs` | Time entries queued for Supabase upload | Offline buffer | **No** (gone = sync gap) | **Cap high, warn, never auto-drop.** |
| `tabathaOrg.tasks` | User tasks with stage + priority + linkage | User-authored | **No** | Cold-store archived tasks after 90d to `_archivedTasks`. |
| `inbarNotes` | Per-tab notes typed into the InBar | User-authored | **No** | **Prune only when tab ID is gone AND note is empty.** If non-empty, move to `closedContexts` entry for that tab. |
| `sugarBox` | "Saved for later" links | User-curated | **No** | Cap 500 FIFO is fine; surface in UI. |
| `companionRecentSessions` | Clock-in/out events synced from desktop companion | Cross-device timeline | Yes (companion DB is source of truth) | Daily retention alarm is fine. |

### Plan-023 patches that follow from this

- **Phase 1 (`storageService.js`):** Add a new module `archiveService.js` exposing `archiveBeforeCap(key, droppedEntries, destination)`. Destinations:
  - `localArchive` → write to `_archive/<key>/<yyyy-mm>.jsonl` via `chrome.storage.local` under a single rolling key `_archive_index` (chrome.storage can't write files; see §3 for the IndexedDB upgrade path).
  - `supabase` → enqueue if authed.
  - `warn` → fire a UI notification, do nothing else.
- **Phase 3:** All FIFO drops for `closedContexts`, `intentHistory`, `focusEngine.history` go through `archiveBeforeCap` first.
- **Settings → Data:** New "Stored Data" panel listing every key with size, entry count, and a "Purge" / "Export to JSONL" action per key. User decides.

---

## 2. `intentChangeLog` vs `intentHistory` — the 10% non-redundancy

You asked: *"Elaborate and explain what is the 10% non-redundancy."*

Both keys log a row every time an intent is set or changed on a tab. The shapes overlap heavily but each has fields the other lacks:

| Field | `intentChangeLog` | `intentHistory` |
|---|---|---|
| `timestamp` | ✅ | ✅ |
| `url` / `domain` | ✅ | ✅ |
| `tabId` | ✅ | ❌ (omitted) |
| `oldIntent` → `newIntent` | ✅ (explicit before/after pair) | ❌ (only "newIntent" implied by the `action`) |
| `oldContext` → `newContext` | ✅ | ❌ |
| `action` (e.g. `set`, `commit`, `skip`, `clear`) | ❌ | ✅ |
| `focusId` (associated focus at the time) | ❌ | ✅ |

So they aren't 90% identical-as-rows — they're 90% redundant **as a data product**: the timeline of "what intents did this user assign to what URLs" is reconstructable from either. The remaining 10% is:
- `intentChangeLog`'s **before/after pair** (a single row tells you a transition, not just a state).
- `intentHistory`'s **action verb + focus linkage** (lets you separate "I committed" from "I skipped").

### Resolution

Merge into one canonical `intentHistory` key with the **union** of fields:

```js
{
  timestamp, tabId, url, domain,
  action,                    // from intentHistory
  oldIntent, newIntent,      // from intentChangeLog
  oldContext, newContext,    // from intentChangeLog
  focusId                    // from intentHistory
}
```

No information lost, one write per change instead of two, cap of 500 retained, archive path per §1.

---

## 3. `chrome.storage` — is it the right substrate given the wider ecosystem?

You asked: *"Is this the best solution/only solution, taking into consideration that more data from this extension will be used for other applications in the ecosystem?"*

You are not off base. Short version: **`chrome.storage.local` is the right primary store for the extension today, but it's the wrong sharing surface for the ecosystem.** Treat it as one cache, not the source of truth.

### Options surveyed

| Option | Quota | Performance | Shareable with desktop/screensaver? | Verdict for Tabatha |
|---|---|---|---|---|
| `chrome.storage.local` | ~10 MB (Chrome enforces) | Async, fine for our sizes | ❌ Extension-only sandbox | ✅ **Keep as the extension's working cache.** |
| `chrome.storage.sync` | 100 KB total / 8 KB per item | Slow, rate-limited | ❌ Synced only to same Google account on other Chromes | Useless for our use case. |
| `chrome.storage.session` | ~10 MB | RAM only | ❌ | Already used implicitly for in-memory state. |
| **IndexedDB** | Quota-based (often >50% of disk) | Async, structured queries, indexes | ❌ Extension-only | ✅ **Upgrade path** when we exceed 10 MB or want indexes (e.g. `timeTracking` queries by date range). |
| File system (OPFS or `FileSystemAccessHandle`) | Very large | Fast | ❌ Extension-only | Not needed yet. |
| **Supabase** (already integrated) | Cloud, auth-gated | Network | ✅ Anything else can read it | ✅ **The ecosystem source of truth.** |
| **Desktop companion (Tauri SQLite)** | Local disk | Local | ✅ via HTTP/WS | ✅ Already the canonical store for `app_sessions` etc. |
| Shared SQLite over filesystem | Disk | Fast | ⚠️ Locking is fragile if both extension and companion open the same DB | Don't. Go via the companion's HTTP API. |

### Recommended architecture

```
                                   ┌──────────────────────┐
        ┌──────────────────────────┤  Supabase (cloud)    │  ◄── source of truth (authed)
        │                          └──────────────────────┘
        │ sync                                ▲
        ▼                                     │ HTTPS
┌────────────────────┐    HTTPS/WS    ┌──────────────────────┐
│ Extension          │ ◄────────────► │  Tabatha Desktop     │  ◄── source of truth (local)
│ chrome.storage.local│               │  (Tauri + SQLite)    │
│  + (later) IndexedDB│               └──────────────────────┘
└────────────────────┘                       ▲
        ▲                                    │ HTTP
        │ (screensaver doesn't talk to extension)
        └─────────►  Screensaver reads desktop API only
```

Concretely:
- **Extension stays on `chrome.storage.local`** for tabs, focus engine, settings, in-flight buffers. It's fast and sandboxed correctly for a service worker.
- **Anything another app needs to read** (sessions, focus history, intent history, time tracking aggregates) is **mirrored to Supabase or the companion DB**. Other apps read from there. They never poke chrome.storage.
- **IndexedDB is the upgrade path for the extension itself** the moment we want to query (e.g. "all intentHistory rows in last 7 days for domain X") — that lookup is O(n) today over 500-row arrays, and it'll get worse if you raise the cap per §1.

This means `storageService.js` is still N/A for "repositories" in the strict sense, **but** the right abstraction is: `storageService` (chrome cache) + `archiveService` (cold storage out) + `syncService` (Supabase mirror). The plan currently rolls archive+sync into Phase 5; I'd split `archiveService.js` into Phase 1 so it exists from the start.

---

## 4. `companionService.js` — impact analysis

You asked: *"What is the impact after if this change or if the change doesn't happen?"*

### If the change DOES happen (extract into `companionService.js`)

- ✅ Five message types (`GET_COMPANION_STATUS`, `GET_COMPANION_SUMMARY`, `COMPANION_CLOCK_IN/OUT/BREAK`) go through the normal service chain instead of being special-cased in `background.js`.
- ✅ WS connection lifecycle (connect, reconnect backoff, heartbeat) lives next to the handlers that depend on it — easier to reason about a single owner.
- ✅ Boundary-discipline compliant: `companionService` can depend on `storageService`, `notificationService`, `clockService` via direct imports without circular cycles.
- ✅ Easier to mock for testing — today `companion-bridge.js` self-instantiates on import.
- ⚠️ One-time risk: the WS reconnect logic has timer state that must survive the move. ~30 min of careful copy.
- 📦 background.js shrinks by ~50 lines (the imports + special-casing currently in the router).

### If the change DOESN'T happen (keep `companion-bridge.js` standalone)

- ❌ The router has to keep special-casing companion message types — violates the "router is dumb" rule.
- ❌ Companion handlers cannot easily call into `clockService` (the natural caller for `CLOCK_IN → notify companion`) without an out-of-band reference back into the bridge module.
- ❌ Future work like "sync paused-focus state with desktop" has nowhere natural to live.
- ✅ Zero migration risk — the WS code is currently working.
- ✅ Slightly smaller diff for v4.0.0-α.

### Verdict

**Do the change.** It's a 359-line file with stable behavior; moving it is mechanical, and not moving it is the only service that breaks the boundary model. Schedule it in Phase 5 alongside `alarmService.js` as planned. Tag the commit clearly so a rollback is one revert.

---

## 5. Version sync script

You asked: *"Is there a script or something we can institute that ensures version checks are always done, and if it's updated in one place it can be updated everywhere else that it needs to be."*

Yes. Today there are three drifting sources:

| File | Current value | Role |
|---|---|---|
| `package.json` | `3.31.5` | npm version (build tooling) |
| `public/manifest.json` | `3.34.5` | Chrome Web Store + extension UI |
| `AGENTS.md` Project State | `0.2.1-alpha` | Headbox session log |
| `Tabatha_Changelog.md` | most-recent header | Human-readable history |

`package.json` is stalest. Plan: **make `manifest.json` the source of truth** (it's what Chrome actually loads), and have a script propagate.

Script written to `scripts/sync-version.mjs`. Behavior:
1. Read `public/manifest.json` → `version`.
2. Update `package.json.version` to match (preserve formatting).
3. Update `AGENTS.md` Project State block's `**Current version:**` line.
4. Mirror the headbox section into `CLAUDE.md`, `GEMINI.md`, `.gemini/agent.md` (per Session Handoff Protocol).
5. Verify `Tabatha_Changelog.md` has a heading for that version (warn if missing).
6. Exit non-zero on mismatch when run with `--check`.

CI/Hook wiring:
- Add `npm run version:sync` and `npm run version:check` to `package.json` `scripts`.
- Add a `pre-commit` hook (Husky or a plain `.git/hooks/pre-commit`) that runs `npm run version:check` and blocks the commit on mismatch.
- Add a `prebuild` script so `npm run build` auto-syncs.

The script is delivered alongside this response.

---

## 6. Configurable caps (not hardcoded)

You said: *"Caps and things that are to be considered for changing based on system use, should be available to configure in user settings not hardcoded."*

Agreed. Plan amendment:

- **Phase 1** adds a new settings block `settings.storage` with defaults:
  ```js
  {
    snapshotIntervalMinutes: 30,     // was 5
    snapshotCap: 20,                 // was 50
    logsCap: 500,
    closedContextsCap: 500,
    intentHistoryCap: 500,
    focusHistoryCap: 200,
    parkedTabsCap: 200,
    parkedTabsWarnAt: 180,
    pendingTimeLogsCap: 5000,        // raised per your note
    pendingTimeLogsWarnAt: 4000,
    archivedTasksColdAfterDays: 90
  }
  ```
- **Settings → Advanced → Data & Retention** surfaces these. Each row shows the current value, the default, current usage (live count from storage), and a tooltip explaining what gets lost or aggregated when it triggers.
- **`enforceArrayCap()` in `storageService.js`** reads from `settings.storage` instead of magic numbers.

### pendingTimeLogs specifically

Per your direction, cap **5000 (not 1000), warn at 4000, never auto-drop**. If the user ignores the warning and somehow exceeds 5000 (e.g. extended offline), we **stop accepting new entries and persist a "blocked sync" UI state** rather than dropping. The new entries are written to `_overflowTimeLogs` so they're still recoverable. No silent loss.

---

## 7. Snapshots — what they are, before deciding to cut

You said: *"I don't know what the snapshots are and how much I rely on them as of now."*

`sessions` (the snapshot array) stores a full dump of: open tabs with their context/intent, active focus, active clock state, and category time totals, taken every 5 minutes. Today it caps at 50 → max 4 hours of history.

Used by:
- `GET_SESSIONS` → consumed by the home page's "Recent Sessions" panel
- `EXPORT_MARKDOWN` → renders a markdown report from the most recent snapshot
- `GET_FLOW_RECALL` → "what was I doing N minutes ago" rewind

If you don't rely on rewind beyond a working day, 30-min interval × 20 cap = 10 hours of history, which is more useful than 4 hours at 5-min granularity. But this is your call and now it's exposed in settings per §6.

---

## 8. Intent / Privacy / Window Titles (audit Finding #1)

Your direction noted. Plan amendments:
- **Privacy mode defaults to `Full`.**
- Settings copy added: *"Tabatha uses titles and URLs together to have more accurate context to user activity without the need for API calls or including AI. It reduces the number of questions or interactions the user has to give to have the tracking they want."*
- Sticky note created at `.headbox/sticky-notes/privacy-modes-future.md` (separate task; will write).

---

## 9. Central counter for UI timers

Your direction noted. Plan amendment:
- New `clockTickService.js` (Phase 4 alongside `clockService.js`) emits a `TICK` event once per second when **any** consumer is active.
- Consumers subscribe with their own granularity (focus timer wants every second, InBar wants every minute) and pause when their host UI is hidden, but the central counter never pauses — it just stops broadcasting if nobody listens.
- Visibility-driven pause becomes a subscription concern, not a timer concern. No more drift between popups.

---

## 10. InBar timer "pause" — clarification

You asked: *"Clarify what you mean by Pause? The timer is still relevant."*

Bad word from the audit. What I meant: when the InBar is **hidden** (tab inactive / page scrolled / user collapsed it), the InBar **doesn't need to re-render** every second — but the underlying time tracking continues unchanged. The fix is purely render-side: stop the `setInterval` in the React component when `document.visibilityState === 'hidden'`, resume on `visible`. The numbers it displays still come from the central counter (§9), so when it re-mounts it shows the current value, not a stale one.

No actual timing pauses. Apologies for the imprecise wording.

---

## 11. Branch strategy — plan ahead for all worktrees

You said: *"I am [comfortable archiving]. And can we plan ahead for all others."*

See [branch-worktree-audit.md](./branch-worktree-audit.md) — full audit of the 4 branches and 1 stale worktree, with a per-branch disposition.

---

## 12. Architecture docs — update first?

You said: *"Let's update these 3 files first unless they come after the decomp."*

Yes — they come **first**, in Phase 0. Concrete sequence:
1. Pull the 3 architecture docs from `refactor/service-arch` (per Phase 0 already in the plan).
2. **Update them against current `master`** (79 handlers, not 62; new state machines) **before** any extraction starts.
3. Only then archive the branch and cut `refactor/decomp-v2`.

This means Phase 0 effort grows from 1h → ~2h. Task file `00-pre-decomp.md` reflects that.

---

## 13. Version bump — count the changes (deferred to end)

You said: *"I agree but stick to the version math. Count the changes."*
And on 2026-05-13: *"we will wait until after all is done to count all of the semantic changes to then know what the version number should be. I like accurate version changes."*

**Decision: version bump is deferred to Phase 6.** During each phase, append a one-line entry to `maintenance/Plan-023/semantic-changes.md` for every semantically meaningful change (categorize as `breaking` / `feature` / `fix` / `perf` / `internal-only`). At the end, the running list determines the bump.

Counting begins at master's current `3.34.5`. The earlier prescription of `3.35.0-α` is removed — Phase 6 picks the number from the ledger.

---

## Summary of plan amendments

| # | Patch | Where it lands |
|---|---|---|
| 1 | New `archiveService.js` introduced in Phase 1 (was implicit in Phase 5) | Phase 1 |
| 2 | `intentChangeLog` merged into `intentHistory` with union schema | Phase 3 |
| 3 | `chrome.storage` stays as cache; Supabase + companion remain ecosystem source of truth; IndexedDB on roadmap | Architecture docs |
| 4 | Companion bridge → `companionService.js` confirmed | Phase 5 |
| 5 | Version sync script + pre-commit + prebuild | Phase 0 |
| 6 | All caps + intervals move to `settings.storage` + exposed in Settings UI | Phase 1 + UI follow-up ticket |
| 7 | `pendingTimeLogs`: cap 5000, warn 4000, **never auto-drop**, `_overflowTimeLogs` recovery | Phase 3 |
| 8 | Privacy default = Full, copy added, sticky note for future modes | Phase 0 |
| 9 | Central tick service (`clockTickService.js`) | Phase 4 |
| 10 | InBar "pause" = render-side only; no timing change | Phase 4 |
| 11 | Pre-decomp arch docs updated against master before extraction | Phase 0 |
| 12 | Version bump deferred — `semantic-changes.md` ledger built during phases, number chosen in Phase 6 | All phases |
