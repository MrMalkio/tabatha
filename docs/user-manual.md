# Tabatha User Manual

**Version:** v0.2.1-alpha  
**Last Updated:** 2026-04-27  
**Codename:** Attention Operating System

---

## Table of Contents

1. [What Is Tabatha?](#what-is-tabatha)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [The Home Dashboard](#the-home-dashboard)
5. [The Intent-Popup (InPop)](#the-intent-popup-inpop)
6. [The Intent Bar (InBar)](#the-intent-bar-inbar)
7. [BlockGate (Site Blocking)](#blockgate-site-blocking)
8. [Focus Engine](#focus-engine)
9. [Clock In/Out](#clock-inout)
10. [The Sidebar](#the-sidebar)
11. [The QuickSwitch Popup](#the-quickswitch-popup)
12. [Settings Hub](#settings-hub)
13. [Keyboard Shortcuts](#keyboard-shortcuts)
14. [Glossary](#glossary)
15. [FAQ](#faq)
16. [Changelog](#changelog)

---

## What Is Tabatha?

Tabatha is a Chrome extension that transforms your browser into an attention-aware workspace. It helps you:

- **Set intention** before browsing — every tab gets a purpose
- **Track time** per tab, category, and context
- **Manage focus** with timers, queues, and drift detection
- **Park distractions** for later instead of falling into rabbit holes
- **Review your patterns** with stats on how you spend attention

Tabatha is part of the **Flux ecosystem** — a family of apps designed to help you manage context, time, and attention across your digital life.

---

## Installation

1. Download or clone the Tabatha repository
2. Run `npm install` then `npm run build`
3. Open `chrome://extensions` in Chrome
4. Enable **Developer mode** (top right toggle)
5. Click **Load unpacked** → select the `dist/` folder
6. Pin Tabatha to your toolbar for quick access

<!-- TODO: Screenshot — chrome://extensions with Tabatha loaded -->

---

## Quick Start

1. **Click the Tabatha icon** in your toolbar → opens the QuickSwitch popup
2. **Open a new tab** → the Intent-Popup appears asking "Why are you here?"
3. **Set a focus** on the Home Dashboard → timer starts counting down
4. **Press `Ctrl+Shift+S`** → opens the Sidebar for a detailed view

---

## The Home Dashboard

Access: Open a new tab or navigate to Tabatha's home page.

### Header Row
The header is a single dense row:
- **Left:** Greeting with name, tab count, active time
- **Center:** FlipClock (scalable via settings)
- **Right:** Sugar Box/Parked badges, version, theme toggle, settings

### Clock In/Out Bar
Directly below the header:
- **🟢 Clocked In / ⚪ Clocked Out** status with live timer (H:MM:SS)
- **☕ Break** button — pauses work timer, shows ON BREAK badge
- **▶ Clock In / ⏹ Clock Out** buttons
- Break time is deducted from work hours

### Now Bar
When a focus is active, displays the highest-priority item:
- **NOW** label + focus label + priority badge (P1–P10)
- Color coded: P1-3 🔴 red, P4-6 🟠 orange, P7-10 🟢 green

### Focus Bar
When a focus is active, the FocusBar shows:
- **Current focus label** with funnel stage badge
- **Live countdown timer** (MM:SS) — turns red and counts UP when drifted (+MM:SS)
- **Associated tabs count** and elapsed time
- **Tag breadcrumb** (e.g., ACME Corp > Dashboard > Fix Login Bug)
- **Action buttons:** Complete, +5m Extend, Tags
- **Quick-add input** — add another focus item without interrupting current one

### Navigation Tabs

| Tab | Description |
|-----|-------------|
| **Intents** | All intents with details, expandable. Includes intents without active tabs. |
| **Tabs** | All tracked tabs grouped by their parent intent |
| **Tasks** | Focus items by funnel stage (Unsorted through Roadblocked) |
| **Time** | Time stats, category breakdown, idle tab count, top intents by time |
| **Stashed** | Sugar Box + Parked Tabs — saved items you can reopen |

---

## The Intent-Popup (InPop)

**Trigger:** Automatically appears when you navigate to a new domain without a set context.

### Header
"**Why are you here?**" — prompts you to define your intent before proceeding.

### Mode
- **Strict (default):** Page is fully blocked until intent is set. Page scroll disabled.
- **Relaxed:** Overlay appears but includes a **Dismiss** button — browse without intent.
- Configurable in Settings > Intent-Popup > Strict mode toggle.
- **Blur strength** is adjustable (0–30px) via Settings slider.

### Layout (top to bottom)

1. **Text input** (top) — type a new intent or focus description
2. **Active focus items** — current focus items. Click to inherit context, or type first to nest under it.
3. **Recent** (smaller) — last 5 intents used today. One-click to reuse.
4. **Common** (smallest) — persistent/pinned intents. Deduplicated from Recent and Active.
5. **Category dropdown** — Business / Professional / Work / Personal
6. **Action buttons:**

| Button | What It Does |
|--------|-------------|
| **Continue** | Sets your typed/selected intent and proceeds |
| **Side Quest** | Quick 5-minute detour with auto-reminder |
| **Sugar Box** | Saves URL for later as a reward, closes tab |
| **Park** | Saves tab to Parked list, closes tab |
| **Later** | Saves intent for future action, closes tab |
| **Nevermind** | Closes tab, logs as a "focus win" |

> **Note:** Any of these buttons can be used to proceed — each classifies your decision differently.

7. **Skip intent for this domain** — stops showing InPop on this domain.

### Intent Threading
- **Type new + hit Enter** — creates new top-level intent
- **Type text + click preset** — nests text as sub-intent under the preset
- **Click preset directly** — inherits that intent (grouping)

### Expanded Intent View
Click the edit icon on any intent to expand it into a full form:
- **Title** — short name for the intent
- **Description** — detailed notes, what to do when returning
- **Linked Task** — connect to an existing task or create a new one
- **Checkbox:** "Make this a task" — promotes the intent to the Tasks funnel

---

## The Intent Bar (InBar)

**Trigger:** Appears on every page when an intent or focus is active.

A slim bar (24px) that slides up from the bottom (or top) of the screen.

### What It Shows
- **Left:** Two count-up timers:
  - 🔵 **Intent timer** — time on current tab's intent
  - 🟢 **Task timer** — total time on all tabs associated with the related task
- **Center:** Current intent label + focus label (if different)
  - 🎯 badge when focus is active
  - "No intent set" badge when blank
- **Right:** Focus countdown timer (turns red when drifted, shows +MM:SS)
- **✕ Close** button — hides InBar for the current tab

### Behavior
- Pushes page content by its height — nothing is hidden or covered
- Timers update every second
- Listens for focus updates and refreshes live
- Position (top/bottom) configurable in Settings > Intent-Popup > InBar

---

## BlockGate (Site Blocking)

**Trigger:** Automatically appears when navigating to a blocked domain.

### How It Works
1. Add domains to the blocked list via **Settings > Blocked Sites**
2. When visiting a blocked site, a red overlay appears: **"🚫 Blocked Site"**
3. To proceed, you must:
   - **Write a justification** (minimum 50 characters)
   - **Set a timer** (5/10/15/30/60 minutes)
   - Optionally link to a task/intent
4. After the timer expires, the block re-activates

### Actions
| Button | What It Does |
|--------|-------------|
| **Proceed** | Unlocked after 50+ chars — grants temporary access |
| **Leave** | Closes tab — logs as a "focus win" |

### Wildcard Support
- `reddit.com` — blocks exact domain
- `*.tiktok.com` — blocks all subdomains
- `example.com` also matches `www.example.com`

---

## Focus Engine

### Focus States

| State | Meaning |
|-------|---------|
| **Active** | Timer counting down |
| **Paused** | Timer stopped, queued |
| **Drifted** | Timer expired, counter shows +MM:SS in red |
| **Completed** | Done, moved to history |

### Progress Funnel

| Stage | Icon | Description |
|-------|------|-------------|
| Unsorted | 📥 | Just captured |
| Todo | 📋 | Will address later |
| Focus | 🎯 | Currently active |
| Addressing | ⚡ | In progress |
| Resolved | ✅ | Done |
| Roadblocked | 🚧 | Blocked |

### Timer Behavior
- Default: **15 minutes** (configurable)
- On expiry: state becomes **Drifted**, timer counts UP
- **+5m** extends without resetting

---

## The Sidebar

**Access:** Press `Ctrl+Shift+S`

Shows tracked tabs organized by context with time tracking data and quick actions.

---

## The QuickSwitch Popup

**Access:** Click the Tabatha toolbar icon

Compact popup for quick actions: view/switch focus, quick-set new focus.

---

## Settings Hub

**Access:** Right-click Tabatha icon > Options, or click settings on the dashboard.

Every component has a **live preview** alongside its controls.

### Sections

| Section | Controls |
|---------|----------|
| **Appearance** | Theme selection, Your Name (for greeting), Default Realm (Business/Professional/Work/Personal) |
| **FlipClock** | Format (12/24h), seconds, scale, text color, show countdown, countdown mode (daily/custom), custom target time |
| **Focus Engine** | Default timer, auto-associate tabs, drift notifications, funnel stage reference |
| **Intent-Popup** | Enable/disable, strict/relaxed mode, blur strength (slider), side quest duration, inherit items shown, recent intents count, skipped domains (remove), persistent presets (add/remove), InBar enable/position |
| **Blocked Sites** | Add/remove blocked domains with wildcard support. View currently blocked list. |
| **Time Tracking** | Idle threshold, context timer |
| **Export & Agents** | Auto-export, interval, path |
| **Tags** | Tag preview, registry |
| **Parked Tabs** | View and reopen |
| **Sugar Box** | View and enjoy |
| **Stats & History** | Decision counts, focus wins, history |
| **Privacy** | Capture toggles (all OFF by default) |
| **About** | Version info |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Click toolbar icon** | Open QuickSwitch popup |
| **Ctrl+Shift+S** | Open/close Sidebar |
| **Enter** (in InPop) | Submit intent |

---

## Glossary

| Term | Definition |
|------|-----------|
| **InPop** | Intent-Popup — the overlay asking "Why are you here?" |
| **Focus** | A named attention target with a timer |
| **Drift** | When a timer expires but you're still working |
| **Sugar Box** | Reward links saved for later |
| **Park** | Save a tab for later retrieval |
| **Funnel Stage** | Progress: Unsorted through Roadblocked |
| **Realm** | Classification: Business, Professional, Work, or Personal |
| **InBar** | Intent Bar — slim bottom/top bar showing current intent, task, and timers |
| **BlockGate** | Site blocking overlay — requires justification and timer to access blocked sites |
| **Clock In/Out** | Work session tracking with break support |
| **NowBar** | Homepage bar showing current highest-priority focus item |
| **Priority** | Task/focus importance ranking from P1 (critical) to P10 (lowest) |
| **Task Link** | Connection between a Tabatha intent and an Asana/ClickUp task |
| **AMR** | Application Model Reference — Settings as live component catalog |

---

## FAQ

**Q: Why does the InPop appear on every new site?**  
A: Tabatha wants you to browse with intention. Skip for any domain or disable entirely in Settings.

**Q: What happens when my timer runs out?**  
A: Nothing interrupts you. Timer switches to "drifted" and counts UP. Informational, not blocking.

**Q: Can my employer see my personal browsing?**  
A: No. Personal profiles never report to employer accounts.

**Q: Where do parked tabs go?**  
A: Settings > Parked Tabs. Click any to reopen.

**Q: How do I block distracting sites?**  
A: Settings > Blocked Sites > add the domain. Supports wildcards (e.g. `*.reddit.com`). You'll need to justify access in 50+ characters and set a timer.

---

## Changelog

See [Tabatha_Changelog.md](../Tabatha_Changelog.md) for full version history.
