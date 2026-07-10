# C15 — Config & Interaction-Density Model

> 🔗 Google Doc: https://docs.google.com/document/d/1GEfiYKkdDafGa1wGgP_HRvYnBQfqwg3hgV-N9PqVZeU/edit?usp=drivesdk&ouid=104108780460431833741

Status: expanded (Fable overnight 2026-07-10)
Parent: [Program Spec](../00-cortex-program-spec.md) §5, §8 (Phase 2)
Origin: user
Phase: Phase 2

## Purpose

Every other Cortex cluster grows its own config knobs independently (C1's cadence, C2's redaction rules, C3's retention, C8's routing tier, C9's speak-vs-modal threshold). Left alone, that produces N scattered settings blocks with no single place a user or org admin can reason about "how present is Tabby, and what is it allowed to do." C15 is the **single cross-cutting configuration surface** that unifies those knobs, plus one dial that doesn't belong to any single cluster: the **interaction-density dial** — invisible/passive ↔ high-touch/manual — which determines how much Tabby shows up in the user's day (modals vs. voice vs. silence, manual inputs vs. universal audio-input replacement per C9) rather than what it captures or where data goes.

## Detailed behaviors

### 1. Unified config surface — six dimensions, one place
Per the program spec, the surface covers: **capture cadence/scope** (incl. multi-screen/per-window mode), **redaction rules**, **storage targets**, **retention**, **routing tier** (C8's autonomy ladder), and **proactivity level**. Today these exist only as scattered `DEFAULT_SETTINGS` keys with no unifying UI section — the Settings page's "Privacy & Capture" section (verified, `src/settings/index.jsx` line 101, `activeSection === 'privacy'`) wires exactly **two** of them (`screenshotCapture`, `keystrokeAnalytics` toggles, lines 1833/1837) even though `DEFAULT_SETTINGS` already defines eight more Cortex keys (`captureDwellSeconds`, `captureMinGapSeconds`, `captureOnContextChange`, `captureStoragePath`, `sensitiveRules`, `captureRetention`, plus the `storage.*` block). C15's UI work is to build out the remaining wiring for these, not invent new settings — see the mapping table below.

### 2. The interaction-density dial — the one genuinely new axis
- **Range:** invisible/passive ↔ high-touch/manual. This is explicitly *not* the same axis as proactivity (C8) — proactivity is "does Tabby act without asking," density is "does Tabby show up at all, and how." A user could want a highly proactive but very quiet Tabby (silent overnight builds, no modals) or a reactive-only but very present one (asks via voice for everything).
- **What it actually controls, concretely:**
  - **Modals vs. voice vs. silence** — the density setting is one of the inputs C9's speak-vs-modal decision consults (program spec §7: "Cortex decides speak-vs-modal by config + context + presence"). At the "invisible" end, C9's fallback-to-modal path should itself be suppressed more aggressively in favor of silent self-correction (C10) — i.e. don't interrupt with either voice or a modal, just fix the record and move on.
  - **Manual inputs vs. universal audio-input replacement** — per C9/#211/Dump 2 ("Tabatha needs the ability to let a user replace virtually every button/input with an audio button... but many users need Tabby to be as passive as possible"), the density dial is what decides whether a given surface defaults to its normal manual control or the audio-replacement variant. Buttons/inputs are not globally swapped — the dial governs the default per interaction-density tier, and C9's per-hotkey model still applies underneath.
  - **Passive self-correction aggressiveness (C10)** — at the invisible end, Tabatha should more readily auto-repair tab↔intent links and recomputed durations without surfacing a confirmation; at the high-touch end, the same corrections should surface for approval instead of applying silently.
- **This is a single dial, not a settings page.** The spec is explicit: "a single control spanning invisible/passive ↔ high-touch/manual." Implementation-wise this likely wants to be a small discrete set of named tiers (e.g. `invisible` / `balanced` / `manual`) rather than a raw slider, so each of the behaviors above has a well-defined mapping per tier instead of continuous interpolation nobody can reason about — this is a design recommendation, not settled in the source material (see Open questions).

### 3. Per-user AND per-org layering
- **Org sets floors/ceilings for org time; personal profile controls personal time.** This mirrors the existing personal/org partition pattern already established for capture retention (`captureRetention.personal` vs `captureRetention.org` in `DEFAULT_SETTINGS`, verified) and for org-mandated capture-on-clock-in (program spec §6 privacy spine, rule 2). C15 generalizes that same shape to every config dimension it unifies, not just retention.
- **Concretely:** an org admin should be able to set (a) a *minimum* interaction density for org time (e.g. "cannot go below `balanced` while clocked in, so compliance-relevant modals aren't silenced"), and (b) a *maximum* routing tier or capture scope (e.g. "org time never uses BYOK, only the backend-proxy tier"). The user's personal profile then operates freely within whatever the org hasn't constrained, exactly as today's personal retention is user-controlled while org retention is admin-controlled (program spec §6 rule 6).
- **No org-scoping mechanism exists yet in settings today.** `settingsService.js`/`DEFAULT_SETTINGS` currently model one flat settings object per install with no org-floor/ceiling concept anywhere in the Cortex keys — this is new surface area C15 must design, not existing plumbing to wire up.

### 4. Config-to-`DEFAULT_SETTINGS` mapping (what exists vs. what's net-new)

| C15 dimension | Existing `DEFAULT_SETTINGS` key (verified, `src/background/constants.js`) | UI wired? | Net-new needed |
|---|---|---|---|
| Capture master enable | `screenshotCapture` (line 49) | Yes (line 1833) | — |
| Capture cadence (dwell fallback) | `captureDwellSeconds` (line 51) | **No** | wire to Privacy & Capture UI |
| Capture anti-thrash gap | `captureMinGapSeconds` (line 52) | **No** | wire to UI |
| Capture-on-context-change | `captureOnContextChange` (line 53) | **No** | wire to UI |
| Capture scope — multi-screen/per-window mode | *none* | — | **net-new key**, e.g. `captureScopeMode: 'fullDesktop' \| 'perScreen' \| 'perWindow'` (C1 §5 describes the three modes; no setting exists yet) |
| Storage target/path | `captureStoragePath` (line 54) | **No** | wire to UI; external-archive target (Drive/OneDrive/HDD) is **net-new**, C3 lists it as a "stub interface" only |
| Redaction rules | `sensitiveRules` (line 55) | **No** (array, needs a rule-builder UI, not a toggle) | UI for add/edit/remove per-site/app suppress/redact rules |
| Retention | `captureRetention` (lines 56–59) | **No** | wire to UI; org floor/ceiling is net-new |
| Ledger/storage caps | `storage.*` block (lines 60–74) | Partial (some caps like `logsCap` may surface elsewhere in Settings; not verified for the Cortex-specific ones) | audit needed |
| Routing tier (C8) | *none* | — | **net-new**, e.g. `cortexRoutingTier: 'cronHarness' \| 'backendProxy' \| 'aiGateway' \| 'byok'` — Phase 2 dependency, blocked on C8 itself landing first |
| Proactivity level (C8) | *none* | — | **net-new**, e.g. `cortexProactivity: 'reactive' \| 'proactive'` |
| Interaction-density dial | *none* | — | **net-new**, the cluster's own headline deliverable, e.g. `interactionDensity: 'invisible' \| 'balanced' \| 'manual'` |
| Org floor/ceiling layering | *none anywhere* | — | **net-new**, no existing per-dimension org-override mechanism |

This table is the concrete backlog for whoever implements C15: five keys already exist and only need UI wiring (cheap), five+ dimensions need net-new settings keys (real design work), and org layering needs a mechanism that doesn't exist for *any* setting today, Cortex or otherwise.

## Data model touchpoints

- **`src/background/constants.js` `DEFAULT_SETTINGS`** (verified) — the append point for every net-new key in the table above; C15 should follow the existing convention of grouping new keys under a `// ── Cortex — ... ──` comment block (already established at line 48) rather than scattering them.
- **`src/settings/index.jsx`** (verified, skimmed) — the "Privacy & Capture" section (`activeSection === 'privacy'`, line 1827) is the natural home for capture/redaction/retention wiring; routing tier, proactivity, and the density dial likely want their own new `SECTIONS` entry (e.g. `{ id: 'cortex', label: '🧠 Cortex' }`) rather than overloading Privacy & Capture, since they're behavioral, not privacy, settings. Not settled — flagged as an implementation decision.
- **Org-level settings storage** — no existing schema surfaced in this pass for per-org setting floors/ceilings (distinct from per-org *retention*, which does exist via `captureRetention.org`). This likely needs either a new Supabase table (org policy overrides) or an extension of whatever table already governs org-mandated capture-on-clock-in (not identified in this session — flagged for whoever owns C12/org policy work).

## Dependencies

**Depends on:**
- **C1 (Adaptive Capture Engine)** — cadence/scope config values (`captureDwellSeconds`, `captureMinGapSeconds`, new `captureScopeMode`) are C1's own settings, unified here.
- **C2 (Sensitive-Data Guard)** — `sensitiveRules` redaction/suppression rule authoring UI belongs here.
- **C3 (Storage & Retention Fabric)** — `captureStoragePath`, `captureRetention`, external-archive target selection.
- **C8 (Agent Orchestration & Routing)** — routing tier and proactivity level are C8 concepts; C15 cannot define real values for `cortexRoutingTier`/`cortexProactivity` until C8's own cluster file specifies the actual tier enum and proactivity semantics. **Blocking dependency**, not just a cross-reference.
- **C7 (Recommendation & Action Layer)** — proactivity level gates whether C7's approved recommendations auto-execute (proactive) or wait for another explicit trigger (reactive); C15 exposes the dial, C7 consumes it.
- **C9 (Voice & Audio)** — speak-vs-modal decisioning and the three-hotkey audio-input model both consult the interaction-density dial; C15 cannot finalize the dial's tier definitions until C9's own cluster file (still a stub as of this session) specifies exactly what "invisible" vs. "manual" means for voice behavior.

**Feeds:**
- **C10 (Passive Self-Correction)** — density dial tier determines whether self-correction applies silently or surfaces for confirmation.
- **C12 (Team/Onboarding SOP Mode)** — org floor/ceiling layering is the mechanism org admins would use to mandate SOP-mode density/routing constraints for new hires.
- **C14 (Agent Data Map)** — every net-new settings key this cluster introduces is itself something DATA-MAP.md's "Agent access" column may need to reference (e.g. does an agent respect the density dial when deciding whether to surface a recommendation at all).

## Reuse points (VERIFIED paths)

- `src/background/constants.js` — `DEFAULT_SETTINGS`, Cortex block lines 48–74. **Verified**, read in full; exact key names and current values cited above are accurate as of this session.
- `src/settings/index.jsx` — `SECTIONS` array (lines 84–107) and the `activeSection === 'privacy'` block (line 1827, toggles at 1833/1837). **Verified** via targeted grep + read; full file not read end-to-end (large file, ~2000+ lines).
- `src/background/services/captureService.js` — `captureConfig()` (lines 29–35) shows exactly how `captureDwellSeconds`/`captureMinGapSeconds`/`captureOnContextChange` are consumed today; any new UI must write to these same settings keys, not parallel ones. **Verified**.
- `docs/cortex/API-KEYS.md` — the routing-tier procurement reality (K5/K7: Anthropic + Vercel AI Gateway both "Need," not yet held) is directly relevant to how aggressively C15's routing-tier UI should let a user select tiers 2–4 before those keys actually exist — likely should visually gate/grey-out unavailable tiers rather than let a user pick a tier with no working backend. **Verified**, read in full.
- `src/background/services/syncService.js` — personal/org partition + watermark pattern (verified exports only: `configureSyncService`, `triggerSync`, `syncToSupabase`) is the precedent for how org-vs-personal config layering might sync, though no code there addresses settings-layering specifically (it syncs data, not config).

## Open questions

1. **Discrete tiers vs. continuous slider for the density dial.** Recommended discrete (see behavior 2) but not settled by any source dump — Dump 2/4 describe the *ends* of the spectrum vividly but never specify the UI shape.
2. **Where does org floor/ceiling config live and who edits it?** No existing settings-layering mechanism found anywhere in the codebase for *any* setting, Cortex or legacy. This may be a bigger build than C15's other five dimensions combined.
3. **Should `interactionDensity` be one global dial, or per-surface** (e.g. a user wants invisible during deep-focus work but manual during admin/planning time)? The spec text says "a single control," but C13's/C9's own context-awareness (meeting suppression, focus state) suggests context-sensitivity might be expected implicitly rather than via multiple dials. Not resolved.
4. **Sequencing vs. C8/C9.** This cluster is listed as depending on C8 and C9 for real enum values, but C15 itself is scheduled Phase 2 while C9 is Phase 3 and C8's routing tiers are split across Phase 1 (tier ①) through Phase 2 (tiers ②③). Building C15's UI before C8/C9 fully land means the routing-tier and density-dial values will need placeholder enums now and a follow-up migration when those clusters solidify — flagged so this isn't mistaken for scope creep later.

## Phase & rollout

Phase 2 per program spec §8 ("Routing tiers ② backend proxy + ③ Vercel Gateway; C7 action execution... C15 config surface"). Practically, this cluster should be split into two waves: **Wave A** (cheap) — wire the five already-existing `DEFAULT_SETTINGS` keys into the Privacy & Capture UI, no new settings keys, no org layering, ships independent of C8/C9 timing. **Wave B** (real build) — routing tier, proactivity, interaction-density dial, and org floor/ceiling layering, which genuinely blocks on C8's routing-tier enum and C9's density-tier semantics landing first. Wave A could ship well before Phase 2 if resourced opportunistically; Wave B should not be rushed ahead of its dependencies.
