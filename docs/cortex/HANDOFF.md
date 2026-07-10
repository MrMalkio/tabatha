# Cortex Overnight Handoff — Fable, 2026-07-09 → 2026-07-10 (final)

For Malkio. Two autonomous passes tonight on `claude/tabatha-ai-integration-layer-91903b` (extension) + `feat/cortex-capture` (companion repo). Nothing pushed; staging/main untouched; no secrets printed or written to tracked files.

## ⚡ First: your smoke-test failures — root-caused, NOT a code bug
Dead clock-out/unpause buttons + intent stuck on "⏳ Setting…" were **reproduced-against and cleared** by a full real-browser regression (Playwright + real Chrome v150, fresh profile, CDP `Extensions.loadUnpacked` — note Chrome 137+ ignores `--load-extension`): clock in/out via the real buttons, pause→resume, Set Focus, SET_INTENT, capture on/off, ledger export — **11/11 PASS** on the current dist.
**Cause: stale MV3 service worker.** I rebuilt `dist` under your loaded extension; until you press **Reload (↻) at `chrome://extensions`**, the old SW runs against swapped assets and every `sendMessage` hangs — exactly your symptoms. **→ Press Reload, then re-test.** Rule codified in AGENTS.md Build→Load constraint #5. The working "audio transcription" was the existing webspeech `VoiceInput` (#211 Phase A). One hardening landed from your report: `RESUME_FOCUS` without an id now falls back to the active/most-recently-paused focus.

## State of the phases (registry: `.headbox/plan-registry.md`)
| Plan | Status | What shipped tonight |
|---|---|---|
| **040 Phase 1** | ✅ code-complete 6/6, regression-verified in-browser | capture pipeline, guard/redaction, ledger + nightly export, cron-in-harness, dashboard, DATA-MAP |
| **041 Phase 2** | partial 4/6 | **Companion OS capture BUILT** (`tabatha-desktop` branch `feat/cortex-capture` @ `006c3aa`: GDI window/monitors/virtual modes, guard parity fail-closed, age+bytes retention, settings.json, tray toggle — **68 Rust tests green**) + extension handoff wiring (CAPTURE_TAKEN → ledger; config mirrored over WS; host-only rules never travel). Proxy edge fn code at `supabase/functions/cortex-proxy/` (deploy = you set the secret). Morning digest + approved-actions export + config surface v1 (routing/proactivity) in CortexPanel. Pending: companion merge/deploy, Drive/OneDrive archive adapters, gateway key |
| **042 Phase 3** | partial 3/9 | **T0 decided**: unified voice schema ([DECISION-voice-settings.md](DECISION-voice-settings.md), mirrored to Drive). **Voice v0 shipped** (no new permissions): Tabby speaks instead of the FTE/drift overlay when enabled — tone → 1.5s "hold off" mic window → short varied generated line → modal fallback; home-header 🎙️ voice-note button → ledger. **C10 self-correction v1 shipped** (opt-in, nightly 04:00): tab↔intent + actual-work-time detectors, confidence-laddered auto-apply, every correction audited + revertible. Pending: global hotkeys/offscreen (gated on .pem), realtime speak-to-Tabby, dictation engine, routed STT/TTS |
| **043 Phase 4** | partial 3/6 | proactivity gate (reactive default; codegen never auto-installs), overnight EXECUTE bundle builder (consumes `cortex-actions.v1`, review-first hard rules), migration 023 `org_capture_policy` (written, NOT applied) |
| **044 Phase 5** | partial 1/6 | controller-attribution decision core (human/ai-agent/unknown). Camera/mobile/Mac are genuinely future work — no pretend progress |

**Verification tonight:** extension **332/332 node tests**, build green; companion **68/68 cargo tests**, build green; two independent Opus review passes (Phase 1 diff: 6 findings fixed incl. incognito fail-closed; Phase 2/3 diff: 1 finding fixed — self-correction storage race narrowed to single-round-trip targeted mutations; everything else verified clean, incl. InBar voice interception safety and content-script bundling).

## Everything is opt-in and OFF by default
`screenshotCapture`, `voice.enabled`, `voice.output.enabled`, `selfCorrectionEnabled`, proactivity=reactive. Nothing observes, speaks, or corrects until you flip toggles (Settings → Privacy & Capture → Cortex panel).

## Your action list (in order)
1. **Reload the extension** (chrome://extensions ↻) → re-run your smoke test.
2. Phase 1 regression per the checklist below → **v7.0.0 bump** (`public/manifest.json` + `npm run version:sync`).
3. **Companion**: review + merge `feat/cortex-capture` in `tabatha-desktop`, cut the deploy (this also closes the deploy board item that gated Phase 2; the new build carries the crash-hardening FIX bundle too).
4. **Proxy** (enables tier-②): `supabase secrets set OPENAI_API_KEY=… --project-ref mtdgoahskcibjbhfvofx` then `supabase functions deploy cortex-proxy`.
5. Decisions when ready: apply migrations 022/023; Vercel-Gateway/ElevenLabs keys (slots still blank); `.pem` board item before any manifest-permission phase (voice hotkeys need it).

## Phase 1 smoke test (unchanged)
Settings → Privacy & Capture → Screenshot capture ON → browse → frames in `Downloads\Tabatha\Cortex\captures\personal\…`; suppression rule test; "Export today's ledger now"; cron bundle download; import recommendations. NEW since your last test: flip Voice v0 on and let a focus timer expire — Tabby should tone + speak with the overlay as fallback; try the 🎙️ voice-note button on home.

## Known follow-ups (documented, deliberate)
- Compound sensitive rules carrying BOTH host and app/title conditions travel to the companion with the host clause un-evaluable — split such rules or add companion-side host awareness (low priority; simple rules are unaffected).
- `pushCaptureConfig` doesn't send `capture_dir` — companion uses its own default (`%APPDATA%\Tabatha Desktop\captures`); add UI plumb-through when the C15 surface grows.
- Voice observations use `surface:'voice'`, outside migration 022's browser|os CHECK — needs a tiny follow-up migration before voice rows ever cloud-sync (local-only today).
- Ledger pruning doesn't delete orphaned frame FILES (companion prunes its own; extension-side Downloads files persist) — DATA-MAP open question.

## Artifact map
Extension commits tonight: `d228dc1`→`f74ae3d`+wrap-up (see `git log`). Companion: `feat/cortex-capture` @ `006c3aa`. Docs: 15 feature files + plans 040–044 + prompts + DECISION doc all carry Drive links (folder: *Cortex — AI Optimization Layer*, subfolders features/prompts/plans). Asana: 15 C-subtasks + progress comments + status updates on Flux Development. DATA-MAP updated with the night's new signals.
