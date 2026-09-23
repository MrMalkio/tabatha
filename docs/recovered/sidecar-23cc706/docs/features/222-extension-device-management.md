# Feature #222 — Device Management in the Extension

**Status:** in build (Cirra, 2026-07-21)
**Source:** Malkio, 2026-07-21, after the pause-lockout incident
**Related:** migration 045 (device naming/pause/per-device settings), Sidecar
DevicesCard, device-signout edge fn, Sidecar 0.13.3 (self-resume + revoked filter)

## Why

2026-07-21 incident: Malkio paused the Sidecar device he was signed into. The
paused screen had no self-rescue ("resume from another device" only), the
extension had **no device UI at all**, and while trying to recover he paused his
other devices too — full lockout, resolved only by signing out of everything.
Sidecar 0.13.3 fixed the self-rescue and list hygiene; this feature closes the
other gap: the extension — the primary surface — must be able to manage devices.

## Scope (v1)

A **Devices** section in extension Settings, parity with Sidecar's DevicesCard:

- List all of the account's devices (`browser_profiles` where `revoked_at IS
  NULL`), grouped one-row-per-physical-device, newest first; mark "this device".
- Rename (`display_name`), pause/resume (`paused`), remote sign-out
  (device-signout edge fn — session revocation, then row shows revoked and
  disappears from lists).
- Device kind picker (`device_settings.kind` — phone/tablet/desktop/watch/
  browser) for parity with Sidecar 0.13.0.
- **Pause honor on the extension itself is SOFT**: a banner with a one-tap
  Resume — never a hard block. Lesson of the incident: pause is a user
  convenience flag, not a security boundary; self-rescue must always exist on
  every surface.
- Settings-search index entries for the new section (settingsSearch.js).

## Out of scope (v1)

Per-device settings editor beyond `kind`; device-priority categorization
(Fix Wave 3 follow-on); org/team device views (Olympus).
