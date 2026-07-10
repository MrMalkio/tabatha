# Tabatha Cortex — What Remains (as of 2026-07-10 ~noon ET)

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

## Waiting on Malkio RIGHT NOW
1. ~~Reload the extension~~ — done (you reinstalled unpacked; ghost-card removal at chrome://extensions still recommended).
2. **Re-sign-in to Supabase** (Settings → Sync & Account → sign out → sign in) — auth token is wiped. Gates any sync succeeding, and confirming the migration gap below.
3. **Run the Phase 1 manual regression checklist** (`HANDOFF.md` "Phase 1 smoke test" section, includes new Voice v0 steps) → then bump `public/manifest.json` to **v7.0.0** + `npm run version:sync`. Gates shipping Phase 1 / flipping registry 040 to `completed`.
4. **Companion: confirm you're on the release exe**, not debug — `C:\Users\mrmal\Le Dev\tabatha-desktop\src-tauri\target\release\tabatha-desktop.exe` (Fable already launched it + repointed the autostart registry key). Gates any companion-dependent Phase 2/3 testing.
5. **Companion branch merge/deploy decision** — review + merge `feat/cortex-capture` @ `006c3aa` (carries FIX-06 crash-hardening too) in `tabatha-desktop`, then cut a deploy. Gates: closes Plan 041's deploy board item, unblocks Phase 2 companion capture in production. Note: worktree has one uncommitted change (`src-tauri/Cargo.toml`) — check before merging.
6. ✅ **Migration push — DONE 2026-07-10 ~12:00 ET.** Malkio's fresh token ("flux-tabatha-cortex-shared-deploy") authenticated; CLI push applied **018–024** — the remote was actually at **017** (the 2026-06-30 "018/019 applied" registry record was wrong; corrected). `focus_items.priority`, org-attribution RPC fixes, and all three Cortex tables (022/023/024) are now live. Local == remote at 024.
7. **Deploy `cortex-proxy`** (tier-② routing): `supabase secrets set OPENAI_API_KEY=… --project-ref mtdgoahskcibjbhfvofx` then `supabase functions deploy cortex-proxy`. Gates Phase 2 T3.
8. **Program-spec Google Doc re-sync** — `00-cortex-program-spec.md` has 2 local additions not yet mirrored back to the Drive doc (source of truth per `docs/cortex/README.md`'s sync convention). Low urgency, but flagged to avoid divergence.
9. **Check Work Shifts → Live Stints panel for a stale/ghost install card** left over from the auth-wipe/reconnect cycle overnight; Dismiss it (`DISMISS_INSTALL`, migration 017 pattern) before trusting concurrent-shift state.

## Remaining engineering by plan
- **040 Phase 1** — code-complete 6/6. Nothing left to build; gate is Malkio's manual regression → v7.0.0 (see waiting-on #3).
- **041 Phase 2** (partial 4/6) — Drive/OneDrive external-archive adapters (T2 remainder); companion merge/deploy to close T1 (#5 above); proxy deploy (T3, #7 above); Vercel Gateway key still blank (T4 gated on procurement).
- **042 Phase 3 voice** (partial 3/9) — offscreen/global-hotkey plumbing (gated on the `.pem` board item, see Risks); realtime speak-to-Tabby; dictation engine; routed STT/TTS.
- **043 Phase 4 autonomy** (partial 3/6) — T3 multi-cadence optimization; T5 SOP observation mode; T6 Headbox harness placement; T4 migration 023 needs applying (bundled in #6 above).
- **044 Phase 5 cross-signal** (partial 1/6) — detection-surface wiring for controller attribution; reply-latency/power signals; leverage analytics; ergonomic camera; mobile parity (tabatha-mobile is scaffold-only); Mac companion parity.

## Back burner
- **Agent Control Layer (Tabatha CLI/MCP)** — `docs/cortex/PROGRAM-agent-control-layer.md`. Explicitly parked by Malkio until the Cortex program is complete. Efferent sibling to Cortex (reads/writes Tabatha state instead of just observing); phased P0–P4; open questions on transport (MCP-first vs CLI-first) and host (companion WS bridge vs extension native-messaging). Asana task `1216454646338939`.
- Parking-lot entries dated 2026-07-09/10 (`.headbox/parking_lot.md`):
  - **`.pem` may break persistence across restarts** (2026-07-09) — unpacked extension may disappear on machine restart; needs "verify sync fully rehydrates on login" then ship a stable no-`.pem` build with a pinned manifest `key`. Still open — blocks any Phase 3 manifest-permission work (voice hotkeys need it).
  - **Desktop companion stale-deploy + Headbox integration entangled** (2026-07-09) — largely addressed by tonight's companion build; merge/deploy is the remaining piece (waiting-on #5).
  - **Agent Control Layer parked** (2026-07-10) — see above.

## Risks / loose ends
- Voice observations use `surface:'voice'`, outside migration 022's `browser|os` CHECK constraint — needs a small follow-up migration before voice rows can ever cloud-sync (local-only today).
- Compound sensitive rules with BOTH host and app/title conditions travel to the companion with the host clause un-evaluable — split such rules or add companion-side host awareness (low priority; simple rules unaffected).
- `pushCaptureConfig` doesn't send `capture_dir` — companion falls back to its own default (`%APPDATA%\Tabatha Desktop\captures`); needs UI plumb-through as the C15 config surface grows.
- Ledger pruning doesn't delete orphaned frame **files** — companion prunes its own, but extension-side Downloads files persist (open question in DATA-MAP).
- ~~Migration gap causes partial sync failures~~ — **CLOSED 2026-07-10** (018–024 applied; after re-sign-in, sync should be fully clean).
- Program-spec Google Doc out of sync with 2 local additions — see waiting-on #8.
- Possible stale/ghost Live Stints card from the overnight auth-wipe/reconnect cycle — see waiting-on #9.
- `DECISION-voice-settings.md` (T0, C9↔#211 reconciliation) commits to a webspeech default + C8-routed STT/TTS architecture without an explicit Malkio sign-off yet — worth a read before Phase 3 voice work continues.
