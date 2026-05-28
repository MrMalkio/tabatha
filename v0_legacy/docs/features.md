# Tabatha — Master Feature List

> Combines Rize.io feature parity + Tabatha-native features.  
> Ordered by development priority (most valuable first, building on dependencies).

## Priority Legend

| Status | Meaning |
|--------|---------|
| ✅ v0.1.0 | Shipped in Phase 1 |
| ✅ v0.1.5 | Shipped in Phase 1.5 |
| 🔧 Fixing | Built but has bugs being fixed |
| 🟡 Stub | Backend exists, no UI |
| 🔜 Next | Prioritized for next sprint |
| 📋 Planned | On roadmap, not started |
| 💡 Future | Long-term vision |

---

## Feature Matrix

| # | Feature | Category | Status | Version | Depends On |
|---|---------|----------|--------|---------|------------|
| **— CORE TIME TRACKING (Priority Block)** |
| 1 | Active time tracking per tab | Time | ✅ | v0.1.0 | — |
| 2 | Aggregated time by category | Time | ✅ | v0.1.0 | #1 |
| 3 | Aggregated time by group/project | Time | ✅ | v0.1.0 | #1 |
| 4 | Open duration tracking | Time | ✅ | v0.1.5 | #1 |
| 5 | Idle detection & auto-pause | Time | ✅ | v0.1.0 | #1 |
| 6 | Time panel with visual breakdown | Time | 🔜 | v0.2.0 | #1-4 |
| 7 | Daily/weekly time summary dashboard | Time | 🔜 | v0.2.0 | #6 |
| 8 | Time heatmaps (per-hour activity) | Time | 🔜 | v0.2.0 | #6 |
| 9 | Deep work scoring / focus metrics | Time | 🔜 | v0.2.0 | #1, #5 |
| 10 | Context-switch detection & alerts | Time | 🔜 | v0.2.0 | #1 |
| 11 | Daily productivity score | Time | 📋 | v0.3.0 | #9 |
| 12 | Weekly trend analysis | Time | 📋 | v0.3.0 | #7 |
| 13 | Historical time reports (export) | Time | 📋 | v0.3.0 | #7 |
| 14 | Billable vs. non-billable classification | Time | 📋 | v0.4.0 | #7 |
| 15 | Billable time reporting (PDF/CSV) | Time | 📋 | v0.4.0 | #14 |
| 16 | AI productivity coach / nudges | Time | 💡 | v1.0 | #11 |
| **— CONTEXT & INTENT ENGINE** |
| 17 | Context assignment per tab | Context | ✅ | v0.1.0 | — |
| 18 | Intent tracking per tab | Context | ✅ | v0.1.0 | — |
| 19 | Context inheritance (parent→child) | Context | ✅ | v0.1.0 | #17 |
| 20 | URL auto-categorization (9 built-in) | Context | ✅ | v0.1.0 | — |
| 21 | Custom categories (create/clone) | Context | 🟡 | v0.1.5 | #20 |
| 22 | AI-driven auto-categorization | Context | 📋 | v0.3.0 | #20 |
| 23 | Context-switch cost tracking | Context | 🔜 | v0.2.0 | #10, #17 |
| 24 | Smart Refocus (distraction detection) | Context | 📋 | v0.3.0 | #22, #10 |
| **— GATEKEEPER (Good Friction)** |
| 25 | Gatekeeper overlay on new tabs | Focus | ✅ | v0.1.5 | — |
| 26 | Side Quest mode (5m timer) | Focus | ✅ | v0.1.5 | #25 |
| 27 | Sugar Box (save distraction for later) | Focus | 🟡 | v0.1.5 | #25 |
| 28 | Park tab (save for later) | Focus | 🟡 | v0.1.5 | #25 |
| 29 | Sugar Box UI (view/retrieve) | Focus | 📋 | v0.2.0 | #27 |
| 30 | Parked Tabs UI (view/retrieve) | Focus | 📋 | v0.2.0 | #28 |
| 31 | Distraction blocker (block sites) | Focus | 📋 | v0.3.0 | #25 |
| 32 | Focus music integration | Focus | 💡 | v1.0 | — |
| **— TAB MANAGEMENT** |
| 33 | Tab list with search/filter/sort | Tabs | ✅ | v0.1.5 | — |
| 34 | Context view (group by context) | Tabs | 🔧 | v0.1.5 | #17 |
| 35 | Tab locking (prevent close) | Tabs | ✅ | v0.1.0 | — |
| 36 | URL locking (domain jailing) | Tabs | ✅ | v0.1.0 | — |
| 37 | Tab priority system (5 levels) | Tabs | ✅ | v0.1.0 | — |
| 38 | Chrome Tab Group integration | Tabs | ✅ | v0.1.0 | — |
| 39 | Sub-Groups / Projects | Tabs | ✅ | v0.1.0 | #38 |
| 40 | Bulk close with context capture | Tabs | ✅ | v0.1.5 | — |
| 41 | Tab rename (custom title) | Tabs | ✅ | v0.1.5 | — |
| 42 | Saved Groups (persist/restore workspaces) | Tabs | 📋 | v0.3.0 | #39 |
| 43 | Fuzzy search (tabs + history + bookmarks) | Tabs | 📋 | v0.3.0 | #33 |
| 44 | MRU tab switching (Alt-Tab style) | Tabs | 📋 | v0.3.0 | — |
| 45 | Command palette (/close, /mute, /split) | Tabs | 💡 | v0.4.0 | #43 |
| **— SESSION MANAGEMENT** |
| 46 | Session snapshots (every 5 min) | Session | ✅ | v0.1.5 | — |
| 47 | "Return to Flow" session recall | Session | ✅ | v0.1.5 | #46 |
| 48 | Closed contexts history (500 entries) | Session | ✅ | v0.1.0 | — |
| 49 | Step Away mode (pause/resume) | Session | ✅ | v0.1.5 | — |
| 50 | Off-Chrome context logging | Session | 🟡 | v0.1.5 | #5 |
| **— EXPORT & INTEGRATIONS** |
| 51 | Markdown export (context.md for AI agents) | Export | ✅ | v0.1.0 | — |
| 52 | Auto-export on schedule | Export | ✅ | v0.1.0 | #51 |
| 53 | Google Calendar integration | Integration | 📋 | v0.4.0 | — |
| 54 | Asana integration (URL-based) | Integration | 📋 | v0.4.0 | — |
| 55 | MCP server for AI agent queries | Integration | 💡 | v1.0 | #51 |
| **— UI & EXPERIENCE** |
| 56 | Sidebar (side panel) | UI | 🔧 | v0.1.5 | — |
| 57 | Home dashboard (new tab override) | UI | 🔧 | v0.1.5 | — |
| 58 | Popup (quick tab search) | UI | ✅ | v0.1.5 | — |
| 59 | Pomodoro timer | UI | ✅ | v0.1.5 | — |
| 60 | Settings panel (→ superseded by #118) | UI | → #118 | v0.1.5 | — |
| 61 | Notifications (context reminders) | UI | ✅ | v0.1.0 | — |
| 62 | Toast system | UI | ✅ | v0.1.5 | — |
| 63 | Quick Access speed dial | UI | ✅ | v0.1.5 | — |
| 64 | Visual analytics (charts/graphs) | UI | 📋 | v0.3.0 | #6 |
| 65 | Theming (dark/light/system) | UI | 📋 | v0.4.0 | — |
| 66 | Cross-device sync | Sync | 💡 | v1.0 | — |
| **— INVOICING & BILLING (Rize Parity)** |
| 67 | Project profitability tracking | Billing | 💡 | v1.0 | #14 |
| 68 | Invoice generation from time data | Billing | 💡 | v1.0 | #15 |
| 69 | QuickBooks export | Billing | 💡 | v1.0 | #68 |
| **— SMART CAPTURE (Opt-In, Default OFF)** |
| 70 | Screenshot capture (periodic, per-tab) | Capture | 📋 | v0.3.0 | #1 |
| 71 | Screenshot timeline / visual history | Capture | 📋 | v0.3.0 | #70 |
| 72 | OCR text extraction from screenshots | Capture | 💡 | v0.4.0 | #70 |
| 73 | Keystroke analytics (WPM, typing heatmap) | Capture | 📋 | v0.3.0 | #1 |
| 74 | Activity level scoring (mouse+keyboard) | Capture | 📋 | v0.3.0 | #73 |
| 75 | Keyboard shortcut proficiency tracking | Capture | 💡 | v0.4.0 | #73 |
| 76 | Typing vs. reading ratio per tab | Capture | 💡 | v0.4.0 | #73, #1 |
| 77 | Smart Capture settings panel (all OFF by default) | Capture | 📋 | v0.3.0 | #70, #73 |
| **— AI AGENT CONTEXT SYSTEM** |
| 78 | Context File generator (MD/JSON/YAML) | Agent | 🔜 | v0.2.0 | #51 |
| 79 | Auto-detect agent config paths | Agent | 🔜 | v0.2.0 | #78 |
| 80 | Inject instruction line into agent memory | Agent | 🔜 | v0.2.0 | #79 |
| 81 | Configurable update frequency | Agent | 🔜 | v0.2.0 | #78 |
| 82 | Persistent history (survives browser clear) | Agent | 🔜 | v0.2.0 | — |
| 83 | Custom output path selection | Agent | 📋 | v0.2.0 | #78 |
| 84 | URL masking (privacy mode) | Agent | 📋 | v0.2.0 | #78 |
| 85 | Agent-readable JSON history export | Agent | 📋 | v0.2.0 | #82 |
| **— SECOND BRAIN INTEGRATIONS** |
| 86 | Obsidian vault file drop | 2nd Brain | 📋 | v0.3.0 | #78 |
| 87 | Logseq pages file drop | 2nd Brain | 📋 | v0.3.0 | #78 |
| 88 | Open Brain (OB1) MCP connector | 2nd Brain | 📋 | v0.3.0 | #78, #55 |
| 89 | Notion API sync (daily digest) | 2nd Brain | 💡 | v0.4.0 | #78 |
| 90 | Apple Notes file drop | 2nd Brain | 💡 | v0.4.0 | #78 |
| 91 | Generic webhook (POST context to URL) | 2nd Brain | 📋 | v0.3.0 | #78 |
| **— PRO MODE** |
| 92 | Client/company/project cataloging | Pro | 📋 | v0.3.0 | #39, #14 |
| 93 | Client↔project↔context relations | Pro | 📋 | v0.3.0 | #92 |
| 94 | Multi-profile sync (same Tabatha across Chrome profiles) | Pro | 📋 | v0.4.0 | — |
| 95 | Profile management (admin vs. user profiles) | Pro | 📋 | v0.4.0 | #94 |
| 96 | Cross-profile time aggregation | Pro | 📋 | v0.4.0 | #94, #1 |
| 97 | Profile-specific client assignment | Pro | 📋 | v0.4.0 | #94, #92 |
| 98 | Staff/employer mode (shared tracking) | Pro | 💡 | v1.0 | #94 |
| 99 | Employer time visibility (time only mode) | Pro | 💡 | v1.0 | #98 |
| 100 | Employer full visibility (time + browsing) | Pro | 💡 | v1.0 | #98 |
| 101 | Personal vs. work mode toggle | Pro | 💡 | v1.0 | #98 |
| 102 | Team dashboard (employer view) | Pro | 💡 | v1.0 | #98 |
| **— TASK INTELLIGENCE** |
| 103 | Intent System: Goals tracking | Tasks | 📋 | v0.3.0 | #22 |
| 104 | Intent System: Tasks tracking (Intent → Goal → Task) | Tasks | 📋 | v0.3.0 | #103 |
| 105 | Zero-Integration Task Sync (Asana, Jira, Linear parsing) | Tasks | 💡 | v0.4.0 | #104 |
| 106 | Proactive Task Assumption (from URL GIDs) | Tasks | 💡 | v0.4.0 | #105 |
| 107 | Task-to-Session logging | Tasks | 💡 | v0.4.0 | #106, #14 |
| **— UI & CUSTOMIZATION** |
| 108 | Refocus Flip Clock (Top Center / Side layouts) | UI | 📋 | v0.2.0 | — |
| 109 | Clock Customization (Colors, Scale, Brightness) | UI | 📋 | v0.2.0 | #108 |
| 110 | Custom Background Image Support | UI | 📋 | v0.2.0 | — |
| 111 | Light Mode Theme | UI | 📋 | v0.3.0 | — |
| **— INPUT & ACCESSIBILITY (Backlog 2026-04-25)** |
| 112 | Hotkeys (custom keyboard shortcuts) | Input | 📋 | v0.2.0 | #56, #57, #58 |
| 113 | Voice Dictation Input (speech-to-text for any field) | Input | 📋 | v0.3.0 | #112 |
| 114 | Voice Notes & Recordings (audio capture, playback, storage) | Capture | 📋 | v0.3.0 | #113 |
| **— PLATFORM & INTEGRATIONS (Backlog 2026-04-25)** |
| 115 | BYOK API Keys (user provides own keys for external services) | Settings | 📋 | v0.2.0 | #60 |
| 116 | Webhook Triggers on Actions (outbound webhooks on events) | Integration | 📋 | v4.0 | #91, #115 |
| 117 | Tabatha Desktop Companion App (OS-level time tracking) | Platform | 📋 | v4.0+ | #66, Phase 5 |
| **— CORE UX & SETTINGS (Backlog 2026-04-26)** |
| 118 | Settings Page (full build, supersedes #60) | UI | 📋 | v0.2.0 | — |
| 119 | Extension Toolbar Icon (branded, state-aware) | UI | 📋 | v0.2.0 | — |
| 120 | Global Tooltips (all interactive elements) | UI | 📋 | v0.2.0 | #56, #57 |
| 121 | Focus Countdown Timer (auto-start on intent, default 15m) | Focus | 📋 | v0.2.0 | #59, #118 |
| **— INTENT & FOCUS SYSTEM (Backlog 2026-04-26)** |
| 122 | Multi-Focus Task Queue & Tab-Intent Association | Focus | 📋 | v0.2.0 | #17, #18, #19, #121 |
| 123 | Intent System v2 / Gatekeeper Overhaul (rules, training, non-interrupting) | Focus | 📋 | v0.2.0 | #25, #118, #122 |
| 124 | Floating Tabatha Widget (always-on mini-panel) | UI | 📋 | v0.2.0 | #122, #123 |
| **— ARCHITECTURE (Backlog 2026-04-26)** |
| 125 | AI-as-Enhancement Principle (meta-constraint, all features work without AI) | Arch | 📋 | all | — |
| **— FOCUS RE-ENTRY (Backlog 2026-04-26)** |
| 126 | Return-from-Away Intent Reminder (conversational re-entry popup) | Focus | 📋 | v0.2.0 | #5, #25, #49, #123 |
| **— INTENT-POPUP ENHANCEMENTS (Session 009, 2026-04-26)** |
| 127 | InPop header changed to "Why are you here?" | UI | ✅ | v0.2.0 | #22, #123 |
| 128 | InPop "Skip intent for this domain" link + Settings management | Focus | ✅ | v0.2.0 | #123 |
| 129 | InPop Inherit from active focus items (top 3, configurable) | Focus | ✅ | v0.2.0 | #122, #123 |
| 130 | InPop Tooltips on every element | UI | ✅ | v0.2.0 | #120, #123 |
| 131 | InPop "Nevermind" button (logs focus win, closes tab) | Focus | ✅ | v0.2.0 | #123 |
| 132 | Intent History logging (all InPop actions tracked) | Data | ✅ | v0.2.0 | #131 |
| 133 | Stats & History settings page (decision counts, focus wins) | UI | ✅ | v0.2.0 | #132 |
| 134 | Parked Tabs settings page (view/reopen parked tabs) | UI | ✅ | v0.2.0 | #123 |
| 135 | Sugar Box settings page (view/enjoy saved distractions) | UI | ✅ | v0.2.0 | #123 |
| **— SITE BLOCKING (Backlog 2026-04-26)** |
| 136 | Site Blocking (intent-gated bypass) | Focus | 📋 | v0.2.0 | #123, #128 |
| 137 | BlockGate Overlay (50+ char intent, timer, why, attach-to-task) | Focus | 📋 | v0.2.0 | #136 |
| **— TEAM MODE (Backlog 2026-04-26)** |
| 138 | Team Auth (extension login/pair flow) | Pro | 📋 | v0.3.0 | #98 |
| 139 | Time Report Push (extension → backend) | Pro | 📋 | v0.3.0 | #138 |
| 140 | Org Settings Pull (backend → extension, real-time) | Pro | 📋 | v0.3.0 | #138 |
| 141 | Admin Panel (web app, dashboard, member mgmt) | Pro | 📋 | v0.3.0 | #138 |
| 142 | Asana URL Parsing (zero-integration GID extraction) | Tasks | 📋 | v0.2.0 | #105, #106 |
| **— INTENT PRESETS & WORKSPACE INTELLIGENCE (Backlog 2026-04-27)** |
| 143 | Preset Intent Designs (visual templates for calendar, meetings, calls, etc.) | UI | 📋 | v0.3.0 | #123 |
| 144 | Google Workspace Integration Suite (Meet, Calendar, Docs, Drive URL parsing) | Integration | 📋 | v0.2.0 | #142 |
| 145 | AI Chat Context Tracker (Gemini, Claude, ChatGPT, Codex thread/UUID tracking) | Context | 📋 | v0.2.0 | #20, #142, #144 |
| 146 | HeadBoxes — Cross-App Project Catalog (unified project view across all tools) | Context | 📋 | v0.3.0 | #145, #92 |
| 147 | Universal URL Mapping Engine (extensible URL→context rules, user-contributed) | Context | 📋 | v0.2.0 | #20, #142, #144, #145 |
| 148 | Overlock Manager Integration (all intents/activity committable to overlock) | Data | 📋 | v0.2.0 | #132 |
| **— FOCUS/BREAK/CLOCK STATE INTERLOCK (Backlog 2026-05-12)** |
| 149 | Pause/Break Conflict Resolution (prompt when break conflicts with active intents) | Focus | 📋 | v0.2.0 | #122, #121 | [concept](../../docs/features/149-pause-break-conflict.md) |
| 150 | Break/Clock-Out Auto-Pause (all intents pause on break or clock-out) | Focus | 📋 | v0.2.0 | #122, #149 | [concept](../../docs/features/150-break-clockout-auto-pause.md) |
| 151 | Unpause Auto-Resume Interlock (unpause deactivates break, auto clocks in) | Focus | 📋 | v0.2.0 | #150 | [concept](../../docs/features/151-unpause-auto-resume-interlock.md) |
| 152 | Intelligent Auto-Pause/Resume + Time Redistribution | Focus | 📋 | v0.3.0 | #122, #123, #147, #149 | [concept](../../docs/features/152-intelligent-auto-pause-resume.md) |
| **— TAB MANAGEMENT & NOTES (Backlog 2026-05-14)** |
| 153 | Purge Mode (tab-by-tab triage with enhanced InBar) | Tabs | 📋 | v0.3.0 | #122, #123, InBar | [concept](../../docs/features/153-purge-mode.md) |
| 154 | Notes Panel (rich text notes with object linking) | UI | 📋 | v0.2.0 | #56, #57 | [concept](../../docs/features/154-notes-panel.md) |
| 155 | InBar Parent Context Display & Inline Editing (Focus › Parent › Tab Intent) | UI | 📋 | v0.2.0 | #122, #123, InBar | [concept](../../docs/features/155-inbar-parent-context.md) |
| 156 | Time Entry Editing (adjust start/end, insert/remove pauses, split, merge) | Time | 📋 | v0.2.0 | #1, #6, #132, #148 | [concept](../../docs/features/156-time-entry-editing.md) |
| 157 | Deep Edit Panel (full page time correction, UI flags, role-gated) | Time | 📋 | v0.3.0 | #156, #138 | [concept](../../docs/features/157-deep-edit-panel.md) |
| **— ORG & BILLING (Backlog 2026-05-14)** |
| 158 | Org Profiles in Settings (company/team/client profiles) | Settings | 📋 | v0.3.0 | #118, #92 | [concept](../../docs/features/158-org-profiles.md) |
| 159 | Task Cost & Revenue Tracking (billing methods, billable vectors) | Billing | 📋 | v0.3.0 | #158, #14, #1 | [concept](../../docs/features/159-task-cost-revenue.md) |
| **— DISCIPLINE & FOCUS (Backlog 2026-05-14)** |
| 160 | Tab Caps (self-imposed tab limit with enforcement tiers) | Focus | 📋 | v0.2.0 | #25, #118 | [concept](../../docs/features/160-tab-caps.md) |
| 161 | Freeform Mode (silent tracking, no alerts/popups, timed or indefinite) | Focus | 📋 | v0.2.0 | #118, #123 | [concept](../../docs/features/161-freeform-mode.md) |
| **— COLLABORATION (Backlog 2026-05-14)** |
| 162 | User-to-User Requests (gated queue, booking-calendar × task-manager) | Pro | 📋 | v0.3.0 | #138, #158, #122 | [concept](../../docs/features/162-user-requests.md) |
| 169 | Cowork Activity Page (shared team activity bars + availability) | Pro | 📋 | v0.3.0 | #138, #158 | [concept](../../docs/features/169-cowork-activity.md) |
| 170 | Team Page (owner god-eye view of all team activity) | Pro | 📋 | v0.3.0 | #138, #158, #169 | [concept](../../docs/features/170-team-page.md) |
| **— MULTI-SURFACE / CROSS-DEVICE (Backlog 2026-05-14)** |
| 163 | Background Tasks / Parallels (passive media tracking) | Context | 📋 | v0.3.0 | #1, #147, #117 | [concept](../../docs/features/163-background-parallels.md) |
| 164 | Mobile Triggers (phone actions → system webhooks) | Integration | 📋 | v0.4.0 | #117, Mobile | [concept](../../docs/features/164-mobile-triggers.md) |
| 165 | Voice Notes (universal capture from any surface) | UI | 📋 | v0.3.0 | #114, #154 | [concept](../../docs/features/165-voice-notes.md) |
| 166 | Off-Device Intent Tracking (manual/auto, time-only) | Time | 📋 | v0.3.0 | #117, #122 | [concept](../../docs/features/166-off-device-tracking.md) |
| 167 | Desktop Sidebar (native OS side panel via Desktop Companion) | UI | 📋 | v0.4.0 | #117, #56 | [concept](../../docs/features/167-desktop-sidebar.md) |
| 175 | Contribution Intake Engine (webhook receiver for external apps) | Integration | 📋 | v0.4.0 | #164, #148 | [concept](../../docs/features/175-contribution-intake-engine.md) |
| **— HISTORY & FEEDBACK (Backlog 2026-05-14)** |
| 171 | Log Interaction Tracking (log every prompt and user response) | Data | 📋 | v0.2.0 | #132, #148 | [concept](../../docs/features/171-log-interaction-tracking.md) |
| 172 | History Queue Recovery (re-queue completed items, edit/correct time) | UI | 📋 | v0.2.0 | #122, #156 | [concept](../../docs/features/172-history-queue-recovery.md) |
| 173 | Edit Contribution Notes (system improvement feedback loop) | Data | 📋 | v0.3.0 | #156, #157, #148 | [concept](../../docs/features/173-edit-contribution-notes.md) |
| 174 | Recurring Focuses & Tasks (scheduled auto-population) | Focus | 📋 | v0.2.0 | #122 | [concept](../../docs/features/174-recurring-focuses-tasks.md) |
| **— QUICK ACCESS (Backlog 2026-05-14)** |
| 176 | Quick Tab List Hotkey (fuzzy search, recently closed, groups) | UI | 📋 | v0.2.0 | #112, #43, #58 | [concept](../../docs/features/176-quick-tab-list-hotkey.md) |
| **— USABILITY & CLEANUP (Backlog 2026-05-15)** |
| 177 | Sugar Box & Stashed Tab Deletion | UI | 📋 | v0.2.0 | #134, #135 | [concept](../../docs/features/177-sugarbox-stash-delete.md) |
| 178 | Agent Context Tracking (AI chat/agent attribution per intent) | Context | 📋 | v0.2.0 | #145, #123 | [concept](../../docs/features/178-agent-context-tracking.md) |
| 180 | InPop Variants (profile-aware, site-specific, InPop-Social) | Focus | 📋 | v0.3.0 | #123, #147, #118 | [concept](../../docs/features/180-inpop-variants.md) |
| **— WEBSITE (Backlog 2026-05-14)** |
| 168 | Help & Docs Page (feature docs, adjacent feature links, searchable KB) | Website | 📋 | v0.3.0 | — | [concept](../../docs/features/168-help-docs-page.md) |
| **— DESIGN TASKS (Logged 2026-05-15)** |
| 179 | Logo Redesign (replace current logo, new brand identity) | Design | 📋 | v0.2.0 | — | [concept](../../docs/features/179-logo-redesign.md) |
| **— TEAM ACCOUNTABILITY (Backlog 2026-05-15)** |
| 181 | Blocker Banner (marquee ticker of team dependencies, escalating, manager-controlled) | Pro | 📋 | v0.3.0 | #138, #158, #162 | [concept](../../docs/features/181-blocker-banner.md) |
| **— AGENTIC / AI (Backlog 2026-05-15)** |
| 182 | Chaperone Mode (voice AI companion, contextual speech, cross-device) | AI | 📋 | v0.4.0 | #125, #117, #113 | [concept](../../docs/features/182-chaperone-mode.md) |
| **— CROSS-DEVICE (Backlog 2026-05-15)** |
| 183 | Device Proximity Detection (phone/computer nearness via BLE/WiFi) | Platform | 📋 | v0.4.0 | #117, Mobile, #182 | [concept](../../docs/features/183-device-proximity.md) |
| **— DESIGN CHANGES (Logged 2026-05-15)** |
| D01 | Homepage Collapsible Header (sections recess into sidebar on collapse) | UI | 📋 | v0.2.0 | — | [concept](../../docs/features/D01-homepage-collapsible-header.md) |
| **— FOCUS LIFECYCLE (Backlog 2026-05-17)** |
| 184 | Persistent Focuses (ongoing/frequent, "done for today" lifecycle, dynamic presets) | Focus | 📋 | v0.2.0 | #122, #174 | [concept](../../docs/features/184-persistent-focuses.md) |
| **— BUG FIXES (Logged 2026-05-14)** |
| B05 | Idle detection ignores non-browser activity | Time | 🔧 | v0.2.0 | #5, #117 | — |
| B06 | Logs not listing intent activity timestamps | Data | 🔧 | v0.2.0 | #132 | — |

| **— AUTO-DETECTION & CLOCKING (Mike Transcript, 2026-05-18)** |
| 187 | Auto Clock-In/Out on Startup/Shutdown | Time | 📋 | v0.4.0 | #117, #5 | [concept](../../docs/features/187-auto-clock-startup.md) |
| 188 | Client/Project-Level Time Attribution | Time | 📋 | v0.3.0 | #92, #147, #117 | [concept](../../docs/features/188-client-time-attribution.md) |
| 189 | Service-Level Profitability Reporting | Billing | 📋 | v0.4.0 | #188, #159, #67 | [concept](../../docs/features/189-service-profitability.md) |
| 190 | AI-Generated Activity Summaries | AI | 💡 | v1.0 | #188, #16, #125 | [concept](../../docs/features/190-ai-activity-summaries.md) |
| **— CALENDAR & SCHEDULING (Mike Transcript, 2026-05-18)** |
| 192 | Calendar Integration with Auto-Backfill | Integration | 📋 | v0.4.0 | #53, #156 | [concept](../../docs/features/192-calendar-auto-backfill.md) |
| 193 | Meeting Block Detection | Focus | 📋 | v0.4.0 | #192, #53, #143 | [concept](../../docs/features/193-meeting-block-detection.md) |
| 194 | Scheduled Auto-Engagement (Mobile Nudges) | Integration | 📋 | v0.4.0 | #164, #183 | [concept](../../docs/features/194-mobile-schedule-nudges.md) |
| **— TEAM & PRIVACY (Mike Transcript, 2026-05-18)** |
| 191 | Team Activity Dashboard (Mutual Visibility) | Pro | 📋 | v0.3.0 | #169, #170, #138 | [concept](../../docs/features/191-team-mutual-dashboard.md) |
| 195 | Deep Edit / Retroactive Log Editing | Time | 📋 | v0.3.0 | #156, #157 | [concept](../../docs/features/195-retroactive-log-editing.md) |
| 196 | Intent Countdown Timer (Visible Pressure) | Focus | ✅ (partial) | v0.2.0+ | #121 | [concept](../../docs/features/196-intent-countdown-pro.md) |
| 198 | Privacy Modes / Scaled Visibility | Pro | 📋 | v0.3.0 | #138, #158, #170 | [concept](../../docs/features/198-privacy-modes.md) |
| **— AI & ACCOUNTABILITY (Mike Transcript, 2026-05-18)** |
| 197 | Context-Aware AI Assistant Bridge | AI | 📋 | v0.4.0 | #178, #55, #78 | [concept](../../docs/features/197-ai-assistant-bridge.md) |
| 199 | Morning Kickstart / Daily Planning View | UI | 📋 | v0.3.0 | #174, #122 | [concept](../../docs/features/199-morning-kickstart.md) |
| 200 | Decision Fatigue Reducer (Routine vs. Choice) | Focus | 📋 | v0.3.0 | #174, #199 | [concept](../../docs/features/200-decision-fatigue-reducer.md) |
| 201 | Follow-Through Score / Accountability Metric | Data | 📋 | v0.3.0 | #122, #184, #11 | [concept](../../docs/features/201-follow-through-score.md) |
| **— WORKFLOW & SESSION RECOVERY (Backlog 2026-05-19)** |
| 202 | Session Resurrection (context-aware recovery, Ghost Snapshot, Ice Box) | Focus | 📋 | TBD | #172, #184 | [concept](../../docs/features/202-session-resurrection.md) |
| **— BUSINESS TAXONOMY & EXPORTS (Mike Transcript, 2026-05-26)** |
| 203 | Business Taxonomy Mapping (On vs. In the Business) | Focus | 📋 | v0.4.0 | #188, #158 | [concept](../../docs/features/203-business-taxonomy-mapping.md) |
| 204 | Activity Review & Approval Flow (timesheet review before push) | Time | 📋 | v0.3.0 | #156, #195 | [concept](../../docs/features/204-activity-review-approval-flow.md) |
| 205 | QBO / Payroll Timesheet Export | Billing | 📋 | v0.4.0 | #204, #159 | [concept](../../docs/features/205-qbo-payroll-export.md) |
| 206 | Time Block Compliance Tracker | Focus | 📋 | v0.3.0 | #174, #192 | [concept](../../docs/features/206-time-block-compliance-tracker.md) |
| **— FOCUS QUEUE ENHANCEMENTS (Backlog 2026-05-26)** |
| 185 | Focus Auto-Resume Control & Queue-for-Later | Focus | 📋 | v0.2.0 | #122 | [concept](../../docs/features/185-focus-auto-resume-queue.md) |
| 207 | Back Burner Focuses (parallel/deferred work waiting pairs, momentary check-ins) | Focus | 📋 | v0.3.0 | #122, #123 | [concept](../../docs/features/207-backburner.md) |
| 208 | Smart Deferral & Task Splitting Engine (Auto-Stint Scheduler) | Focus | 📋 | v0.3.0 | #122, #192, #193, #206 | [concept](../../docs/features/208-smart-deferral-stint-scheduling.md) |
| **— ASANA INTEGRATION (Backlog 2026-05-26)** |
| 186 | Asana Task ↔ Focus Linking (attach at creation/edit + auto-focus from URL) | Integration | 📋 | v0.2.0 | #54, #142, #122 | [concept](../../docs/features/186-asana-focus-linking.md) |
| **— BUG FIXES (Logged 2026-05-26)** |
| B07 | Cannot resolve paused active focus from sidebar top spot | Focus | 🔧 | v0.2.0 | — | [concept](../../docs/features/B07-resolve-paused-focus.md) |
| B08 | Autopause triggers while user is active on PC (non-browser) | Time | 🔧 | v0.2.0 | B05, #117 | [concept](../../docs/features/B08-autopause-false-trigger.md) |

---

## Screenshot & Keylogger Benefits Analysis

> Both features are **OFF by default**. Users explicitly opt in per feature.

### Screenshot Capture — Benefits When Enabled

| Benefit | Description |
|---------|-------------|
| **Visual Time Audit** | Scroll through your day as a visual timeline — see exactly what was on screen at any moment |
| **Proof of Work** | Freelancers/contractors can show clients exactly what they worked on, reducing billing disputes |
| **Process Recall** | "How did I set up that Docker config last month?" — search screenshots to find it |
| **Onboarding Documentation** | New hires can screenshot-document their workflow for training materials |
| **Bug Reproduction** | Developers can review screenshots to find exactly when a bug appeared in the UI |
| **OCR Search** | (v0.4.0) Extract text from screenshots for full-text search across your visual history |
| **AI Context Enrichment** | Feed screenshots to AI agents for richer understanding of what you were doing |
| **Compliance & Audit Trail** | Regulated industries can prove specific actions were taken at specific times |

### Keystroke Analytics — Benefits When Enabled

| Benefit | Description |
|---------|-------------|
| **Typing Speed Tracking** | Track your WPM over time — are you getting faster or slower? |
| **Activity Level Verification** | Distinguish "staring at screen" from "actively working" — refine focus metrics |
| **Keyboard vs. Mouse Ratio** | Keyboard-heavy = coding, mouse-heavy = browsing/reading — auto-detect work type |
| **Shortcut Proficiency** | Track which keyboard shortcuts you use and which you don't — suggest efficiency improvements |
| **Writing vs. Consuming Ratio** | Per-tab insight: are you creating content or passively consuming? |
| **Deep Work Validation** | High WPM + low context-switching = genuine deep work (not just "tab was active") |
| **AI Training Data** | Your typing patterns can train AI agents to understand your work rhythm |
| **Ergonomic Awareness** | Sustained high activity alerts for RSI prevention |

### Privacy Guarantees

- **Both features are OFF by default** — require explicit opt-in
- **Keystroke analytics track aggregate patterns only** — no literal keystrokes recorded
- **Screenshots never capture password fields** — auto-masked
- **All data stays local** — never uploaded to any server
- **User can delete all captured data at any time**
- **Incognito tabs are NEVER captured**

---

## Development Priority Summary

### v0.2.0 — "Time Intelligence + Agent Context" (NEXT)
Focus: Make Tabatha the definitive browser time tracker + AI agent bridge.
- #6 Time panel with visual breakdown
- #7 Daily/weekly time summary dashboard
- #8 Time heatmaps
- #9 Deep work scoring
- #10 Context-switch detection
- #23 Context-switch cost tracking
- #29 Sugar Box UI
- #30 Parked Tabs UI
- #78-85 AI Agent Context System (full block)
- #112 Hotkeys (custom keyboard shortcuts)
- #115 BYOK API Keys
- #118 Settings Page (CRITICAL — dependency for many features)
- #119 Extension Toolbar Icon
- #120 Global Tooltips
- #121 Focus Countdown Timer
- #122 Multi-Focus Task Queue & Tab-Intent Association (foundation)
- #123 Intent System v2 / Gatekeeper Overhaul (foundation)
- #124 Floating Tabatha Widget
- #126 Return-from-Away Intent Reminder
- #144 Google Workspace Integration Suite (Meet, Calendar, Docs, Drive)
- #145 AI Chat Context Tracker (thread/UUID tracking)
- #147 Universal URL Mapping Engine
- #148 Overlock Manager Integration

### v0.3.0 — "Smart Cataloging + Capture + Pro"
- #11 Daily productivity score
- #12 Weekly trend analysis
- #13 Historical time reports
- #22 AI auto-categorization
- #24 Smart Refocus
- #31 Distraction blocker
- #42 Saved Groups
- #43 Fuzzy search
- #64 Visual analytics
- #70-77 Smart Capture (screenshots + keystroke analytics)
- #86-88 Second Brain integrations (Obsidian, Logseq, OB1)
- #91 Generic webhook
- #92-93 Client/project cataloging
- #113 Voice Dictation Input
- #114 Voice Notes & Recordings
- #143 Preset Intent Designs (visual templates)
- #146 HeadBoxes — Cross-App Project Catalog

### v0.4.0 — "Billing, Multi-Profile & Integration"
- #14-15 Billable time classification & reporting
- #45 Command palette
- #53-54 Calendar/Asana integration
- #65 Theming
- #72 OCR text extraction
- #75-76 Advanced keystroke metrics
- #89-90 Notion, Apple Notes integration
- #94-97 Multi-profile sync & management

### v1.0 — "Full Parity + Enterprise"
- #16 AI productivity coach
- #32 Focus music
- #55 MCP server
- #66 Cross-device sync
- #67-69 Invoicing & profitability
- #98-102 Staff/employer mode & team dashboard

### v4.0 — "Automation & Desktop Platform"
- #116 Webhook Triggers on Actions
- #117 Tabatha Desktop Companion App

