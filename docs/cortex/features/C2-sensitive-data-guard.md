# C2 — Sensitive-Data Guard

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5
Origin: user; privacy spine (SOURCE-braindumps.md Dump 3)
Phase: Phase 1 (T1–T3 shipped; pixel-level redaction rendering is T4)

## Purpose

C2 is the privacy spine sitting between C1's capture decision and any write to disk. It answers
two questions for every frame C1 is about to take: *should this frame be captured at all*
(suppression), and *if so, what part of it must be blurred before it's written* (redaction). The
governing insight from the design brain-dump is that the privacy risk in a tool like QuickBooks
is never "which client was I looking at" — it's the *combination* of a client's identity and
their private financial detail appearing together in one frame. Suppression removes a frame
outright; redaction keeps the page-identifying context (title, app chrome) while blacking out the
sensitive region — and redaction happens **before** any bytes are ever written, never as a
post-hoc cleanup pass.

## Detailed behaviors

**Global opt-out**
1. `settings.screenshotCapture` is the master enable gate for the entire capture pipeline
   (wired in `src/settings/index.jsx` L1833, read by `captureService.isEnabled()`). When off, C2
   never runs — there's nothing to guard because nothing is captured. This is per-user, on the
   personal profile.
2. Org enforcement (capture-mandated-on-clock-in) is a separate concern owned by C12, not by this
   toggle — a user's personal opt-out is not silently overridden by an org mandate; the mandate is
   an explicit, admin-configured requirement that layers on top, not a bypass of consent (see
   Open Questions for precedence once C12 lands).

**Per-site/app suppression — scoped to the active capture target only**
3. `evaluateCapture(target, rules)` in `src/utils/sensitiveDataGuard.js` evaluates **only the
   frame that is actually about to be captured** — the currently focused/active tab or window.
   `captureService.captureNow()` calls it with exactly one `target`, so tabs/windows that are not
   the capture target are never evaluated and therefore never suppressed.
4. Concrete QuickBooks example: rule `{ when: { hostContains: 'intuit.com' }, action: 'suppress' }`
   skips the frame while a QuickBooks tab is the *focused, about-to-capture* target. The instant
   the user switches to a different tab, that tab becomes the new target and is evaluated on its
   own merits — capture resumes immediately for everything else. There is no global blackout while
   QuickBooks merely exists in another tab.
5. Suppression is re-evaluated on every single capture attempt, not cached or made sticky per
   session — rule changes in Settings take effect on the very next capture with no restart needed.
6. `appName` matching (desktop/companion-captured frames) is case-insensitive and structurally
   identical to `host`/`hostContains` matching for browser frames — the same rule set protects
   both "QuickBooks the web tab" and "QuickBooks the desktop app" without duplication (tested in
   `test/sensitiveDataGuard.test.js`).
7. **Known gap:** `matchesTarget()` never reads `target.surface`, even though the JSDoc documents
   a `target.surface` field. There is currently no way to write a rule that suppresses QuickBooks
   only in the browser while still allowing the OS-level QuickBooks desktop app to be captured (or
   vice versa). If surface-scoped suppression is wanted, `matchesTarget` needs a `when.surface`
   branch — not implemented today.

**Capture-time auto-redaction**
8. When a target matches a `redact` rule (and no `suppress` rule also matches — see precedence
   below), `evaluateCapture` returns a `redactions` array of `{ region, percent }` descriptors
   (e.g. `{ region: 'bottom', percent: 80 }`). These describe pixel regions to blur, applied to
   the raw frame buffer **before** it is written to any storage target (local disk, ledger
   reference, or sync) — never a "capture then redact" two-step.
9. Rationale (verbatim intent): blurring the bottom 80% of a QuickBooks tab keeps the top strip —
   window/tab title, page/app chrome — which is enough to know *what page/client* was open,
   while removing the financial detail region that would otherwise co-locate client identity with
   client-private information in one image.
10. A target can carry multiple redaction regions (array), e.g. two distinct on-screen panels
    blurred independently in one frame.
11. **Precedence: suppress always wins over redact.** In `evaluateCapture`, `matched.some(r =>
    r.action === 'suppress')` is checked before any redact rules are collected — if the same
    target matches both a suppress rule and a redact rule, the frame is skipped entirely and the
    redact match is moot (verified in `sensitiveDataGuard.js` L27–33). This satisfies program spec
    §6 rule 5 ("sensitive-context suppression always wins") but should be called out explicitly
    since it's a real behavioral choice, not an accident of code order.
12. Redacted (non-suppressed) frames flow through the **full** capture pipeline — a ledger
    observation is recorded, `capture_ref.redacted = true`, and `capture_ref.redactions` (JSONB)
    stores the applied regions for audit/debugging.

**Sensitive workstyle profiles**
13. Finance/legal presets are a **UI convenience layer**, not a separate runtime concept: picking
    a preset in Settings expands into a batch of ordinary `sensitiveRules` entries (suppress
    and/or redact) rather than introducing a second evaluator. `evaluateCapture` only ever sees
    the flat `rules` array.
14. Example preset shape: a "Finance" preset seeds suppress/redact rules for known
    accounting/banking hosts (e.g. `intuit.com`, common bank domains) or their desktop apps; a
    "Legal" preset seeds rules for common case-management SaaS domains/app names. The concrete
    seed list is a placeholder to be curated with the user — presets remain user-editable after
    applying (they are not locked/read-only once expanded into `sensitiveRules`).

**Suppressed frames still need a ledger footprint**
15. Manual screen recordings (C1 behavior 12–13) must re-evaluate the guard *continuously* as
    focus changes mid-recording — e.g. a recording that pans over a QuickBooks window should blur
    or pause for that portion, not just at recording start. **Not implemented today**: recording
    doesn't exist yet (C1 T4), and `evaluateCapture` is currently only invoked from the
    single-frame `captureNow()` path — there is no per-frame-of-a-stream call site to extend once
    recording lands.
16. **Real gap found in current code:** when `guard.suppress` is true, `captureService.captureNow()`
    returns `{ captured: false, reason: 'suppressed' }` **without calling `recordObservation()`**
    (`captureService.js` L100–101) — so a suppressed frame produces **zero** ledger entry today.
    This contradicts the intent that the timeline should still show "something was worked on
    here, just not what" (a `kind: 'context'` observation with no `captureRef`, mirroring how
    `cortex_observations.capture_ref` is nullable and `cortex_capture_refs.suppressed` exists as a
    boolean specifically to represent this case). Flagged as a required T4 fix, not a design
    question — the data model already anticipates it; the service just doesn't call it yet.

## Data model touchpoints

| Key / table | Location | Notes |
|---|---|---|
| `settings.screenshotCapture` | `constants.js` (~L49) | Master gate — shared with C1, not C2-specific |
| `settings.sensitiveRules` | `constants.js` (~L55) | `[]` by default; array of `{ when, action, redact? }` — the only rule store C2 reads |
| `settings.keystrokeAnalytics` | `constants.js` (~L50) | Reserved, **separate** concern from screenshot guarding — do not conflate |
| `tabatha.cortex_capture_refs.redacted` (bool) | `022_cortex_ledger.sql` | Set when any redaction applied |
| `tabatha.cortex_capture_refs.redactions` (jsonb) | same | Applied region descriptors, for audit |
| `tabatha.cortex_capture_refs.suppressed` (bool) | same | Already modeled; not yet populated end-to-end (behavior 16) |
| `tabatha.cortex_observations.capture_ref` | same | Nullable FK — supports the "suppressed but still logged as context" case once behavior 16 is fixed |

**Local vs syncs:** the redaction/suppression *decision* and its metadata (booleans, region
descriptors) may sync as part of cloud-batch backup if the user opts in; the raw pixels — both
the pre-redaction original (which must never exist on disk at all) and the redacted output — stay
local/archived per C3. Program spec §6 rule 4 ("redaction happens at capture time, before write")
means there is never a pre-redaction file to leak in the first place.

## Dependencies (transformer graph)

**Depends on:**
- **C1 (Adaptive Capture Engine)** — supplies the capture target and timing decision that C2
  gates; C2 has no independent trigger of its own.
- **C15 (Config & Interaction-Density Model)** — surfaces the rule editor, suppression-list UI,
  and preset picker; C2 only consumes the resulting `sensitiveRules` array.

**Feeds:**
- **C3 (Storage & Retention Fabric)** — only guard-approved (allowed or redacted) frames are ever
  handed to storage; suppressed frames never reach C3 at all.
- **C4 (Observations Ledger)** — every observation carries the guard's verdict (`redacted`,
  `suppressed`) so downstream consumers know a record is intentionally incomplete, not missing.
- **C5 (Pattern Engine) / C6 (Optimization Loop) / C7 (Recommendation Dashboard)** — must never
  surface a recommendation derived from a suppressed or redacted region's content; C2's verdict is
  the boundary these layers are not allowed to see past.
- **C12 (Team/SOP Mode)** — org-mandated capture-on-clock-in still passes through C2; org admins
  may need to add org-level rules on top of personal ones (see Open Questions for precedence).

## Reuse points

| File (verified) | Reused for |
|---|---|
| `src/utils/sensitiveDataGuard.js` | `evaluateCapture()` — pure, unit-tested suppression + redaction decision |
| `src/background/services/captureService.js` | Calls `evaluateCapture()` inline in `captureNow()` (L100), before `recordObservation()` |
| `src/background/constants.js` (~L55) | `sensitiveRules` default (`[]`) |
| `src/settings/index.jsx` (L101, L1829–1837) | "Privacy & Capture" panel — toggle exists; rule/preset editor UI does not exist yet (C15 task) |
| `supabase/migrations/022_cortex_ledger.sql` | `cortex_capture_refs.{redacted,redactions,suppressed}`, `cortex_observations.capture_ref` (nullable) |
| `test/sensitiveDataGuard.test.js` | Suppression (host/appName, case-insensitivity), redaction region pass-through, no-rules clear case |

No companion (`tabatha-desktop`) files are directly reused by C2 today — redaction/suppression
logic is currently browser-side only; a companion-side equivalent (Rust) is required once OS-level
frames are actually captured (C1 T4), since `evaluateCapture` itself is portable JS but the pixel
operation it drives is not yet mirrored in Rust.

## What's already built (Phase 1 T1–T3)

- `src/utils/sensitiveDataGuard.js` — `evaluateCapture()`, fully pure, tested in
  `test/sensitiveDataGuard.test.js` (suppression by host/appName, case-insensitive app matching,
  redact-region pass-through, no-rule clear path).
- `src/background/services/captureService.js` — guard wired into the single-frame capture path
  (`captureNow()`), correctly gating persistence on `guard.suppress`.
- `constants.js` `sensitiveRules: []` default — safe, empty, opt-in.
- **Remains (T4):**
  - Actual pixel-level blur implementation (OffscreenCanvas for browser-captured frames post
    `captureVisibleTab`; a Rust image-processing path for companion-captured frames) — today
    `redactions` is only a *descriptor*, nothing consumes it to touch pixels.
  - Fix behavior 16 (suppressed frames must still write a context-only observation).
  - Extend guard evaluation to a per-frame-of-a-stream call site once manual recording exists.
  - `when.surface` matching in `matchesTarget()` if surface-scoped rules are wanted (behavior 7).
  - Preset UI + seed lists for Finance/Legal workstyle profiles (behavior 13–14) — currently no
    UI exists to pick or expand a preset; only the flat rule array is modeled.

## Open questions

- **Suppress-over-redact precedence** — confirmed as current code behavior (behavior 11). Is
  unconditional suppress-wins the intended product behavior, or should the most-specific matching
  rule win regardless of action type? Needs a product decision before more rule types are added.
- **Org vs personal rule layering** — when clocked in under an org mandate, do org-level
  `sensitiveRules` merge (union) with personal rules, or override them? Not decided; blocks C12
  design.
- **Surface-scoped suppression** — real code gap (behavior 7); needs a decision on whether it's
  in scope for Phase 1 T4 or deferred.
- **Redaction rendering location** — browser-side (OffscreenCanvas on the `captureVisibleTab`
  `dataURL`) is straightforward; companion-side (Rust) redaction of OS-captured frames is new work
  with no existing crate in the companion repo — needs its own design pass, likely coordinated
  with C1's T4 companion-capture module rather than built independently.
- **Preset content ownership** — who curates and updates the Finance/Legal seed host/app lists
  (hardcoded in the extension vs a synced, updatable list)? Affects whether new sensitive SaaS
  tools require a full extension release to add.
- **Suppressed-frame ledger fix (behavior 16)** — straightforward but must land before Phase 1 is
  considered feature-complete, since it's a direct contradiction between the shipped data model
  (which already has the `suppressed` column and nullable `capture_ref`) and the shipped service
  code (which doesn't use them together yet).

## Phase & rollout

| Behavior | Phase |
|---|---|
| Global opt-out gate, per-site/app suppression, evaluate-target-only scoping (1–7) | Phase 1 (T1 — shipped, decision logic only) |
| Redaction descriptor generation + precedence rules (8–12) | Phase 1 (T1 — shipped, decision logic only) |
| Actual pixel redaction rendering (browser + companion) | Phase 1 T4 |
| Sensitive workstyle presets — UI + seed lists (13–14) | Phase 2 (C15 config surface) |
| Per-frame guard re-evaluation during manual recording (15) | Phase 2 (depends on C1's manual recording landing) |
| Suppressed-frame ledger fix (16) | Phase 1 T4 (blocking — data model already shipped, service fix is small) |
| Org-level rule layering | Phase 4 (C12 team/SOP mandate enforcement) |
