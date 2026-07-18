# Portfolio Track — parked (captured 2026-07-18)

> Parked per the 2026-07-18 decision: capture now, keep Sidecar work focused, run
> the full audit as its own dedicated effort. This is a faithful capture of a
> voice brain-dump — treat details as the owner's intent, verify before acting.

## The north star (the actual problem)
Reduce the friction between **thought → action**. The owner keeps building
useful v0.9 systems, then loses the thread / forgets where things were. Goal:
get each system to a **usable v1**, then have 1–2 agents periodically propose
implementation plans (owner says yes/no) so building compounds instead of scatters.

## The systems (purpose in one line each)
- **Headbox** — vendor-neutral agent-instruction + governance layer (syncs
  CLAUDE.md / AGENTS.md / GEMINI.md + rules across harnesses; `checkpoint`,
  "where are we" commands; CLI; multi-person governance). *Likely open-sourced.*
- **Caspera** — the owner's personal AI-assistant platform + orchestration ("world's
  best PM / EA cracking the whip"). Also a team UI (would replace Asana usage).
  Subsystems: **Abulia** (autonomous/assisted decision-making for analysis
  paralysis), **Arbor** (branches), **Collab** (agent↔agent collaboration protocol),
  **Overlock** (thread management), **Anasa** (agent+human project mgmt on top of
  Asana; own DB+API+real-time inbox; mirrors all Asana tasks).
- **SteadyStars** — the product to **sell** (revenue). **SS Avengers** = the agent
  persona team that runs it (personas already defined; missing recurring steps +
  access). These personas generalize to run every other project under Caspera + **Reva** (COO agent).
- **Flux** — the owner's personal operating system / hyper-personal context layer +
  UI (journal, calendar, where focus is vs should be). Caspera plugs in; Flux can be
  its own proactive context-gathering agent. Subsystems: **Tabatha** (this repo —
  browser+mobile activity/context + team time-tracking; **live**), **Flux
  screensaver** (awareness/clock; done).
- **Agent Vault** — lost-thread recovery (Antigravity); infra largely **rolled into
  Headbox**.
- **Heimdall / Bifrost** — fleet control plane + SSH bridge; cross-machine dispatch
  so agents can drive multiple machines/VPS autonomously (CLI + UI). *Believed ~done.*
- **Bond** — relationship app + AI. **Explicitly deprioritized** (focus risk).

## How they compound (owner's intent)
Headbox (governance) + Caspera (orchestration) + its subsystems + Anasa
(agent/human task layer) → an execution system pointed at the products. Anasa's
DB/API means agents don't depend only on a heartbeat — some run on real-time
task/comment inboxes. Tabatha + Flux feed personal/work context. SS Avengers run
SteadyStars first, then any project.

## Owner's requested deliverable (the full audit — NOT done here)
"Look at everything — every folder, every Asana task status, all code + plans +
timelines — and tell me what's **actually** close to a usable v1, what unlocks the
others, and map dependencies by order-of-magnitude impact + cascading effects."
Then have agents auto-propose implementation plans for periodic yes/no approval.

**Why it's parked:** it spans many repos **and machines** — some data is only on
the **old machine** (needs **Heimdall/Bifrost** to reach) — plus all Asana tasks
and years of call transcripts. It deserves a dedicated run with multi-machine
access, an interview pass with the owner, and its own output (a portfolio map +
prioritized roadmap). Doing it inside a feature session would be exactly the
focus-scatter to avoid.

## Immediate bridge to current work
**Anasa** is the one node that touches today's Sidecar work: it already mirrors
Asana and is built for agent/human task collab, so it's a candidate source for the
Sidecar task integration (Plan 040, Epic 3) — pending the Anasa-vs-Asana review.

## Adjacent asks captured (for the audit track)
- Process the owner's **years of call transcripts + Google Drive docs** into a
  context web **over time** (cost-gated, incremental) — like the ~200 SteadyStars
  calls already synthesized.
- Stand up a **second brain / better memory system** (Flux DB + Caspera/Anasa DB on
  the same Supabase project; Anasa ingests all Asana tasks).
- Machine posture: powerful daily-driver + always-on (less stable) machine + VPS;
  possibly a Mac laptop; Heimdall + Chrome Remote Desktop to patch in. Consider
  Hermes / OpenClaw for an always-on autonomous agent.
