# C2 — Sensitive-Data Guard

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: user; privacy spine
Phase: Phase 1

## Purpose
The privacy spine that sits between capture and persistence. C2 decides whether a given frame may be written at all, and redacts sensitive regions at capture time — before the image ever touches disk — so the ledger keeps useful "which page / which client" context without ever recording the client's private/identifying data.

## Key behaviors
- **Global opt-out** — wire the currently inert `screenshotCapture` toggle; per-user control on the personal profile.
- **Per-site/app suppression** — when a designated app/site (e.g. QuickBooks) is the *focused* window, skip capturing that frame — but keep capturing other tabs/windows when it is not focused.
- **Capture-time auto-redaction** — blur a configurable region (e.g. bottom 80% of a QuickBooks tab) before the image is written. The privacy risk is client-ID + private-info *together*, not "which client."
- **Sensitive workstyle profiles** — finance/legal presets that auto-deactivate capture for known-sensitive contexts.

## Dependencies
- C1 (Adaptive Capture Engine) — C2 runs inline on C1's capture path before persist.
- C3 (Storage & Retention Fabric) — only guard-approved, redacted frames are stored.
- C15 (Config & Interaction-Density Model) — surfaces redaction rules and suppression lists.
