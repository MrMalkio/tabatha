# C13 — Environment & Mobile

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: video V13; user
Phase: Phase 5

## Purpose
Extends Cortex's observation beyond the screen into the physical environment and onto the phone, applying the same ledger/redaction model to new capture surfaces.

## Key behaviors
- **Ergonomic camera** — optional desk-cam capture every 5–10s over 3–7 days → posture / glare / monitor-height feedback.
- **Mobile** — phone-side screenshot + audio tracking (future) using the same ledger and redaction model.

## Dependencies
- C2 (Sensitive-Data Guard) — redaction model applies to camera/phone surfaces.
- C3 (Storage & Retention Fabric) — stores environment/mobile captures.
- C4 (Observations Ledger) — new surfaces feed the same ledger.
