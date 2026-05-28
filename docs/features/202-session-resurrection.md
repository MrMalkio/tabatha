# Feature #202 — Session Resurrection

> **Status:** 📋 Planned · **Version:** TBD **Depends On:** Focus Engine (core),
> #172 History Queue Recovery, #184-persistent-focuses **Created:** 2026-05-19
> **Source:** User request — leverage Chrome's session restore with selective,
> deferred recovery

## User Context (Quotes)

> "Normally when a user closes Chrome unexpectedly and there were tabs open,
> Chrome invites them to restore that session on next restart. Do we have access
> to that list of tabs and such to incorporate that feature into Tabatha?"
>
> "User is able to restore selective parts of sessions. User can decide to
> restore later." — User, 2026-05-19

## The Idea — "Resurrection" Not "Restore"

Chrome's native restore is dumb: it dumps every tab back in your face, all at
once, no context, no grouping. That's a **chaos reload**, not a recovery.

Tabatha's Session Resurrection is **context-aware recovery**. When you lost a
session — whether from a crash, force-quit, or just closing Chrome at 2AM — the
next time you open your browser, Tabatha doesn't just say "Want your tabs back?"
It says:

> _"You were deep in **'API Refactor'** with 7 tabs and 2 tasks open. You also
> had **'Vacation Planning'** parked with 3 tabs. What do you want to bring
> back?"_

Each focus is presented as a **recoverable capsule** — a sealed unit of work
with its tabs, intent, tasks, and elapsed time preserved. You pick what matters
now. The rest stays on ice.

---

## What It Does

### 1. Ghost Snapshot (Continuous Persistence)

Tabatha already tracks tab state via the Focus Engine. Session Resurrection adds
a **Ghost Snapshot** — a lightweight, rolling backup of the entire session state
written to `chrome.storage.local` on a heartbeat.

| Data Point                                                        | Source                       | Frequency                     |
| ----------------------------------------------------------------- | ---------------------------- | ----------------------------- |
| All open tabs (url, title, favIconUrl, windowId, pinned, groupId) | `chrome.tabs.query({})`      | Every 60s + on tab open/close |
| Active focuses + their linked tabs                                | Focus Engine state           | On focus mutation             |
| Active intents per tab                                            | Intent map                   | On intent mutation            |
| Clock state (clocked-in, elapsed, break status)                   | Clock Service                | On clock tick                 |
| Active tasks + linked focuses                                     | Task store                   | On task mutation              |
| Window geometry (position, size, state)                           | `chrome.windows.getAll()`    | Every 60s                     |
| Chrome tab groups (title, color, collapsed)                       | `chrome.tabGroups.query({})` | On group change               |

The Ghost Snapshot is a single JSON blob stored under key
`tabatha:ghostSnapshot`. It is **not** the session itself — it's a **last known
state** checkpoint.

### 2. Death Detection

On `chrome.runtime.onStartup` (browser reopened after full close), Tabatha
compares the Ghost Snapshot to the current live tab state:

```
Ghost Snapshot tabs:  [A, B, C, D, E, F, G, H, I, J]
Current live tabs:    [K]  (just the new-tab page)

Missing tabs = Ghost - Live = [A, B, C, D, E, F, G, H, I, J]
→ Trigger: SESSION_DEATH detected
```

If missing tabs > 0 and last shutdown was not a **graceful close** (see below),
the Resurrection flow activates.

#### Graceful vs. Ungraceful Close

| Signal                                                          | Classification                         |
| --------------------------------------------------------------- | -------------------------------------- |
| User clicked "Clock Out" in Tabatha before closing              | Graceful — no resurrection             |
| `chrome.runtime.onSuspend` fired and user had 0 active focuses  | Graceful                               |
| `chrome.runtime.onSuspend` fired but focuses were active        | Ambiguous — offer resurrection         |
| No `onSuspend` recorded (crash/force-quit)                      | Ungraceful — auto-trigger resurrection |
| `onStartup` fires with ghost snapshot present and tab delta > 3 | Ungraceful — auto-trigger              |

### 3. The Resurrection Screen

When a session death is detected, the **Homepage (New Tab)** transforms into the
**Resurrection Screen** — a temporary overlay that replaces the normal
dashboard.

#### Layout: "Your Last Session"

```
╔══════════════════════════════════════════════════════════════════════╗
║  🪦 → 🌅  SESSION RESURRECTION                                     ║
║  ─────────────────────────────────────────────────────────────────  ║
║  Chrome closed unexpectedly. Here's what you had going:            ║
║                                                                     ║
║  ┌──────────────────────────────────────────────────┐              ║
║  │  ☑ 🎯 API Refactor  ·  7 tabs  ·  2h 14m deep   │  [Preview ▾] ║
║  │     📌 github.com/org/repo/pull/42               │              ║
║  │     📌 docs.api.com/v3/endpoints                 │              ║
║  │     📌 localhost:3000/test                        │              ║
║  │     ... +4 more                                  │              ║
║  │     📋 Tasks: "Fix auth middleware", "Write tests"│              ║
║  │     ⏱ Clock was running · Break: none            │              ║
║  └──────────────────────────────────────────────────┘              ║
║                                                                     ║
║  ┌──────────────────────────────────────────────────┐              ║
║  │  ☑ 🏖 Vacation Planning  ·  3 tabs  ·  12m       │  [Preview ▾] ║
║  │     📌 airbnb.com/rooms/12345                    │              ║
║  │     📌 google.com/flights                        │              ║
║  │     📌 tripadvisor.com/...                       │              ║
║  └──────────────────────────────────────────────────┘              ║
║                                                                     ║
║  ┌──────────────────────────────────────────────────┐              ║
║  │  ☐ 🔇 Unassigned  ·  4 tabs                      │  [Preview ▾] ║
║  │     📌 reddit.com/r/programming                  │              ║
║  │     📌 youtube.com/watch?v=...                   │              ║
║  │     📌 gmail.com                                 │              ║
║  │     📌 calendar.google.com                       │              ║
║  └──────────────────────────────────────────────────┘              ║
║                                                                     ║
║  ╔══════════════════════════════════════════════════╗              ║
║  ║  [🌅 Resurrect Selected]   [🧊 Put On Ice]      ║              ║
║  ║  [🗑 Dismiss — Start Fresh]                      ║              ║
║  ╚══════════════════════════════════════════════════╝              ║
╚══════════════════════════════════════════════════════════════════════╝
```

#### Interaction Model

| Action                       | Effect                                                                     |
| ---------------------------- | -------------------------------------------------------------------------- |
| **☑ / ☐ Checkbox per focus** | Toggle which focus capsules to restore                                     |
| **Preview ▾**                | Expand to see all tabs + tasks in the capsule                              |
| **Individual tab ☑/☐**       | Within an expanded capsule, deselect specific tabs                         |
| **🌅 Resurrect Selected**    | Opens all selected tabs, restores focus state, resumes clock if applicable |
| **🧊 Put On Ice**            | Saves the session to the**Ice Box** (see below) for later restoration      |
| **🗑 Dismiss**                | Clears the ghost snapshot, starts fresh                                    |

#### Selective Restore Behaviors

- Restoring a focus capsule re-creates the Chrome tab group with matching
  color/title
- If the focus had a running clock, Tabatha asks: _"Resume clock for 'API
  Refactor'?"_
- Tasks linked to the focus are restored to active status
- Intents are re-applied to restored tabs
- Window geometry is restored (same monitor position if possible)

### 4. The Ice Box — "Restore Later"

When the user clicks **🧊 Put On Ice**, the unrestored capsules are saved to a
persistent **Ice Box** — a frozen session archive accessible from the Homepage
and Sidebar.

#### Ice Box Storage

```js
// chrome.storage.local key: "tabatha:iceBox"
{
  sessions: [
    {
      id: "ice_1716123456_x8k2",
      frozenAt: "2026-05-19T08:00:00Z",
      originEvent: "crash", // "crash" | "force_quit" | "manual_close" | "user_frozen"
      capsules: [
        {
          focusId: "f_abc123",
          focusLabel: "API Refactor",
          focusRealm: "Work",
          focusTags: ["dev", "backend"],
          tabs: [
            { url: "...", title: "...", favIconUrl: "...", pinned: false },
            // ...
          ],
          tasks: [
            { id: "t_1", name: "Fix auth middleware", status: "in_progress" },
            // ...
          ],
          intents: [
            {
              tabUrl: "...",
              label: "Reviewing PR #42",
              context: "Code Review",
            },
          ],
          clockState: {
            wasRunning: true,
            elapsedMs: 8040000,
            wasOnBreak: false,
          },
          groupMeta: {
            title: "API Refactor",
            color: "blue",
            collapsed: false,
          },
          windowBounds: {
            left: 0,
            top: 0,
            width: 1920,
            height: 1080,
            state: "maximized",
          },
        },
        // ...more capsules
      ],
    },
    // ...older frozen sessions
  ];
}
```

#### Ice Box UI (Homepage Card)

```
┌────────────────────────────────────────────────────┐
│  🧊 Ice Box  ·  2 frozen sessions                  │
│  ──────────────────────────────────────────────     │
│  📦 May 19, 2:00 AM  ·  crash  ·  3 capsules       │
│     🎯 API Refactor (7 tabs)  ·  🏖 Vacation (3)   │
│     [Thaw ☀️]  [Peek 👀]  [Melt 🗑]               │
│                                                     │
│  📦 May 17, 11:30 PM  ·  manual  ·  1 capsule      │
│     📚 Research (12 tabs)                           │
│     [Thaw ☀️]  [Peek 👀]  [Melt 🗑]               │
└────────────────────────────────────────────────────┘
```

| Action      | Effect                                                                    |
| ----------- | ------------------------------------------------------------------------- |
| **Thaw ☀️** | Opens the Resurrection Screen for that frozen session (selective restore) |
| **Peek 👀** | Read-only preview of all tabs/tasks without restoring                     |
| **Melt 🗑**  | Permanently delete the frozen session                                     |

#### Ice Box Retention

- Default: 30 days (configurable in Settings → Session Recovery)
- Maximum: 20 frozen sessions (oldest auto-melts when limit exceeded)
- Storage footprint: ~2-5 KB per frozen session (URLs + metadata only, no page
  content)

### 5. Fallback: `chrome.sessions` API

As a secondary data source, Tabatha also queries
`chrome.sessions.getRecentlyClosed()` on startup. This catches tabs that were
closed _before_ the last Ghost Snapshot was written (e.g., during the 60s
heartbeat gap).

- Recently-closed tabs are **deduplicated** against the Ghost Snapshot
- Any tabs found only in `chrome.sessions` are added to a special
  **"Recovered"** capsule
- This capsule appears on the Resurrection Screen as a separate group: _"🔎 Also
  found: 3 tabs Chrome remembered"_

### 6. Graceful Close Integration

When a user **clocks out** or explicitly ends their session:

1. The Ghost Snapshot is **cleared** (no resurrection on next startup)
2. The session is **archived** to focus history (existing behavior)
3. Optional: offer to **freeze** the current tab layout to the Ice Box anyway
   (_"Save this workspace for later?"_)

This prevents false resurrections while still giving power users a manual freeze
option.

---

## Chrome Permissions Required

| Permission    | Currently Have? | Why                                            |
| ------------- | --------------- | ---------------------------------------------- |
| `"sessions"`  | ❌ Needs adding | `chrome.sessions.getRecentlyClosed()` fallback |
| `"tabs"`      | ✅              | Tab queries for Ghost Snapshot                 |
| `"storage"`   | ✅              | Ghost Snapshot + Ice Box persistence           |
| `"tabGroups"` | ✅              | Restore Chrome tab groups                      |

---

## Settings (under "Session Recovery")

| Setting                              | Key                        | Default |
| ------------------------------------ | -------------------------- | ------- |
| Enable Session Resurrection          | `resurrectionEnabled`      | `true`  |
| Ghost Snapshot frequency (seconds)   | `ghostSnapshotIntervalSec` | `60`    |
| Offer resurrection on graceful close | `resurrectionOnGraceful`   | `false` |
| Ice Box retention (days)             | `iceBoxRetentionDays`      | `30`    |
| Ice Box max sessions                 | `iceBoxMaxSessions`        | `5`     |
| Auto-resurrect last focus on startup | `autoResurrectLastFocus`   | `false` |

> **`autoResurrectLastFocus`**: When enabled, if there was exactly one active
> focus at death time, Tabatha skips the Resurrection Screen and immediately
> restores that focus + its tabs. Power user shortcut.

---

## Event Log Entries

| Event Type            | Logged When                                     |
| --------------------- | ----------------------------------------------- |
| `session_death`       | Ghost Snapshot → live tab mismatch detected     |
| `session_resurrected` | User restores capsules from Resurrection Screen |
| `session_frozen`      | User puts capsules on ice                       |
| `session_thawed`      | User restores from Ice Box                      |
| `session_melted`      | User deletes a frozen session                   |
| `session_dismissed`   | User starts fresh, discarding ghost             |

---

## Implementation Notes

### Background Service: `resurrectionService.js`

New service in the decomposed architecture. Handlers:

| Message                | Direction | Purpose                                              |
| ---------------------- | --------- | ---------------------------------------------------- |
| `GHOST_SNAPSHOT_WRITE` | Internal  | Periodic snapshot writer (alarm-driven)              |
| `GHOST_SNAPSHOT_READ`  | UI → BG   | Read last ghost snapshot                             |
| `SESSION_DEATH_CHECK`  | Internal  | Compare ghost vs. live on startup                    |
| `RESURRECT_CAPSULES`   | UI → BG   | Restore selected capsules (open tabs, restore focus) |
| `FREEZE_CAPSULES`      | UI → BG   | Save capsules to Ice Box                             |
| `THAW_SESSION`         | UI → BG   | Load frozen session for re-selection                 |
| `MELT_SESSION`         | UI → BG   | Delete frozen session                                |
| `GET_ICE_BOX`          | UI → BG   | List all frozen sessions                             |

### Frontend Components

| Component                | Location       | Purpose                                                  |
| ------------------------ | -------------- | -------------------------------------------------------- |
| `ResurrectionScreen.jsx` | `src/home/`    | Full-page overlay on homepage when death detected        |
| `CapsuleCard.jsx`        | `src/home/`    | Focus capsule with expand/collapse, tab list, checkboxes |
| `IceBoxCard.jsx`         | `src/home/`    | Homepage card showing frozen sessions                    |
| `IceBoxPanel.jsx`        | `src/sidebar/` | Sidebar section for Ice Box access                       |

### Alarms

| Alarm Name         | Interval           | Purpose                       |
| ------------------ | ------------------ | ----------------------------- |
| `ghost-snapshot`   | 60s (configurable) | Write rolling Ghost Snapshot  |
| `icebox-retention` | 24h                | Prune expired frozen sessions |

---

## Synergy with Existing Features

| Feature                            | Synergy                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| **#172 History Queue Recovery**    | Resurrection is the_automatic_ version; #172 is the manual "go dig through history" version      |
| **#184 Checkpoint Progress Notes** | CPNs written before death are preserved in the capsule — visible on Peek                         |
| **#184 Persistent Focuses**        | Persistent focuses survive death automatically; resurrection handles the_tabs_ that go with them |
| **#201 Follow-Through Score**      | A resurrected-and-completed focus counts toward follow-through; a dismissed one is "abandoned"   |
| **Clock Service**                  | Clock state (elapsed, break) is captured and optionally resumed                                  |
| **Chrome Tab Groups**              | Group metadata (title, color, collapsed state) is restored on resurrection                       |
| **Supabase Sync**                  | Frozen sessions sync to cloud → accessible from other devices or after Chrome reinstall          |

---

## Open Questions

1. **Should the Resurrection Screen block the homepage entirely, or appear as a
   dismissible banner?** Current design: full overlay that must be acted on
   (resurrect, freeze, or dismiss). Could alternatively be a persistent banner
   that the user can ignore.
2. **Should individual tabs within a capsule be individually restorable, or only
   at the capsule (focus) level?** Current design: both — capsule-level
   checkboxes + expandable per-tab checkboxes.
3. **Should we capture scroll position / form state?** Chrome's internal restore
   does this. Extension API does not expose it. Answer: No — accept this
   limitation. URLs are enough.
4. **Ice Box cloud sync — should frozen sessions sync to Supabase?** Would
   enable cross-device resurrection. Storage cost is minimal. Suggested: yes, as
   part of Sync Batch 2.
5. **What if the user opens Chrome, gets the Resurrection Screen, then closes
   Chrome again before acting?** The ghost snapshot should NOT be overwritten by
   the near-empty current state. Solution: freeze the ghost snapshot until the
   Resurrection Screen is resolved.

---

## Related Features

- #172 History Queue Recovery
- #184 Checkpoint Progress Notes
- #184 Persistent Focuses
- #199 Morning Kickstart (could integrate — show Resurrection as part of morning
  flow)
- #201 Follow-Through Score
