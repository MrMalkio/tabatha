# Bug B10 — InBar shifts/breaks host-page layout on some sites

> **Status:** 📋 Specced, not started · **Reported:** 2026-08-10 (Malkio, live use)
> **Affects:** `src/content/inbar.js` (~L150-163) · **Severity:** HIGH (breaks third-party sites)

## Symptoms

On **some** sites, with InBar visible, page content is shifted left, right, or pushed **off-screen
entirely**. Hiding the InBar restores the page immediately. Site-dependent — many sites are fine.

## Root cause (high confidence, from source)

`src/content/inbar.js` mutates `document.body` directly to make room for the bar:

```js
document.body.style.setProperty('transition', 'margin 0.2s ease', 'important');
if (h > 0) document.body.style.setProperty('transform', 'translateZ(0)', 'important');   // ← the bug
else       document.body.style.removeProperty('transform');
// + margin-top / margin-bottom `${h}px` !important
```

**`transform` on `<body>` is the problem.** Per CSS spec, any non-`none` `transform` makes that
element a **containing block for all `position: fixed` descendants**. So every fixed-position element
on the host page — sticky headers, nav rails, side drawers, cookie banners, modals, chat widgets —
stops being positioned against the *viewport* and is positioned against `<body>` instead.

On sites where `<body>` is centered, has margins, is narrower than the viewport, or is itself offset,
that reparenting moves those elements horizontally — left, right, or completely off-screen. Sites
whose `<body>` happens to fill the viewport at origin look fine, which is exactly why it's
site-dependent.

The comment above the line says the transform exists to beat pages that `!important`-reset margins,
i.e. it was added as a paint/stacking workaround. It fixes one class of site by breaking another.

Secondary contributor: `margin-top/bottom !important` on `<body>` also fights layouts that assume a
zero-margin body (and CSS `100vh` shells, which don't account for the added margin).

## Fix directions (evaluate, don't assume)

1. **Drop the `transform` entirely.** Verify what it was actually fixing — if it's a repaint issue,
   `will-change`, `contain`, or forcing reflow another way avoids creating a containing block.
2. **Stop resizing the page at all** — render the bar as a viewport-fixed overlay in its own shadow
   host and let it float over content (optionally with a small safe-area inset), instead of pushing
   `<body>`. Removes the whole class of conflict.
3. If the page must be pushed, prefer `html { padding-* }` or a wrapper element over mutating
   `<body>`'s `transform`/`margin`.
4. **Restore cleanly on hide/unload** — confirm every property set is removed (transform is removed,
   margin/transition currently are not obviously restored on teardown).

## Verification

Reproduce on a site that breaks and one that doesn't (Malkio to name examples — see Open questions),
then confirm: fixed elements stay viewport-anchored with InBar shown, no horizontal shift, no
off-screen content, layout identical to InBar-hidden, and no regression to whatever the transform was
originally added for.

## Open questions for Malkio

- Which sites break? Even two or three examples make this fast to verify — the failure depends on the
  host page's `<body>` geometry.
- Top or bottom InBar position when you see it (both code paths set the transform, but the margin
  differs).

## Related

- B09 (InBar edit-dropdown save vs assign) — same file, unrelated defect.
