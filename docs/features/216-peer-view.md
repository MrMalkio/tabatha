# Feature #216 — Peer View

> **Status:** 📋 Planned · **Plan:** [042 → 043](../superpowers/specs/2026-07-20-plan-043-peer-view-design.md)
> **Depends On:** pair-watch code mint/redeem UX pattern (migration 040, shipped)
> **Created:** 2026-07-20

## User Context (Quotes)

> Malkio's Plan 043 brief: "A Context View variant for someone who is NOT the
> user (assistant, partner, friend): signs in via a user-minted code (reuse
> pair-watch machinery — new audience kind), user-set expiration, per-element
> visibility customization (which CV elements the peer sees), user-granted
> capabilities (can peer add intents/tasks? update checkpoints?),
> Tabatha-to-Tabatha peer invites when both have accounts, multi-peer
> management."

## What It Does

Lets the user share a scoped, time-limited, permission-limited view of their
Context View with someone who isn't them — an assistant checking in, a
partner who wants a glance without asking, a friend acting as an
accountability peer. The peer never gets the user's own login: they redeem a
short numeric code into an **anonymous Supabase session** scoped by a
`peer_grants` row, so a compromised or forgotten peer link can never expose
more than what was explicitly granted, and revoking a grant instantly cuts
access.

Configurable per grant: which Context View elements are visible (brand,
timer, focus label, up-next, checkpoints, day countdown), what the peer can
*do* (add an intent, add a task, update a checkpoint, send a nudge), and when
the grant expires. A peer can send a preset encouragement ("nudge") that
surfaces on the user's Context View, optionally riding the #182 Chaperone
pre-recorded audio channel.

## Implementation Notes

- Full design: `docs/superpowers/specs/2026-07-20-plan-043-peer-view-design.md`.
- New tables `tabatha.peer_grants`, `tabatha.peer_nudges` (migrations 051-052,
  placeholder numbers pending build-time re-verification).
- Peer reads/writes route through SECURITY DEFINER RPCs
  (`get_peer_view`, `peer_create_intent`, `peer_add_checkpoint`,
  `peer_nudge`) rather than raw RLS on `focus_items`/`focus_checkpoints`, so
  future column additions to those tables don't need a peer-RLS review every
  time.
- v1 ships free/ungated. v2: Tabatha-to-Tabatha peer invites (real accounts
  on both sides) and pro-gating via Olympus's `feature_permissions`
  (`docs/superpowers/specs/2026-07-20-flux-zeus-admin-design.md`), once
  Olympus ships.

## Related Features

- Migration 040 `pair-watch` (mechanism donor, not trust-model donor)
- #182 Chaperone Mode (nudge audio ride-along)
- Olympus / `flux-olympus` `feature_permissions` (v2 pro-gating)
