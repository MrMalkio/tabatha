# Task 05b — companionService

| Property | Value |
|---|---|
| **Branch** | `refactor/decomp-v2-companion` |
| **Branched from** | `refactor/decomp-v2` (after Phase 4 integration) |
| **Merge target** | `refactor/decomp-v2` |
| **Depends on** | All of Phase 4 (specifically clockService) |
| **Parallel with** | 05a |
| **Effort** | ~1.5 hours |
| **Risk** | Medium-High (WS connection state) |

## Files created
- `src/background/services/companionService.js`

## Files deleted
- `src/background/companion-bridge.js` (359 lines — content moves into the new service, not the file)

## Handlers owned
`GET_COMPANION_STATUS`, `GET_COMPANION_SUMMARY`, `COMPANION_CLOCK_IN`, `COMPANION_CLOCK_OUT`, `COMPANION_CLOCK_BREAK`.

## Internal exports
- `sendClockEvent(event)` — called by `clockService` on CLOCK_IN/OUT/BREAK.
- `getConnectionStatus()` — for status badge.

## Efficiency fixes bundled
- **Idle broadcast transition-only.** Inside the bridge's idle handler, only call `broadcastToExtension({ type: 'COMPANION_IDLE_STATE', ... })` when `state !== lastBroadcastedState`. Today it broadcasts every detection interval.
- Reconnect backoff exponential (currently fixed-interval).
- Move the connection lifecycle constants (`WS_URL`, `HEARTBEAT_MS`, `RECONNECT_BASE_MS`) into `constants.js`.

## Migration of internal state
The current `companion-bridge.js` self-instantiates on import. The new service module exposes `initialize()` which `bootstrap.js` calls once. **Do not** auto-init on import — that pattern fights testing.

## Router registration
```js
const services = [..., companionService];
```

## Verification
- [ ] Start desktop companion → extension shows "connected"
- [ ] Stop companion → extension shows "disconnected" with backoff visible in console
- [ ] Restart companion → reconnects without extension reload
- [ ] CLOCK_IN from extension → companion DB shows the entry
- [ ] User goes idle then active → `COMPANION_IDLE_STATE` fires twice total (transitions), not every interval
- [ ] message-contracts.md updated
