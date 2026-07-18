# Companion Local Socket — Authentication Gap (scoped fix)

**Status:** open · known limitation, disclosed on the showcase companion card
**Component:** `tabatha-desktop` · `src-tauri/src/ws_server.rs`
**Assessed:** 2026-07-16 · companion v0.2.0
**Severity:** High on a shared/multi-user machine; Moderate on a single-user desktop

---

## The gap

The companion's WebSocket server accepts **any** connection with no authentication of
any kind.

- `src-tauri/src/ws_server.rs:312` — binds `SocketAddr::from(([127, 0, 0, 1], 9147))`.
  This is the one thing that is right: it is **loopback-only** and is never exposed to
  the LAN or the internet.
- `src-tauri/src/ws_server.rs:325` — `listener.accept()` accepts every peer.
- `src-tauri/src/ws_server.rs:335` — `accept_async(stream)` completes the WebSocket
  handshake **without inspecting a single header**. No `Origin` check, no token, no
  peer-process check. The connection is then fully privileged.

The extension side has no credential to offer either:
`src/background/constants.js:155` → `COMPANION_WS_URL = 'ws://localhost:9147'`, opened
at `src/background/services/companionService.js:57` with a bare
`new WebSocket(COMPANION_WS_URL)`. **This is why auth cannot be bolted on unilaterally** —
any change that requires a credential breaks the shipped bridge until both sides ship
together.

## What an attacker can actually do today

Two distinct attackers, with very different reach.

### 1. Any web page you visit (the serious one)

WebSocket connections are **not subject to the same-origin policy** and are not
preflighted by CORS. Any page — an ad iframe included — can run
`new WebSocket('ws://localhost:9147')` and, because the server ignores `Origin`, be
accepted. The browser *sends* `Origin: https://evil.com`; the server simply never looks.

Once connected, that page can:

| Capability | Handler | Impact |
|---|---|---|
| **Silently enable OS screen capture** | `CaptureConfig` → `ws_server.rs:480-504` | `{"type":"CAPTURE_CONFIG","enabled":true,...}` turns on the GDI capture engine on a machine where the user has it **off**. This is the worst of it. |
| **Neuter redaction** | same handler, `sensitive_rules` | Attacker-supplied rules replace the user's, so frames that would have been redacted are written in the clear. |
| **Redirect where frames are written** | same handler, `capture_dir` | Frames land in an attacker-chosen directory. |
| **Read activity + clock data** | `RequestSummary` `:452`, `GetClockState` `:445`, plus the `APP_SWITCH` broadcast stream | Leaks every app name and window title — a live feed of what you are doing. |
| **Forge time records** | `ClockIn` `:427`, `ClockOut` `:433`, `ToggleBreak` `:439` | Corrupts the timeclock, which syncs to the org. |
| **Write files** | `CaptureFrame` `:519`, `WriteExport` `:534` | Constrained but real — see below. |

Note the page cannot *read back* the captured frames over this socket (there is no
"read frame" message), so this is not directly a screen-exfiltration primitive. It is a
**"turn the victim's camera on and point it somewhere"** primitive, which is bad enough:
capture is precisely the feature the privacy policy promises is off unless *you* turn it on.

### 2. Any local process running as your user

Everything above, plus it can forge any `Origin` header, so header checks do not contain it.
In fairness, a process already running as you has other options — but it should not get a
turnkey, documented screen-capture switch.

### What is *not* wrong

- **Not network-exposed.** Loopback bind is correct; no remote host can reach 9147.
- **Path traversal is already handled.** `CaptureFrame`/`WriteExport` route through the
  `safe_components` guard (`ws_server.rs:~640`), and `decode_data_url` (`:661`) accepts
  base64 only. Writes are confined to the capture/export dirs — a nuisance (disk fill,
  junk files), not arbitrary filesystem write.
- **No keylogging.** There is none in the codebase, on any branch.

## The minimal correct fix

Staged, so the zero-breakage half can ship immediately.

### Stage 1 — `Origin` allowlist (ship now, breaks nothing)

Replace `accept_async` at `ws_server.rs:335` with `accept_hdr_async`
(`tokio-tungstenite 0.24`, already the pinned dep — no new crate) and reject the
handshake unless `Origin` is either absent or an allowlisted `chrome-extension://<id>`.

Rationale: Chrome sends `Origin: chrome-extension://<id>` from the extension service
worker, and `Origin: https://…` from a web page. A header check therefore **fully closes
attacker #1 — the drive-by web vector — without the extension changing one line**, since
the extension already sends a conforming Origin. This is the high-value, low-risk half.

Absent-Origin must be allowed for now (native/CLI callers, tests) or tolerated behind a
setting; that is the deliberate seam that leaves attacker #2 open until Stage 2.

### Stage 2 — handshake token (needs both sides, ship together)

1. Companion generates a random token at first run, stores it in its settings dir
   (`settings.rs`) at user-only permissions.
2. Companion surfaces it in the debug panel / tray ("Pair with extension").
3. User pastes it into Tabatha settings once; extension sends it as a subprotocol
   (`new WebSocket(url, ['tabatha.v1', token])`) or a first-frame `AUTH` message.
4. Companion rejects any connection that has not authenticated within N seconds.

A first-frame `AUTH` handshake is the friendlier of the two — it lets the server return a
clean typed error instead of an opaque handshake failure, and keeps old extensions working
during a grace period if `require_auth` defaults to false for one release.

### Stage 3 — defence in depth

- Gate `CAPTURE_CONFIG{enabled:true}` behind an explicit **local** user confirmation
  (tray prompt), so no remote message alone can ever start capture. Arguably worth doing
  even with auth: capture is the one action where a confirm dialog is proportionate.
- Rate-limit `CLOCK_IN`/`CLOCK_OUT`.
- Log rejected handshakes.

## Recommended sequencing

Stage 1 now (self-contained, no coordination, kills the web vector) → Stage 3 capture
confirm → Stage 2 with the next paired extension+companion release. Until Stage 2 lands,
the honest public framing is: **local-only interface, authentication hardening in progress.**
