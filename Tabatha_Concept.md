# Tabatha Concept & Vision

**Tabatha** is not just a tab manager; it is an **Attention & Context Operating
System** for the browser.

Traditional browsers treat tabs as disposable, disconnected lists. Tabatha
treats them as **resources** bound to a specific **Context** (What am I doing?)
and **Intent** (Why am I doing it?).

---

## 🌟 The Core Philosophy

1. **Context Over Chaos**: tabs should never exist in a vacuum. Every tab
   belongs to a "Context" (e.g., "Q1 Report", "Learning React", "Vacation
   Planning").
2. **Intentional Browsing**: friction is good when it stops mindless browsing.
   Tabatha introduces "Good Friction" (The Gatekeeper) to ensure you actively
   choose your distraction or focus.
3. **Universal Time**: Time tracking shouldn't be a separate app. It should be
   intrinsic to the browser.
4. **AI-Ready**: Your browsing habits, context, and active tabs are structured
   data that AI agents (like me!) can read to understand _exactly_ what you are
   working on.

---

## 🧩 Key Features & Concepts

### 1. The Gatekeeper (Good Friction)

When you open a new tab without a clear path (no link clicked), Tabatha
interrupts you with a beautiful overlay. It asks: **"What are you down for?"**

- **Continue**: You state your intent (e.g., "Checking stocks"). The tab opens,
  and that Context is assigned.
- **Side Quest (5m)**: "I just need to check one thing." Tabatha sets a 5-minute
  timer. If you go over, it nudges you back.
- **Sugar Box**: "I want to watch this YouTube video, but not now." optionally
  save it to a distraction list to consume later as a reward.
- **Park**: "This is useful, but not for right now." Save tab to a "Parked" list
  for later retrieval.

### 2. The Context Engine

Tabatha tracks the "Lineage" of your browsing.

- **Inheritance**: If you are in a tab labeled "Project X" and click a link, the
  new tab _automatically_ inherits "Project X". You don't have to tag everything
  manually.
- **Auto-Categorization**: Tabatha knows that `github.com` is likely "Work/Dev"
  and `youtube.com` is "Media".

### 3. The Sidebar (Command Center)

A permanent, vertical slice of your browser that replaces the chaotic top bar.

- **Intent Dashboard**: At a glance, see what your current focus is and how long
  you've been active.
- **Tab List**: A rich list showing priority colors, active time heatmaps, and
  context.
- **Groups & Sub-Groups**: Chrome Groups are flat. Tabatha adds a "Project"
  layer above them.

### 4. Welcome Page (Mission Control)

Replaces the "New Tab" page with a dashboard.

- **Quick Access**: One-click launch for top sites, auto-injecting your current
  intent.
- **Return to Flow**: If you restart Chrome, Tabatha asks "Do you want to
  restore your 'Coding' session?" instead of blindly opening 50 tabs.
- **Dashboard**: Manage tabs, specific groups, and view time stats without
  opening the sidebar.

### 5. Tab Locking

- **Hard Lock**: Prevents accidental closing of critical tabs (requires
  confirmation).
- **URL Lock**: "Jailbreaks" a tab to a specific domain. If you try to navigate
  away from `asana.com` in that tab, Tabatha intercepts it, opens the link in a
  _new_ tab, and keeps the original locked.

### 6. Agent-Ready Data (Markdown Export)

Tabatha maintains a live `context.md` file. This allows AI agents to read your
current state:

> _"User is currently focused on 'Q3 Planning' (High Priority). They have 5 tabs
> open related to 'Financials'. They have been active for 45 minutes."_

---

## 🔮 The Future (Phase 2 & 3)

Tabatha aims to bridge the gap between "Browsing" and "Doing".

- **Integrations**: Syncing tasks directly from Asana/Jira into the browser
  sidebar.
- **Biometrics**: Using `chrome.idle` and activity patterns to detect "Flow
  State" and auto-enable Do Not Disturb.
- **LLM Intelligence**: "Hey Tabatha, summarize all my 'Research' tabs from
  yesterday" (using local or cloud LLMs).
- **Smart Refocus**: If you open Reddit during a "Deep Work" context, Tabatha
  gently greys out the screen and asks, "Is this part of Deep Work?"
- **Step Away Mode**: A proactive "Pause" button. Tell Tabatha you're leaving
  (e.g., "Walk the dog"). Tabatha puts the browser to sleep. When you wake it
  up, it reminds you: _"You were fixing the login bug before you walked the dog.
  Ready to jump back in?"_

---

## 🎯 Target Audience

- **Developers**: Who manage dozens of documentation tabs and need to switch
  contexts (Fix Bug -> Review PR) rapidly.
- **Researchers**: Who need to keep "threads" of investigation separate.
- **ADHD / Focus-Challenged**: Who benefit from the "Gatekeeper" friction to
  prevent doom-scrolling.
- **AI Power Users**: Who want their agents to have full context of their
  digital workspace.
