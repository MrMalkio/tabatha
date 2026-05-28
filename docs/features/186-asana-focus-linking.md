# Feature #186 — Asana Task ↔ Focus Linking

> **Status:** 📋 Planned · **Version:** v0.2.0  
> **Depends On:** #54 Asana Integration, #142 Asana URL Parsing, #122 Focus Queue  
> **Created:** 2026-05-26

## User Context (Quotes)

> "We need the ability to attach an Asana Task to a focus. At creation or edit."
>
> "It would be additionally great to be able to just create a focus automatically or be prompted to do so when a user navigates to an isolated task page (based on the URL)."
> — User, 2026-05-26

## What It Does

Two capabilities:

### 1. Attach Asana Task to Focus (Manual)

At focus creation or during editing, user can link an Asana task:

- **Search/paste Asana URL** → extracts GID via URL parsing (#142)
- **Browse Asana tasks** → pulls from synced project list
- Focus stores `asanaTaskGid`, displays task name + project
- Time tracked against focus → pushed to Asana time entry (if Asana time tracking widget is active)

### 2. Auto-Focus from Asana Task URL (URL-Triggered)

When user navigates to an Asana task page (`app.asana.com/0/{project_gid}/{task_gid}`):

- System detects isolated task page via URL pattern
- **Prompt:** "Create a focus for [Task Name]?" with options:
  - ✅ "Start Focus" → creates focus with Asana task linked
  - 📋 "Queue for Later" → adds to queue (#185)
  - ❌ "Skip" → treats as normal browsing
- Task name and project extracted from page or API

## Data Model Addition

```json
{
  "focus": {
    "id": "focus_xyz",
    "label": "Fix authentication flow",
    "asanaTask": {
      "gid": "1234567890",
      "name": "Fix authentication flow",
      "project": "Tabatha Development",
      "url": "https://app.asana.com/0/...",
      "linkedAt": "2026-05-26T10:00:00Z"
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

- Extends `SET_INTENT` / `START_FOCUS` handlers with optional `asanaTask` payload
- URL detection: add Asana task page pattern to URL rules engine (#147)
- Task name extraction: try page title first (`{task_name} - Asana`), fall back to API call
- Focus card UI: show Asana icon + task name when linked
- Edit modal: "Link Asana Task" field with URL paste or search

## Open Questions

- Should resolving a focus auto-complete the Asana task? (Probably not — but should offer a prompt)
- Should the system sync Asana task status changes back to focus state?
- Multiple Asana tasks per focus, or 1:1 only?
