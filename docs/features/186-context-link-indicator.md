# Feature #186: Context Link Indicator & Focus Counts

> **Scoped at v4.3.0**
> **Category:** Awareness · Context
> **Status:** In Progress
> **Priority:** Medium

## Summary

Two related UI enhancements for contextual awareness:

### 1. InBar Context Link Indicator
The tab intent label in the InBar center should display an icon showing whether the current tab is connected to the active focus:
- **🔗** (linked) — the tab is in `activeFocus.associatedTabIds`
- **⚡** (unlinked) — the tab has context but is NOT associated with the current focus

This gives instant visual feedback on whether context is properly connected and tab grouping/categorization is correct.

### 2. Focus Tab & Window Counts
In sidebar and homepage focus cards, show small badge numbers representing:
- How many **tabs** are associated with the focus (`associatedTabIds.length`)
- How many unique **windows** those tabs span

Format: `{N} tabs · {M} windows` next to the focus label.

## Entry Points

| Surface | What shows |
|---------|-----------|
| InBar (center label) | 🔗 or ⚡ icon next to the tab intent text |
| Home FocusBar | `{N} tabs · {M} windows` stat line |
| Sidebar focus card | `{N} tabs · {M} windows` stat line |

## Data Requirements

- `activeFocus.associatedTabIds` (already available)
- `sender.tab.id` (already in GET_INBAR_DATA)
- Window count: need to query `chrome.tabs.get()` for each associated tab or pass window data from backend

## Backend Changes

- `GET_INBAR_DATA` response needs `isTabLinked: boolean` flag
- Focus engine `GET_FOCUS_ENGINE` should include window count per focus (or let UI compute from tab data)

## Related Features

- #184 Checkpoint Progress Notes (staleness indicator uses same focus label area)
- #185 Popup Harmony (singleton overlay system)
