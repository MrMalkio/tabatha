# Sticky Note: Desktop Companion Status

**Left by:** Antigravity (2026-05-10) · **Updated:** Claude (2026-06-30, v6.4.0 deploy)
**For:** Next agent working on Desktop Companion / Phase B

## Update 2026-06-30 — Companion v0.1.0 PACKAGED (Plan 019)

The companion is now **built + packaged for distribution**:
- Installers produced: **`.msi` + `setup.exe`** (`Tabatha-Desktop-Companion_0.1.0-setup.exe`, `Tabatha-Desktop-Companion_0.1.0.msi`).
- Install-folder creation + **dummy-proof guided install**.
- **Supabase-Storage auto-update** — key-guard + atomic swap.
- **23 Rust tests** green. **Rust + VS Build Tools now installed on OD** (the other dev machine).
- Tracked in `.headbox/plan-registry.md` under Plan 019 (distribution) — status `partial`.

## Status (original, 2026-05-10)

The Tabatha Desktop Companion (`c:\Users\mrmal\Le Dev\tabatha-desktop\`) is **built and verified**.

- Binary compiles: `src-tauri\target\debug\tabatha-desktop.exe`
- WebSocket server on `:9147` — confirmed with live APP_SWITCH events
- Extension bridge wired: `src/background/companion-bridge.js`
- Idle suppression working: off-Chrome apps don't trigger false idle

## Repos

- **Desktop companion:** `c:\Users\mrmal\Le Dev\tabatha-desktop\` (separate git repo, `master` branch)
- **Extension bridge code:** `c:\Users\mrmal\Le Dev\Tabatha\` (on `feat/follow-through-engine` branch)

## What's Next (Phase B)

1. Embed `CompanionStatus` widget in Home dashboard header
2. Bidirectional clock sync (extension <-> companion)
3. Focus matching (window title -> focus item correlation)
4. `UnifiedTimeline.jsx` — merged browser + desktop activity view
5. Add `Antigravity.exe` to categorizer as "development"
6. Fix `uptime_ms` always being 0

## Key Artifacts

- Implementation plan: `C:\Users\mrmal\.gemini\antigravity\brain\f7e02d91-5c49-439b-a379-078ca7ccfe7d\implementation_plan_001.md`
- Data breakdown: `C:\Users\mrmal\.gemini\antigravity\brain\f7e02d91-5c49-439b-a379-078ca7ccfe7d\data_breakdown.md`
- Walkthrough: `C:\Users\mrmal\.gemini\antigravity\brain\f7e02d91-5c49-439b-a379-078ca7ccfe7d\walkthrough.md`

## Warning

The `tabatha-desktop` repo is OUTSIDE the Tabatha workspace. Use `cd c:\Users\mrmal\Le Dev\tabatha-desktop` for Rust/Tauri work. Extension bridge code lives in the main Tabatha workspace.
