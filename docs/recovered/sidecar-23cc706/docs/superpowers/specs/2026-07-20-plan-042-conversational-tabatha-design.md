# Implementation Plan 042: Conversational Tabatha (the AI pillar)

**Status:** draft — Koda review next
**Driver:** Malkio · **Author:** Cindra
**Current version:** Extension 6.7.44 (main tag) / Sidecar 0.11.0
**Target version on v1 completion:** Sidecar minor bump (0.12.0-line; exact number set per Headbox Rule 10 at commit time) + Extension patch bump for the PTT unit. No breaking schema changes in v1 — no major bump forced.
**Depends on:** nothing outside this doc for v1. v2 depends on an active Flux account existing as a concept (not yet true anywhere in this codebase — flagged, §6).
**Feeds into:** Plan 043 (Peer View nudge audio can ride this doc's dispatch channel), Plan 044 (AI-authored preset checkpoints, v2), #182 Chaperone (this doc generalizes its trigger/dispatch layer).

---

## 0. Reality check before scoping

The brief assumes assembly.ai is today's transcription provider. It is not.
Grepping `sidecar/`, `supabase/functions/`, `src/` for "assembly" returns zero
hits. **Today's provider is the browser-native Web Speech API**
(`sidecar/src/lib/speech.ts`, `createSpeechCapture`, `continuous=true` +
`interimResults=true`, cumulative `finalText` accumulation in `onresult`). No
server-side STT exists anywhere. **Interpretation chosen:** design the
provider interface so Web Speech API is the real, working v1 default
implementation, and assembly.ai is the first pluggable alternative behind the
same interface — not "swap out assembly.ai," but "introduce the abstraction
assembly.ai will eventually slot into." This is stated explicitly so nobody
build-time-assumes assembly.ai is already wired.

Also: #182 Chaperone's own design doc already resolved the full-agentic engine
question — **"Hermes first, OpenClaw if needed" — both installed** (see
`docs/features/182-chaperone-mode.md`, Enrichment §"Escalation path"). Plan 042
does not re-litigate that choice; §4 below builds on it rather than proposing a
third LLM stack.

---

## 1. Unit 0 — Two reported voice bugs (fix first, blocks nothing else)

**Bug A: transcription repeats the first few words of a recording.**
`sidecar/src/lib/speech.ts` (`createSpeechCapture`, lines 39-101) accumulates
`finalText` across the lifetime of one `SpeechRecognition` instance. Chrome's
native recognizer silently ends and auto-restarts a `continuous` session after
its own internal silence/duration timeout; nothing in `speech.ts` currently
resets `event.resultIndex` bookkeeping or detects a restart boundary. Working
hypothesis: on auto-restart, the new session's first `result` event re-emits
indices already folded into `finalText`, duplicating the leading words.
**Fix scope:** `sidecar/src/lib/speech.ts` — track a per-`start()` session
epoch; on `onend`→auto-restart, either (a) start a fresh accumulator and only
append the delta once confirmed non-overlapping with the tail of the prior
segment, or (b) suppress the first `isFinal` result of a restarted session if
its text is a prefix-match of the last already-committed sentence. Needs a
real device/browser repro before landing — file a quick manual repro note in
the PR, this is the kind of bug that hides behind exact silence-timing.

**Bug B: proactive check-in stops recording while the user is still
speaking, AND treats the intent as "no progress" even when checkpoints
exist.** Two separate root causes, confirmed against
`sidecar/src/components/VoiceCheckIn.tsx`:
- *Cuts off mid-thought:* nothing in `VoiceCheckIn.tsx` overrides the
  recognizer's default silence-timeout or auto-restarts a session that ends
  from a natural mid-sentence pause — the existing 450ms grace window (lines
  157-173) only guards the *manual* stop-button case, not an unexpected
  `onend`. **Fix:** on an unexpected `onend` (not user-initiated), silently
  restart the same logical session (reusing Bug A's session-epoch tracking so
  restart doesn't reintroduce a duplication) instead of surfacing it as "done
  listening."
- *"No progress" despite checkpoints existing:* the staleness trigger (lines
  205-212) already reads `focus_checkpoints` via `useCheckpoints` — but only
  the **timestamp** of the latest note (`notes[0].created_at`), never its
  **content**. The check-in prompt and the "no progress" framing are
  generated without ever looking at what the last checkpoint said. This is
  the same gap this whole plan exists to close (§2) — Unit 0's fix is the
  minimal version: have the check-in prompt interpolate
  `notes[0].text`/`progress_level` when one exists ("last you said '<text>' —
  still on that, or did it move?") instead of a generic "still working on
  this?" that ignores it.

**Files:** `sidecar/src/lib/speech.ts`, `sidecar/src/components/VoiceCheckIn.tsx`.
No schema change.

---

## 2. Architecture — one dispatch channel, three entry points

Everything proactive (check-ins, calls, Dispatch/PTT, personality interrupts)
routes through **one processing channel**: raw speech → transcript segments →
a mutation/intent pipeline that can adjust, create, or resume a focus,
checkpoint, or task. What differs per entry point is only **how much
conversational feedback happens on top of that channel**:

| Entry point | Feedback | Trigger | v1/v2 |
|---|---|---|---|
| **Dispatch / PTT** | None — lightweight transcription only, best-effort attribution + mutation, no spoken reply | User-initiated (push button, hold, release) | v1 |
| **Scripted check-in** (today's `VoiceCheckIn`) | Deterministic keyword parse, checkpoint-aware prompt (Unit 0) | App-initiated on staleness | v1 (fixed) |
| **Rotating preset prompts** | Pre-recorded/scripted lines from a rotating pool, no live LLM | App-initiated (same triggers as check-in + #182 v0) | v1 |
| **Realtime conversational AI** | Full LLM round-trip, follow-up questions, routes content to Tabatha vs Flux | App-initiated ("app starts the conversation, the AI agent picks it up") | v2 |
| **In-app "calls"** | Full realtime conversation, 5-10 min intake | App- or user-initiated | v2 |

The v1/v2 line is drawn exactly where a live LLM call becomes required. v1
never calls an LLM; v2 is entirely "wire the LLM in," reusing the same
mutation pipeline v1 already built and exercised.

---

## 3. v1 — buildable now, no new AI infra

**Unit 1 — Transcription-provider abstraction.**
New `sidecar/src/lib/transcription/` module: a small interface
(`start(onSegment, onEnd)`, `stop()`, `providerId`). `webSpeechProvider.ts`
wraps the existing (Bug-A-fixed) `speech.ts` as the default, real
implementation. `assemblyAiProvider.ts` ships as a typed stub (throws
"not configured" until a v2 API key/edge-function pairing exists) so the
interface shape is locked in without a live integration. Provider choice
lives in `profiles.settings.sidecar.transcriptionProvider` (JSONB, no
migration). Ties into the Olympus `feature_permissions` matrix's illustrative
`voice_checkins` key (`docs/superpowers/specs/2026-07-20-flux-zeus-admin-design.md`
§5) for future pro-gating — no hard dependency on Olympus shipping first.

**Unit 2 — Dispatch/PTT mode, Sidecar.**
Evolves the existing lightweight "Simple mode" voice entry into push-to-talk:
press-hold-release on a new `DispatchButton` component
(`sidecar/src/components/DispatchButton.tsx`), streaming segments through
Unit 1's active provider into a new `sidecar/src/data/dispatch.ts`
(`processDispatchTranscript(text): MutationResult[]`) that reuses
`voiceCheckin.ts`'s existing deterministic command parser
(`parseVoiceCommand`) as its first pass — same regex router, invoked without
any spoken/TTS feedback. Attribution: every mutation created via Dispatch
tags `tags._src = 'dispatch'` (mirrors the existing `_src='sidecar'` off-device
tagging convention) so it's auditable which mutations came from best-effort
PTT parsing vs explicit UI actions.

**Unit 3 — Dispatch/PTT mode, Extension.**
Same push-to-talk affordance surfaced in the InBar and/or popup
(`src/content/` or `src/popup/`, zone-check against
`docs/parallel-development-workflow.md`'s ownership table before scoping the
exact file — InBar is isolated/lower-conflict). **Decision: duplicate the
small parser/mutation logic rather than share a package across the two
separate codebases (`src/` extension vs `sidecar/`)** — they have different
storage layers (`chrome.storage` vs Supabase-direct) and no existing
cross-repo shared-code mechanism exists in this project. Revisit only if a
third surface needs the same logic (monorepo extraction is a real cost, not
worth it for two callers).

**Unit 4 — Checkpoint-aware rotating preset prompts.**
A small pool of pre-recorded/scripted check-in phrasings (extends #182's v0
"personality packs" concept — same `settings.chaperone` config surface, same
realtime `browser_profile_status` trigger channel) that rotate instead of
repeating one script verbatim, each template interpolating the latest
checkpoint's text/progress_level (Unit 0's fix generalized into a reusable
`buildCheckInPrompt(focus, latestCheckpoint)` helper in
`sidecar/src/lib/checkInPrompts.ts`). No LLM — string templates only.

**Unit 5 — Device-handoff micro-summary (CeeCee idea).**
On a surface regaining focus after being backgrounded (Page Visibility
`visible` transition, reusing the existing listener shape from
`PhoneFocusMode.tsx` inverted, or extension tab-activate), compute a diff of
`focus_events`/`focus_checkpoints` since that surface's own last-active
timestamp and show a one-line summary ("while you were on your phone: +2
checkpoints, 1 extension"). Purely client-side aggregation over data already
synced — no new table. The one new piece of state needed (per-surface
last-active timestamp) is small enough to live in `AsyncStorage`/local
storage rather than a new migration; if it later needs to be cross-device
aware, it can move into `device_settings` JSONB (migration 045, already
device-scoped) without a schema change.

---

## 4. v2 — named, not designed in build detail here

- **Realtime conversational AI** — a live LLM round-trip (backbone: Hermes
  first, OpenClaw if needed, per #182's already-resolved decision) driving
  the check-in/call/Dispatch-with-feedback experiences. Needs: a new edge
  function or Hermes-side session bridge, a system-prompt assembly step that
  feeds "Tabatha = operational context (what the user is doing, always)."
- **In-app "calls."** App/extension/phone-first ringing UI, 5-10 min intake
  conversations, routing captured content into Tabatha (operational) vs Flux
  (personal) — genuinely requires an active Flux account concept, which does
  not exist anywhere in this codebase today (no `flux_account_id`, no Flux
  auth bridge found). **This is a real, named dependency gap** — v2 planning
  for the routing logic cannot get more concrete than this doc without a
  companion Flux-side design doc defining what "an active Flux account" means
  from Tabatha's side (a linked auth identity? a shared profile row? a
  webhook?). Flagged for Malkio, not assumed.
- **WhatsApp / phone-system channel** for calls — external telephony
  integration, not scoped here.
- **assembly.ai (or another) provider actually wired** behind Unit 1's
  interface — v1 only stubs the shape.
- **AI-authored preset checkpoints** — depends on this doc's v2 LLM path;
  cross-referenced from Plan 044 §7 unit 8.
- **Full personality-interrupt generalization** beyond #182's pre-recorded v0
  and this doc's Unit 4 rotating-preset layer.

---

## 5. Dependencies section

| Depends on | For |
|---|---|
| Nothing (self-contained) | Unit 0, 1, 2, 3, 4, 5 (all v1) |
| An active Flux account concept (not yet defined) | v2 in-app calls, Tabatha↔Flux routing |
| #182 Chaperone's `settings.chaperone` config surface (already shipped) | Unit 4 |
| `browser_profile_status` realtime channel (migration 011/033, shipped) | Unit 4, Unit 5 |
| Olympus `feature_permissions` (draft, migrations 046-049, not yet built) | Soft — future pro-gating of Unit 1's provider choice only, not a build blocker |

| Blocks | Why |
|---|---|
| Plan 044 §7 Unit 8 (AI-authored presets) | Needs this doc's v2 LLM path |
| Full Chaperone GA (#182) | Needs this doc's v2 realtime conversational layer |

---

## Parallelability Review

- **Zones touched:** Sidecar `sidecar/src/lib/`, `sidecar/src/components/`,
  `sidecar/src/data/` (new files, not edits to shared high-traffic ones except
  `VoiceCheckIn.tsx` and `voiceCheckin.ts`). Extension: InBar/popup zone for
  Unit 3 only (isolated per the ownership table).
- **Shared files modified:** `sidecar/src/components/VoiceCheckIn.tsx` (Unit
  0 + Unit 4) — no 🔴/🟡 extension-side shared files touched.
- **Conflicts with active worktrees:** none known at doc time — re-check
  `git worktree list` before starting Unit 0 (this worktree,
  `claude/tabby-sidecar-mobile-46c612`, already touches `sidecar/`; coordinate
  if still open at build time).
- **Can run parallel with other work:** Yes — Units 0/1/2/4/5 are Sidecar-only
  and additive; Unit 3 is extension-isolated (InBar/popup zone).
- **Max branch lifetime estimate:** Unit 0 alone: 1-2 sessions. Units 1-5
  (full v1): ~1 week — split at Unit 0 (ship the bug fixes standalone first,
  they're independently valuable and low-risk) then Units 1-5 as a second
  branch.
- **Scope-split points:** Unit 0 (bug fixes) ships alone first. Units 1+4
  (provider abstraction + prompt templating) are a natural second slice.
  Units 2+3 (PTT, two surfaces) are a third slice, since they're
  cross-codebase and best reviewed together for parity. Unit 5 is
  independent and can slot in anywhere.

---

## Koda vet + expansion (2026-07-20)

### Reality-check re-verification

Spot-checked the doc's own reality check rather than trusting it blind:

- `sidecar/src/lib/speech.ts` confirmed line-for-line: `continuous = true`,
  `interimResults = true`, `finalText` is a closure variable reset only
  inside the exposed `start()` method (`finalText = ''`), never touched by
  `onend`. The Bug A hypothesis holds up under a closer read than the doc
  itself does: `finalText` only resets when **the app code** calls
  `controller.start()` again. If Chrome's own engine silently restarts the
  underlying recognition session without the SpeechRecognition object ever
  firing a JS-visible `onend`/`onstart` pair the app reacts to, the browser's
  internal `event.resultIndex` numbering restarts from 0 for the new internal
  segment while `finalText` (JS-side) still holds the old accumulation —
  exactly the "re-emits indices already folded in" mechanism the doc
  describes. This is a plausible, well-reasoned diagnosis, not a guess
  dressed up as one.
- `sidecar/src/components/VoiceCheckIn.tsx` line citations are exact:
  lines 157-173 are the 450ms grace-window effect verbatim; lines 205-212
  are the staleness `baseline`/`staleMs` computation verbatim. The "ignores
  checkpoint content" claim is confirmed — `notes[0].created_at` is read,
  `notes[0].text` never is, and the spoken prompt is the hardcoded
  `` `How's ${f.label} going?` `` with no interpolation.
- `parseVoiceCommand` (Unit 2's reuse target) is a real exported function in
  `sidecar/src/lib/voiceCheckin.ts:79`, and `settings.chaperone` (Unit 4's
  reuse target) is real, confirmed live in `docs/features/182-chaperone-mode.md`
  and read by `sidecar/src/screens/ContextView.tsx`'s
  `useChaperoneOnPhoneAway`. Both cross-references check out.

### Verdicts per unit

| Unit | Verdict | Notes |
|---|---|---|
| **Unit 0 (voice bugs)** | **PROCEED** | Diagnosis verified against real line numbers, not paraphrased. Bug A's two-option fix (prefix-suppress vs. session-epoch) should pick (a) session-epoch tracking as primary — prefix-matching (b) is fragile against a restart landing mid-word (no clean prefix boundary to detect). |
| **Unit 1 (provider abstraction)** | **PROCEED** | Low-risk interface extraction. One gap: the interface (`start(onSegment, onEnd)`, `stop()`, `providerId`) has no `onError` in its stated shape even though `speech.ts`'s real controller has one (`onError`) — the wrapper needs to surface mic-permission-denied through the same channel `useVoiceCapture` already uses, or PTT will fail silently on a denied mic. **Revise:** add `onError(code: string)` to the Unit 1 interface signature explicitly. |
| **Unit 2 (Dispatch/PTT Sidecar)** | **PROCEED** | `parseVoiceCommand` reuse confirmed real and exported. |
| **Unit 3 (Dispatch/PTT Extension)** | **PROCEED** | The no-shared-package decision is sound engineering judgment for a two-caller, two-runtime situation — don't force it. |
| **Unit 4 (rotating presets)** | **PROCEED** | `settings.chaperone` reuse confirmed. |
| **Unit 5 (device-handoff micro-summary)** | **PROCEED, with a named gap** | Page Visibility `visible` fires on tab-switch-back, but a **cold start** (tab was fully closed, phone was locked long enough to kill the PWA process, or a fresh install) never fires a `hidden→visible` transition at all — there's no prior "last-active" timestamp to diff against on a truly fresh mount. The unit as written silently produces no summary on cold start, which is actually the *more common* real-world case for "I just picked my phone back up" after hours away. **Revise:** on mount, if no local last-active timestamp exists yet (first-ever load) OR it's older than some threshold (e.g. 4h — implies a full session gap, not a tab-switch), treat it the same as a visibility-transition and compute the same diff from `AsyncStorage`'s stored timestamp rather than only wiring the `visibilitychange` listener. |

### Security/robustness note (minor, non-blocking)

Unit 2/3's Dispatch mutations are described as "best-effort" and untagged with
any confidence score — a garbled PTT transcript that happens to parse as a
valid command (e.g. background noise misheard as "resolve") silently
resolves a real focus with zero confirmation UI (Dispatch explicitly has "no
spoken/TTS feedback"). VoiceCheckIn's manual check-in mitigates this with a
6-second Undo confirm strip; Dispatch as scoped has **no equivalent visible
trail** beyond the `tags._src = 'dispatch'` audit tag, which only shows up if
the user goes looking. **Revise (low-cost):** Dispatch mutations should still
render the same `Confirmation`-strip UI pattern `VoiceCheckIn` already has
(text + Undo), just without the *spoken* half of the round-trip — "no
conversational feedback" should mean no TTS, not no visible confirmation.

### Koda additions

- **Dispatch-mode voice prefixes for routing ("for flux: …").** Since v2's
  entire open question is "how does content route Tabatha-operational vs
  Flux-personal" (§4, flagged as blocked on an undefined Flux-account
  concept), v1's Dispatch channel could ship a **client-side-only** prefix
  convention today, with zero Flux dependency: if a PTT utterance starts
  with a recognized trigger word ("flux", "personal", "note to self"), don't
  run it through `parseVoiceCommand` at all — instead append it to a local
  `dispatch_overflow` log (or literally just drop it into the Sidecar's
  existing checkpoint-notes free-text field, tagged `tags._src='dispatch_overflow'`)
  rather than silently discarding unparseable command syntax. This gives
  Malkio a place to safely test the voice-prefix habit *now*, and gives
  Plan 042 v2 a real corpus of "what did people actually say when told
  'for flux'" to design the eventual routing logic against, instead of
  guessing at v2 design time.
- **PTT "commit tone" instead of silence.** Right now Dispatch has literally
  zero feedback on release — press, speak, release, and the user has no
  signal the mutation even landed short of opening the app and checking.
  A single short audio *tone* (not TTS, not a spoken reply — stays inside
  "no conversational feedback") on successful parse vs. a different tone on
  unparseable input would close the trust gap almost for free, and composes
  cleanly with the confirmation-strip revision above (tone now, visual strip
  whenever they next look).
- **Unit 0's fix is itself a good "personality interrupt" seed.** Once the
  check-in prompt knows `notes[0].text`, the same interpolation machinery
  (`buildCheckInPrompt(focus, latestCheckpoint)`) is one templating step away
  from varying *tone* based on how stale the checkpoint is — a 20-minute-old
  checkpoint gets a soft "still on that?", a 3-hour-old one gets a more
  pointed "haven't heard from you in a while — still real, or did priorities
  shift?" This is Unit 4's rotating-preset pool, just keyed on staleness
  bucket instead of pure rotation — cheap to add once the interpolation
  helper exists, worth naming explicitly so it isn't rebuilt from scratch
  when #182 Chaperone matures.
