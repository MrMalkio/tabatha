# Feature #178 — Agent Context Tracking (AI Chat/Agent Attribution)

> **Status:** 📋 Planned · **Version:** v0.2.0  
> **Depends On:** #145 AI Chat Context Tracker, #123 Intent v2  
> **Created:** 2026-05-15

## User Context (Quotes)

> "Allow user to add agent context — Track which AI chat, AI agent, or similar resource helped or is helping the user for that intent/focus/task."
> — User, 2026-05-15

## What It Does

Users can **attribute AI assistance** to any intent, focus, or task. Track which AI chat (ChatGPT, Claude, Gemini, Codex), AI agent, or similar resource was used during a focus session. This creates a map of "which AI helped with what" for productivity analysis, cost tracking, and context continuity.

## Data Model

```json
{
  "agentContext": {
    "agents": [
      {
        "platform": "claude" | "chatgpt" | "gemini" | "codex" | "cursor" | "custom",
        "name": "Claude Opus 4",
        "chatId": "thread_abc123",
        "chatUrl": "https://claude.ai/chat/abc123",
        "role": "primary" | "supporting" | "reference",
        "addedAt": "2026-05-15T00:47:00Z",
        "notes": "Helped design the data model"
      }
    ]
  }
}
```

## How It's Used

| Scenario | Agent Context |
|----------|---------------|
| User is coding with Cursor | Auto-detect Cursor tab, link agent context |
| User references a Claude chat | Manual add: "Claude helped with architecture" |
| User has ChatGPT open alongside focus | Auto-detect ChatGPT tab via URL mapping (#147) |
| Reviewing AI-generated content | Tag the source agent for provenance |

## Entry Points

- **InBar**: "+ Agent" button to associate an AI context with current tab's intent
- **Focus Detail**: "AI Assistance" section listing all agents used during this focus
- **Task Detail**: "Assisted by" field
- **Auto-detection**: If a tab matches AI chat URL patterns (#145), prompt to associate

## Implementation Notes

- Extends intent/focus data model with `agentContext` array
- Auto-detection reuses #145 (AI Chat Context Tracker) URL matching
- Manual entry: dropdown with common platforms + custom option
- Synergy with #145: if AI chat thread is already tracked, auto-link when user opens it during a focus
- Display: small AI platform icon badges on focus/task entries

## Open Questions

- Should agent context track cost? (e.g., "this Claude chat cost ~$0.50 in API credits")
- Should Tabatha auto-detect ALL AI tabs or only prompt when user is in a focus?
- Privacy: should agent context be visible in team views (#169/#170)?
