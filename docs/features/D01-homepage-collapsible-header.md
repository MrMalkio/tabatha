# Design Change D01 — Homepage Collapsible Header Redesign

> **Status:** 📋 Planned · **Version:** v0.2.0  
> **Type:** UI/UX Design Change (not a feature)  
> **Affects:** `src/home/index.jsx`, Homepage layout  
> **Created:** 2026-05-15

## User Context (Quotes)

> "Design change: on home page the headers of each section when closed are all stacked at the top of the screen. We should add a collapsible sidebar to Tabatha. And when a section is closed, the header animates and recesses into the header."
> — User, 2026-05-15

## What It Does

Redesigns the Homepage section collapse behavior. Currently, when a section is collapsed, its header stays in place, creating a stack of collapsed headers. The new behavior:

1. When a section is **collapsed**, its header **animates up** and tucks into a compact sidebar/header bar
2. The sidebar/header bar becomes a quick-navigation strip showing all collapsed section labels
3. Clicking a label in the strip **expands** that section and animates the header back into place

## Before vs. After

### Before (Current)
```
┌─ Homepage ────────────────────────┐
│ ▶ Clock Bar (collapsed)           │
│ ▶ Focus Queue (collapsed)         │
│ ▶ Tasks (collapsed)               │
│ ▼ Logs ──────────────────────     │
│   [log entries...]                │
│ ▶ Work Shifts (collapsed)         │
│ ▶ Stats (collapsed)               │
└───────────────────────────────────┘
```

### After (Redesigned)
```
┌─ Homepage ────────────────────────────────┐
│ ┌────────┐                                │
│ │ 🕐 ⏺ 📋│  ← Collapsed headers recessed  │
│ │ 📊 💼  │     into compact sidebar        │
│ └────────┘                                │
│ ▼ Logs ───────────────────────────────    │
│   [log entries visible with full width]   │
│                                           │
└───────────────────────────────────────────┘
```

## Animation Spec

1. **Collapse**: Header text shrinks + slides up → settles into sidebar slot as icon + abbreviated label
2. **Expand**: Icon in sidebar grows + slides down → becomes full-width section header in place
3. Transition: `300ms ease-out`, Framer Motion `layoutId` for seamless morph

## Implementation Notes

- Use Framer Motion `AnimatePresence` + `layout` for header animation
- Sidebar position: left edge or top-left corner of homepage
- Sidebar shows: icons + tooltips for each collapsed section
- Section order preserved: sidebar icons maintain the same order as sections
- State: `expandedSections` array in `chrome.storage.local` for persistence

## Files to Modify

| File | Change |
|------|--------|
| `src/home/index.jsx` | Add collapsible sidebar, section collapse/expand animation |
| `src/home/styles` | Sidebar layout, animation keyframes |
