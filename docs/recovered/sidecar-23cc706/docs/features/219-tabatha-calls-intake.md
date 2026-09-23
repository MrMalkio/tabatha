# Feature #219 — Tabatha Calls & Intake Conversations

> **Status:** 📋 Planned (v2) · **Plan:** [042](../superpowers/specs/2026-07-20-plan-042-conversational-tabatha-design.md)
> **Depends On:** An active Flux account concept (not yet defined anywhere in
> this codebase — named dependency gap, see Plan 042 §4)
> **Created:** 2026-07-20

## User Context (Quotes)

> Malkio's Plan 042 brief: "In-app 'calls' — Tabatha calls the user (app/
> extension/phone first; WhatsApp/phone-system later) opening a real
> conversation: check-ins acknowledging life happens — intake conversations
> (5-10 min) about anything on the user's mind (ideas, calls they had,
> observations), then Tabatha routes what belongs in Tabatha into Tabatha and
> what belongs in Flux into Flux. REQUIRES an active Flux account for the
> deep-context features."

## What It Does

Tabatha proactively "calls" the user — a real, ringing, answerable
conversation, not a notification — for two purposes: a check-in that
acknowledges life doesn't stop at the edge of a focus timer, and a longer
5-10 minute intake conversation where the user can just talk about whatever's
on their mind (an idea, a call they had, an observation) and Tabatha sorts
the output: operational content (a new intent, a task, a deadline) stays in
Tabatha; personal/reflective content (goals, relationships, anything that
isn't "what am I doing right now") routes to Flux. This is the feature that
makes the Tabatha→Flux boundary (see `Tabatha_Concept.md`'s Ecosystem
Journey section) a real, working seam rather than a conceptual one.

Channel order: in-app (extension/Sidecar) first, phone-native/WhatsApp later.

## Implementation Notes

- Full design: `docs/superpowers/specs/2026-07-20-plan-042-conversational-tabatha-design.md`
  §4 (explicitly v2, not designed in build detail in that doc).
- Hard-blocked on a real definition of "an active Flux account" from
  Tabatha's side — no such concept exists in this codebase today (no linked
  auth identity, no shared profile row, no webhook). This is not assumed or
  guessed at; it needs its own companion design doc before build units can
  be cut.
- Reuses the same dispatch/mutation channel as Dispatch mode (#217) and
  scripted check-ins — the delta is a live LLM round-trip plus routing logic,
  not a new pipeline.
- AI backbone: Hermes first, OpenClaw if needed — the same choice already
  resolved for #182 Chaperone's full-agentic tier, not a new decision.

## Related Features

- #182 Chaperone Mode (shares the AI backbone decision and the trigger
  channel)
- Plan 042 Unit 4/5 (v1 groundwork: rotating preset prompts, device-handoff
  micro-summaries — the non-AI precursor to this feature)
- `Tabatha_Concept.md` Ecosystem Journey (Tabatha → Flux → Caspera)
