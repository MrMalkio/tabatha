# Extension UI/UX Audit — 2026-07-21

**Auditor:** Argus (Sonnet, read-only)
**Scope:** Chrome extension only — Home, Sidebar, Popup, Settings (all 24 sections), Work Shifts, content scripts (gatekeeper/InPop, InBar, BlockGate), Tasks, Logs, and misc shared components.
**Branch/worktree audited:** `integrate/6.7.50`, worktree `C:\Users\mrmal\le dev\Tabatha\.claude\worktrees\integrate-6750`, manifest version 6.7.53.
**Method:** direct code reading (no edits, no commits) across six parallel research passes, one per surface area, each grounded in file:line evidence. No dev server / visual preview was needed for most findings since the layout logic was traceable in JSX/CSS; header-state reasoning for Home was cross-checked against the `8814e86` fix commit via `git show`.
**Companion audits:** this report covers the extension only. Sidecar/watch UX and cross-cutting systems (docs site staleness, auth email branding, org visibility) are covered in sibling reports already in this folder: `2026-07-21-sidecar-companion-watch-ux-audit.md` and `2026-07-21-crosscutting-systems-audit.md`.

Mission framing (Malkio, verbatim): *"A complete scan of the UI/UX. The state of everything, the quality of its implementation, its functionality, does it work, is it complete, is it sensible, does it satisfy its goal, can it be done easier."* Every finding below is classed **NOW-fix** (small, safe, high-value), **OVERHAUL** (belongs in the bigger UI/UX redesign track), or **BUG** (broken behavior), with severity and a one-line fix sketch.

---

## Seed-ask verdicts (quick answers before the detail)

| # | Seed ask | Verdict |
|---|---|---|
| 1 | Live Preview panel: wasted space / missing coverage | **Confirmed and worse than described.** 11 of 24 settings sections render a completely blank preview pane (no content, no fallback message) — including Context View, the most visually complex settings section in the product. |
| 2 | Settings references `.md` repo files instead of live docs links | **Confirmed, one instance found.** `docs/guides/asana-integration.md` referenced as inert plain text in Integrations → Asana. Narrower than expected — grep of `src/settings/**` and `src/components/ui/**` found no other user-facing hits. |
| 3 | Home header whitespace/wasted-row | **Confirmed, root cause isolated.** Clock wrapper reserves ~40-50px unconditionally even when the clock is fully hidden; `OtherProfilesStrip` is a separate full-width row that wastes space with ≤2 chips. The 6.7.49 fix solved overlap, not economy, exactly as flagged. |
| 4 | Devices panel lifecycle / no re-pair affordance | **Confirmed, and a more serious bug sits underneath it.** No re-invite path exists for a signed-out device (as flagged) — but the audit also found remote "Sign out" doesn't actually kill a Chrome-extension install's session (no `auth_session_id` ever captured), so the device silently un-revokes itself on its next 5-minute sync tick. |
| 5 | Focus can't be backburnered, only tabs (Sidecar can do both) | **Inverted from what's shipped, but the real gap is worse.** Backburner is actually Focus-only everywhere (Sidecar has no tab concept at all). The real parity bug: Sidebar and Home have every other focus action except a Backburner-initiate button — only the in-page InBar has it, contradicting the feature's own spec ("Available on InBar, Homepage, and Sidebar"). Separately, "Park" is an unrelated tab-level system that's almost certainly the actual source of Malkio's "tab vs focus" impression. |

---

## Surface 1 — Settings (`src/settings/*.jsx`, 24 nav sections)

### Live Preview coverage

| Section | Has preview? | Useful? | Should have one? |
|---|---|---|---|
| Appearance | Yes (generic) | Partial — doesn't reflect selected theme's actual colors | — |
| FlipClock | Yes | Yes, but buggy (scale clamped at 1.0 vs slider's 1.5 max) | — |
| **Context View** | **None** | n/a | **Yes — highest-value gap; most visual section in Settings** |
| Devices | None | n/a | No (list data, no visual analog) |
| Focus Engine | Yes | Yes | — |
| Focus Lifecycle | None | n/a | Maybe (small state diagram) |
| Intent-Popup (Gatekeeper) | Yes, but duplicated (see below) | Yes | — |
| URL Rules | Count only | Weak | Yes (show a rule's actual domain→intent mapping) |
| **Blocked Sites** | **None** | n/a | **Yes — BlockGate is a full visual takeover, mockup would help a lot** |
| Time Tracking / Export & Agents / Privacy & Capture | Fallback text only | Weak | No |
| Work Clock / Follow-through / Sync & Account / Webhooks / Desktop Activity / Integrations / Developer | **None** | n/a | No (data/toggle-driven, low visual value) |
| Tags & Associations / Parked Tabs / Sugar Box / Stats & History | Yes | Yes/marginal | — |
| About | Custom fallback text | n/a | — |

**Headline:** 11/24 sections (46%) render a completely blank preview pane with no fallback message at all — reads as broken/unfinished rather than "doesn't need one." Only 4 get the generic fallback; 9 get a real preview.

### `.md` reference audit

| File:line | Text found | Fix |
|---|---|---|
| `src/settings/index.jsx:2043` | Plain (non-clickable) text: *"See `docs/guides/asana-integration.md` for full setup instructions"* inside Integrations → Asana card | Link to `https://tabatha.pondocean.co/docs/tasks-and-asana` (a matching live page already exists) |

### Findings table

| # | Finding | Sev | Class | Fix sketch |
|---|---|---|---|---|
| S1 | Live Preview blank (no content, no message) for 11/24 sections | high | NOW-fix | Add the existing generic fallback string to the remaining cases, or collapse/hide the panel when the active section has none |
| S2 | FlipClock preview clamps `scale` at 1.0 (`index.jsx:2128`) while the real slider goes to 1.5 — preview silently stops reflecting the setting | med | BUG | Raise clamp to slider max, or scale-to-fit the container instead of clamping the source value |
| S3 | Context View section has zero preview despite being the most visually complex customization surface (day countdown, up-next, timeline, checkpoints) | high | OVERHAUL | Add a mocked Context View frame to Live Preview reflecting each toggle live |
| S4 | Blocked Sites shows only a count, not the actual BlockGate screen | med | NOW-fix | Render a static BlockGate mockup in Live Preview |
| S5 | `docs/guides/asana-integration.md` is inert plain text pointing at a repo path a shipped-extension user can never open | low | NOW-fix | Replace with a link to the live docs site |
| S6 | Cortex (AI recommendation engine, routing tier, digest preview, Voice v0, Context Reconciliation) is buried inside "Privacy & Capture," badly undersold by the section name | med | OVERHAUL | Promote Cortex to its own top-level nav section |
| S7 | Three different confirmation UX patterns coexist for destructive actions (native `confirm()`, custom two-click arm/confirm, none) with no rule for which gets which; device sign-out and clearing a pairing token get *no* confirm at all | low | BUG-ish | Standardize on one pattern (native `confirm()` is cheapest) for sign-out/clear-token/remove-rule |
| S8 | "Idle threshold (minutes)" is editable from both Time Tracking and Focus Lifecycle — same key, two homes, no cross-reference | low | inconsistency | Keep the control in one section, link from the other |
| S9 | Intent-Popup section has two simultaneous preview surfaces (inline InBar mockup in the settings column *and* the shared Live Preview's Gatekeeper mockup) — only section doing this | low | NOW-fix | Move the InBar mockup into the shared pane, toggle-able alongside Gatekeeper |
| S10 | Two disabled "SOON"-labeled buttons ("+ Create Rule", "Block Domain") ship live in URL Rules' domain-groups tab | low | informational | Finish or remove |
| S11 | Tags & Associations is a full top-level nav page whose entire content is a static TagPicker demo with no adjustable setting | low | informational | Fold into Appearance or drop as standalone nav entry |

**IA note:** Team Activity (managing *other people's* presence) is a sub-panel buried inside Sync & Account, while Devices (managing *your own* devices) gets a full top-level nav entry — inconsistent altitude for comparable concerns.

---

## Surface 2 — Home (`src/home/index.jsx` + composed components)

### Header layout state matrix (seed 3)

Traced via `git show 8814e86` (the 6.7.49 overlap fix) and `FlipClock.jsx:213-314`. The fix switched `transform:scale()` → `zoom` and gave grid columns guaranteed minimums — it never touched the middle column's unconditional `margin:5px; padding:20px` wrapper.

| Clock state | Companion strip | Result |
|---|---|---|
| Shown | Absent | Clean — full clock dominates the row, no pill row |
| Shown | Present (≥1 other device) | Clock row **plus** a full-width `OtherProfilesStrip` row below; with 1-2 chips the row is mostly dead space (`justify-content: flex-start` on a ~1036px row) — the "wasted row" |
| **Hidden** | Absent | Middle grid cell collapses content-wise but its wrapper still claims ~40-50px of padding/margin — an invisible box sits dead-center in the header, forcing the row taller than the visible content needs — the "awkward whitespace" |
| Hidden | Present | Both symptoms stack |
| (any clock state) × signed-out | n/a | `OtherProfilesStrip` data requires being signed in, so signed-out is unreachable for that axis — but also **Home gives zero visual signal** for signed-in vs signed-out state anywhere in the header |

### Findings table

| # | Finding | Sev | Class | Fix sketch |
|---|---|---|---|---|
| H1 | Clock wrapper (`index.jsx:1894`) reserves margin/padding unconditionally even when both `showClock`/`showCountdown` are false | med | NOW-fix | Gate the wrapper's spacing on those flags; render null/zero-size when both off |
| H2 | `OtherProfilesStrip` is a separate full-width row that wastes space with only 1-2 chips | med | NOW-fix | Fold into the header's existing flex-wrap utility cluster, or right-align/compact the row |
| H3 | "Companion" terminology collision: the desktop-companion dot (`CompanionStatus`, inline 6px dot) vs. the cross-device `OtherProfilesStrip` pills are different components with the same colloquial name | low | clarify | Confirm with Malkio which one "wasted row" refers to before fixing |
| H4 | No visual affordance anywhere on Home distinguishes signed-in vs signed-out; no CTA path into cloud-sync sign-in from Home | low | OVERHAUL | Add a lightweight header signal + sign-in entry point |
| H5 | `InitiativesPanel` and `ProjectsClientsPanel` both let a user browse/manage Clients→Projects→Tasks as two separate nav tabs — functional overlap, unclear which to use | med | OVERHAUL | Merge: keep InitiativesPanel's tree as canonical, fold ProjectsClientsPanel's CRUD into it |
| H6 | `SessionList.jsx` is dead code — imported, never rendered, unused elsewhere | low | NOW-fix | Delete file + import |
| H7 | **Bug:** `UnifiedTimeline` ("Context Activity" section) early-returns empty *before* folding in clock breaks/clock-in-out markers whenever `sessions.length === 0`. Any user who has never connected the desktop companion sees a completely blank Context Activity section — not even their own clock-in/out/break markers — with no empty-state explanation | **high** | **BUG** | Build break/clock-marker segments independent of companion `sessions.length`; only early-return when truly nothing exists; add a distinct empty-state message |

**Positive notes:** `ActivityHeatmap`, `AnalyticsDashboard`, `LogsPanel`, `CheckpointTimeline`, `DevicePausedBanner` are all well-built with good empty states; no other stub/TODO markers found on this surface.

---

## Surface 3 — Devices / Companion Pairing Lifecycle (seed 4)

Two separate, non-cross-referencing systems both claim to show "your devices": **Settings → Devices** (identity/pairing, over `browser_profiles`) and **Work Shifts → Live Stints** (presence/clock-session, over `browser_profile_status`). They share no code, no table, and (aside from one one-way "N offline · clean up" deep link) no cross-cleanup.

### Findings table

| # | Finding | Sev | Class | Fix sketch |
|---|---|---|---|---|
| D1 | **Remote "Sign out" of another install is functionally a no-op after ≤5 minutes.** The extension never writes `auth_session_id` anywhere (grep-confirmed across all of `src/`), so `device-signout`'s GoTrue-revoke branch never fires for a Chrome-extension target. The target keeps a fully valid session and, on its next 5-min sync alarm, `ensureBrowserProfileRow()` unconditionally writes `revoked_at: null` back onto its own row — silently un-revoking itself with zero user-visible signal. Directly contradicts the panel's own copy ("Sign out is the only remote action that actually ends a session") | **high** | **BUG** | Capture the GoTrue session id at sign-in into `auth_session_id`; have `ensureBrowserProfileRow` check for an externally-set `revoked_at` before clearing it, and force a real local sign-out if found |
| D2 | Signing out a device does not remove it from Live Stints / the awareness strip — `fetchInstalls()` doesn't filter on `revoked_at`, so a "signed out" device keeps appearing as an offline ghost until separately dismissed in Work Shifts | high | BUG | Have `SIGNOUT_DEVICE` also mark/delete the corresponding `browser_profile_status` row, or filter Live Stints by `revoked_at` |
| D3 | No way to re-invite / regenerate a code for a specific signed-out device — confirmed. Pairing codes are profile-scoped and carry only a free-text label, never tied to a prior row; redeeming always creates a brand-new row, old row's history gone for good | med | NOW-fix | Surface a "Re-invite" button on revoked rows pre-labeled with the old display name, or add copy clarifying sign-out is final |
| D4 | Pairing-code copy on both the extension and Sidecar implies TV/Watch-only ("...choose 'Sign in with a code' (TVs)..."), hiding that it's exactly what a user would need to recover an accidentally-signed-out phone | med | NOW-fix | Soften copy to "any device," mention phones explicitly |
| D5 | `revoked_at` state is polled into `_selfDeviceStatus` every 30s but nothing on the extension side reads it — `DevicePausedBanner` only checks `.paused`, never `.revokedAt`. This is the root architectural gap behind D1: the Sidecar has "honor logic" that force-signs-out on remote revoke; the extension does not | med | OVERHAUL | Add a revoked-state consumer parallel to the paused banner that forces `useAuth.signOut()` |
| D6 | No self-deregistration / "forget this device" action, and no link from Devices into the separate Live Stints cleanup a stale self-entry actually needs | low | NOW-fix | Add a "clean up in Live Stints" link next to local sign-out |
| D7 | Terminology collision: "Sign out" (Devices) vs. "Clock out"/"Dismiss" (Live Stints) act on overlapping device sets with unrelated meanings, no in-app copy explains the split | low | NOW-fix | One line of cross-referencing copy in each panel |
| D8 | `docs/features/222-*` and `223-*` spec files are not present in this worktree (jumps from 219 to B07/D01), so planned-vs-actual can't be diffed directly — reconstructed from source + git history instead | low | docs gap | Confirm the specs exist somewhere and sync them into this branch's `docs/features/` |

**What works correctly:** self-pause + one-tap Resume banner is genuinely solid (exactly the self-rescue the underlying incident needed); `signOutDevice` correctly blocks self-targeting; device de-dup grouping logic is clean; the 6.7.53 "actionable mint auth error" fix is a real improvement.

---

## Surface 4 — Backburner Parity, Sidebar, Popup (seed 5)

### Backburner / focus-action parity

| # | Finding | Sev | Class | Fix sketch |
|---|---|---|---|---|
| B1 | Sidebar's and Home's active-focus/queue action rows have every other action (Resolved, Pause, +5m, Edit, Checkpoint, Timeline, Off-device, Sub-focus) but **no Backburner-initiate button** — only the in-page InBar has it (`#backburner-btn`). Directly contradicts `docs/features/207-backburner.md`'s own spec: *"Available on InBar, Homepage, and Sidebar."* 2 of 3 promised surfaces never got it | **high** | **BUG** | Add a 🔥 button next to Pause in both action rows, wired to the same `BACKBURNER_FOCUS` message InBar already uses |
| B2 | Backburner is Focus-scoped only, everywhere (extension and Sidecar) — Sidecar has no tab concept at all, so "Sidecar can do both" isn't literally accurate, but the underlying confusion is real | med | BUG | Decide product intent: extend Backburner to bare tabs, or explicitly document Focus-only scope |
| B3 | "Park" (`PARK_TAB`) is the actual tab-level deferral primitive, but lives only inside the BlockGate overlay, has none of Backburner's mechanics (no timer/reason/check-in log), and is shown read-only elsewhere as "Stash" — two unrelated "set aside" systems with different models is almost certainly the real source of the tab-vs-focus confusion | med | BUG | Unify Park into Backburner's data model, or clearly separate the two in UI copy |
| B4 | Home's empty-stash copy says *"Click Park in the Intent-Popup to save a tab for later"* — no "Intent-Popup" component exists anywhere in `src/` (Park only lives in the BlockGate overlay) | low | BUG | Fix copy to point at where Park actually lives |

### Sidebar / Popup

| # | Finding | Sev | Class | Fix sketch |
|---|---|---|---|---|
| B5 | Sidebar's 5-tab panel nav is icon-only (🎯📋📑📌📦), discoverable only via hover tooltip — poor first-run discoverability in a narrow panel | med | OVERHAUL | Add persistent text labels or a one-time coach-mark |
| B6 | `SidebarTasksPanel` is a stripped CRUD (create/complete/reopen only); Home's `TasksPanel` additionally has delete, inline edit, and link-to-focus — breaking the sidebar/home parity goal repeatedly called out in this project's own session log | med | BUG | Port delete/edit/link into Sidebar, or share one component |
| B7 | `GroupsList` renders tab groups read-only with no click-to-expand action | low | UX | Add onClick to jump to/expand the group |
| B8 | "Restore tab" in the Parked list removes by array index, not a stable id — a concurrent mutation (e.g. background auto-park) could remove the wrong entry | low | BUG | Key parked entries by generated id, remove by id |
| B9 | Popup's search placeholder says "Ctrl+Space" but the manifest's actual registered shortcut is Ctrl+Shift+E | low | BUG | Fix the hardcoded string, or read `chrome.commands.getAll()` dynamically |

**Positive notes:** Popup itself has no dead ends (empty/no-match states, working feedback form); Sidebar's empty/loading states are otherwise reasonable.

---

## Surface 5 — Content Scripts: Gatekeeper/InPop, InBar, BlockGate

**Naming ground truth:** `gatekeeper.js` *is* "InPop" — line 3 states "Formal name: Intent-Popup (InPop)." There is no separate InPop file; filename and formal name disagreeing is itself a source of confusion for future work.

| # | Finding | Sev | Class | Fix sketch |
|---|---|---|---|---|
| C1 | **Gatekeeper race:** the overlay is built only after awaiting `CHECK_CONTEXT_NEEDED`/`GET_FOCUS_ENGINE`/two storage round-trips; `document_start` doesn't guarantee the page stays frozen during those awaits — a real window exists where the page renders before the "you must set intent" gate appears, undermining the core enforcement mechanism | **high** | **BUG** | Inject a cheap dimming placeholder synchronously first, swap in the full form once data resolves |
| C2 | **Unescaped HTML injection** in gatekeeper.js: `item.label`, recent/persistent intent labels are interpolated into `innerHTML` with no escaping — a crafted intent label (typed once, replayed on every future prompt) executes on render. Only `inheritedContext` gets partial (quote-only) escaping | **high** | **BUG** | Add a shared `escapeHtml()` helper, route every user-controlled string through it |
| C3 | Gatekeeper shows 8+ simultaneous choices (2 toggle states + text input + 3 preset lists + 6 action buttons) before a user can proceed — direct contradiction of the documented Progressive Simplicity principle | med | OVERHAUL | Collapse secondary actions behind "More options ▾"; keep Continue + Nevermind primary |
| C4 | No `role="dialog"`/`aria-modal`, no focus trap, no Escape handling on the gatekeeper overlay | med | BUG | Add dialog semantics + Tab-trap + Escape-as-dismiss |
| C5 | **Same unescaped-HTML pattern in InBar**, more instances (focus label, tab intent, focus list, description, a pause note inserted raw inside a `<textarea>` where a literal `</textarea>` would break the tag, backburner alert card). Materially more dangerous once #221 Shared Focuses ships and labels start crossing between teammates' browsers | **high** | **BUG** | Same `escapeHtml()` helper across ~10 call sites in inbar.js |
| C6 | InBar's persistent bar has 8 icon-only buttons with zero `aria-label` anywhere — the single clearest violation of "calm, minimal-friction" for an always-on-screen surface | med | OVERHAUL | Add `aria-label`s; consider an overflow menu for less-frequent actions |
| C7 | No Escape-to-dismiss anywhere in InBar — none of the 7 possible full-viewport auto-triggered overlays (FTE, Welcome-Back, Combo, Checkpoint, Backburner-alert, Idle-prompt, Drift-detected) can be keyboard-dismissed, and none place focus inside themselves on open | med-high | BUG | Shared keydown listener per overlay: Escape → safest dismiss; focus first button on open |
| C8 | Seven distinct auto-triggered modal types can each pop a full-viewport overlay with no cooldown/backoff between different types firing in quick succession; several are themselves option-heavy (checkpoint: 7 CTAs; FTE: 7 buttons) | med | OVERHAUL | Add a shared "last modal shown at T" timestamp; suppress a new auto-triggered modal within N minutes of the last; trim button sets |
| C9 | Native `confirm()` used for "mark intent complete" — visually/tonally jarring next to the fully custom dark theme everywhere else, blocks the host page's main thread | low | NOW-fix | Replace with an inline custom confirm affordance |
| C10 | Sticky note (pause note) deliberately breaks the shared visual language (cursive font, paper texture) — the one intentional exception to an otherwise consistent design system across all three content scripts | low | design note | Keep if intentional, but match button styling to the rest of the system |
| C11 | BlockGate's very first `chrome.runtime.sendMessage` call has no try/catch (unlike gatekeeper.js and inbar.js) — an invalidated extension context throws an unhandled rejection and the block silently fails open | med | NOW-fix | Wrap in the same try/catch pattern used by the other two files |
| C12 | BlockGate's "Associate with" field is a bare text input with no autocomplete, unlike gatekeeper's presets or InBar's focus-list dropdown — feature #212 explicitly calls out `ComboInput`/`FocusInput` as the standard mechanism | low | NOW-fix | Swap in the shared `ComboInput`/`FocusInput` component |
| C13 | Same missing dialog semantics/focus trap/Escape handling in BlockGate as gatekeeper | med | BUG | Same fix as C4 |
| C14 | Cross-cutting: nearly every `sendMessage(...)` across all three files ends in `.catch(() => {})`, including writes users assume are saved (checkpoint notes, pause notes, intent edits, backburner actions) — a failed background write gives zero user-visible signal | med | NOW-fix | Add a lightweight toast for the writes that matter, reusing InBar's existing "notes-saved" transient-indicator pattern |
| C15 | **Feature #212 (InPop Intent Dropdown Header) confirmed unbuilt** in both plausible locations. The closest analog is InBar's existing "Edit Intent" dropdown (focus list + create-new), but it isn't a header, isn't collapsed-by-default, and lives in InBar not gatekeeper/InPop | med | OVERHAUL | Build `<IntentHeaderDropdown>` reusing InBar's existing focus-list/`SWITCH_FOCUS` plumbing |

**Positive notes:** all three files are clean of `console.log`/TODO/FIXME debug cruft; the three surfaces genuinely share one visual design system (dark card, Segoe UI, consistent accent-per-context color coding) — this is *not* "bolted together separately," contrary to what the fragmentation of findings might suggest; BlockGate's escape hatch (50-char justification, generous "Leave" exit, self-chosen timer) is the best-designed friction-to-purpose ratio of the three.

---

## Surface 6 — Work Shifts, Tasks, Logs, Misc Components

| # | Finding | Sev | Class | Fix sketch |
|---|---|---|---|---|
| W1 | **Break notes silently don't persist** — `BreakNotes` saves to local React state only (comment literally says "In production this would persist via sendMessage"); no backend handler exists. Unlike sibling stubs, this one has **no "SOON" badge**, so it looks fully functional and isn't — a user types a note, reloads, it's gone | **high** | **BUG** | Wire a save handler into `clockService.js`/`clockHistory`, or add the same stub badge used elsewhere until real |
| W2 | Shift-level Edit/Delete are disabled stubs (correctly labeled "SOON") — no path exists to correct a wrong historical shift | low | NOW-fix (label only) | Real backlog item, not urgent — already honestly labeled |
| W3 | `LiveStintsView` polls every 10s unconditionally with no visibility-based pause, even when the tab is backgrounded | low | OVERHAUL | Pause the interval on `document.visibilitychange` |
| W4 | Task stage UI hand-duplicates `StagePicker`'s pattern instead of reusing it (StagePicker can't currently accept a subset of stages) | low | OVERHAUL | Add an optional `stages` prop to `StagePicker`, have Tasks pass its subset through |
| W5 | Task delete only checks one of two possible data sources (legacy vs org); a genuine ID collision across both would leave the org copy silently un-deleted | low | BUG (edge case) | Delete in both branches when both exist |
| W6 | Asana GID field round-trips through task edit/save but is never surfaced anywhere (no "View in Asana" link, no sync indicator) | low | OVERHAUL | Surface a link when `asanaGid` is set, or note as intentional groundwork for the Plan 040 Asana epic |
| W7 | Logs' "tab" entry type always stamps `date: new Date()` (current render time) instead of the tab's actual activity time — every Tab Activity row misleadingly sorts to "now" | med | BUG | Track and use each tab's actual first-seen/last-active timestamp |
| W8 | Activity editor's "Range Trim" tool permanently deletes companion session data behind a two-click toggle with no `window.confirm()` and no undo — weaker confirmation than every other destructive action in the product | med | NOW-fix | Add a `window.confirm()` naming the count of segments about to be deleted |
| W9 | Activity editor copy tone ("Enterprise Compliance Block," "Retroactive Review & Approval Queue") reads like enterprise SaaS, at odds with the personal "Attention OS" voice everywhere else | low | OVERHAUL | Reword stub copy to match the calmer voice used elsewhere |
| W10 | `docs/features/211-audio-input-voice-control.md` still says "Status: Planned," but Phase A (VoiceInput.jsx — genuinely functional Web Speech API dictation) has already shipped in code | low | NOW-fix (docs) | Update the spec doc's status |

**Positive notes:** Work Shifts' Analytics view (previously "stubbed" per project history) is now fully built out with real charts/CSV export; Tasks CRUD is essentially complete (delete confirm, inline edit, link-to-focus, start-intent-from-task all verified working); Logs' filter bar/pagination/type chips are solid with no dead ends; `ChangelogView`, `WhatsNewModal`, `CommandPalette`, `KeyboardShortcuts`, `LinkMergeModal`, `AbandonedStintsModal`, `TagPicker`, `ComboInput`, `Tooltip`, `GlassCard`, `PopButton` are all fully wired, no stubs, no dead code found in any of them.

---

## Ranked Top 15

Ranked by (a) direct user/data/security impact, (b) whether it's one of Malkio's five named seeds, (c) how central the affected surface is to the product's core promise (intentional browsing enforcement, cross-device continuity, attention tracking integrity).

1. **C2 + C5 — Unescaped HTML injection across gatekeeper.js and inbar.js.** Stored intent labels, pause notes, and checkpoint text are interpolated into `innerHTML` unescaped in ~12 call sites total. Currently a self-XSS risk; becomes a real cross-user injection vector once #221 Shared Focuses ships and labels sync between teammates. Highest severity because it's a security defect in the product's most-frequently-rendered surfaces.
2. **D1 — Remote "Sign out" of a device is a no-op after ≤5 minutes.** The extension never captures `auth_session_id`, so the GoTrue revoke never fires; the target device silently un-revokes its own row on its next sync tick with zero user-visible signal. This is seed 4, but far more serious than "no re-pair button" — it means the security control the Devices panel advertises doesn't actually work for extension installs.
3. **D2 — Signed-out devices don't disappear from Live Stints.** Two device-tracking systems (Devices panel vs. Live Stints) never reconcile with each other, so a user can watch a device look "gone" in one place and "still there" in another. Compounds #2 into genuine confusion about what "signed out" even means.
4. **C1 — Gatekeeper race lets the page render before the intent gate appears.** Undermines the literal core mechanism the whole product is built around (you must set intent before browsing).
5. **H7 — Home's "Context Activity" section renders nothing for any user who's never connected the desktop companion**, not even their own clock-in/out/break markers, with no empty-state explanation. Likely affects the majority of users (companion is optional) and silently hides a feature that should always have data.
6. **W1 — Break notes silently fail to save.** No "SOON" badge distinguishes it from the many correctly-labeled stubs nearby — this is the one place in the whole audit where the UI actively lies about whether input was saved.
7. **B1 — Backburner-initiate button missing from Sidebar and Home**, present only on InBar — directly contradicts the feature's own written spec ("Available on InBar, Homepage, and Sidebar"). This is the concrete shape of seed 5.
8. **B2/B3 — Backburner is Focus-only; "Park" is a separate, differently-shaped tab-level system living only inside BlockGate.** This is almost certainly the real source of Malkio's "tab vs. focus" impression, and it's a product-model inconsistency, not just a missing button.
9. **S1/S3 — Live Preview blank for 11/24 settings sections, including Context View** (the most visually complex one). Seed 1, confirmed and quantified.
10. **D3/D4/D5 — Full device re-pairing dead end:** no re-invite path for a revoked device, pairing-code copy hides the phone use case, and `revoked_at` is captured but never actuated locally (root cause behind #2). Seed 4, the full state-machine picture.
11. **C7/C8 — InBar has no Escape-to-dismiss on any of 7 possible auto-triggered overlays, and no cooldown between different overlay types firing back to back.** Accessibility gap plus a real "can this get naggy" risk on the product's most persistent surface.
12. **H1/H2 — Home header wastes space in both directions** (dead whitespace when clock hidden; wasted companion-pill row when shown) — seed 3, root-caused to two specific unconditional-spacing bugs.
13. **C3/C6 — Systemic "wall of choices" on gatekeeper (8+ options) and InBar (8 unlabeled icons)** — the clearest, most repeated violation of the product's own documented Progressive Simplicity principle, spanning the two most-seen surfaces.
14. **C15 — Feature #212 (InPop Intent Dropdown Header) is confirmed unbuilt**, despite the reusable pieces (focus list, `SWITCH_FOCUS`) already existing in InBar's edit dropdown.
15. **S6 — Cortex (a full AI recommendation subsystem) is buried inside a section literally named "Privacy & Capture,"** the single worst information-architecture mismatch found in Settings.

---

## Counts by class

- **BUG:** 24 (C1, C2, C4, C5, C7, C11, C13, D1, D2, H7, W1, W5, W7, S2, S7, B1, B2, B3, B4, B6, B8, B9, plus 2 doc-gap items D8/W10 counted as informational rather than functional bugs)
- **NOW-fix:** 20 (S1, S4, S5, S9, D3, D4, D6, D7, H1, H2, H6, C9, C12, C14, W2, W8, plus several low-severity items folded into surface tables)
- **OVERHAUL:** 16 (S3, S6, C3, C6, C8, C15, D5, H4, H5, B5, W3, W4, W6, W9, plus systemic items)
- **Informational / positive notes:** ~15 (documented separately per surface — mostly places implementation is already solid and needs no action)

*(Exact per-item classification is stated inline in each surface's findings table above; the totals above reflect the ~55 distinct numbered findings across all six surfaces, with a handful of closely-related items grouped once in the Top 15 for readability.)*
