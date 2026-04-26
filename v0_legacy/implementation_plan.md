# Implementation Plan: Tabatha Search Popup

This plan outlines the steps to implement a search popup for Tabatha, allowing
users to quickly find and switch between open tabs, inspired by the "Quick Tabs"
extension.

## User Review Required

> [!NOTE]
> This change will modify the default behavior of clicking the Tabatha extension
> icon. Currently, it does nothing or opens the default popup (if configured).
> We will be setting it to open a custom search interface.

## Proposed Changes

### Extension Metadata

#### [MODIFY] [manifest.json](file:///c:/Users/mrmal/Le%20Dev/Tabatha/manifest.json)

- Update `action.default_popup` to point to `popup.html`.
- Ensure necessary permissions (`tabs`, `activeTab`) are present (they seem to
  be).

### UI Implementation

#### [NEW] [popup.html](file:///c:/Users/mrmal/Le%20Dev/Tabatha/popup.html)

- A clean, minimal HTML structure for the search bar and tab list.
- Input field for search query.
- Container for search results.

#### [NEW] [popup.css](file:///c:/Users/mrmal/Le%20Dev/Tabatha/popup.css)

- Styling for the popup to match Tabatha's aesthetic (or a clean, modern look).
- Dark mode support if possible/relevant.
- Highlight styles for selected tabs in the list.

### Logic Implementation

#### [NEW] [popup.js](file:///c:/Users/mrmal/Le%20Dev/Tabatha/popup.js)

- **Initialization**: Fetch all open tabs using `chrome.tabs.query({})` on load.
- **Search Logic**: Filter tabs based on title and URL as the user types.
- **Rendering**: Dynamically update the results list.
- **Navigation**:
  - Arrow Up/Down to traverse the list.
  - Enter to switch to the selected tab.
- **Action**: Clicking a list item should also switch to that tab.

## Verification Plan

### Manual Verification

1. **Load Extension**: Load the unpacked extension in Chrome Developer Mode.
2. **Open Popup**: Click the Tabatha icon in the toolbar.
3. **Search**: Type a query (e.g., "Google", "GitHub") and verify relevant tabs
   appear.
4. **Navigation**: Use Arrow keys to select a tab and press Enter. Verify the
   browser switches to that tab.
5. **Mouse Interaction**: Click a tab in the list and verify the browser
   switches to that tab.
6. **Empty State**: Verify behavior when no search query is entered (should show
   all tabs or MRU list).
