# Feature #197 — Context-Aware AI Assistant Bridge

> **Status:** 📋 Planned · **Version:** v0.4.0
> **Depends On:** #178 Agent Context Tracking, #55 MCP Server, #78 Context File Generator
> **Created:** 2026-05-18
> **Source:** Mike Transcript (N11)

## User Context (Quotes)

> "I wanted to have all that context so that my AI has it… what are you doing right now? Or I want to say, hey Reggie, call Malkio and XY…"
> — Mike, describing his AI assistant vision

## What It Does

Exposes Tabatha's real-time state as a **context API** for external AI assistants:
- Current focus, active intents, recent tab history
- Time-in-focus, break status, idle state
- Client/project context (from #188)
- API endpoint or MCP tool that AI agents can query

This makes Tabatha the "context engine" — not the AI itself, but the data layer AI draws from.

## Implementation Notes

- MCP Server (#55) is the ideal transport — AI agents query Tabatha via MCP tools
- Fallback: REST API or webhook for non-MCP assistants
- Privacy: API access requires auth token, user controls what data is exposed
- Agent Context Tracking (#178) provides the per-session attribution layer

## Related Features

- #178 Agent Context Tracking
- #55 MCP Server for AI Agent Queries
- #78 Context File Generator
- #125 AI-as-Enhancement Principle
