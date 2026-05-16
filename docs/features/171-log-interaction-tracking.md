# Feature #171 — Log Interaction Tracking (User Response Logging)

> **Status:** 📋 Planned · **Version:** v0.2.0  
> **Depends On:** #132 Intent History, #148 Overlock  
> **Created:** 2026-05-14

## User Context (Quotes)

> "I want the logs to also show every interaction that user is given and what the user's response was."
> — User, 2026-05-14

## What It Does

Every time Tabatha presents the user with a prompt, overlay, or decision point, the **interaction itself** and the **user's response** are logged. This creates a complete audit trail of not just what happened, but what Tabatha asked and what the user chose.

## Interactions to Log

| Interaction | User Responses Tracked |
|-------------|----------------------|
| InPop intent prompt | Intent entered, inherited, skipped, "Nevermind" |
| BlockGate overlay | Justified (what they typed), timer used, went back |
| Focus countdown expired | Extended, completed, dismissed |
| Idle prompt | Resumed, went on break, clocked out |
| Welcome Back (#126) | Confirmed same focus, changed focus, new focus |
| Tab Cap warning (#160) | Closed tabs, overrode, entered Purge Mode |
| Break conflict (#149) | Paused all, paused individual, completed |
| Time redistribution (#152) | Assigned time, discarded |

## Log Entry Format

```json
{
  "type": "interaction",
  "interaction": "inpop_prompt",
  "presentedAt": "2026-05-14T10:00:00Z",
  "respondedAt": "2026-05-14T10:00:05Z",
  "responseTime": 5000,
  "response": "intent_entered",
  "responseData": { "intent": "Reviewing PR #342" },
  "context": { "tabUrl": "github.com/...", "activeFocus": "Sprint work" }
}
```

## Implementation Notes

- Extend existing Overlock (#148) logging to include interaction events
- Each overlay/prompt component emits a log event on user action
- Logs Panel filter: "Interactions" chip to show only prompt/response entries
- Analytics: response time trends, most common actions, skip rates

## Open Questions

- Should interaction logs be included in team visibility (#169/#170)?
- Can interaction patterns inform UI improvements? (e.g., "users skip InPop 80% of the time on gmail.com")
