# Asana Widget — Proposed Version Split

**Status:** proposal only — not executed. Written as part of the widget carve-out
(Asana task 1216679069945012), follow-up to Kael's restoration (task
1216678582893487, PRs #27–#33) and codifying Plan 040 Addendum 4 / the
"Surface-scoped versioning" table (formerly SYSTEM-MAP.md §7.1, not yet merged
into this branch's `docs/` tree at time of writing).

## Where the widget work lives today

- `Koda/asana-widget-pre-rebase` — the intact widget-side extension work
  (one-click Asana/Anasa task actions: attention tracking, context mirroring,
  one-click open/link/create). Currently version-stamped **6.8.2**, tangled
  into the extension's own `6.x` line. **Preserved fully intact per this
  carve-out's constraints — not touched, not merged, not re-versioned.**
- `flux-asana-widget/` (in-repo, on `staging`) — the original Express/HTTPS
  time-tracker server, package version `1.0.0`, already its own module.
- `supabase/functions/asana-widget` (commit `7f1bccb`, "deploy native
  attention widget service") — a Supabase Edge Function implementing the
  same widget surface, currently reachable only via local
  `claude/tabatha-ai-integration-layer-91903b` (diverged from its own
  `origin` copy, not pushed with this commit). **Not swept into staging by
  this carve-out** per Kael's explicit flag — needs its own disposition call.

## Proposed split

Give the Asana widget an independent `0.x` version line, matching the pattern
already used for Tabby Sidecar (`sidecar/app.json`) and the desktop companion
(`src-tauri/tauri.conf.json`):

| Component | Proposed home | Proposed version source | Starting version |
|---|---|---|---|
| Extension-side widget UI (one-click actions, attention tracking, context mirrors) | stays in `src/` but version-tracked separately | new `widget/package.json` or a `WIDGET_VERSION` const synced independently of `public/manifest.json` | `widget-0.1.0` (first re-versioned cut off Koda's rebase) |
| `flux-asana-widget/` server | already separate | its own `package.json` (currently `1.0.0`) | keep `1.0.0`, no change needed |
| `supabase/functions/asana-widget` edge fn | pending decision (see Open question below) | function-level version comment/tag, no repo-wide manifest | TBD once disposition is decided |

**Mechanics when Koda rebases `Koda/asana-widget-pre-rebase` onto the
now-current `staging` (v6.7.29):** the rebase will re-mint the extension's own
commits past 6.7.29 (they currently sit at 6.8.2, colliding with — and now
far behind — the real 6.7.x/6.7.29 line). At that point, split the widget's
version stamp OUT of `public/manifest.json` entirely and into its own
tracked file, so future widget-only commits don't force extension version
bumps and vice versa. This mirrors how `sidecar/app.json` already keeps the
Sidecar's `0.x` line independent of the extension's `6.x` line.

## Open question (for Malkio/Koda, not decided here)

`supabase/functions/asana-widget` (`7f1bccb`) duplicates/extends the
`flux-asana-widget/` server's functionality as a hosted Edge Function. Before
the widget's `0.x` line is cut, decide whether the Edge Function supersedes
the Express server (retire one), or both persist for different deploy
targets — that decision determines whether the widget's `0.x` package
manifest lives at repo root, inside `flux-asana-widget/`, or inside a new
`supabase/functions/asana-widget/` own manifest.

## Explicitly not done by this note

- No version files were created or renamed.
- No commits from `Koda/asana-widget-pre-rebase` or
  `claude/tabatha-ai-integration-layer-91903b` were rebased, merged, or
  re-versioned.
- No decision was made on the Edge Function vs. Express server question above.
