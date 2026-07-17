# Feature #186 — Asana Task ↔ Focus Linking

> **Status:** Partial — native App Components configured; installation and live-task validation pending · **Base version:** v6.7.22 · **Release:** Unassigned
> **Depends On:** #54 Asana Integration, #142 Asana URL Parsing, #122 Focus Queue
> **Created:** 2026-05-26

## User Context (Quotes)

> "We need the ability to attach an Asana Task to a focus. At creation or edit."
>
> "It would be additionally great to be able to just create a focus automatically or be prompted to do so when a user navigates to an isolated task page (based on the URL)."
> — User, 2026-05-26

## What It Does

Five capabilities are implemented on the isolated branch. The native Asana app is the primary delivery surface; browser-extension helpers remain unmerged and unreleased.

### 1. Attach Asana Task to Focus (Manual)

At focus creation or during editing, user can link an Asana task:

- **Search/paste Asana URL** → extracts GID via URL parsing (#142)
- **Browse Asana tasks** → pulls from synced project list
- Focus stores `asanaTaskGid`, displays task name + project
- Reopening the task switches to its unresolved focus instead of duplicating it

### 2. Auto-Focus from Asana Task URL (URL-Triggered)

When a user navigates to an Asana task page (`app.asana.com/0/{project_gid}/{task_gid}`):

- A compact task strip appears with **Set focus**, **My time**, and **Agent time**
- `?focus=true` and `/f` pages immediately update the InBar to the visible task title
- SPA navigation is observed, so moving between tasks refreshes Tabatha without a page reload
- Task name and visible parent breadcrumb are extracted without reading descriptions

### 3. Human and Agent Task Time

- Human and named-agent timers are separate and may run concurrently
- Agent timers open a matching tab-scoped Cortex controller span
- Local storage is canonical; Supabase/widget mirroring is best-effort
- Each entry records the Asana task, actor, agent name, Tabatha focus, tab/window, and timestamps

### 4. Parent and Nested Rollups

- A stint is stored once against the subtask where it began
- Known ancestor GIDs are stored on that same row
- A parent report includes direct rows plus descendant rows containing that parent GID
- This permits each hierarchy level to show a rollup without duplicating rows or counting a child twice within one total

### 5. Lightweight Task Context and Explicit Completion

- Visiting a task upserts a `contextOnly` record in Tabatha's existing task store
- The record captures source ID/URL, project and parent references, freshness, and attention totals—not Asana's broader project-management fields
- Focuses link to this local task ID, so existing intent/task relationships continue to work
- Completing the linked task in Tabatha offers a separate **also complete in Asana** confirmation
- Declining leaves Asana untouched; remote failures leave the local completion intact and visible

## Data Model Addition

```json
{
  "focus": {
    "id": "focus_xyz",
    "label": "Fix authentication flow",
    "tags": {
      "asanaTaskGid": "1234567890",
      "asanaParentTaskGid": "1234567880",
      "asanaAncestorTaskGids": ["1234567880", "1234567000"],
      "asanaTaskUrl": "https://app.asana.com/0/..."
    }
  }
}
```

## URL Pattern for Detection

```
https://app.asana.com/0/{project_gid}/{task_gid}
https://app.asana.com/0/{project_gid}/{task_gid}/f
```

## Implementation Notes

- Asana app `1214413273944527` has Entry Point, Modal Form, and Widget enabled for the restricted `gnge.co` workspace
- `supabase/functions/asana-widget/index.ts` is the production native App Component service; it validates exact-body Asana HMAC signatures and `expires_at`
- The Entry Point action is **Track attention**; its Modal Form creates or stops human or named-agent stints and returns an attachment URL matched by the Widget
- The app is not yet installed into a project and no live timer submission has been made
- `src/content/asana.js` owns the Asana-only task strip and SPA observation
- `asanaService.js` owns task context, timers, focus linking, local persistence, and cloud mirroring
- `asanaTaskTracking.js` owns pure hierarchy and duration calculations
- Migration 029 and the widget route expose nested and agent totals in Asana
- `asana-task-action` is the authenticated, narrow task-action Edge Function (`get`, `create`, `complete`); the Asana PAT never enters extension code
- Existing Tabatha task cards can open Asana or Anasa, attach an Asana URL/GID without changing the local task ID, or create and attach a minimal Asana task in one action
- The Anasa base URL is configurable so the same button can target a tailnet deployment while public DNS is pending

## Open Questions

- Resolving a focus does not silently complete the Asana task; source completion is offered only when the linked Tabatha task is explicitly completed.
- Should the system sync Asana task status changes back to focus state?
- Focus linking remains one Asana task per focus; parent rollup is metadata, not an additional focus link.
