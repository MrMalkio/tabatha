# Bug B10 — InBar shifts/breaks host-page layout on some sites

> **Status:** 🔒 Root cause settled — **blocked on one product decision from Malkio** (see "Fix
> directions (revised)"). Not started. · **Reported:** 2026-08-10 (Malkio, live use)
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

Secondary contributor: `margin-top/bottom !important` on `<body>` also fights layouts that assume a
zero-margin body (and CSS `100vh` shells, which don't account for the added margin).

## ⚠️ Root-cause premise CORRECTED (2026-08-11, nightly TaskRun — CeeCee)

**The paragraph originally here was wrong, and its conclusion was dangerous.** It said the transform
"was added as a paint/stacking workaround", implying it could simply be deleted. The source history
says the opposite.

`git blame` puts the transform at commit **`8aa2d0b`** (Malkio, 2026-07-16, merge "showcase mobile
responsiveness + honest companion state", **v6.7.20**). The comment it shipped with — still in the
file at `src/content/inbar.js:149-154` — states the containing-block behaviour **is the intended
mechanism, deliberately chosen**:

> Plain body margin only reflows document flow — it does nothing for the host page's own
> position:fixed headers/footers (very common on SPA shells) […] Setting a transform on `<body>`
> makes body the containing block for its fixed descendants, **so they move down/up with the pushed
> content instead of staying pinned under the bar**.

So the transform was added *precisely* to fix fixed-position SPA shells — the same class of site
B10 now breaks. It is not vestigial and it is not a repaint hack.

**Consequence: "drop the transform" is not a free win.** It would reintroduce exactly the bug
`8aa2d0b` was written to fix — host-page sticky headers/nav sitting *underneath* the InBar, hidden.
The real shape of B10 is a **genuine trade-off between two broken states**, both on fixed-shell SPAs:

| Option | Asana-class sites (fixed shell, offset body) | Sites `8aa2d0b` was fixing (fixed header) |
|---|---|---|
| Transform ON (today) | ❌ whole shell displaced / off-screen | ✅ header moves with content |
| Transform OFF (doc's old option 1) | ✅ shell correct | ❌ header hidden under the bar |

That is why this was **not** auto-fixed on the 2026-08-11 unattended run: picking a side is a product
decision, and a one-line 3am change would have silently traded a HIGH bug for a different HIGH bug on
overlapping sites, unverifiable without cross-site browser testing. Escalated as a morning decision.

**Teardown claim also corrected:** the original item 4 suspected the properties leak on hide. They
largely don't — the collapse path calls `pushPage(0)` (`inbar.js:1190`), which removes `transform`
and sets the margin to `0px`. Residue is cosmetic only: `transition: margin …!important` and a
`margin-*: 0px !important` declaration stay on `<body>`. Worth tidying, but it is **not** the reported
defect and fixing it alone changes nothing for B10.

## Fix directions (revised — option 1 struck)

1. ~~**Drop the `transform` entirely.**~~ **Rejected** — see the corrected root cause above; this
   regresses the fixed-header class of site that `8aa2d0b` deliberately fixed.
2. **Stop resizing the page at all** ← **recommended.** Render the bar as a viewport-fixed overlay in
   its own shadow host and let it float over content (optionally with a small safe-area inset),
   instead of pushing `<body>`. This is the only direction that resolves *both* broken states rather
   than trading between them, because it stops mutating host layout entirely. Cost: the bar overlaps
   ~28px of page content instead of displacing it, and any host element that is itself pinned to the
   same edge will sit under it.
3. If the page must be pushed, prefer `html { padding-* }` or a wrapper element over mutating
   `<body>`'s `transform`/`margin` — `padding` on `<html>` does not create a containing block for
   fixed descendants, so it avoids B10, but it also does **not** reposition the host's fixed headers,
   so it inherits `8aa2d0b`'s original problem. Strictly a middle ground, not a resolution.
4. **Per-site opt-out** (allowlist/denylist of hosts that get the transform). Rejected as a primary
   fix — unbounded maintenance, and it fails silently on every site not yet catalogued.

**The decision Malkio owes this bug:** accept option 2's overlap trade-off (bar floats over content,
no host layout mutation ever), or keep pushing the page and accept that one of the two site classes
stays broken. Everything else above is settled.

## Verification

Reproduce on a site that breaks and one that doesn't (Malkio to name examples — see Open questions),
then confirm: fixed elements stay viewport-anchored with InBar shown, no horizontal shift, no
off-screen content, layout identical to InBar-hidden, and no regression to whatever the transform was
originally added for.

## CONFIRMED REPRO (Malkio, 2026-08-10, with paired screenshots)

**app.asana.com** — e.g. `https://app.asana.com/1/9526911872029/project/1211839349340120/task/1217155161118393`

Side-by-side evidence, same page, InBar shown vs hidden:
- **Shown:** the entire app shell is displaced left — the global left nav (Work/Agents/Strategy rail
  and the project sidebar) is pushed off the left edge, the board column is clipped, and the task
  detail panel runs past the right edge. Content is unusable.
- **Hidden:** renders normally — full sidebar, correct column widths, panel inside the viewport.

This is textbook confirmation of the diagnosis. Asana's web app is a fixed-position shell: the nav
rail, sidebar, and detail pane are all `position: fixed` against the viewport. Once `<body>` carries a
`transform`, they re-anchor to `<body>` and inherit its offset/width, so the whole chrome slides.

**Severity is higher than "some sites":** Asana is Malkio's primary daily surface, so this has been
degrading his main workspace continuously — and any comparable fixed-shell SPA (Linear, Notion,
Gmail, Slack web) is likely affected the same way.

### Second confirmed repro — dashboard.stripe.com (Malkio, paired screenshots)

Stripe's billing/customer view, same page, InBar shown vs hidden:
- **Shown:** the entire left navigation (Duckandshark switcher, Home, Balances, Transactions,
  Customers, Product catalog, Shortcuts, Products) is **gone from the viewport**; page content is
  displaced left; the "Pause payment collection" modal is pushed down and clipped at the bottom edge
  with its action buttons (Cancel / Pause) out of reach.
- **Hidden:** full sidebar renders, modal is centred and complete with buttons visible.

Same mechanism, and it escalates the impact class: here the transform doesn't merely shift chrome —
it puts a **modal's confirm/cancel buttons off-screen**, i.e. the user cannot complete or safely
abandon a billing action. Two independent products (Asana, Stripe), both fixed-shell SPAs, both
broken the same way, confirms this is the general case for that architecture rather than a
site-specific quirk.

**Prediction worth testing during the fix:** any host page that both (a) pins chrome with
`position: fixed` and (b) does not have `<body>` filling the viewport at origin. Linear, Notion,
Gmail, Slack web, GitHub's newer views, and most admin consoles fit that description.

## Interim workarounds (source-verified 2026-08-14, nightly TaskRun — CeeCee)

The Stripe repro means a user can be stranded at a billing modal whose Cancel/Pause buttons are
off-screen. Two escape hatches already exist in shipped code, so nobody is actually stuck while the
fix direction is being decided. Both were read out of source, not assumed:

| Workaround | Mechanism | Limit |
|---|---|---|
| **Collapse the bar to its nub** (click the collapse control; the nub re-expands it) | `collapse()` at `src/content/inbar.js:1181` calls `pushPage(0)` at :1189, which hits the `else` branch of `pushPage` and **removes the `transform` outright** plus zeroes the margin → host layout fully restored, immediately | **Not persisted.** `isCollapsed` is a per-injection local (`src/content/inbar.js:72`, initialised `false`), so it resets on every page load and every SPA re-injection. This is a per-pageview click, not a standing setting. |
| **Turn the bar off globally** — Settings → Intent Bar (InBar) → "Show Intent Bar on pages" | `inbarEnabled` toggle, `src/settings/index.jsx:1637-1639` | Durable, but all-or-nothing: removes InBar on every site, not just the broken ones. |

**Negative finding worth recording:** switching `inbarPosition` between top and bottom does **not**
help. `pushPage` sets the `transform` at `src/content/inbar.js:156-157`, *before* the
top/bottom branch, so the containing-block side-effect is identical in both positions. The obvious
"just move it to the bottom" guess is a dead end.

This is a mitigation note only — it does not touch the open decision below, and no code was changed
to produce it. The gap it exposes (no per-site disable, and collapse doesn't survive navigation) is
worth folding into whichever fix direction is chosen.

## Related

- B09 (InBar edit-dropdown save vs assign) — same file, unrelated defect.
