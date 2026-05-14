# Task 05c — alarmService

| Property | Value |
|---|---|
| **Branch** | `refactor/decomp-v2-alarm` |
| **Branched from** | `refactor/decomp-v2` (after 05b merged) |
| **Merge target** | `refactor/decomp-v2` |
| **Depends on** | Task 05b (and effectively all earlier services) |
| **Parallel with** | — |
| **Effort** | ~1 hour |
| **Risk** | Medium |

## Files created
- `src/background/services/alarmService.js`

## Behavior
- **Consolidates both `chrome.alarms.onAlarm` listeners** into a single handler in this service.
- Routes alarm names to the owning service:
  - `session-snapshot` → `sessionService.saveSessionSnapshot()`
  - `data-retention` → `bootstrap.runRetentionCleanup()`
  - `companion-heartbeat` → `companionService.heartbeat()`
  - `supabase-sync` → **guarded behind auth check** before calling `syncService.tick()` (sync service is implicit today — keep inline if not extracted)
  - `companion-recent-sessions-retention` → existing retention code, moved here

## Efficiency fixes bundled
1. Remove the duplicate `setDetectionInterval(60)` call (audit Finding #6).
2. Guard `supabase-sync` alarm: if `!(await getAuth()).user`, skip the tick entirely. Today it fires whether or not the user is authenticated.

## Router registration
```js
const services = [..., alarmService];
```

Note: `alarmService` doesn't usually handle runtime messages — it owns the alarm listener. It still implements `handleMessage` returning `undefined` to play nice with the router chain.

## Verification
- [ ] Only one `chrome.alarms.onAlarm.addListener` registration exists (grep `onAlarm.addListener` in src — count must be 1)
- [ ] Session snapshot alarm fires at the configured interval
- [ ] Without auth, no Supabase sync attempts in network panel
- [ ] After sign-in, Supabase sync alarm fires
- [ ] message-contracts.md confirms no message-type changes
