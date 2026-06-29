# Feature #212 — InPop Intent Dropdown Header (Full-Bleed Intent Switcher)

> **Status:** 📋 Planned · **Version:** v0.3.0
> **Depends On:** InPop component, Intent Selector (#123), Focus Engine (#122), ComboInput / FocusInput
> **Created:** 2026-05-30
> **Source:** User, 2026-05-30
> **Category:** UI / InPop

## User Context (Quotes)

> "On the InPop we should make the header of the pop-up a drop-down. It doesn't immediately look like a drop-down. What it should be preset to is the intent that the tab is going to be connected to, or what it's assumed the intent of that tab is going to be connected to."
>
> "The drop-down function should live as the top portion of the InPop. As a design, it should bleed into the top portion of it with full bleed to the top and a clear delineation to the rest of the InPop. It should not make it look like there's so much more going on. It should definitely have a simple down-facing chevron arrow."
>
> "A user can click that to change the tab to be connected to any other active focus, or any focus that's in the list — rather than necessarily active focuses. At the bottom of the drop-down, or at the top, whichever makes more sense, the user can just click and input a new intent from the same mechanism."
> — User, 2026-05-30

---

## What It Does

Turns the **InPop header into the tab's intent switcher**. By default the header simply *displays* the intent the tab is (or is assumed to be) connected to — it doesn't shout "I'm a dropdown." A subtle **down-facing chevron** is the only affordance. Clicking it opens a picker to reassign the tab to any other focus, and to create a brand-new intent inline.

This removes a layer of navigation: the most common InPop action (confirming/changing what this tab is *for*) lives right at the top, where the user's eye already lands.

---

## Design Requirements

### Default (Closed) State
- Header shows the **preset intent**: the focus the tab is assumed/assigned to.
- Visually reads as a **header**, not an obvious control — minimal chrome, just a small **down-facing chevron**.
- **Full bleed to the top** of the InPop (no top padding/margin; touches the top edge).
- **Clear delineation** from the rest of the InPop body below (divider / subtle elevation / background shift) so it's understood as its own zone without looking busy.

### Open (Expanded) State
- Chevron click expands the dropdown **within the top portion** of the InPop.
- **Options list:**
  - **Active focuses** first (most likely targets).
  - Then **all focuses in the list** (not just active) — full reassignment range.
- **Inline new-intent input** using the **same mechanism** as elsewhere (ComboInput / FocusInput autocomplete) — placed at the **top or bottom** of the dropdown (decide by usability; suggest **bottom** so existing options are reachable first, with new-entry as the "none of these" fallback).
- Selecting an option **reconnects the tab** to that focus and collapses the header back to display state showing the new intent.

### Restraint
- The expansion must not make the InPop feel heavier — keep it visually quiet. The whole point is "one obvious thing at the top," not a second panel.

---

## Behavior
- **Preset logic:** header defaults to the tab's current `contextSource`/assigned focus, or the system's best-guess intent for an unassigned tab (inherited vs. user contexts — reuse existing InPop contextSource tracking).
- **Reassignment:** writes the tab→focus association (same path as existing intent assignment), emits the standard update message so InBar/sidebar/home stay in sync.
- **New intent:** creating one assigns the tab to it immediately and adds it to the focus list.

---

## Anchor Points
- InPop header component (top region) — refactor into a `<IntentHeaderDropdown>`.
- Reuse `ComboInput` / `FocusInput` for the inline create + autocomplete.
- Reuse existing tab→focus association action + `UPDATE_FOCUS` / intent-assignment message types.
- Honor existing inherited-vs-user context distinction when computing the preset.

---

## Open Questions
1. New-intent input at **top** vs **bottom** of the dropdown — recommend bottom; confirm against real usage.
2. Should the list show **focus priority** (#214) badges to aid selection?
3. Keyboard nav (arrow + enter) and the voice mic (#211) inside the dropdown?
4. How to visually distinguish "active focuses" from "all focuses" within one list (section header vs. subtle dimming)?

---

## Related Features
- #123 Intent Selector · #122 Focus Engine
- #211 Audio Input (mic inside the new-intent field)
- #214 Priority Matrix & Lazy Priority (optional priority badges in the list)
