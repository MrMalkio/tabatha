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

## Design Principle: Progressive Simplicity (added 2026-07-18)

Tabatha grows **more capable and simpler at the same time**. Controls, modals,
and configuration keep expanding under the hood (extension, Sidecar, Flux), but
the *upfront* surface trends toward fewer buttons and fewer prompts: the user
should be able to **just do and just say** — and the system (fed by everything
Tabatha/Flux already knows) supplies the support, defaults, and follow-through
toward the user's understood goals. Every new feature should ask: what does this
*remove* from the user's upfront attention, not just what does it add.

## The Ecosystem Journey: Tabatha → Flux → Caspera (added 2026-07-20)

Tabatha is not the end state — it is the **on-ramp**. The Flux family of
products is designed to baby-step a user deeper into the ecosystem, one layer
of trust and context at a time, never demanding the deeper layers up front.

1. **Tabatha — operational context.** *What the user is doing, always.* Tabs,
   intents, focuses, checkpoints, tasks, time tracking. Tabatha only needs to
   know the shape of the current work — it doesn't need to know why the work
   matters or what else is going on in the user's life. This is the layer
   every user starts on, and the layer that stays fully useful even if nobody
   ever goes further.
2. **Flux — personal context.** *Who the user is, ever-learning.*
   Accountability, organization, time/life management, the connective tissue
   between "what am I doing right now" (Tabatha) and "what actually matters
   to me" (goals, relationships, recurring commitments, the stuff that
   doesn't fit inside a browser tab). Flux is where Tabatha's operational
   exhaust becomes long-term self-knowledge — Plan 042's Conversational
   Tabatha is the first place this boundary becomes concrete: an in-app call
   or intake conversation listens to *anything* on the user's mind, and
   routes what belongs in Tabatha into Tabatha, and what belongs in Flux into
   Flux.
3. **Caspera — tasks handled *for* the person.** Once Flux has enough
   ever-learning context about who the user is and how they work, Caspera
   becomes viable: an operator that doesn't just track or advise, but
   *acts* — via its own harness or Hermes/OpenClaw-style operators (the same
   engine choice already resolved for #182 Chaperone's full-agentic tier).
   This is the layer that requires the most trust and the most accumulated
   context, which is exactly why it's last, not first.

**The ordering isn't fixed — it's audience-dependent.** For a personal user,
the natural path is Tabatha → Flux → Caspera: prove the operational layer is
useful, build personal context over time, only then hand off real agency.
For a professional/business user, the more likely path is **Tabatha → Caspera
→ Flux, or some other ordering** — a business may want delegated execution
(Caspera) on well-defined operational tasks before it wants a system that
knows the individual person deeply (Flux). Neither ordering is the "correct"
one; the point of naming both is that onboarding and upsell design for each
audience should not assume the personal-user sequence is universal.

This journey is also why Plan 042 (Conversational Tabatha) explicitly gates
its deepest features behind "an active Flux account" rather than trying to
absorb Flux's job into Tabatha itself — the layering above is the product
boundary, not just a technical one.
