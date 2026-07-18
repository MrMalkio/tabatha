# Implementation Plan 041: Tabby Watch — Wear OS companion for Galaxy Watch 6 (v0.1.0)

**Surface:** Tabby Watch (new repo `tabatha-watch`) · **Current version:** none · **Target on completion:** v0.1.0
**Date:** 2026-07-18 · **Owner:** Soren (Opus, Tabatha fleet) · **Target device:** Samsung Galaxy Watch 6 — Wear OS 4 (API 33/34), Kotlin + Jetpack Compose for Wear OS
**Repo:** `C:\Users\mrmal\le dev\tabatha-watch` → `github.com/MrMalkio/tabatha-watch` (private)

> Status: **DESIGN → BUILD.** This doc is written first, self-reviewed (§10), then
> executed. Definition of executable-done for v0.1.0: `gradlew assembleDebug` green
> + ViewModel timer-math unit tests green. No physical watch attached, so the build +
> tests are the acceptance gate; sideload/pairing is Malkio's manual step.

---

## 1. Framing — what a watch adds to the Attention OS

Tabatha already lives on three surfaces: the Chrome extension (the brain), the
Windows desktop companion (passive activity capture), and Tabby Sidecar (the phone,
an Expo RN-web app at `tabatha.pondocean.co/sidecar`). Each is a **window onto the
same `focus_items` row** — the one thing you're working on now, with a countdown.

The watch is the most **glanceable** surface of them all and the one most present on
the body. Its job is not to reproduce the sidebar. On a 1.5" round screen the honest
scope is: *see the current focus and its timer at a wrist-flick, and take the three or
four actions you'd otherwise pull your phone out for* — check a progress note in,
extend by five, pause, resume, clock out. Everything else (queue grooming, editing,
tasks/Asana, timeline) stays on the phone and desktop where there's room. This is the
**Progressive Simplicity** principle from Plan 040 applied hard: the watch is the
smallest possible expression of a focus.

The watch reads and writes the **same `tabatha` Postgres schema** every other surface
uses (`https://mtdgoahskcibjbhfvofx.supabase.co`, PostgREST + Realtime), so a
checkpoint added on the wrist shows up in the extension sidebar and the phone Context
View within a second, and a focus started in the extension is on the wrist by the time
you look down. No new "watch state" — it's the same object graph.

## 2. Domain model the watch binds to (from the Sidecar source)

Read directly from `sidecar/src/data/*` — the watch mirrors these exactly so behaviour
matches across surfaces.

- **`focus_items`** (schema `tabatha`): `id, profile_id, client_id, label,
  funnel_stage, focus_state ('active'|'paused'|'completed'), timer_minutes,
  priority, tags(JSONB), created_at, completed_at, browser_profile_id`.
  Tags of interest: `realm`, `_src` ('sidecar' etc.), `_off` (off-computer),
  `_startedAt` (ISO), `_elapsedMs` (frozen elapsed while paused), `_parent`
  (client_id of parent → sub-intent), `_backburner`, `_snoozeUntil`.
- **`focus_events`** (migration 034): `(id, profile_id, focus_client_id, kind
  ('start'|'pause'|'resume'|'resolve'|'extend'|'snooze'), at, source, meta)`.
  Best-effort append; the interval-pairing (`start|resume` → next `pause|resolve`)
  yields time-worked. The watch writes `start/pause/resume/resolve` with
  `source:'watch'`.
- **`focus_checkpoints`** (migration 032): `(id, profile_id, focus_client_id, text,
  progress_level, created_at, source)`. Progress levels are a **fixed canned set** —
  the watch reuses them verbatim so a wrist checkpoint reads identically elsewhere:
  `none 😐 · little 📈 · lot 🚀 · almost_done 🏁 · stuck 🚧`.
- **`browser_profile_status`** (migration 010/011, in realtime): per-device presence +
  `metadata` JSON. Sidecar's Phone Focus Mode writes `metadata.focusAway`. The watch
  reads this to surface **phone-away awareness** (§5.6) and can optionally write its
  own presence row so the phone/TV Context View can show "on the watch".

### 2.1 Timer semantics (must mirror `focus.ts` exactly)

This is the one piece of logic the watch re-implements client-side, so it must match
byte-for-byte or the countdown will disagree with the phone. From `elapsedMsOf`:

- **active**: `elapsedMs = now − startedAt` where `startedAt = tags._startedAt ??
  created_at`.
- **paused**: `elapsedMs = tags._elapsedMs` (frozen). Fallback to `now − startedAt`
  only if `_elapsedMs` is absent/NaN.
- **pause** freezes: writes `tags._elapsedMs = max(0, now − startedAt)`,
  `focus_state='paused'`.
- **resume** rebases: writes `tags._startedAt = new Date(now − _elapsedMs)`,
  `focus_state='active'` (so elapsed continues where it left off — never restarts).
- **remaining** = `timer_minutes*60000 − elapsedMs`; may go negative → **overtime**.
- **extend(+5)**: `timer_minutes += 5` (and a `focus_events 'extend'` row with
  `{addedMinutes, fromMinutes, toMinutes}`).

The watch's `TimerEngine` (pure Kotlin, §7.3) reproduces exactly this, and its unit
tests assert the freeze-on-pause / rebase-on-resume invariants against hand-computed
millisecond values.

### 2.2 "Current focus" selection (mirror `useFocus`)

The Sidecar picks the current focus data-driven, not device-pinned: an `active`
non-backburner focus wins; else the most-recent `paused` non-backburner focus; else
none. The watch uses the **same** rule (active-beats-paused, most-recent by
`startedAt`) so wrist and phone always agree on "what am I doing". No local pin on the
watch — it's a viewer, and pinning is a phone/desktop concern.

## 3. Non-goals for v0.1.0 (explicitly on the phone/desktop, not the wrist)

- Queue grooming / reordering / priority editing.
- Creating a brand-new intent from scratch by typing (voice-only quick-add is a
  *stretch*, §5.7; text entry on a watch is a non-starter).
- Tasks / Asana / sub-intent trees / timeline / Context View customization.
- Editing focus label or timer target beyond `extend +5`.
- Backburner management, snooze.
- Auth with a password (categorically forbidden — see §6).

These are deliberate. Shipping the four core wrist actions well beats a cramped
port of the sidebar.

## 4. Interaction model (round 1.5" AMOLED, rotating bezel, one-/zero-hand)

Galaxy Watch 6 has a **capacitive rotating bezel** (touch-ring; the physical bezel is
the Classic — 6 non-Classic uses the touch bezel, but Wear OS surfaces both as
rotary input events) plus two side buttons (Home, Back). Design consequences:

- **Rotary input drives vertical scroll.** Compose for Wear OS `ScalingLazyColumn`
  consumes rotary events natively → the bezel scrolls the action list without the
  finger covering the screen. This is the primary one-handed affordance.
- **`Vignette` + `TimeText` + `PositionIndicator`** (Wear Compose `Scaffold`) — curved
  top clock, edge scrollbar, faded top/bottom so content reads on the round display.
- **Big tap targets.** Minimum 48dp; primary actions are full-width `Chip`s, not icons
  crammed in a row. The countdown ring is the hero and is never a tap target itself
  (avoids fat-finger misfires).
- **Ambient mode (always-on).** The watch spends most of its life ambient. In ambient
  we render a **burn-in-safe** low-luminance version: focus label (1 line, truncated),
  a monochrome ring outline, and remaining time as text. No animation, ≤ shifted a few
  px on the AOD refresh. Interactive mode brings back color + the live ring.
- **Zero-hand glance.** The whole point: raise wrist → AOD already shows label +
  remaining. No tap needed for the 90% "am I still on track?" case. Tap only to *act*.
- **Confirmations.** Resolve (complete) and Clock-out get a Wear `Confirmation`
  overlay (swipe-to-dismiss friendly), because they're the destructive/irreversible
  ones. Extend/pause/resume are one-tap, no confirm (cheap to undo).

### 4.1 Screen map

```
┌─ Focus screen (home) ───────────────┐   the hero, always first
│  TimeText (curved clock)             │
│        ⟳ countdown ring              │   ring fills as timer elapses;
│     "Draft the Q3 deck"              │   turns amber when paused,
│        12:04 left                    │   red pulse in overtime
│     [ realm chip ]                   │
│  ·  scroll (bezel) for actions  ·    │
├─ Action list (ScalingLazyColumn) ────┤
│  [ + Checkpoint ]                    │→ progress-level picker screen
│  [ ⏸ Pause ] / [ ▶ Resume ]          │
│  [ +5 min ]                          │
│  [ ✓ Done ]                          │→ Confirmation
│  [ 🕐 Shift: 3h 12m ]                │→ Clock screen
└──────────────────────────────────────┘
   Empty state (no active/paused focus):
   "Nothing in focus" + [ 🎙 Quick add ] (if voice available) + shift chip.
```

- **Checkpoint screen:** 5 big chips (the canned progress levels, emoji + label),
  tap one → writes a `focus_checkpoints` row with empty text (level-only is a valid,
  fast wrist checkpoint) → Confirmation tick → back to Focus. Optional: a "🎙 add
  note" row that opens the system voice-input IME to attach text (§5.7).
- **Clock screen:** shows shift elapsed + Clock in / Clock out (writes to the same
  clock table the Sidecar reads; see §7.4 for the exact table binding, resolved at
  build time from the Sidecar clock source).

## 5. Feature scope v0.1.0

### 5.1 Glanceable current focus + timer ring (hero)
Bind current focus (§2.2). Ring = `elapsedMs / (timer_minutes*60000)` clamped visual,
with the label, remaining time, realm chip, and state color (green active / amber
paused / red overtime).

### 5.2 Checkpoint quick-add with canned progress levels
5-chip picker → `focus_checkpoints` insert (level required, text optional). This is the
single highest-value wrist action: log "made progress 🚀" in two seconds without the
phone.

### 5.3 Extend +5
`timer_minutes += 5` + `focus_events 'extend'`. One tap, no confirm.

### 5.4 Pause / Resume
Freeze/rebase per §2.1 + `focus_events`. One tap. The ring goes amber on pause.

### 5.5 Clock in / out
Shift elapsed glance + toggle. Binds to the Sidecar's clock source (§7.4).

### 5.6 Phone-away awareness (read-only, glance)
Read `browser_profile_status.metadata.focusAway` over Realtime. When the phone signals
"focus away / put the phone down", the watch shows a small calm indicator on the Focus
screen (a dot + "phone down" caption) — *not* an alarm; the watch's presence is the
whole point of putting the phone away, so it stays gentle. No buzz.

### 5.7 Voice checkpoint note (stretch, ship if trivial)
Wear OS exposes the system voice input via `RemoteInput` / the input-method speech
button. For a checkpoint's optional text we launch the platform speech IME
(`ACTION_RECOGNIZE_SPEECH` or a `RemoteInput` on the notification-style input) and take
the returned string. This is "trivial" because it's a system intent, not our STT. If
the intent isn't resolvable on the device, the note field simply isn't offered — the
level-only checkpoint still works. **No custom audio capture, no server STT** in
v0.1.0.

### 5.8 Tile + complication (strongly-encouraged addition — in scope)
- **Tile** (`androidx.wear.tiles` + `ProtoLayout`): a swipe-left glanceable card
  showing current focus label + remaining + a mini ring, with two tap zones
  (open app / +5). Refreshed via `TileService` freshness + on Realtime change through
  a lightweight refresh request. This is the "don't even open the app" surface.
- **Complication** (`androidx.wear.watchface.complications.datasource`): a
  `SHORT_TEXT` + `RANGED_VALUE` complication provider exposing remaining minutes and
  ring progress, so the user can drop "focus remaining" onto their own watch face.
  Ranged value = elapsed/target; short text = "12m".

Both read the same cached current-focus snapshot the app maintains (§7), so they're
cheap and consistent.

## 6. Auth / pairing design — **never asks for a password**

**Hard constraint:** the watch app must never ask for, receive, display, or store the
user's password, and must not run the interactive OAuth/magic-link browser flow (a
1.5" screen can't, and typing a password on a watch is both forbidden and absurd). Yet
every read/write is RLS-scoped to the user, so the watch needs a **user-scoped session
token** (a Supabase GoTrue refresh token → short-lived access JWT) without ever seeing
a credential.

### 6.1 Chosen flow: phone-minted pairing code → token exchange (edge function)

The phone (Sidecar), already authenticated, is the **trust anchor**. It mints a
short-lived pairing code; the watch redeems it for its own refresh token via a new edge
function. Rationale for choosing this over the alternatives:

- **QR from phone → watch camera:** Galaxy Watch 6 has *no camera*. Rejected.
- **Watch shows code, type into phone:** watch can't display then the phone would push
  — more moving parts; and the watch would still need a channel to receive the token.
- **Bluetooth companion (Wearable Data Layer) from a phone app:** would require a
  *native Android phone app* to pair with; Tabby's phone surface is a **web** app
  (Sidecar), which cannot use the Data Layer API. Rejected for v0.1.0 (revisit if a
  native phone app ever ships).
- **Chosen — phone-minted numeric pairing code, watch types it once:** the phone shows
  a 6-digit code in Sidecar Settings ("Pair a watch"); the user reads it and enters it
  on the watch **once** using the Wear numeric input (6 taps, or voice "one two
  three…"). The watch POSTs `{code}` to an edge function that validates it and returns
  a **fresh refresh token** minted for that user. The watch stores the refresh token in
  encrypted `EncryptedSharedPreferences` (Android Keystore-backed) and from then on
  self-refreshes access JWTs via GoTrue `/token?grant_type=refresh_token`. The user's
  password is never involved at any step.

This is the standard "device authorization"/pairing pattern (like a TV app), adapted
so the *phone* is the authorizer rather than a web browser on a second device. Six
digits typed once on a watch is acceptable UX for a one-time pairing.

### 6.2 What CeeCee must apply/deploy (I have no deploy rights — SPEC only)

**Migration `tabatha.watch_pairing_codes`** (owner-RLS; codes are short-lived,
single-use):

```sql
-- CeeCee to apply. Schema: tabatha.
create table if not exists tabatha.watch_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null,                    -- the authing user (auth.uid())
  code_hash text not null,                     -- SHA-256 of the 6-digit code (never store raw)
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,             -- now() + interval '5 minutes'
  consumed_at timestamptz,                     -- set on successful redeem; single-use
  device_label text                            -- optional "Galaxy Watch 6"
);
alter table tabatha.watch_pairing_codes enable row level security;
-- Owner may insert/select/delete their own codes (the mint side, called from Sidecar
-- with the user's session). The redeem side runs in an edge function with the service
-- role and bypasses RLS.
create policy wpc_owner_all on tabatha.watch_pairing_codes
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create index on tabatha.watch_pairing_codes (code_hash) where consumed_at is null;
```

**Edge function `pair-watch`** (two actions; deployed with the service-role key as a
secret — same pattern as the existing `send-focus-push` fn):

1. **mint** (called by Sidecar with the user's JWT): generate a random 6-digit code,
   store `code_hash = sha256(code)`, `expires_at = now()+5m`, return the *raw* code to
   the phone UI only. (Could also be a Postgres RPC `mint_watch_pairing_code()` — either
   is fine; edge fn keeps parity with existing infra.)
2. **redeem** (called by the watch, unauthenticated but rate-limited): body `{code}`.
   Look up an unconsumed, unexpired `code_hash`; if valid, mark `consumed_at=now()`,
   then mint a **new user session** for that `profile_id` via the Admin API
   (`auth.admin.generateLink` / `createSession`-style: generate a session for the user
   and return `{ refresh_token, access_token, expires_at }`). The watch stores the
   refresh token. **The service-role key lives only in the edge function**, never on the
   watch.

Security notes for CeeCee's review: 6-digit code + 5-min expiry + single-use +
rate-limit on redeem (e.g. 5 attempts/code, lock after N global failures) keeps
brute-force impractical; codes are hashed at rest; the watch only ever holds a
*user-scoped* refresh token (same trust level as the phone already holds), never the
service role, never the password.

### 6.3 Sidecar side (small, separate follow-up — not in this repo)

Sidecar Settings gains a "Pair a watch" button → calls the `pair-watch` mint action →
shows the 6-digit code with a 5-minute countdown. That's a ~1-screen change to the
Expo app, owned by the Sidecar track, flagged here as a dependency. **Not built in
tabatha-watch.**

### 6.4 Build-time posture (no prod sessions minted by me)

Per the mission boundary, I do **not** mint sessions against prod user data during
development. The data layer is written against the real schema and the real anon key,
but for the **debug build and unit tests** it runs in one of two safe modes selected by
a build flag / missing-token fallback:

- **Fixture mode (default for debug):** a `FakeFocusRepository` serves a canned current
  focus + queue so the UI and timer render and can be exercised without any network or
  session. This is what the assembled debug APK shows on first launch before pairing.
- **Live mode:** activates only once a real refresh token exists in
  `EncryptedSharedPreferences` (i.e. after a real user pairs on-device). No token →
  fixtures. This means the shipped debug APK is safe to sideload and inspect without
  touching anyone's data until Malkio actually pairs.

## 7. Architecture

### 7.1 Module / package layout (single `:app` module for v0.1.0)

```
tabatha-watch/
  settings.gradle.kts, build.gradle.kts (root), gradle/ (wrapper), gradle.properties
  app/
    build.gradle.kts
    src/main/AndroidManifest.xml
    src/main/java/co/pondocean/tabbywatch/
      TabbyWatchApp.kt            (Application; DI wiring — manual, no Hilt for v0.1)
      MainActivity.kt             (ComponentActivity, setContent { WearApp() })
      ui/
        WearApp.kt                (Scaffold + nav between Focus / Checkpoint / Clock)
        FocusScreen.kt            (hero ring + action list)
        CheckpointScreen.kt       (5 canned-level chips)
        ClockScreen.kt            (shift + in/out)
        components/RingIndicator.kt, Chips.kt
        theme/ (Wear MaterialTheme colors/typography)
      data/
        model/Focus.kt, Checkpoint.kt, FocusEvent.kt   (data classes ↔ schema)
        FocusRepository.kt        (interface)
        SupabaseFocusRepository.kt(live: PostgREST + Realtime via OkHttp/ktor)
        FakeFocusRepository.kt    (fixtures for debug/tests)
        net/PostgrestClient.kt    (REST calls w/ apikey + Bearer JWT + schema header)
        net/RealtimeClient.kt     (WS subscribe to focus_items/events changes)
        auth/SessionStore.kt      (EncryptedSharedPreferences refresh token)
        auth/GoTrueClient.kt      (refresh_token → access JWT; pair-watch redeem)
      domain/
        TimerEngine.kt            (PURE — elapsed/remaining/overtime; §2.1)
        CurrentFocus.kt           (PURE — §2.2 selection rule)
      vm/
        FocusViewModel.kt         (StateFlow<FocusUiState>; ticks a 1s flow)
      tile/FocusTileService.kt    (androidx.wear.tiles)
      complication/FocusComplicationService.kt
    src/test/java/.../TimerEngineTest.kt, CurrentFocusTest.kt   (JVM unit tests)
```

Deliberately **no Hilt / no Room / no heavy DI** for v0.1.0 — a watch app this small is
better served by manual construction in `TabbyWatchApp`, keeping the build fast and the
APK lean. Networking: **OkHttp** (already the Android default, tiny) for REST + a raw
OkHttp `WebSocket` for Realtime; JSON via `kotlinx.serialization`. No Supabase-Kt SDK —
it pulls a large dependency graph and we only need three tables and one WS channel;
hand-rolling the PostgREST calls (with the `Accept-Profile`/`Content-Profile: tabatha`
schema headers and `apikey` + `Authorization: Bearer <jwt>`) is smaller and fully under
our control.

### 7.2 Data layer — PostgREST + Realtime, poll-and-subscribe

- **Reads:** `GET /rest/v1/focus_items?profile_id=eq.<uid>&order=created_at.desc`
  with headers `apikey: <anon>`, `Authorization: Bearer <access_jwt>`,
  `Accept-Profile: tabatha`. Same for `focus_checkpoints`.
- **Writes:** `PATCH /rest/v1/focus_items?id=eq.<id>` (pause/resume/extend),
  `POST /rest/v1/focus_checkpoints`, `POST /rest/v1/focus_events`, all with
  `Content-Profile: tabatha`.
- **Realtime vs poll — the battery decision (see §8):** the watch **does not hold a
  persistent WebSocket in ambient/background**. It subscribes to Realtime **only while
  the app UI is foregrounded** (the "I'm looking at it" window), giving instant updates
  during active use, and otherwise relies on a **cheap periodic refresh** (a single
  REST GET) driven by the Tile's freshness interval and an on-resume fetch. A watch is
  not a server; a always-on WS would wreck battery and the radio would drop it in doze
  anyway. This mirrors `useFocus`'s poll-plus-subscribe but flips the default to
  poll-when-away, subscribe-when-watching.

### 7.3 `TimerEngine` (pure, unit-tested — the heart of correctness)

Pure Kotlin object, no Android deps, so it runs on the JVM in `src/test`:

```kotlin
data class FocusSnapshot(
  val focusState: String,      // "active" | "paused" | "completed"
  val startedAtMs: Long,       // tags._startedAt ?? created_at
  val elapsedFrozenMs: Long?,  // tags._elapsedMs (nullable)
  val timerMinutes: Int,
)
object TimerEngine {
  fun elapsedMs(f: FocusSnapshot, now: Long): Long =
    if (f.focusState == "active") maxOf(0, now - f.startedAtMs)
    else f.elapsedFrozenMs?.coerceAtLeast(0) ?: maxOf(0, now - f.startedAtMs)
  fun remainingMs(f: FocusSnapshot, now: Long) =
    f.timerMinutes * 60_000L - elapsedMs(f, now)          // negative = overtime
  fun isOvertime(f: FocusSnapshot, now: Long) = remainingMs(f, now) < 0
  fun progressFraction(f: FocusSnapshot, now: Long): Float =
    (elapsedMs(f, now).toFloat() / (f.timerMinutes * 60_000f)).coerceIn(0f, 1f)
  // mutation helpers return the tag/state deltas the repo PATCHes:
  fun pausePatch(f: FocusSnapshot, now: Long): FocusPatch  // _elapsedMs=elapsed, state=paused
  fun resumePatch(f: FocusSnapshot, now: Long): FocusPatch // _startedAt=now-elapsed, state=active
}
```

Tests assert: active elapsed grows with `now`; pause freezes `_elapsedMs` to the
exact elapsed at pause; a subsequent resume rebases `_startedAt` so elapsed *continues*
(never restarts) — the exact bug fixed in Sidecar commit `1777775`; overtime when
`elapsed > target`; extend adds 5 min to `timerMinutes`. Hand-computed millisecond
fixtures, `now` injected (no wall-clock in tests → deterministic).

### 7.4 Clock (shift) binding
The Sidecar reads a clock/shift source (clock in/out, breaks). The exact table
(`clock_sessions` per migration 008, surfaced as "Your shift") is confirmed against the
Sidecar clock data file during build; the watch's `ClockScreen` does the minimal
in/out write + elapsed read against it. If the clock write path proves to need
extension-side orchestration (auto clock-in lives in the extension per Plan 036), the
watch v0.1.0 degrades to **read-only shift glance** and defers the in/out *write* to
v0.2.0 — noted as a build-time decision, not a blocker for assembleDebug.

## 8. Battery budget

A Wear app that drains the watch is uninstalled by lunch. Rules baked into the design:

- **No persistent background WebSocket.** Realtime only while foregrounded (§7.2).
- **No background service, no `WorkManager` polling loop in v0.1.0.** State refreshes
  on app resume, on user action, and via the Tile's own freshness interval (the system
  batches Tile refreshes). The complication/tile pull a cached snapshot, not the
  network, on each render.
- **1 Hz UI tick only while the Focus screen is foreground *and* interactive.** In
  ambient, the ring is static text/outline updated at the AOD cadence (~1/min), not a
  running animation. The `FocusViewModel`'s tick flow is lifecycle-scoped and stops in
  `onPause`.
- **Coalesced writes.** Wrist actions are single PATCH/POSTs; no chatty sync loop. The
  event-log writes are best-effort and fire-and-forget (mirroring `insertFocusEvent`).
- **Access-token refresh is lazy** — only when a call gets a 401 or the JWT is within
  60s of expiry, not on a timer.

Net: in the common case the watch does *zero* network work between glances, and a
glance is one small GET (or nothing, if a foreground Realtime push already updated it).

## 9. Offline behaviour

- Last-known current focus + timer are cached (a small `focus_snapshot.json` in app
  storage) so a wrist-raise with no connectivity still shows the label + a
  locally-ticked timer (the timer only needs `startedAt`/`elapsedMs`, both cached — it
  keeps counting offline and reconciles on reconnect).
- Wrist **actions taken offline** (checkpoint, pause, extend) are queued in a tiny
  local outbox and flushed on next connectivity; each carries its own timestamp so the
  event log and `_elapsedMs` stay accurate even if the write lands minutes later. For
  v0.1.0 the outbox is best-effort (a JSON list); conflict resolution is
  last-write-wins on the single-user row, which is safe because the user is the only
  writer and actions are additive (checkpoints/events) or idempotent-ish (state
  toggles reconcile to whatever the latest wrist action said).

## 10. Self-review (ruthless pass — battery, legibility, one-/zero-hand)

Reviewing the above against the three lenses the mission demands, and revising:

- **Battery — is Realtime-when-foreground still too much?** For a *view-only* glance
  you don't even need the WS; the on-resume GET covers it. **Revision:** foreground
  Realtime is retained but gated behind "the Focus screen is actually visible", and the
  subscription tears down immediately in `onStop`, not `onPause`, so a quick raise that
  Wear keeps momentarily visible doesn't thrash. Accepted.
- **Legibility — 5 emoji chips on a 1.5" round screen may clip at the curved edges.**
  **Revision:** the checkpoint picker uses a `ScalingLazyColumn` (one chip per row,
  full width, scaled toward center) rather than a 2×3 grid — vertical bezel scroll is
  more legible and reachable than a cramped grid whose corner items fall in the round
  mask's dead zone. Adopted into §4.1.
- **Legibility — remaining time in overtime.** A red pulsing ring is good but the
  *number* matters: show `+3:20` (leading plus) in overtime, not a bare `-3:20` or a
  wrapped-to-zero. Adopted into §5.1.
- **One-hand — is `+5` reachable without a second hand?** Yes: it's a full-width chip
  in the bezel-scrollable list; rotary scroll + single tap is one-handed. But
  **Resolve/Done sitting next to +5 risks a mis-tap that completes a focus.**
  **Revision:** Done is placed **last** in the list (furthest scroll) *and* behind a
  Confirmation, so it can't be hit by accident during a quick extend. Adopted into
  §4.1.
- **Zero-hand — does the AOD actually show enough?** Label can be long. **Revision:**
  ambient shows label truncated to ~1 line + remaining time; that's the "on track?"
  answer. If the user needs more they raise-and-tap. Accepted.
- **Auth — is six digits typed on a watch really OK?** It's a *one-time* pairing, and
  the alternative (native phone app + BT Data Layer) doesn't exist yet because the phone
  surface is web. Six taps once is the right trade. If it grates, v0.2.0 can add a
  "voice the code" path (Wear speech IME already in scope for §5.7). Accepted, with the
  voice fallback noted.
- **Scope — is the Tile/complication too much for v0.1.0?** They share the cached
  snapshot and add real glance value (the whole point of a watch). Kept, but the
  complication is `SHORT_TEXT + RANGED_VALUE` only (no tap action beyond opening the
  app) to keep it a half-day of work, not a rabbit hole. Accepted.
- **Risk — clock write path.** Flagged in §7.4 with a defined degradation (read-only
  shift) so it can never block the build. Accepted.

Conclusion: design is buildable and honestly scoped. Proceed to scaffold.

## 11. Build / test acceptance

- `./gradlew :app:assembleDebug` produces `app/build/outputs/apk/debug/app-debug.apk`.
- `./gradlew :app:testDebugUnitTest` runs `TimerEngineTest` + `CurrentFocusTest` green.
- Wear AVD smoke-boot **if** a system image + headless emulator is feasible on this
  box; otherwise the build + unit tests are the acceptance gate and that's stated in
  the report (no physical watch attached).

## 12. What needs whom (hand-off)

- **CeeCee (deploy rights):** apply the `watch_pairing_codes` migration (§6.2), deploy
  the `pair-watch` edge function (mint + redeem, service-role secret), and land the
  small Sidecar Settings "Pair a watch" button (§6.3). None of these block the watch
  build; they block *live pairing on the physical watch*.
- **Malkio (physical device):** enable Wear OS developer mode + ADB debugging on the
  Galaxy Watch 6, `adb connect` over Wi-Fi, `adb install app-debug.apk`, then pair once
  with the 6-digit code from Sidecar. Instructions in the repo README.

---

## Parallelability Review

- **Zones touched:** entirely new repo `tabatha-watch` — **zero** overlap with the
  Tabatha extension/Sidecar/companion codebase. The only Tabatha-repo writes are this
  design doc + the plan-registry line (two files, explicit-add).
- **Shared files modified:** `docs/superpowers/specs/2026-07-18-tabby-watch-design.md`
  (new) and `.headbox/plan-registry.md` (append one row). No source, no migrations
  applied by me.
- **Conflicts with active worktrees:** none in code. The registry append could race
  another agent editing the same file — mitigated by a single-row append and explicit
  `git add` of only that path.
- **New backend surface (specced, not applied):** `watch_pairing_codes` migration +
  `pair-watch` edge fn are **CeeCee's to deploy**; they are additive (new table, new
  fn) and don't touch existing tables/policies, so they can land independently whenever
  convenient.
- **Can run parallel:** yes — this whole surface is isolated. Max branch lifetime: the
  watch repo is standalone; no long-lived Tabatha branch is held open.
- **Scope-split:** v0.1.0 (this plan) is the core wrist experience + Tile/complication +
  pairing spec. v0.2.0 candidates (native phone app + BT Data Layer pairing, clock
  in/out *write*, voice quick-add of a new intent, Context-View-style always-on face)
  are explicitly deferred.
