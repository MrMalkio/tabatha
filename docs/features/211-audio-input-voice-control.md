# Feature #211 — Audio Input & Voice Control ("Talk to Tabatha")

> **Status:** 📋 Planned · **Version:** v0.4.0
> **Depends On:** Focus Engine (#122), Intent Selector (#123), InBar, Tasks Panel, Settings; AI Counterpart (for natural-language intent parsing)
> **Created:** 2026-05-30
> **Source:** User, 2026-05-30
> **Category:** Input / AI Counterpart

## User Context (Quotes)

> "We want an audio input button near every text input in the system — at least for every title and every description."
>
> "We also want a general audio input button where the user can just speak to Tabatha, and whatever the system prompt is for the general button will know what to do with that information — whether to create a new focus, create a new task; if they trigger this general input button from the InBar of a specific tab, it might take certain actions based on that tab in conjunction with what the user is saying."
>
> "We can see what of this we can have created that does not lean on AI, what is needed before the AI to even make sense, and then what it looks like to include the AI."
>
> "We don't want the user to really have to click around too much. We'd ideally like for them to just click a floating button that is on pretty much every tab and every window and is in the extension bar. Also likely supports or depends on a hotkey."
>
> "The user would be able to do pretty much anything from this audio button, or completely control Tabatha by audio alone — including speaking about what they want to do at any point throughout the day, and then it creates the different intents and tasks. When the user speaks to Tabatha it can change settings or whatever it may be, including allowing Tabatha to open up new windows."
> — User, 2026-05-30

---

## What It Does

Adds **voice as a first-class input** across Tabatha, in two tiers:

1. **Field-level dictation** — a small mic button beside every text input (focus/task titles and descriptions, notes, etc.) that transcribes speech to text. This is the **non-AI baseline**.
2. **General voice command** — a floating, omnipresent mic button (every tab, every window, the extension bar, hotkey-bound) where the user simply *speaks intent* and Tabatha figures out the action: create a focus, create a task, change a setting, open windows, run a control flow — context-aware to the tab it was triggered from. This is the **AI-counterpart tier**.

The north star: the user can **control Tabatha by voice alone**, including a free-form "here's my day" brain-dump that gets parsed into intents and tasks.

---

## Phased Build (Non-AI → AI)

### Phase A — Speech-to-Text Plumbing (No AI)
- Integrate a transcription source (Web Speech API / `SpeechRecognition` where available, or a STT service fallback).
- **Field-level mic buttons:** beside every title/description input. Click (or hotkey) → record → transcribe → insert into the field. Pure dictation, no interpretation.
- Recording UX: visible recording state, waveform/level indicator, cancel/confirm, push-to-talk vs. toggle.
- Permissions handling (mic access) and a graceful denied-state.

### Phase B — Floating Capture Button (No AI yet)
- A floating action button injected on every tab (content script), present in the InBar, the sidebar, popup, and bound to a global **hotkey**.
- In the non-AI stage it can still do useful deterministic things: dictate into the *currently focused* Tabatha input, or capture a raw voice note attached to the active focus/tab.

### Phase C — General Voice Command (AI Counterpart)
- Spoken input → transcription → **intent parsing** via the AI counterpart against a defined system prompt/tool schema.
- The parser maps utterances to **actions**:
  - Create / rename / resolve a focus or task.
  - Set or adjust priority (ties into #214).
  - Change settings.
  - Open windows / tabs, group tabs, start a stint, pause, backburner, defer.
- **Context injection:** when triggered from a specific tab's InBar, the active tab URL/title/context is passed alongside the utterance so actions can be tab-aware ("link this to my research focus", "block this site", "this tab belongs to the client X intent").

### Phase D — Full Conversational Control
- Free-form "plan my day" capture → batch-creates intents/tasks with inferred priorities and (optionally) schedule placement (ties into #208 Smart Deferral, #035 Calendar).
- Multi-step / multi-action utterances handled in one turn.
- Voice-driven window/workspace orchestration.

---

## The General Button — Action Routing

```
[Voice utterance] + [trigger context: tab? sidebar? popup?]
      │
      ▼
[Transcribe] → [AI intent parse against tool schema]
      │
      ▼
  ┌─────────────────────────────────────────────┐
  │ create_focus | create_task | set_priority    │
  │ change_setting | open_window | group_tabs    │
  │ start_stint | pause | backburner | defer     │
  │ link_tab_to_focus | block_site | brain_dump  │
  └─────────────────────────────────────────────┘
      │
      ▼
[Confirm (optional) → Execute → Voice/visual ack]
```

Confirmation behavior is configurable: silent execution for low-risk actions, confirm for destructive/ambiguous ones.

---

## Data Model / Settings

```js
// DEFAULT_SETTINGS (constants.js)
voice: {
  fieldDictationEnabled: true,
  floatingButtonEnabled: true,
  floatingButtonPosition: 'bottom-right',
  hotkey: 'Alt+Shift+V',
  pushToTalk: true,
  aiCommandEnabled: false,        // gated until AI counterpart lands
  confirmDestructiveActions: true,
  sttProvider: 'webspeech',       // 'webspeech' | 'service'
  language: 'en-US'
}
```

Voice notes / transcripts can be attached to focus history with `{ transcript, audioRef?, createdAt, sourceContext }`.

---

## UI Surfaces
- **Every title/description input:** inline mic affordance.
- **Floating action button:** content-script injected on all tabs; mirrored in InBar, sidebar, popup.
- **Extension bar (action icon):** voice trigger entry point.
- **Global hotkey:** start/stop capture from anywhere.

---

## Open Questions / Dependencies
1. **STT choice:** Web Speech API is free but inconsistent across browsers and may route audio to vendor servers — privacy review needed. A self/3rd-party STT service is more reliable but adds cost/latency. (Ties to existing privacy-modes-future sticky note.)
2. **Privacy:** always-listening vs. push-to-talk (default push-to-talk). Where is audio processed? What's stored?
3. **MV3 constraints:** content-script injection of a floating button on *every* page, plus mic permission per-origin, is non-trivial. May need an offscreen document for audio in MV3.
4. **AI dependency boundary:** Phases A–B ship without AI; Phases C–D require the AI counterpart and a stable tool/action schema (reuse the message-type contracts).
5. **Action safety:** voice-driven `open_window` / settings changes need a confirm/undo path.

---

## Related Features
- #123 Intent Selector · #122 Focus Engine
- #210 Priority Challenge (voice "yes/no/why" responses)
- #214 Priority Matrix & Lazy Priority (voice-set priorities)
- #208 Smart Deferral · #035 Calendar (voice "plan my day")
- #207 Backburner (voice backburner/defer)
- AI Counterpart (parent capability)
