# Tabatha Roadmap

This roadmap outlines the future development of Tabatha, integrating its core
"Context-Driven" philosophy with the speed and utility of "Quick Tabs".

## Phase 1: Foundation (Current)

- [x] **Context Tracking**: Basic association of tabs to contexts.
- [x] **Intent Prompt**: Interception of new tab creation.
- [x] **Time Tracking**: Basic active time logging.
- [x] **Tab Locking**: Prevent accidental closure.

## Phase 2: Rapid Access & Management (Next Up)

_Inspired by Quick Tabs_

- [ ] **Quick Action Menu (Popup)**:
  - [ ] **Global Search**: Fuzzy search across all open tabs, history, and
        bookmarks.
  - [ ] **MRU Switching**: "Alt-Tab" for your browser tabs.
  - [ ] **Command Palette**: Run commands like `/close`, `/mute`, `/split`
        directly from the search bar.
- [ ] **Keyboard Shortcuts**:
  - [ ] Custom shortcuts for opening the search menu.
  - [ ] Quick switch to previous/next tab without opening the menu.
- [ ] **Custom Hotkeys** (#112): User-configurable hotkeys for primary features
      (new session, timer toggle, context switch) without opening any panel.
- [ ] **BYOK API Keys** (#115): Settings panel for users to provide their own
      API keys for external services (OpenAI, Google Cloud, etc.).

## Phase 3: Deep Customization & Logic

- [ ] **Saved Contexts**: Persist entire workspaces (windows/groups) and restore
      them later.
- [ ] **Smart Categorization**: Machine learning or heuristic-based
      auto-categorization of URLs into contexts.
- [ ] **Idle Detection & "Offline" Context**: Better handling of breaks and time
      away from the browser.
- [ ] **Voice Dictation Input** (#113): Speech-to-text for any Tabatha input field,
      triggered via hotkey or mic button. Uses Web Speech API or BYOK Whisper.
- [ ] **Voice Notes & Recordings** (#114): Capture, store, and play back audio
      notes attached to sessions, contexts, or standalone.

## Phase 3.5: Notes (v0.5.0)

- [ ] **Notes System V1** (#222): A real notepad — free-standing notes that may or may not be
      connected to the current focus. Markdown body, tags, pinning, colors, search; a flat stream
      rather than a filing hierarchy (Progressive Simplicity). Every note carries an immutable
      **context stamp** (what focus/tab/shift was active at capture) which never claims ownership,
      plus an optional one-click **promote-to-linked**. V1 surfaces: **extension sidebar + desktop
      companion**. V2: Sidecar, cloud sync (with `updated_at` from migration one), voice-to-note.

## Phase 4: Polish & Sync

- [ ] **Cross-Device Sync**: Sync contexts and time tracking across devices.
- [ ] **Theming**: specific themes for the extension interface
      (Dark/Light/System).
- [ ] **Visual Analytics**: Charts and graphs of time spent per context.

## Phase 5: The Flux Ecosystem (App Family Integration)

- [ ] **Connected Online Version**: An online counterpart capable of receiving/sending payloads to sync settings, features, and cross-session data.
- [ ] **Offline Standalone Version**: Ensure Tabatha remains fully functional and robust in offline, isolated environments.
- [ ] **Screensaver Clock Integration**: Send current task focus and active session data to the standalone Refocus Clock application.
- [ ] **Flux Master Interface**: Full integration with "Flux," the master context and management interface, creating a seamless tri-app ecosystem that can operate interdependently or independently.

- [ ] **Mimir Connector** (#222): Notes push to Mimir — the ecosystem's beyond-second-brain memory
      layer — as an **opt-in sink over the desktop companion's local bridge**, never a dependency.
      Notes remain fully functional with Mimir absent, offline, or never configured. Requires the
      Mimir-side connector work tracked on Mimir's own roadmap
      (`Caspera/second-brain/mimir/docs/13-roadmap-and-status.md`).

## Phase 6: Automation & Desktop Platform (v4.0)

- [ ] **Webhook Triggers** (#116): Outbound webhooks on Tabatha events (session start/end,
      context switch, pomodoro complete, etc.) for Zapier/IFTTT-style automation.
- [ ] **Tabatha Desktop Companion** (#117): Standalone desktop app (Electron/Tauri) that
      extends attention tracking to the full OS — active window, app time, cross-app context.
