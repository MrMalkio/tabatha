# Fleet UI/UX Audit — Sidecar, Desktop Companion, Tabby Watch

**Auditor:** Cirra (Sonnet) · **Date:** 2026-07-21 · **Mode:** read-only, no code changes
**Asana:** umbrella task 1216771084326772
**Scope:** Tabby Sidecar PWA + Context View (v0.13.4), Desktop Companion (main line + unreleased `feat/companion-ux-wave` 0.3.8), Tabby Watch (Wear OS, v0.2.0)

Method: full read of source for each surface (screens/components/data/lib layers for Sidecar; Rust + React for Companion; Kotlin/Compose for Watch), plus a live look at the deployed Sidecar login screen (`https://tabatha.pondocean.co/sidecar`, mobile viewport, no sign-in performed per audit constraints — screenshot capture in the browser pane repeatedly timed out in this environment, so live verification relied on DOM/text extraction, which matched source behavior exactly). Every finding below is graded by **severity** (low/med/high/critical) and **class**:
- **NOW-fix** — small, should ship immediately
- **OVERHAUL** — needs a bigger redesign/rework
- **BUG** — something actually broken or incorrect

---

## 1. Tabby Sidecar (PWA) + Context View — v0.13.4

Overall impression: this is a **mature, heavily-iterated codebase**. Nearly every file carries inline provenance comments tracing each change back to a specific spec/incident ("Fix Wave 3 item 5a," "2026-07-21 report," "Malkio screenshot"), and the arbitration/timer logic is unusually well-reasoned (cross-surface active-focus arbitration, pause/resume elapsed-ms freezing, day-boundary timeline separators). The device-lockout incident from this same day (paused-device self-rescue) has already been fixed and shipped. Most "seed" concerns in the brief are already addressed at v0.13.4; the findings below are the residue and some new observations.

### 1.1 Device lifecycle (seed #1)

| Severity | Class | Finding | Fix sketch |
|---|---|---|---|
| Med | BUG (dead end) | **No "regenerate a code for a listed device."** `DevicesCard.tsx` supports rename / pause / remote sign-out per row, but re-pairing a signed-out or lost device requires going back to `PairWatchCard.tsx` and minting a brand-new code untethered to any existing row — there's no "get this device back" action from its own row. Confirmed by reading both files: `PairWatchCard`'s `mint()` has no `deviceId` parameter at all. | Add a "Re-pair" action on a revoked/signed-out row that pre-fills the mint flow with that row's `display_name`, or at minimum link straight to Settings → Pair a device from the row. |
| Med | BUG | **Signing a device out has no undo window.** `signOutDevice()` (`DevicesCard.tsx` ~L263) calls the `device-signout` edge function immediately on tap — no confirm dialog — for any row that isn't "this device." Given the exact incident this same file's header comment describes (Malkio locking himself out via pause), an accidental sign-out of the wrong row is one mis-tap away and is **not** self-rescuable the way pause is (`DevicePausedScreen.tsx` now has a resume button; there is no analogous "I signed this back in" screen — the device must fully re-pair). | Add a confirm step to `signOutDevice`, mirroring the confirm-gate pattern already used elsewhere in this codebase (`HistoryRow`'s restore-confirm in `FocusScreen.tsx`). |
| Low | NOW-fix | The device list's grouping/dedup (`groupKey`/`groupRows`, `isDefaultVisible`) is a well-built client-side band-aid over a genuine data-quality bug (~731 duplicate rows from an extension-side `local_id` regeneration bug, per the file's own comments) — it correctly hides the mess by default with a "Show all" escape hatch. This is good defensive work, but it's presentation-layer masking; confirm the parallel server-side cleanup + extension fix mentioned in the comments has actually landed, or this list silently degrades again as more dupes accumulate. | Track/verify the paired extension-side + server-side cleanup tasks are closed, not just the client mitigation. |
| Low | OVERHAUL | Device "kind" (phone/tablet/desktop/watch/browser_extra) is a fully manual per-row picker with no smart default beyond "phone" — a user with a genuinely large device list (the exact scenario this feature exists for) must hand-classify every row to get Phone Focus Mode gating right. | Infer a default from `browser`/`extension_installed`/UA where possible; keep manual override for the rest. |

### 1.2 Clock/timer consistency across screens

| Severity | Class | Finding | Fix sketch |
|---|---|---|---|
| **High** | **BUG** | **`formatTimer()` (`lib/theme.ts` L73-79) never rolls over to hours** — it always renders `M:SS`, even past 60 minutes (e.g. a focus 2h24m over shows `"144:30"`, not `"2:24:30"`). This is the literal root cause `ContextView.tsx` had to build a dedicated "fit-to-ring" font-shrinking workaround for (its own comment: *"Malkio screenshot, 2026-07-18: '04:3(' cut off at 1h44m over"*). Meanwhile `formatClock()` and the newer `formatElapsedDigits()` both correctly roll to `h:mm:ss`. Three time-formatting helpers doing three different things for what is conceptually the same "duration" value is a real inconsistency, and `formatTimer` is still the one used for FocusScreen's countdown/overtime number and the Pomodoro ring's remaining-time display. | Make `formatTimer` roll over to `h:mm:ss` like its siblings; this likely lets the ring's font-shrink hack in `ContextView.tsx` (`timerFont` calc, L426-435) be simplified since the string length becomes predictable again. |
| Low | NOW-fix | `ClockScreen.tsx`'s "Also on the clock" hint reads *"the desktop reflects them on its next sync"* — i.e. clock-state changes from the phone are eventually-consistent to the desktop (poll-based), while `ContextView.tsx` and `DevicesCard.tsx` both use Supabase realtime subscriptions for their own live state. This is an honestly-disclosed but real one-way-freshness gap: Sidecar-to-desktop clock sync is not currently on the same realtime tier as Sidecar-to-TV. | Confirm whether the extension subscribes to `browser_profile_status` realtime at all; if not, this is a parity gap worth closing given how central "one shift across devices" framing is to this screen. |

### 1.3 Checkpoints / sub-intents / backburner — parity

These are implemented Supabase-natively in the Sidecar (`data/checkpoints.ts`, `data/focus.ts`'s `tags._parent`/`tags._backburner`), meaning any other surface reading the same `focus_items`/`focus_checkpoints`/`focus_events` tables gets them "for free" at the data layer — the parity gap (confirmed by this project's own session log) is that the **extension's UI** doesn't yet render sub-intents/backburner/checkpoints the same way, not a Sidecar-side limitation. Recorded here for the parity matrix; the fix lives on the extension side, outside this audit's surface list.

### 1.4 Settings screen — density and save-model inconsistency

| Severity | Class | Finding | Fix sketch |
|---|---|---|---|
| Med | OVERHAUL | `SettingsScreen.tsx` is **13 stacked Cards in one undifferentiated scroll** (Account, Notifications, Defaults, Timer mode, Context View, Voice check-ins, Work schedule & nudges, Pair a device, Devices, Invites, Task sync, Feedback, Chaperone) with no section nav, no collapse, no grouping of clearly-related concerns (Timer mode / Context View display / Voice check-ins are all "how focus behaves/looks" but read as 7 flat, equal-weight cards). This runs directly against the Progressive Simplicity principle Malkio recorded in `Tabatha_Concept.md` per the project's own session log — each individual section already applies progressive disclosure internally (e.g. Pomodoro fields only appear once picked) but the outer screen doesn't. | Group into 3-4 collapsible top-level sections (Account & devices / Focus behavior / Integrations / Feedback) using the same disclosure pattern already used inside each card. |
| Med | NOW-fix | **Inconsistent save model on one screen.** Six settings groups require an explicit "Save X" button tap (defaults, timer mode, timer display, voice check-in, nudges, schedule) while five others autosave instantly on toggle (push, away-immediate, checkpoint counter, chaperone enable, chaperone quiet-hours preset). A user toggling Pomodoro minutes and navigating away without noticing the separate "Save timer mode" button loses the change silently — no "unsaved changes" warning exists anywhere on the screen. | Either autosave everything (debounced), or add a single persistent "unsaved changes" indicator/bar so the two interaction models don't silently coexist. |
| Low | BUG (dead end) | Task Sync card's **"Disconnect" button is rendered, styled as a real action, and permanently `disabled`**, with an adjacent hint "Disconnect is coming soon." Better than a silent no-op (the Watch's "Quick add" chip, see §3, does the same thing with *no* explanation), but a real-looking button that can never be pressed is still a small trust ding. | Either ship disconnect, or replace the button with plain text ("Disconnect: coming soon") until it exists. |

### 1.5 Context View

The most iterated, most polished screen in the app — pending-queue choose cards, a dedicated on-break full-screen state, phone-away/gone three-way status classification (with unit-tested pure logic), day-boundary timeline separators, and a fit-to-ring font-shrink pass all show real design care.

| Severity | Class | Finding | Fix sketch |
|---|---|---|---|
| Low | BUG | **Chaperone "Personality interrupts" audio can silently no-op on first load.** `playChaperoneLine()` (`lib/chaperone.ts` L83-88) explicitly swallows the promise rejection from `audio.play()` when browser autoplay policy blocks it pre-user-gesture — correct defensive code, but on a kiosk/TV Context View (the exact intended use case for this feature) there may never be a qualifying user gesture, so the flagship "theatrical nudge" feature can be permanently silent with zero indication to the user that it isn't working. | Surface a one-time "tap to enable Chaperone audio" prompt the first time playback is blocked, or note this as a known TV-mode limitation in the feature's settings copy. |

### 1.6 Accessibility / component-kit

| Severity | Class | Finding | Fix sketch |
|---|---|---|---|
| Low | NOW-fix | `Btn` (`ui/kit.tsx`) has **no `accessibilityLabel` prop at all**, yet many call sites use icon-only labels (`"✕"`, `"▶"`, `"✓"`, `"⏰"` in `QueueRow`/`BackburnerRow`/`HistoryRow`). A screen-reader user gets the raw emoji/glyph read aloud with no semantic label, and callers have no way to fix this since the prop doesn't exist. | Add an optional `accessibilityLabel` to `Btn` and backfill the icon-only call sites. |

### 1.7 Minor / lower-priority observations

- `RecentScreen.tsx` reads `intent_history` raw, capped at 50 rows, no filters/pagination — functional, honestly scoped ("Parked tabs and the Sugar Box... aren't synced"), fine for v1.
- `TasksScreen.tsx`, `SimpleScreen.tsx`, `VoiceCheckIn.tsx`, `data/focus.ts` action set are all solid — no material issues found. `VoiceCheckIn`'s undo semantics per voice command (with an explicit "no undo for extend" carve-out and a documented reason) is a good example of the codebase's general care level.
- `data/focus.ts`'s `patch()` (the shared write path for nearly every focus action — pause/resume/extend/setPriority/setStage/etc.) does an optimistic local update, writes to Supabase, and on failure only does `console.warn` — there is **no user-facing error/toast** for any of these actions if the write fails (the comment above it even names the exact incident — "Stuck Sidecar" — this was meant to fix). The revert-with-no-explanation UX bug this comment describes is only half-closed: the console.warn helps debugging, but a real user watching a checkbox/pill silently revert on a bad network still gets no explanation. *(Med / BUG)* — fix: surface a lightweight inline toast on write failure, reusing the pattern already used in `DevicesCard.tsx`'s `err` state.

---

## 2. Tabby Watch (Wear OS, Compose) — v0.2.0

*(Full findings gathered by a parallel background audit of `C:\Users\mrmal\le dev\tabatha-watch`; summarized and re-graded here for the combined ranking.)*

**Architecture:** Not Bluetooth/Data-Layer paired — the watch is a standalone client that talks directly to Supabase over its own network connection. "Pairing" reuses the same 6-digit Sidecar code mechanism.

| Severity | Class | Finding | Fix sketch |
|---|---|---|---|
| **Critical** | **BUG** | **No exception handling anywhere in the network layer** (`SupabaseFocusRepository`, `PostgrestClient`, `GoTrueClient` — outside the one correctly-`runCatching`-wrapped pairing flow). Every repository call (`loadFocusItems`/`pause`/`resume`/`extend`/`resolve`/`addCheckpoint`) runs unguarded inside `viewModelScope.launch{}` with no installed `CoroutineExceptionHandler`. An `IOException` from a timeout/DNS failure/no-connectivity — i.e. the exact "phone out of range" scenario this audit was asked to check — is uncaught and **crashes the app**, not a graceful degrade. This is the single most serious defect found across all three surfaces. | Wrap every repository call site in `runCatching` (already the correct pattern in `PairViewModel.submit()`), surface an inline error state, keep last-known UI rather than propagating. |
| High | OVERHAUL | **No staleness signal anywhere.** The Tile/complication read a `SnapshotCache` with **no timestamp field at all** — no "last synced," no visual staleness treatment. If the watch app is never opened, the Tile silently counts down from a cache that could be hours or days old with zero indication anything has stopped reflecting reality. | Add a `cachedAtMs` field to `SnapshotCache`; grey out / age-indicate the Tile past a threshold. |
| High | BUG | **"0 rows" and "fetch failed" are indistinguishable.** A clean HTTP failure from `PostgrestClient` returns an empty list, which renders identically to "genuinely nothing in focus" — a stale/offline watch can show "Nothing in focus" while the phone has an active timer running, with no way for the user to tell the difference. | Thread a distinct error/offline state through `FocusUiState` instead of collapsing to null. |
| Med | OVERHAUL | **Clock screen is a placeholder.** Three static lines of text ("Your shift," a preview label, "Clock in/out lands in v0.2.0") with no real shift data — and the shipped version already **is** 0.2.0; the deferral target was never updated when the version bumped. | Either ship the clock read/write cycle or update the in-app copy to stop promising a version that already passed. |
| Med | BUG (dead end) | **"🎙 Quick add" chip on the empty-focus screen is a literal no-op** (`{ /* voice quick-add: v0.3.0 */ }`) — tapping it produces zero feedback of any kind. | Hide the chip until built, or show a "Coming soon" confirmation (the app already has a `Confirmation` dialog primitive it could reuse). |
| Med | NOW-fix | No overtime alert beyond the ring turning red — no vibration, no notification — a weak signal for a wrist device whose whole value proposition is "glanceable, don't need to check your phone." | Add a haptic buzz on timer expiry. |
| Med | OVERHAUL | Missing unpair/logout affordance — `SessionStore.clear()` exists in code but nothing in the UI calls it; a lost/shared watch can't be signed out from itself. | Add a secondary "Sign out" chip alongside the existing "Re-pair" chip. |
| Low | OVERHAUL | Checkpoint "voice note" capability is described in doc comments in two files but doesn't exist in code at all (no `RecognizerIntent` call anywhere) — aspirational documentation, not a stub. | Build it, or strip the comments so future readers don't believe it ships. |
| Low | NOW-fix | Generic "Code invalid or expired" error covers every failure mode including plain network/IO errors, which will mislead a user into re-typing a code that was actually fine. | Distinguish network failure from genuine rejection in the pairing error copy. |

**Vocabulary:** consistent with the rest of the ecosystem (`focus_state`, `funnel_stage`, "checkpoint," "realm," "Cloud Sync" branding correctly used instead of "Supabase"). No drift found — one of the stronger aspects of this codebase.

**Verdict:** not a tech demo — a genuinely-engineered MVP core (well-tested timer math, a real pairing state machine with a live smoke test) let down by a **hollow failure-handling layer**. The connectivity-crash issue is a ship-blocker; the rest is legitimate beta rough edges.

---

## 3. Desktop Companion (Tauri) — main line + `feat/companion-ux-wave` (0.3.8, unreleased)

Repo: `C:\Users\mrmal\le dev\tabatha-desktop`. The wave (4 commits, 14 files, +1260/-332) sits on top of main line and delivers the three items Malkio asked about: window-title cards, an assign-to-intent flow, and a slimmed tray. `npm run build` and `cargo check` both pass clean. Backend engineering quality is high — thorough inline comments, `#[serde(default)]` guards on new wire fields so old payloads still deserialize, no orphaned Tauri commands. The gaps are almost entirely in the **new UI layer's guardrails and honesty about what's actually wired up**, not in the underlying plumbing.

| Severity | Class | Finding | Fix sketch |
|---|---|---|---|
| High | BUG | **Active Window card CSS truncation swap regression.** The wave swaps which string renders where (window title now the bold header, app name now the small muted line — `App.jsx` L276-280) but didn't move the matching CSS: the `nowrap/ellipsis` rule set is still on `.app-title` (`styles/index.css` L178-184), while `.app-name` — which now holds the long, unbounded window-title string — has no truncation rule at all (L173-176). Real browser-tab/document titles routinely exceed the card width and will wrap or blow out the row. This will misrender for the majority of real-world usage, on the exact surface this wave exists to polish. | One-line CSS fix: move the `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` triple to whichever selector now holds the long string. |
| High | BUG (footgun) | **"Exit Completely" has zero confirmation.** One click in the new `CompanionMenu.jsx` dropdown → `exit_companion` → `app.exit(0)` immediately, no `confirm()`, no two-step. It sits directly under a divider in a 240px hover-triggered popup — a slightly errant click kills all tracking for the rest of the day with no undo. | Add a confirm dialog or "click again to confirm" pattern before issuing the command. |
| High | BUG (footgun) | **"Pair Extension (copy token)" silently rotates the pairing token on every click**, which — per the backend function's own doc comment (`main.rs` `pair_extension_token`, L513) — revokes whatever client currently holds the previous token. This action used to live one level deeper (behind a tray right-click); the wave promotes it to one app-click + one menu-click away, with an innocuous label that gives no hint it disconnects an already-paired extension. A user exploring the new menu can break their working extension connection without knowing why. | If `get_companion_extras` reports the extension as connected, warn/confirm before rotating ("This will disconnect your current extension. Continue?"). |
| High | OVERHAUL | **Assign-to-Intent is a cosmetic dead end at the product level — the most important finding for release-readiness.** The modal UI itself is well-built (proper empty state, disabled states, no dead ends getting in or out), but the underlying `window_intent_map` mapping is read **only** by two frontend calls that paint a same-session "🔗 focus_label" badge on matching Recent Activity rows. It does not feed the Today summary, the pre-existing automatic focus-keyword matcher, or any sync path — confirmed both by the backend's own comment ("time-attribution rollup using this table is a follow-up") and by grepping for any other reader of that table. A user who assigns "Slack" → "Client Alpha" will reasonably expect that to eventually count toward Client Alpha's tracked time; today it's a badge that vanishes once the row scrolls out of the 20-row Recent Activity window. | Before announcing: either add an honest in-modal disclaimer ("tags Recent Activity now — doesn't add to your time totals yet"), or hold the feature out of the announcement until the attribution rollup exists. This is a product-communication decision, not just a code fix — worth escalating to Malkio directly rather than silently patching. |
| Med | BUG | `get_companion_extras` failures are caught and silently logged; the Capture / Start-on-Login toggles then render using a falsy default, showing a confident "⬜ off" that's indistinguishable from a real, confirmed-off state. | Render a distinct "…"/couldn't-load state instead of falling through to `false`. |
| Med | NOW-fix | The **Capture** (screen-capture engine) toggle is now a bare one-word on/off menu row with no description of what it captures or how often — a step down in context from its previous tray-checkbox placement, for functionality that's inherently privacy-sensitive. | Add a one-line subtitle/tooltip describing what Capture does. |
| Med | OVERHAUL | Assign-to-Intent data lives **only** in this machine's local SQLite file — no export, no cross-device sync. It's silently gone on reinstall, app-data clear, or a second machine, with no warning that it's device-local, while the rest of the Tabatha ecosystem is moving toward cross-device Cloud Sync. | Flag before users build up assignment rules they assume are backed up; scope sync alongside the attribution rollup. |
| Low | NOW-fix | `seen_focuses` table has no cleanup/expiry — a long-lived install slowly accumulates stale one-off intents forever (capped at 50 recency-ordered rows for display, but the table itself grows unbounded). | Add an age-based prune. |
| Low | NOW-fix | Icon-extraction cache (`icon_extract.rs`) has no eviction — unbounded for the process's lifetime (in practice bounded by distinct exe paths ever seen, so low real risk). | Cap size, or accept as-is with a comment. |
| Low | NOW-fix | No loading/skeleton state for the Active Window card's icon — a brief blank → category-glyph → real-icon flicker on every poll cycle. | Fixed-size placeholder while `get_app_icon` resolves. |
| Low | NOW-fix | No Escape-key handling to close the Companion Menu dropdown (outside-click only). | Add keyboard dismiss for consistency/a11y. |
| Low | NOW-fix | The Assign-to-Intent badge on Recent Activity rows has no `max-width`/ellipsis guard (unlike the adjacent `.session-app` element) — long free-text focus labels can wrap the row instead of eliding. | Apply the same ellipsis treatment already used on `.session-app`. |

**Connection status pill** (item 3, `InstallGuide.jsx`): the cleanest piece of the wave — `connected` correctly demotes from an alarm-styled card to a low-priority pill, `disconnected`/`never_installed` keep the full guided-install treatment. No issues found.

**Is `feat/companion-ux-wave` release-ready?** **No, not as-is for a "here's the update" announcement** — but it's close. Two of the three blockers (the CSS truncation swap, the two unconfirmed menu actions) are small, fast fixes, not a redesign. The third — Assign-to-Intent's gap between what it visually promises and what it actually does — is a product-communication decision that should go to Malkio before shipping the announcement, independent of the code fixes.

**Dead code / TODOs found:** the backend comment explicitly flags the `window_intent_map` → time-attribution rollup as unbuilt (documented, not hidden); two pre-existing, unrelated macOS/Linux `// TODO` stubs in `window_monitor.rs` (irrelevant — this is a Windows-only app today). No orphaned commands or genuinely dead code introduced by this wave.

---

## Ranked top-15 (across all three surfaces)

1. **[Critical/BUG]** Watch: unguarded network calls crash the app on any connectivity failure — the single most serious defect in the fleet (§2)
2. **[High/BUG]** Companion: Active Window card CSS truncation swap will misrender on most real-world window titles — a shipping-blocker for the unreleased wave (§3)
3. **[High/BUG]** Companion: "Exit Completely" menu action has zero confirmation (§3)
4. **[High/BUG]** Companion: "Pair Extension" silently rotates the token and disconnects the current extension with no warning (§3)
5. **[High/OVERHAUL]** Companion: Assign-to-Intent is a cosmetic dead end — doesn't feed totals or sync anywhere; escalate the announcement decision to Malkio (§3)
6. **[High/BUG]** Sidecar: `formatTimer()` never rolls to hours — root cause of the Context View's overtime-digit clipping workaround (§1.2)
7. **[High/OVERHAUL]** Watch: Tile/complication cache has no timestamp — infinite silent staleness (§2)
8. **[High/BUG]** Watch: "0 rows" vs. "fetch failed" are indistinguishable — a stale watch can show "Nothing in focus" while a timer is actually running (§2)
9. **[Med/BUG]** Sidecar: remote device sign-out has no confirm step and no undo (§1.1)
10. **[Med/BUG]** Sidecar: no way to re-pair/regenerate a code for an existing device row (§1.1)
11. **[Med/OVERHAUL]** Watch: Clock screen is a static placeholder despite already shipping as "0.2.0" (§2)
12. **[Med/OVERHAUL]** Sidecar: Settings screen is 13 flat cards with no grouping, against the project's own Progressive Simplicity principle (§1.4)
13. **[Med/BUG]** Sidecar: focus-action writes fail silently to the user (console.warn only) despite this being a previously-named incident ("Stuck Sidecar") (§1.7)
14. **[Med/OVERHAUL]** Companion: Assign-to-Intent data is device-local only, no export/sync — silently lost on reinstall (§3)
15. **[Med/BUG]** Watch: "Quick add" chip on the empty-focus screen is a silent no-op (§2)

**Just outside the top 15, still worth a look:** Sidecar's inconsistent settings save model (§1.4), Watch's missing overtime haptic and missing on-device unpair (§2), Companion's Capture-toggle privacy context gap and `get_companion_extras` failure state (§3), Sidecar's `Btn` component missing `accessibilityLabel` support (§1.6).

---

## Findings tally

| Surface | BUG | OVERHAUL | NOW-fix | Total |
|---|---|---|---|---|
| Sidecar | 6 | 2 | 4 | 12 |
| Companion | 4 | 2 | 6 | 12 |
| Watch | 3 | 4 | 2 | 9 |
| **Total** | **13** | **8** | **12** | **33** |

By severity (all surfaces): 1 Critical · 8 High · 15 Medium · 9 Low.
