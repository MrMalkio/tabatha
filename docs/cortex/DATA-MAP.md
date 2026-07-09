# Cortex — Agent Data Map (C14)

Status: stub — Fable to populate
Parent: [Program Spec](./00-cortex-program-spec.md) §9 · Cluster: [C14](./features/C14-agent-data-map-governance.md)

The authoritative catalog of every signal Cortex (and every pre-Cortex source) captures: where it lives, which partition it belongs to, how long it is retained, its redaction state, and the access contract for downstream agents. Every agent leveraging Tabatha data reads this map. Fable to fold in all prior data sources from Program Spec §3 and populate retention/redaction/access-contract columns.

| Signal | Source | Storage (local/cloud) | Partition (personal/org) | Retention | Redaction | Agent access |
|--------|--------|-----------------------|--------------------------|-----------|-----------|--------------|
| Active-window poll (app, title, category, idle) @1s | `tabatha-desktop/…/window_monitor.rs` | local (companion SQLite) | both | TBD | none | TBD |
| Screen capture frames (browser tab + OS) | C1 Adaptive Capture Engine | local-first → external archive (C3) | both (separate) | time + free-space (C3) | capture-time region redaction (C2) | TBD |
| Behavioral telemetry (intent, focus, clock, tabs, domains) | `src/background/services/*` | local + cloud batch (syncService) | both | TBD | none | TBD |
| Dictation / voice notes | C9 Voice & Audio | local → ledger/context | personal | TBD | TBD | TBD |

> Columns are the frozen schema; rows above are seed examples from the reuse map (Program Spec §3). Fable: complete every source, set real retention/redaction/access values, and keep in sync with `.headbox/workspace-map.md`.
