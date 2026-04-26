# Agent Instructions

<!-- HEADBOX STATUS: none | PREP: not started -->
<!-- Headbox System: Mojo/headbox/ | Spec: Mojo/headbox/HEADBOX-SPEC.md -->

## About This File

This project does not yet have full agent instructions (a "Headbox").
A Headbox provides standardized instructions, session tracking, versioning,
and cross-project consistency for agents working in this workspace.

## What To Do

When you begin a session in this project:

1. **Work normally.** The user came here to get something done - prioritize that.
2. **Observe & infer.** As you work, note the project's structure, tech stack, version,
   key files, and workflows. Write observations to `headbox-prep-notes.md`
   (create it if it doesn't exist). Infer answers from the codebase before asking.
3. **Elicit naturally.** When it makes sense (max 1 question per 5-7 exchanges):
   - State what you observe: "This looks like a Next.js app - right?"
   - Piggyback on user descriptions to fill fields without explicit questions
   - Ask directly only as last resort: "What's the current version?"
4. **Fill prep notes.** Each answer goes into `headbox-prep-notes.md` and
   removes that question from your mental list.
5. **Escalate if stalled.** After 3 sessions with no progress, be more direct.
   After 10 sessions, draft with `[TBD]` gaps and present.
6. **When ready, offer.** Once you have enough context (or no questions remain):
   > "I've collected enough context to draft a Headbox for this project.
   > Want me to generate it?"

**Full prep protocol:** See `Mojo/headbox/prep/headbox-prep-interview.md`

## Standing Rules (Until Headbox Is Active)

- Always commit before ending a session. Use `wip:` prefix if incomplete.
- Follow Conventional Commits: `{type}({scope}): {description}`
- When in doubt - ask.
- If you notice something off-topic, note it in `parking_lot.md`, don't chase it.

## Session Log

| Date | Agent | Work Done | Notes |
|------|-------|-----------|-------|
| | | | |
