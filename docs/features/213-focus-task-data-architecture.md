# Feature #213 — Focus / Task Data Architecture Normalization

> **Status:** 📋 Planned · **Version:** v0.3.0
> **Depends On:** Focus Engine (#122), Tasks Panel, Sub-Focus / `parentFocusId` hierarchy
> **Created:** 2026-05-30
> **Source:** User, 2026-05-30
> **Category:** Architecture / Data Model
> **Pairs With:** #214 Priority Matrix & Lazy Priority

## User Context (Quotes)

> "Currently we are able to attach priorities to a focus, which we probably just want to consider as being a high-level task or a parent task. This is because the system already has actual tasks — things labeled as tasks, which should always be attached to a focus, if not be a focus itself. That's one thing: making sure that that slight data architectural structure is updated."
> — User, 2026-05-30

---

## Problem

Tabatha has **two task-like concepts** that aren't cleanly related in the data model:

1. **Focuses** — currently the priority-bearing unit; effectively high-level / parent tasks.
2. **Tasks** — discrete to-do items in the Tasks Panel.

Today a task can exist somewhat independently, and "focus" doubles as "parent task," but the relationship isn't enforced. This makes priority reasoning (#214), reporting, and the AI counterpart's decisions ambiguous: *what is the unit of work, and what does its priority apply to?*

---

## Target Model

Establish a clear, enforced hierarchy:

```
Focus  (≈ parent / high-level task — priority-bearing)
  └── Task  (must belong to a Focus)        ← OR ──
Task that is itself promoted to a Focus (stands alone as its own focus)
```

**Rules:**
1. **Every Task must be attached to a Focus** — either an existing focus, or by being **promoted to its own focus** (a task that *is* a focus).
2. A **Focus is the priority-bearing unit** (high-level/parent task). Tasks may carry their own lighter priority, but they inherit context from their parent focus.
3. No orphan tasks. On creation, a task either selects a parent focus or triggers focus creation/promotion.

---

## Migration / Implementation

1. **Schema:** ensure `task.parentFocusId` is **required** (or a `task.isPromotedFocus` flag when the task is itself a focus).
2. **Promotion path:** "Promote task → focus" action (already partially exists via start-intent-from-task / link-task-to-intent) becomes the canonical way a standalone task becomes a focus.
3. **Backfill:** existing orphan tasks → prompt user to assign a parent focus, or auto-create a focus from the task.
4. **CRUD enforcement:** Tasks Panel create/edit flows require a focus association (with inline focus create + the InPop/ComboInput mechanism).
5. **Sync:** propagate the relationship through `syncService` (focus history / task tables) so Supabase mirrors the hierarchy.

---

## Why This Matters (Downstream)
- **#214 Priority:** priority is defined primarily at the **focus** level (parent task); the Priority Matrix and Lazy Priority both operate on focuses, with optional task-level refinement.
- **#210 Priority Challenge:** "is this the most important thing" needs an unambiguous unit to compare — the focus.
- **AI Counterpart / #211 Voice:** "create a task" must always resolve to a parent focus, keeping the graph clean.
- **Reporting / Asana sync:** a consistent parent→child mapping aligns with Asana's task/subtask + project model.

---

## Anchor Points
- `focusService.js` (focus = parent task semantics), Tasks Panel CRUD, `parentFocusId` traversal (already used by #209), `syncService`.
- Constants / schema defaults for task object.

---

## Open Questions
1. Do tasks get the **full** Priority Matrix (#214) or only the Lazy P1–P5, inheriting matrix context from the parent focus? (Recommend: tasks = lazy priority + inherited matrix; focuses = full matrix.)
2. How are existing decoupled tasks surfaced for backfill without nagging?
3. Should "focus" be renamed in UI to reflect "parent task," or keep "focus" as the user-facing term? (Keep "focus" — it's core to the product philosophy.)

---

## Related Features
- #214 Priority Matrix & Lazy Priority
- #210 Priority Challenge & Accountability
- #209 Focus Resolution Tab Cleanup (parent/child traversal)
- #208 Smart Deferral (task splitting under a parent focus)
