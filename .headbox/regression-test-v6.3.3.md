# Tabatha v6.3.3 — Regression Test (delta since v6.3.1)
**Build:** v6.3.3 from `…\Tabatha\dist` · **Confirm:** Settings nav reads `v6.3.3-α`
**Scope:** Only the fixes added after the v6.3.1 test session. Everything you already passed (A1-A6, B1-B6, G1) does not need re-running unless you want to.

Mark each ✅ / ❌ with a note on failures. If everything passes → **merge PR #21**.

---

## 1. Idle prompt is now clickable (was the D1 blocker)
1. Settings → 🧠 Focus Lifecycle → set **Idle threshold = 1 min**, ensure **Auto-pause ON** + **Prompt before pausing ON**
2. Start a focus. Leave mouse/keyboard alone ~70s until the "💤 Still on task?" overlay appears
3. **Move your mouse and click a button**
   - ✅ PASS: overlay stays put; clicking **Yes, on task / I diverged / Pause focus** works
   - ❌ was the bug: overlay vanished the instant you moved the mouse

## 2. Off-device focus is NOT paused by idle
1. Start a focus → click 📱 to mark it **off-device** (📴)
2. Go idle 2+ min, return
   - ✅ PASS: focus still active, no pause, no prompt, time intact

## 3. Auto-pause master OFF
1. Settings → Focus Lifecycle → **Auto-pause on idle = OFF**
2. Start focus, go idle 2+ min, return
   - ✅ PASS: nothing happens to the focus at all (no prompt, no pause)
3. Turn Auto-pause back ON when done

## 4. Side-quest now counts as drift
1. Settings → set **Drift threshold = 1 min**
2. Start a focus on some work tabs
3. Open a new tab, give it a **different side-quest intent** (via InPop or InBar)
4. Stay on that side-quest tab ~70s
   - ✅ PASS: "🧭 Drifting off?" overlay appears (the side-quest tab is treated as off-task)
   - ❌ was the bug: no drift prompt ever fired for side-quest tabs

## 5. Sidebar parity
Open the sidebar with an active focus that has ≥1 checkpoint note:
- ✅ **📊** button present → opens the checkpoint timeline with ✏️ Edit mode
- ✅ **📱 / 📴** off-device toggle present
- ✅ **📌 Sub** sub-focus button present

## 6. Domain Groups populated on load
1. Settings → 🔗 URL Rules → 🌐 Domain Groups
   - ✅ PASS: shows domains with **visit count + last-seen** immediately (even for sites whose tabs are closed)
   - ❌ was the bug (G2-G5): empty / only open tabs
2. Click 🚫 dismiss → ⭐ target → ↩ restore on a domain — all should work and persist

## 7. Meeting-domain textarea (B7 retest)
Settings → Focus Lifecycle → Meeting domains box:
- ✅ Click at end, press **Enter**, type a new domain — the new line stays and you can type on it
- Click away (blur) → it saves

## 8. Timeline note formatting
Add a checkpoint note with **multiple lines** (Shift+Enter between lines), then view it in the timeline (not edit mode):
- ✅ PASS: line breaks are preserved (not collapsed into one paragraph)

## 9. Tooltips
Hover tooltips in Settings, especially near the right edge:
- ✅ PASS: tooltip text wraps and stays on-screen (no right-edge clipping)

---

## If all pass → merge PR #21 (`feat/plan-036-focus-lifecycle` → `staging`)

## Known NOT covered here (companion required, skip):
- OS-unlock auto clock-in, desktop-idle suppression, companion meeting detection
