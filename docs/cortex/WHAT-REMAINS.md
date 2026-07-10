# Tabatha Cortex — What Remains (as of 2026-07-10 afternoon ET)

Synthesis of `docs/cortex/HANDOFF.md` (3 rounds, last 18h), `.headbox/plan-registry.md` rows 039–044,
`docs/cortex/README.md`, `docs/cortex/PROGRAM-agent-control-layer.md`, `docs/progress.md`, and both
repo git logs (`Tabatha` @ `claude/tabatha-ai-integration-layer-91903b`, `tabatha-desktop` @ `feat/cortex-capture`).

## Done & verified
- **Phase 1 (Plan 040) code-complete 6/6**, real-browser regression **11/11 PASS** (Playwright + Chrome 150, fresh CDP profile) — capture pipeline, guard/redaction, ledger + nightly export, cron-in-harness, dashboard, DATA-MAP. Extension **332/332 node tests**, build green.
- Blank-home crash root-caused + fixed — `VoiceNoteButton` missing `useRef` import (commit `cf09b04`), re-verified live.
- Sync-stale root-caused — Supabase auth token wiped (`hasUser:false`); last success 05:15 today; fixed contributing bugs: `chrome.storage.local` quota-exceeded (`unlimitedStorage` added, `f127e09`) + Sync-Now silently swallowing failures (now surfaces diagnostic).
- Companion **release** exe built + launched + auto-start registry repointed (old deploy was a debug build with crash-hardening never packaged).
- ElevenLabs scoped key minted (TTS+STT only) → `.env.cortex.local`; `API-KEYS.md` K10 ✅.
- C11a agent-vs-human attribution v1 shipped (`agentSessionService` + UI, commit `8100859`).
- Companion OS capture (Rust) built on `feat/cortex-capture` @ `006c3aa` — GDI window/monitor/virtual modes, guard parity fail-closed, age+bytes retention, `CAPTURE_CONFIG`/`CAPTURE_TAKEN` WS contract. **68/68 cargo tests green.**
- Extension-side capture handoff wiring — `CAPTURE_TAKEN`→ledger, config mirrored over WS, host-only rules never travel (commit `5e7bcae`).
- Voice v0 shipped, no new permissions — Tabby speak-instead-of-modal + home voice-note button→ledger (commit `f74ae3d`, 17 tests).
- C10 self-correction v1 shipped — tab↔intent + work-time detectors, confidence-laddered apply/revert via `activityAudit`, nightly 04:00, opt-in (commit `baf4051`, 30 tests).
- Phase 4 proactivity gate + overnight EXECUTE bundle builder shipped (`1f2e22c`, `c62cf19`); migration 023 `org_capture_policy` written, **not applied**.
- Phase 5 controller-attribution decision core shipped (`2eee591`, 6 tests).
- Dist atomic-swap fix — unpacked extension can no longer see an empty `dist` mid-build (`f5ff7a7`, `88a9e05`).
- Two independent Opus review passes overnight — every finding fixed (incognito fail-closed, serialized mutations, fail-closed redaction, self-correction storage race). Nothing pushed; `staging`/`main` untouched.
- **Migrations 018–024 applied to live Flux** — remote was actually at 017 (2026-06-30 registry record corrected); pushed with new "flux-tabatha-cortex-shared-deploy" token. `focus_items.priority` + all three Cortex tables (022/023/024) now live; local == remote at 024. "Migration gap" risk closed.
- **Save-As dialog eliminated from capture writes** (extension `2f171b5`, 361 node tests, build green) — frames now go to the companion over WS (`CAPTURE_FRAME`) or OPFS fallback when the bridge is down; nightly export via `WRITE_EXPORT` (buffers to `pendingCortexExports` offline, flushes on reconnect); C1 focus-gate so the extension only captures while Chrome is the focused app (companion owns desktop capture while blurred); filenames now carry a tab-title slug; clock-sync requests `CLOCK_STATE` on bridge connect.
- **Companion desk-panel + clock-sync + WS write path fixed** (`b94f7d0`, 79 cargo tests, release build) — "localhost refused to connect" fixed (`default = ["custom-protocol"]` now loads the embedded frontend, not the dev server); version bumped to **v0.2.0**, shown as "Tabby Desk v0.2.0 (release)" in title + tray; clock-sync root cause was non-idempotent `clock_in` (duplicate open sessions) — fixed (`clock_in` reuses the open session, `clock_out` closes all); new `CAPTURE_FRAME`/`WRITE_EXPORT`/`FILE_WRITTEN` WS handlers with path-safety guards; OS-capture filenames now carry a window-title slug; confirmed OS desktop capture was already firing correctly (62 personal + 45 org frames on disk) — the earlier "only saw the Chrome tab" report was a surfacing artifact of the extension's old `chrome.downloads` path, not a capture failure.

## Waiting on Malkio RIGHT NOW
1. **RELOAD the extension** (`chrome://extensions` → ↻) — the on-disk dist is verified to contain the silent-capture + live-status fixes (15/16 real-browser PASS); your running service worker is just stale. After reload: no Save-As, title-slug filenames, live status card.
2. **Re-sign-in to Supabase** (Settings → Sync & Account → **⚠ Force reset auth** if no Sign Out, then sign in) — auth token wiped; sole remaining sync blocker (migrations 018–025 all live).
3. **Remove the ghost extension card** — CONFIRMED still present in Secure Preferences: `dphebjboopafmehmmcclgmhbgfahchde` (disabled, `disable_reasons:[4]`, pre-key path-derived) alongside the live `hoknmocl…`. It may render greyed/errored not as a normal card. Fix: toggle Developer-mode off/on to force a re-render, OR Remove Tabatha entirely + Load-unpacked once (collapses both path-entries into the keyed one).
4. **Run the Phase 1 manual regression checklist** (`HANDOFF.md` "Phase 1 smoke test", incl. Voice v0) → bump `public/manifest.json` to **v7.0.0** + `npm run version:sync`. Gates flipping registry 040 to `completed`.
5. **Program-spec Google Doc re-sync** — `00-cortex-program-spec.md` has 2 local additions not mirrored to the Drive doc. Low urgency.
6. **Live Stints ghost card** — Work Shifts → Live Stints may show a stale install from the overnight reconnect cycle; Dismiss it (`DISMISS_INSTALL`). Distinct from #3.

### Handled by Fable/agents (2026-07-10 PM) — no longer on you
- ✅ **Companion v0.2.0 relaunched** clean (`Tabby Desk v0.2.0 (release)`, WS listening, extension reconnected); its **corrupted SQLite activity DB rebuilt** via raw b-tree salvage (372 sessions + 1 clock recovered), integrity ok.
- ✅ **cortex-proxy deployed** (tier-② routing live; 401-protected; OpenAI secret set server-side).
- ✅ **Migration 025 applied** — adds the `surface` CHECK (`browser/os/desktop/voice/mobile`) the docs wrongly assumed 022 had; voice cloud-sync unblocked. Local==remote at 025.
- ✅ **Companion merged + deployed** — feat/cortex-capture → master @ dbf8cd7, tagged v0.2.0, master-built exe running clean at the canonical path (no remote exists on that repo — local master only). Plan 041 deploy gate CLOSED; Asana board item updated (story 1216459982162117).
- ✅ **C10a Context Reconciliation v1 shipped** (b8a1fb7 — Reconcile-now confirm/skip panel, 4 proposal kinds incl. retroactive time edits, context textbox; audio input + LLM reasoning deferred to v2) and ✅ **Phase 043 T3 multi-cadence shipped** (intraday slice exports + dual-cadence harness bundle, opt-in cortexIntradayEnabled). Suite now **408 tests green**.

## Remaining engineering by plan
- **040 Phase 1** — code-complete 6/6. Nothing left to build; gate is Malkio's manual regression → v7.0.0 (see waiting-on #5).
- **041 Phase 2** (partial 5/6) — remaining: Drive/OneDrive external-archive adapters (T2 remainder); Vercel Gateway key blank (T4, procurement-gated). T1 merge/deploy ✅, T3 proxy ✅ (deployed + live).
- **042 Phase 3 voice** (partial 4/9 incl. C10a) — remaining: offscreen/global-hotkey plumbing (.pem-gated); realtime speak-to-Tabby; dictation engine; routed STT/TTS (proxy now live to route through); C10a v2 (LLM reasoning + audio context input).
- **043 Phase 4 autonomy** (partial 5/6) — remaining: T5 SOP observation mode; T6 Headbox harness placement (companion-side, now unblocked by the deploy).
- **044 Phase 5 cross-signal** (partial 1/6) — detection-surface wiring for controller attribution; reply-latency/power signals; leverage analytics; ergonomic camera; mobile parity (tabatha-mobile is scaffold-only); Mac companion parity.

## Back burner
- **Agent Control Layer (Tabatha CLI/MCP)** — `docs/cortex/PROGRAM-agent-control-layer.md`. Explicitly parked by Malkio until the Cortex program is complete. Efferent sibling to Cortex (reads/writes Tabatha state instead of just observing); phased P0–P4; open questions on transport (MCP-first vs CLI-first) and host (companion WS bridge vs extension native-messaging). Asana task `1216454646338939`.
- Parking-lot entries dated 2026-07-09/10 (`.headbox/parking_lot.md`):
  - **`.pem` may break persistence across restarts** (2026-07-09) — unpacked extension may disappear on machine restart; needs "verify sync fully rehydrates on login" then ship a stable no-`.pem` build with a pinned manifest `key`. Still open — blocks any Phase 3 manifest-permission work (voice hotkeys need it).
  - **Desktop companion stale-deploy + Headbox integration entangled** (2026-07-09) — largely addressed by today's companion build (`b94f7d0`); merge/deploy is the remaining piece (waiting-on #4).
  - **Agent Control Layer parked** (2026-07-10) — see above.

## Risks / loose ends
- Voice observations use `surface:'voice'`, outside migration 022's `browser|os` CHECK constraint — needs a small follow-up migration before voice rows can ever cloud-sync (local-only today). Migration 024 added controller-attribution columns to the same table, so one combined follow-up migration could fix both at once.
- Compound sensitive rules with BOTH host and app/title conditions travel to the companion with the host clause un-evaluable — split such rules or add companion-side host awareness (low priority; simple rules unaffected).
- `pushCaptureConfig` doesn't send `capture_dir` — companion falls back to its own default (`%APPDATA%\Tabatha Desktop\captures`); needs UI plumb-through as the C15 config surface grows.
- Ledger pruning doesn't delete orphaned frame **files** — companion prunes its own, but extension-side Downloads files persist (open question in DATA-MAP). Note: automatic writes no longer go through Downloads as of `2f171b5`/`b94f7d0` (companion/OPFS now); this only affects files written before today's fix.
- `.headbox/workspace-map.md` still describes captureService frame I/O as going through `chrome.downloads` — doc drift as of `2f171b5`; needs a pass to match the companion/OPFS write path.
- Program-spec Google Doc out of sync with 2 local additions — see waiting-on #7.
- Possible stale/ghost Live Stints card from the overnight auth-wipe/reconnect cycle — see waiting-on #8.
- `DECISION-voice-settings.md` (T0, C9↔#211 reconciliation) commits to a webspeech default + C8-routed STT/TTS architecture without an explicit Malkio sign-off yet — worth a read before Phase 3 voice work continues.

## New scopes captured (not yet started)
- **C10a AI Context Reconciliation & Confirmation Panel** — `docs/cortex/features/C10a-context-reconciliation-panel.md`, Asana `1216454646044184`. Net-new, not yet started. (C11a already shipped v1, see Done & verified; Agent Control Layer already tracked under Back burner.)
