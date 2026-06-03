# Tabatha v6.3.1 — Manual Regression Test
**Date:** 2026-05-29  
**Build:** v6.3.1 loaded from `…\Tabatha\dist`  
**Confirm version:** Settings → top-left nav should read `Tabatha v6.3.1-α`

Mark each item ✅ PASS, ❌ FAIL, or ⏭ SKIP with a short note on failures.

---

## Before you start
- Reload the extension: `chrome://extensions` → ↻ on Tabatha
- Confirm it reads **6.3.1** — if still 6.3.0 or lower, stop and say so
- You'll need: a focus running, a few open tabs, 5-10 min free for the idle tests

---

## Group A — Core regression (nothing should have broken)

| # | What to do | Pass signal |
|---|---|---|
| A1 | Popup opens | Renders without errors |
| A2 | Clock in | Timer starts |
| A3 | Start a focus "Test QA", 2 min timer | FocusBar appears, InBar shows it |
| A4 | Complete the focus | Moves to history, no JS errors in background console |
| A5 | Open a new tab on any normal site | Gatekeeper / intent prompt appears (or is correctly suppressed per settings) |
| A6 | Sidebar opens | Shows current focus and tabs |

---

## Group B — Focus Lifecycle Settings (new section)

*Settings → 🧠 Focus Lifecycle*

| # | What to do | Pass signal |
|---|---|---|
| B1 | Navigate to Focus Lifecycle | Section exists and renders |
| B2 | Toggle **Auto-pause on idle** OFF | Saves. Reload settings — still OFF |
| B3 | Toggle it back ON | "↳ Prompt before pausing" sub-toggle appears indented below |
| B4 | Toggle **Prompt before pausing** off | Sub-toggle saves, reloads correctly |
| B5 | Toggle back on | Back to default state |
| B6 | Change idle threshold to **1 min** | Saves (you'll use this for Group D) |
| B7 | **Meeting domains textarea** — add a new line: type `whereby.com`, press Enter, type `around.co` | Both domains appear on separate lines. Field accepts Enter key without any weirdness. Saves. |
| B8 | Change **Drift threshold** to **1 min** | Saves (you'll use this for Group E) |
| B9 | Hover any tooltip in this section | Tooltip appears, does NOT clip off right edge, text wraps |

---

## Group C — Auto-Focus chip (new)

*Prerequisite: no active focus, but clocked in.*

| # | What to do | Pass signal |
|---|---|---|
| C1 | Open a tab on **github.com** or **stackoverflow.com** | A small chip appears bottom-right: "⚡ Working on Learning?" (or similar). Auto-fades after ~8 seconds |
| C2 | Open github.com again, chip appears → click **Set** | A focus is created and starts running |
| C3 | Complete that focus. Open github.com again, dismiss with **✕** | Chip disappears. Open github.com immediately again — chip does NOT re-appear (30-min cooldown) |
| C4 | Settings → URL Rules → edit any rule → enable **🎯 Auto-create focus** → save. Open a tab matching that rule with no active focus | Focus is **silently** created — no chip, no prompt |

---

## Group D — Idle prompt (new)

*Prerequisite: B6 set idle threshold to 1 min. Active focus running.*

| # | What to do | Pass signal |
|---|---|---|
| D1 | Start a focus. Move mouse away, don't touch keyboard for ~70 seconds | An overlay appears: "💤 Still on task?" with 3 buttons. Focus is NOT silently paused |
| D2 | Click **Yes, on task** | Overlay closes. Focus still active |
| D3 | Go idle again (~70s) → click **Pause focus** | Overlay closes. Focus shows as paused |
| D4 | Start fresh focus. Go idle → click **I diverged** | Focus transitions to drifted state |
| D5 | **Auto-pause OFF test:** Settings → toggle Auto-pause OFF. Start focus, go idle 2+ min, return | No overlay, no pause. Focus still active. *(Restore setting after.)* |

---

## Group E — Drift detection (new)

*Prerequisite: B8 set drift threshold to 1 min. Active focus running.*

| # | What to do | Pass signal |
|---|---|---|
| E1 | Start a focus. Switch to reddit.com (or any unrelated site) and stay for ~70 seconds | "🧭 Drifting off?" overlay appears |
| E2 | Click **Still working on it** | Overlay closes. No more drift prompts for that tab |
| E3 | Start fresh focus. Drift again. Click **Just checking** | Overlay closes. Snoozes for 5 min (won't re-fire immediately) |
| E4 | Start fresh focus. Drift again. Click **Switching tasks** | Current focus pauses. InBar prompts for new focus |

---

## Group F — Checkpoint Timeline Edit Mode (new, Plan 037)

*Prerequisite: a focus with at least 1-2 checkpoint notes. Start "Test QA" focus, add a checkpoint note via the 📋 button, then open 📊.*

| # | What to do | Pass signal |
|---|---|---|
| F1 | Open 📊 checkpoint timeline | Timeline expands. Shows entries. A hint says "Tap ✏️ Edit to…" |
| F2 | Click **✏️ Edit** | Edit mode activates. Total tracked time shown at top with a label. Time adjustment controls (−5m/−1m/+1m/+5m) visible |
| F3 | Click **+5m** | Elapsed time increases by 5 min |
| F4 | Click **−1m** | Elapsed time decreases by 1 min |
| F5 | Type a number in "exact min" box → click **Set** | Elapsed jumps to that exact value |
| F6 | **Pause the focus** (pause button), then re-open timeline in edit mode | A green **↩ Remove last pause & restore its time** button appears |
| F7 | Click it | Focus resumes, time restored, pause entry removed from timeline |
| F8 | On a user-written checkpoint note, click **✏️** | Inline textarea + emoji progress picker appears |
| F9 | Edit the text, change the progress emoji, click 💾 Save | Entry updates. Shows "edited" badge |
| F10 | Click **✕** on any timeline entry | Entry removed |
| F11 | Click **+ Add checkpoint note** (in edit mode) | The checkpoint note form opens |
| F12 | Click **✓ Done** | Edit mode exits cleanly |

---

## Group G — Domain History (new, Plan 038 Phase 1)

*Settings → 🔗 URL Rules → 🌐 Domain Groups tab*

| # | What to do | Pass signal |
|---|---|---|
| G1 | Open the Domains tab | Shows domains with visit count, last-seen time (not just "X tabs open") |
| G2 | Close all tabs for one domain, wait a few seconds, re-check the tab | That domain still appears (persistent — it's not tied to open tabs) |
| G3 | Click **🚫** on any domain | Domain fades out. Check "Show dismissed" checkbox — it reappears there |
| G4 | Click **↩** to restore | Domain returns to active list |
| G5 | Click **⭐ Target** on a domain | Domain shows "⭐ targeted" badge |
| G6 | Search bar — type a domain name | List filters in real time |

---

## Group H — Things NOT to test (companion-dependent, skip)
- OS-unlock auto clock-in
- Companion idle suppression (desktop app active → Chrome idle → no pause)
- Meeting detection via companion process name

---

## After testing
For each ❌, note:
- Which step failed
- What actually happened vs. what was expected
- Any console errors (`chrome://extensions` → Tabatha → "Service worker" → console, or open DevTools on the page)

**Reset before closing:** Settings → Focus Lifecycle → restore idle threshold and drift threshold back to 5 min and 3 min.
