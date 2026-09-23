# Extension 6.7.83 — isolated Chrome smoke verification

Status: PASS for the built extension's offline local runtime. This is not a backend deployment or cross-device sign-in test.

## Candidate and isolation

- Tested 2026-09-23 19:47:13–19:47:20 UTC in Chrome 153.0.8010.53.
- Candidate: integration `dist/`, manifest version `6.7.83`, pinned extension ID `hoknmoclnhccpgofpdihmiadmnmejjod`.
- Integration HEAD observed after test: `d9d7d478610d94538f5d63e5829c393b1882c7e1`.
- Built `dist/assets/background.js` SHA-256: `0fead2e483d1f1bd711715c42a286eeb591d62232abcd4c14860448b39848c82`.
- Launched a new temporary profile at `C:\Users\mrmal\AppData\Local\Temp\tabatha-smoke-bqwTPH`; no existing Chrome profile or account was used.
- Loaded the actual unpacked build through CDP `Extensions.loadUnpacked` with `--enable-unsafe-extension-debugging`.
- Attached to targets before their scripts resumed, blocked HTTP/HTTPS/WebSocket network traffic, and configured DNS resolution to fail. Confirmed the companion remained disconnected and no Supabase authentication session existed.
- Closed the isolated browser gracefully with CDP `Browser.close`. No Chrome force-kill or real-profile mutation.

## Verified behavior

- Service worker boots and reports the expected manifest/version.
- Home, sidebar, settings, popup, work shifts, and activity editor each mount their React root and render meaningful content and controls.
- Screenshots captured for all six surfaces; home screenshot inspected visually, with the greeting, clock, controls, and main sections rendering cleanly at the test viewport.
- Chrome local-storage writes succeed in the isolated profile.
- Runtime messages return successfully: clock in, clock status, start focus, pause, resume, break on/off, complete focus, clock out, and clock history.
- A focus started through the service worker appears on Home through the real broadcast path.
- Paused focus state survives a Home page reload.
- Completed focus is no longer active; clock-out leaves the session inactive and archives a shift.
- No uncaught JavaScript exceptions were captured during the run.

## Limits and evidence

Cloud authentication, live pairing, cross-device synchronization, companion integration, and a real-user extension reload remain outside this isolated check. In particular, this result does not approve the separately recovered pairing backend; its review findings remain open.

Local evidence is under `output/playwright/`: `extension-smoke.mjs`, `extension-smoke-report.json`, and `extension-{home,sidebar,settings,popup,workshifts,activity}.png`.

The initial harness run incorrectly assumed clock-out removed `clockedInAt`. The production contract retains the historical timestamps and sets `session.active = false`; correcting the assertion produced the final passing run. No product code was changed for this check.
