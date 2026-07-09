# C8 — Agent Orchestration & Routing (Autonomy Ladder)

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: user
Phase: Phase 1 (cron-in-harness) / Phase 2+ (higher tiers)

## Purpose
The routing/execution backbone that decides *which* AI runs the optimization work and *how* autonomously. An escalating ladder: start with the cheapest, most local option (cron-in-harness) and climb toward hosted, team-billable, fully-proactive tiers.

## Key behaviors
- **Escalating routing tiers** — ① cron-in-harness (Tabatha writes a scheduled task/script into the user's Claude Code / Codex harness, reading the local ledger) → ② backend proxy (Supabase edge fn / flux-asana-widget holds the key; team billing/batch) → ③ Vercel AI Gateway (fallbacks, observability, zero-retention) → ④ BYOK (user pastes own key).
- **Headbox integration** — leverage Headbox's governance of installed harnesses; companion reads harness folders to place/inspect scheduled tasks.
- **Proactivity config** — reactive (dashboard yes/no) ↔ proactive (agent acts overnight and presents results next morning).
- **Master system prompts** — first-class versioned artifacts in `docs/cortex/prompts/`.

## Dependencies
- C6 (Optimization Loop) — the workload C8 routes.
- C7 (Recommendation & Action Layer) — approved actions execute through C8.
- C4 (Observations Ledger) — cron-in-harness reads the ledger export.
- C15 (Config & Interaction-Density Model) — selects routing tier and proactivity level.
