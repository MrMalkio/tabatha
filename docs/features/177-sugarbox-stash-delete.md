# Feature #177 — Sugar Box & Stashed Tab Deletion

> **Status:** 📋 Planned · **Version:** v0.2.0  
> **Depends On:** #135 Sugar Box, #134 Parked Tabs  
> **Created:** 2026-05-15

## User Context (Quotes)

> "Need ability to delete sugarbox and stashed tabs."
> — User, 2026-05-15

## What It Does

Adds **delete functionality** to both the Sugar Box (saved distractions) and Stashed/Parked Tabs. Currently users can view and reopen these items but cannot permanently remove them.

## Operations

| Surface | Current | Adding |
|---------|---------|--------|
| **Sugar Box** (#135) | View, reopen | ✅ Delete individual, ✅ Delete all, ✅ Multi-select delete |
| **Stashed/Parked Tabs** (#134) | View, reopen | ✅ Delete individual, ✅ Delete all, ✅ Multi-select delete |

## UI

- Each item gets a small `✕` delete button (hover-reveal to keep UI clean)
- Multi-select mode: checkboxes + "Delete Selected" bulk action
- "Clear All" button with confirmation dialog
- Soft delete with 5-second undo toast (prevent accidental loss)

## Implementation Notes

- Sugar Box data: `chrome.storage.local` key `sugarBox` — remove item from array
- Parked tabs data: `chrome.storage.local` key `parkedTabs` — remove item from array
- Log deletion to Overlock (#148) for audit trail
- Deletion is permanent after undo window expires

## Open Questions

- Should deleted items be recoverable from a "trash" view for some period?
- Should deletion emit a log event or just silently remove?
