# C3 — Storage & Retention Fabric

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: user
Phase: Phase 1

## Purpose
The STORE layer. C3 owns where raw frames/audio live, how they get archived externally, how personal and organizational captures stay separated, and how retention is enforced. Local-first by default; cloud/external is a backup path, never the default.

## Key behaviors
- **Local-first** — all raw frames/audio kept on-machine by default at a configurable path.
- **External archival** — auto-archive to Google Drive / OneDrive / external HDD when available; configurable target with graceful fallback to the local path.
- **Personal ⇄ Org partition** — personal captures archived separately and never sent to the org; org-level capture = everything while clocked in.
- **Dual retention plans** — personal retention user-controlled; org retention admin-controlled, driven by both time and free disk space.

## Dependencies
- C1 (Adaptive Capture Engine) — source of frames/recordings.
- C2 (Sensitive-Data Guard) — only guard-cleared frames are handed here.
- C4 (Observations Ledger) — stores capture references pointing at C3 assets.
- C14 (Agent Data Map & Governance) — documents storage locations and retention.
