# C1 — Adaptive Capture Engine

Status: stub — Fable to expand
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: video V1; user-expanded
Phase: Phase 1

## Purpose
The SENSE layer's capture brain. Instead of blind interval screenshotting, C1 uses the context Tabatha already collects (tab switch, window switch, focus/intent change, idle) to decide *when* a frame is actually worth taking, and hands capture between the browser extension and the desktop companion so the same moment is never captured twice.

## Key behaviors
- **Context-driven timing** — existing signals decide when to capture; fixed 5–10s interval (configurable) is only a dwell-time fallback while the user stays in one window.
- **Browser⇄OS handoff** — extension captures the visible tab on tab-switch + dwell-interval; when Chrome loses focus, the companion takes over OS capture. No double-capture.
- **Multi-monitor / aspect-ratio aware** — capture full virtual desktop, each screen as a separate timestamped image, or a specific window in isolation (critical for ultrawide + mixed-ratio setups).
- **Manual screen recording** — on-demand video + system audio + mic from both extension (`getDisplayMedia`/`tabCapture`) and companion (OS capture). PC first; Mac later.
- Reuse: `companionBridge` focus signal, `chrome.tabs.captureVisibleTab`, companion `window_monitor`.

## Dependencies
- C2 (Sensitive-Data Guard) — must filter/redact BEFORE any frame is persisted.
- C3 (Storage & Retention Fabric) — receives captured frames.
- C4 (Observations Ledger) — capture references land here.
- C11 (Cross-Signal Attention Accounting) — consumes companion signals.
