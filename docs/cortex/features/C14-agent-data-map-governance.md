# C14 — Agent Data Map & Governance

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: user — mandatory
Phase: Phase 1

## Purpose
The single authoritative map of everything Cortex (and everything before it) captures, so every downstream agent knows exactly what signals exist, where they live, and what access contract governs them. Without this, agents can't safely leverage the new capture data.

## Key behaviors
- **New data catalog** — author `docs/cortex/DATA-MAP.md` documenting every signal: source, storage (local/cloud), partition (personal/org), retention, redaction state, and agent access contracts.
- **Fold in prior sources** — every pre-Cortex data source is included so agents have one map, not many.
- **Update `.headbox/workspace-map.md`** — add `docs/cortex/**`, capture storage locations, and the new services.

## Dependencies
- C1/C2/C3/C4 — the sources and storage this map documents.
- C11 (Cross-Signal Attention Accounting) — new external signals must be added as they land.
- All clusters — every agent reads this as a shared contract.

See also: [DATA-MAP.md](../DATA-MAP.md).
