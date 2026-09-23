# Feature #217 — Dispatch Mode (Push-to-Talk)

> **Status:** 📋 Planned · **Plan:** [042](../superpowers/specs/2026-07-20-plan-042-conversational-tabatha-design.md)
> **Depends On:** Transcription-provider abstraction (same plan, Unit 1)
> **Created:** 2026-07-20

## User Context (Quotes)

> Malkio's Plan 042 brief: "Simple mode evolves into a PTT experience (push,
> speak, release): notes taken and attributed with best-effort mutation of
> everything that needs mutating; same processing channel as in-call/
> post-call processing but with lightweight transcription only (no
> conversational feedback); PTT on the extension too."

## What It Does

A push-to-talk button — press, speak, release — that transcribes and routes
the result through the same mutation pipeline the rest of Conversational
Tabatha uses (create/adjust/resume intents, log checkpoints, best-effort
attribute notes), but with **zero conversational feedback**: no spoken reply,
no follow-up questions, just fast capture-and-mutate. This is the "lightweight"
end of the voice spectrum — Dispatch is for a user who wants to fire off a
quick verbal note without a back-and-forth, as opposed to a proactive
check-in or an in-app call, which do talk back.

Ships on both surfaces: Sidecar (primary) and the extension (InBar/popup),
so the same push-to-talk gesture works whether the user is at their desk or
on their phone.

## Implementation Notes

- Full design: `docs/superpowers/specs/2026-07-20-plan-042-conversational-tabatha-design.md`
  §3 Units 2-3.
- Reuses the existing deterministic command parser
  (`sidecar/src/lib/voiceCheckin.ts`'s `parseVoiceCommand`) as its first-pass
  router — Dispatch doesn't require the v2 LLM layer to be useful.
- Mutations created via Dispatch are tagged `tags._src = 'dispatch'`,
  matching the existing `_src='sidecar'` provenance convention.
- Extension and Sidecar implementations are **deliberately not shared code**
  — two separate codebases with different storage layers; duplicating a
  small parser is cheaper than a premature cross-repo extraction.

## Related Features

- Plan 042 Unit 0 (voice bug fixes — Dispatch inherits the same speech-capture
  layer, so both bugs must be fixed before Dispatch ships)
- #211 Audio Input & Voice Control
- #165 Voice Notes
