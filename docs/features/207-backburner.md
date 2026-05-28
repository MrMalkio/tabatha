# Feature #207 — Back Burner Focuses (Parallel/Deferred Work Context Pairs)

> **Status:** 📋 Planned · **Version:** v0.3.0  
> **Depends On:** Focus Engine (#122), Intent Selector (#123), Notifications Service (#105), Desktop Companion (#117)  
> **Created:** 2026-05-28 · **Updated:** 2026-05-28

## User Context (Quotes)

> "Give the user the ability to place a focus on the backburner for a moment, and they get a reminder to revisit that thing in a certain amount of time that is set by user at that time. This is a like a version of pause but it is meant to bring them back to it and move to something else."
>
> "Pause means the user is pausing that work and likely all work and just switching to something else for whatever reason. Backburner means user is moving to something else while they are waiting for something out of thier control to finish. Such has letting some process finish so the user can't actually do anything on that focus until it's done so it goes on the backburner while the user gives something else attention."
>
> "When using backburner we, user should have the option to enter what they are going to do (either existing focus they can select or new focus they can input) and what they need to get back to for when they need to give attention back to the backburner item."
>
> "User/system needs to also be able to account for back burner items that need to receive attention for just a moment, and maybe provide an update once they've checked on that backburner item. Along with it's focus pair (the item that the user is going back to once they've addressed the backburner item. There can be multiple backburner items."
>
> "We want more of the interactions for backburner items to be stemming from the inbar, sidepanel, and homepage, with the blocking center stage elements being last in priority. Back burner items should not fully interupt other focuses. They should be subtle, consistent, demanding, but not derailing."
> — User, 2026-05-28

---

## Core UX Philosophy

> **"Subtle, consistent, demanding, but not derailing."**

Unlike a standard `BlockGate` or aggressive modal interruption, the **Backburner** is designed to respect the active user flow. It lives on the periphery, alerting the user via the browser's InBar interface and sidebar, nudging them without hijacking their screens.

---

## The Paradigm: Pause vs. Backburner

| State | Definition | Triggering Event | Mindset | Next Action |
|:---|:---|:---|:---|:---|
| **Paused** | Standard active suspension | Coffee break, meeting, end of day, distraction | "I am stopping work." | Manual activation later. |
| **Backburnered** | Active deferred wait-state | Waiting for compiler, CI/CD build, database migration, or peer review | "I am waiting on a process. I must work on something else, but I *must return here* soon." | InBar floating visual indicator nudges user to check back. |

---

## What It Does

Introduces the **Backburner Engine**, which manages parallel focus loops by tracking **Context-Transition Pairs** (Backburner Focus ↔ Active Transition Focus) and orchestrating **Subtle Check-ins**.

### 1. Backburner Activation Flow
When a user decides to "Backburner" their active focus:
1. **Trigger Backburner Action:** Available on InBar, Homepage, and Sidebar.
2. **Backburner Config Prompt:**
   - **Backburner Item:** (Locked to currently active focus).
   - **Trigger/Timer:** "Remind me to check in X minutes" (e.g., 5, 10, 15, 30, or custom minutes).
   - **Attention Key:** Brief note on what they are waiting for (e.g., "waiting for deploy to complete").
   - **Transition Focus Picker:** "What are you working on in the meantime?"
     - *Option A:* Select an existing focus from the Queue/History.
     - *Option B:* Create a new quick focus on the fly.
3. **Execution:** The current active focus transitions to `backburner` status. The transition focus is set as `active`. The system pairs the two together: `activeFocus.pairedBackburnerId = backburnerFocus.id`.
4. **Sticky Parameters:** If the user has to go back to this same backburner item multiple times, the initial reminder interval is remembered and auto-applied on subsequent snoozes so they don't have to re-enter parameters.

### 2. The Check-in Loop & InBar Nudges
When the backburner timer expires, the reminder displays in a subtle, non-intrusive fashion:
1. **InBar Float-Up Notification:** A small notification tag gently slides up *within* or adjacent to the InBar.
2. **Visual InBar Indicator:** The InBar displays a subtle pulse or mini icon showing a fire/burner with a countdown indicator.
3. **User Action Options (Directly from InBar/Sidebar):**
   - **⚡ Quick Check-in (Momentary Attention):**
     - A quick check-in is when the user stops their transition task for just a minute to inspect progress on the backburnered item (e.g., refreshing a deploy page or opening a terminal logs file).
     - **Time Logging Model (Configurable, Defaults to Option B):**
       - *Option B (Default — Continuous Transition tracking):* The active focus timer remains running against the *Transition Focus* during the check-in. The check-in itself is logged purely as a metadata update note on the backburner item. This keeps the daily timeline clean.
       - *Option A (Toggleable Setting — Split Precision):* Upon starting the check-in, the active Transition Focus automatically pauses. Time during the check-in (e.g. 1-2 minutes) is recorded directly against the Backburner Focus, resuming the Transition Focus immediately when the check-in completes.
     - An InBar input field appears: *"Any progress on [Focus]?"*
     - The user types a brief update (e.g. *"Build finished successfully"* or *"Still working on step 3"*). This is saved as a *Check-in Log Note* under the focus history.
     - Once they submit the update, if the work is done, they click **"Resume Fully"** to swap contexts back. If they need to wait longer, they click **"Keep Waiting"** (which automatically snoozes the alarm with the initial parameters and immediately resumes their active Transition Focus).

### 3. Auto-Triggering Checks (Browser + Desktop)
If the user navigates to an activity paired with the backburnered item *before* or *during* the alarm, Tabatha automatically registers this as a check-in:
- **In-Browser:** User opens or focuses a tab matching the backburner focus's URL rules.
- **Off-Browser (Desktop Companion):** User activates an off-browser desktop app paired with the backburner focus (e.g., opening terminal, Xcode, VS Code, or a DB admin tool). The Desktop Companion matches the active window title and triggers an `AUTO_CHECK_IN` event.
- **Result:** The active Transition Focus is paused, the time starts recording against the Backburner Focus, and a subtle prompt pops up asking: *"Any updates on [Backburner Focus]?"*

---

## Data Model Extensions

### Focus Object Schema Addition
```json
{
  "focus": {
    "id": "f_deploy_auth",
    "label": "Deploy authentication module",
    "status": "backburner", 
    "backburnerMeta": {
      "remindAt": "2026-05-28T13:20:00Z",
      "reminderIntervalMs": 600000,
      "waitingReason": "waiting for Webpack build & pipeline to pass",
      "transitionFocusId": "f_write_docs",
      "checkInLogs": [
        {
          "timestamp": "2026-05-28T13:15:00Z",
          "note": "Still building, at stage 3/5. Extending timer."
        }
      ]
    }
  }
}
```

---

## UI Components & Design

### A. InBar UI
- **🔥 Backburner Button:** Positioned alongside Pause/Play.
- **Floating Reminder:** Slides up smoothly from the InBar. Highly visible but does not cover web content or block actions.
- **Mini check-in form:** Renders directly inside the InBar context to minimize navigation overhead.

### B. Sidebar "Backburner Dock"
- A small horizontal container directly under the active focus spot listing active backburners.
- Shows circular countdown indicators, text notes, and one-click "Inspect" or "Resume" buttons.
