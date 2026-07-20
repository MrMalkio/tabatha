# Feature #182 — Chaperone Mode (Agentic Voice AI Companion)

> **Status:** 📋 Planned · **Version:** v0.4.0  
> **Depends On:** #125 AI-as-Enhancement, #117 Desktop Companion, #113 Voice Dictation, Mobile  
> **Created:** 2026-05-15

## User Context (Quotes)

> "Agentic feature: User can turn on chaperone mode (working name). A voice AI agent supplements some of the notifications by speaking to user as a coworker/assistant that is near. It reacts to any context and engages with user contextually."
>
> "User drifting, Agent just starts talking. But not like 'hey you're drifting' but instead, 'So how are we looking on task name', or 'After we're done with task name, should we do x or y?'."
>
> "If user picks up phone during a focus session or deep focus session. The agent can respond from the computer, in the tone and personality set by the user. And if they continue they have full context of the majority of actions the user is doing on the phone. And can continue talking in a super personal manner."
> — User, 2026-05-15

## What It Does

An **ambient voice AI companion** that acts as a virtual coworker sitting next to the user. Instead of notifications and overlays, the Chaperone *speaks* — contextually, naturally, like a colleague. It has full awareness of the user's focus state, tasks, and cross-device activity.

## Key Principles

| Principle | Detail |
|-----------|--------|
| **Conversational, not alerting** | Never says "you're drifting." Instead: "So how are we looking on that PR?" |
| **Contextually aware** | Knows current focus, tasks, timer state, what's next in queue |
| **Cross-device** | Speaks from computer even when user is on phone |
| **Personality configurable** | User sets tone: encouraging, direct, casual, formal |
| **Non-intrusive start** | Starts talking naturally, doesn't demand attention |

## Interaction Scenarios

| Scenario | Chaperone Response |
|----------|-------------------|
| User opens social media during deep focus | "Hey, after we finish the API integration, want to check if Jake responded to that thread?" |
| User picks up phone mid-focus | (from computer speakers) "Good timing — want me to find that reference image we were looking at earlier?" |
| User idle for 3 minutes | "So for the dashboard layout, are we going with the grid or the flex approach?" |
| Focus timer about to expire | "We've got about 5 minutes left on this session. Want to wrap up or extend?" |
| User completes a task | "Nice. That's 3 down today. Should we tackle the billing component next, or take a break first?" |
| User returns from break | "Welcome back. We were in the middle of the auth flow — pick up where we left off?" |

## Personality Presets

| Preset | Style | Example |
|--------|-------|---------|
| **Supportive Coach** | Warm, encouraging | "You're doing great — let's keep this momentum going." |
| **Direct Coworker** | Peer-level, efficient | "PR review is still open. Should we knock that out?" |
| **Casual Friend** | Relaxed, informal | "Yo, we still doing that thing? Or nah?" |
| **Strict Manager** | Firm, accountability | "The deadline is tomorrow. Let's stay focused." |
| **Custom** | User-defined personality prompt | — |

## Implementation Notes

- **Voice synthesis**: Web Speech API (`speechSynthesis`) for basic, or ElevenLabs/OpenAI TTS for natural voice
- **AI backbone**: LLM (user's BYOK key #115) with Tabatha context injected as system prompt
- **Context feed**: current focus, active tasks, timer state, recent actions, phone activity (#164)
- **Trigger engine**: background service monitors for drift/idle/phone-pickup events
- **Cross-device voice**: Desktop Companion (#117) handles audio output when browser isn't focused
- **Privacy**: all processing can be local (Whisper + local LLM) or cloud (opt-in)
- **Kill switch**: "Hey Tabatha, stop" or mute hotkey

## Data Flow

```
User drifts → Background detects (URL change / idle / phone pickup)
  → Chaperone engine evaluates context (focus state, timer, tasks)
  → LLM generates contextual response
  → TTS synthesizes speech
  → Audio plays from computer speakers / headphones
  → User responds verbally (optional, via mic) or takes action
  → Chaperone acknowledges and adapts
```

## Implementation Files

| File | Purpose |
|------|---------|
| TBD → `src/services/chaperoneService.js` | Core AI agent logic |
| TBD → Desktop Companion module | Cross-device audio output |
| TBD | Personality configuration UI in Settings |

## Open Questions

- Should Chaperone have "office hours" (only active during work shifts)?
- Can Chaperone learn user patterns over time? ("You usually take a break around now")
- How to handle interruption — if user is talking on phone, should Chaperone wait?
- Multi-language support for the voice?
- Should Chaperone be able to take actions? (e.g., "Should I start the next focus?")

---

## Enrichment — 2026-07-18 (voice-transcript intake)

### New User Context (Quotes)

> "Phone rings — before the first ring even completes, the sidecar or the extension literally audibly says: 'Don't you dare touch that phone… if you touch this phone, I will delete this entire computer.' An empty threat — part of the personality. … Oh wait, it's your mom. Answer that."

> "That first audio message could really just be something that's pre-recorded… scenarios: somebody calls, somebody texts, the user just picks up their phone for no known reason — those alerts just play on that trigger."

> "It's creating a supervisor, a coworker, a digital body doubler, an assistant, someone to keep them accountable — batched in."

> "The user should be able to just click a button and engage with that same agent… tapping into the context of Flux, Tabatha, and my second brain."

### v0 slice — pre-recorded Personality Interrupts (Tabatha + Sidecar only, NO AI needed)

The full Chaperone is Flux-tier, but a v0 ships on rails that exist **today**:

1. **Trigger:** phone-side detection → the same `browser_profile_status` realtime
   signal used by Phone Focus Mode / phone-away (shipping in Plan 040 Epic 0).
   Web-detectable now: pickup/navigate-away (visibility, motion). Native-tier
   (parked with #164/#183): incoming call, SMS, caller identity ("it's your mom").
2. **Response:** the **Context View / extension plays a pre-recorded audio line**
   (< 1s latency via the existing realtime channel) — e.g. "Don't you dare touch
   that phone." Personality packs = sets of pre-recorded lines per scenario
   (pickup / repeated pickup / return). Empty threats are theater — config-gated,
   never real actions.
3. **Config:** personality selection + intensity + quiet hours in settings
   (`settings.chaperone`); defaults apply for sidecar-only users.
4. **Escalation path:** v0 pre-recorded → later TTS w/ context interpolation →
   full agentic Chaperone (engine: **Hermes first, OpenClaw if needed** — both
   installed; the "click to engage" button connects to the same personality with
   Flux/second-brain context).

### Also related
- #210 Priority Challenge & Accountability Interrupts (text-modal sibling)
- #211 Audio Input & Voice Control (the inbound half; #182 is outbound)
- #215 Body Doubling (the human-powered variant of the same accountability need)
- Plan 040 Epic 10 (v0 slice scheduling); body-doubling science research task in #215
