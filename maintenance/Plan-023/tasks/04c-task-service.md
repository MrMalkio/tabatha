# Task 04c — taskService

| Property | Value |
|---|---|
| **Branch** | `refactor/decomp-v2-task-service` |
| **Branched from** | `refactor/decomp-v2` (after Tasks 02 + 03 merged) |
| **Merge target** | `refactor/decomp-v2` |
| **Depends on** | Tasks 02 + 03 |
| **Parallel with** | 04a, 04b, 04d |
| **Effort** | ~1 hour |
| **Risk** | Medium (tabathaOrg + legacy fallback paths) |

## Files created
- `src/background/services/taskService.js`

## Handlers owned
`GET_TASKS`, `CREATE_TASK`, `UPDATE_TASK`, `DELETE_TASK`, plus task-stage gating logic (`canTransitionStage`, etc.).

## Efficiency fixes bundled
- After 90 days in `archived` stage, move task from `tabathaOrg.tasks` → `_archivedTasks` (the cold-store key). `cold-after-days` value reads from `settings.storage.archivedTasksColdAfterDays`.
- Migration: ensure `tabathaOrg` migration from `bootstrap.js` already ran (Task 01) — this service can assume it.

## Router registration
```js
const services = [..., taskService];
```

## Verification
- [ ] Create / edit / archive / delete task — all flows work
- [ ] Task stage transitions enforced (cannot skip stages)
- [ ] Old archived task crosses 90-day boundary → moves to `_archivedTasks` (simulate via clock)
- [ ] message-contracts.md updated
