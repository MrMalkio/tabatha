# Feature #210 — Priority Challenge & Accountability Interrupts ("Is This The Thing?")

> **Status:** 📋 Planned · **Version:** v0.3.0
> **Depends On:** Focus Engine (#122), Priority System (#214 Priority Matrix / Lazy Priority), Notifications Service (#105), BlockGate, Tasks Panel
> **Created:** 2026-05-30
> **Source:** User, 2026-05-30
> **Category:** Accountability / Protection

## User Context (Quotes)

> "Challenge the user whenever they repeatedly give their focus or work on things that are not the highest priority. We want to have varying different ways of alerting and interrupts so the user doesn't always treat it the same way or start getting notification fatigue or blindness or start ignoring it super easily."
>
> "The idea is to ask the user if this is the most important task to be working on. The user will probably click yes or no. Then we have a flow that tries to get them back on track or sets a timer for this digression."
>
> "Another opener is prompting the user with 'Is this task more important than…' and then prompts any of the tasks listed as higher priority. Starting with the highest rated priority task, from oldest to newest. A bunch of different variations of these different openers is how I want it implemented."
>
> "We want to also have either on their first opener, or a follow-up opener, that forces the user to type in why they are focusing on this new thing that has been stated as not the priority — or they have to adjust the priority of what it is that they are working on."
> — User, 2026-05-30

---

## What It Does

Introduces the **Priority Challenge Engine** — an accountability layer that detects when the user repeatedly invests attention into work that is *not* their highest-priority item, and interrupts them with **varied, rotating prompts** to either (a) justify the digression, (b) re-rank priorities, or (c) get back on track.

The core design principle is **anti-fatigue variety**: the system must rotate opener styles, escalation levels, and interaction modalities so the user never habituates to a single prompt and starts dismissing it reflexively.

---

## Core Mechanics

### 1. Detection — When To Challenge
The engine watches the active focus against the current priority ranking (see #214). A challenge is considered when:
- The active focus is **not** the highest-priority unblocked item, **and**
- The user has spent more than a threshold of time on the lower-priority item (configurable, e.g. 10 min), **or**
- The user has **repeatedly** chosen lower-priority work across recent stints (pattern detection, not just a single instance).

Repetition weighting matters: a one-off detour is treated lightly; a recurring pattern escalates.

### 2. Rotating Openers (Anti-Fatigue Variety)
A pool of opener variations is cycled so no two consecutive challenges feel identical. Examples:

| Opener Style | Prompt Pattern | Response Mode |
|---|---|---|
| **Direct check** | "Is this the most important thing to be working on right now?" | Yes / No |
| **Comparative** | "Is *[current focus]* more important than *[highest-priority item]*?" — iterates through higher-priority items, highest-rated first, **oldest to newest**. | Yes / No per item |
| **Justify-first** | "You're working on *[current focus]*, which isn't your top priority. Why?" | Forced free-text entry |
| **Re-rank prompt** | "If this is what matters now, bump its priority." | Inline priority editor |
| **Soft nudge** | Subtle InBar pulse / tag, no modal | Passive, dismissible |

The variety spans both **wording** and **modality** (center-stage modal vs. InBar nudge vs. sidebar banner) and **escalation level**.

### 3. The Response Flow
On **Yes** ("this is the most important"):
- Optionally require justification or a priority bump (configurable — see below).
- Snooze further challenges for this focus for a cool-down window.

On **No**:
- Offer to switch to the actual top-priority item, **or**
- Set a **digression timer** — "OK, give yourself X minutes on this, then back to *[top item]*." On expiry, the engine re-challenges or auto-prompts the switch.

### 4. Forced Accountability (First or Follow-Up Opener)
Depending on the opener, either immediately or as a follow-up, the user **must** either:
- **Type a reason** for focusing on the non-priority item (logged to focus history / accountability log), **or**
- **Adjust the priority** of what they're working on (so the system's model stays honest).

This prevents frictionless dismissal and keeps the priority data accurate.

---

## Escalation Ladder (Configurable)

1. **Level 0 — Passive:** Subtle InBar tag / pulse.
2. **Level 1 — Gentle modal:** Single Yes/No, easy dismiss.
3. **Level 2 — Comparative:** Forces the user to compare against each higher-priority item.
4. **Level 3 — Forced justification:** Free-text reason required, or priority re-rank required.
5. **Level 4 — BlockGate-style:** Center-stage, harder to bypass (reserved for chronic repeat offenders / explicitly opted-in "hardcore" mode).

Escalation is driven by repetition frequency and user-configured aggressiveness.

---

## Data Model Extensions

```json
{
  "priorityChallenge": {
    "focusId": "f_email_triage",
    "challengedAt": "2026-05-30T14:10:00Z",
    "openerStyle": "comparative",
    "escalationLevel": 2,
    "topPriorityItemId": "f_ship_release",
    "userResponse": "no",
    "justification": null,
    "digressionTimerMs": 600000,
    "outcome": "set_digression_timer"
  }
}
```

```js
// In DEFAULT_SETTINGS (constants.js)
priorityChallenge: {
  enabled: true,
  aggressiveness: 'medium',        // 'gentle' | 'medium' | 'hardcore'
  minTimeBeforeChallengeMs: 600000,
  requireJustificationOnYes: false,
  requirePriorityBumpOnYes: false,
  cooldownAfterAckMs: 1800000,
  rotateOpeners: true,
  maxEscalationLevel: 3
}
```

---

## UI Surfaces
- **InBar:** Passive pulse / tag for Level 0–1; inline mini-prompt for quick Yes/No.
- **Center stage (BlockGate):** Reserved for high escalation; last in priority of surfaces.
- **Sidebar / Homepage:** Comparative list rendering ("more important than…") and justification entry.

---

## Anti-Fatigue Notes
- Maintain an **opener-rotation history** so the same style isn't reused back-to-back.
- Vary **timing jitter** so challenges don't arrive on a predictable cadence.
- Track a **dismissal/ignore rate**; if it climbs, the system should *change tactics* (different modality) rather than simply escalate volume.

---

## Open Questions
1. How is "highest priority" resolved when #214's Priority Matrix and Lazy Priority disagree? (Matrix should win when present; fall back to Lazy P1–P5.)
2. Should justifications feed an AI summary later ("you keep deprioritizing X because…")?
3. Should the digression timer count time against the lower-priority focus normally, or flag it as "acknowledged digression" time in reporting?

---

## Related Features
- #214 Priority Matrix & Lazy Priority (priority source of truth)
- #213 Focus/Task Data Architecture (what "task" vs "focus" priority means)
- #200 Decision Fatigue Reducer
- #207 Backburner · #208 Smart Deferral
- #105 Notifications Service · BlockGate
