# Implementation Plan 043: Peer View

**Status:** draft — Koda review next
**Driver:** Malkio · **Author:** Cindra
**Current version:** Sidecar 0.11.0 (Context View shipped v0.2.0+)
**Target version on v1 completion:** Sidecar minor bump (exact number per Headbox Rule 10 at commit time)
**Depends on:** `pair-watch` edge function + `watch_pairing_codes` pattern (migration 040, shipped) for the code mint/redeem UX shape only — Peer View does **not** reuse its session-issuance mechanism as-is (§2).
**Migration claim:** 051-052 (placeholder — Olympus, per `2026-07-20-flux-zeus-admin-design.md`, claims 046-049; re-verify via `ls supabase/migrations` before writing SQL, per this repo's established convention).

---

## 1. Why pair-watch's *mechanism* transfers but its *trust model* doesn't

`pair-watch` (`supabase/functions/pair-watch/index.ts`) mints a 6-digit code
(CSPRNG, sha256-hashed at rest, 5-min expiry, one live code per profile),
and on redeem mints a **full user session** via Admin API
`generateLink`→`verifyOtp` — because a paired watch is trusted at the same
level as any other of the user's own devices.

A peer is not the user. Handing a peer a real user session would give them
full read/write over everything — checkpoints, tasks, other devices, clock
history. **Peer View reuses the code mint/redeem UX (short numeric code,
hashed, time-limited, single-use) but issues a fundamentally different
credential**: a Supabase **anonymous session** (`signInAnonymously()`) whose
`auth.uid()` is recorded against a `peer_grants` row, so every subsequent
read/write is gated by that row's `visibility`/`capabilities` JSONB — never
by inheriting the owner's own RLS scope.

---

## 2. Data model (schema `tabatha`, migrations 051-052)

### 2.1 `tabatha.peer_grants`

```sql
CREATE TABLE tabatha.peer_grants (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_profile_id   UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  peer_auth_user_id  UUID,                         -- set on anonymous-peer redeem
  peer_profile_id    UUID REFERENCES tabatha.profiles(id),  -- set for Tabatha-to-Tabatha peers (v2)
  peer_label         TEXT NOT NULL DEFAULT '',      -- "Mom", "Assistant", user-set
  code_hash          TEXT,                          -- mint/redeem, same shape as watch_pairing_codes
  code_expires_at    TIMESTAMPTZ,
  redeemed_at        TIMESTAMPTZ,
  grant_expires_at   TIMESTAMPTZ,                   -- user-set expiration, nullable = no expiry
  visibility         JSONB NOT NULL DEFAULT '{}',    -- { brand:true, timer:true, focusLabel:true, upNext:true, checkpoints:false, dayCountdown:true }
  capabilities       JSONB NOT NULL DEFAULT '{}',    -- { addIntent:false, addTask:false, updateCheckpoint:false, nudge:true }
  revoked_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((peer_auth_user_id IS NOT NULL) OR (peer_profile_id IS NOT NULL) OR (redeemed_at IS NULL))
);

CREATE UNIQUE INDEX peer_grants_code_uniq ON tabatha.peer_grants (code_hash) WHERE redeemed_at IS NULL;
```

RLS: owner can `SELECT`/`INSERT`/`UPDATE`/`DELETE` own rows
(`owner_profile_id = tabatha.current_profile_id()`). A peer (anonymous or
Tabatha profile) can `SELECT` only their own grant row (`peer_auth_user_id =
auth.uid()` or `peer_profile_id = tabatha.current_profile_id()`) — enough to
read their own visibility/capabilities, nothing else.

### 2.2 Peer read access — RPC, not raw table grants

Rather than writing peer-scoped RLS policies onto `focus_items` /
`focus_checkpoints` directly (which would mean every future column addition
to those tables needs a peer-RLS review), Peer View reads through one
SECURITY DEFINER RPC, matching this codebase's established resolver pattern
(Olympus's `get_effective_permissions`, this repo's own precedent):

```sql
CREATE OR REPLACE FUNCTION tabatha.get_peer_view(p_grant_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
  -- verifies auth.uid() matches the grant's peer identity and grant is
  -- live (not revoked, not expired), then returns a JSONB shaped by
  -- the grant's visibility flags only — fields the peer can't see are
  -- omitted from the payload entirely, not just hidden client-side.
$$;
```

### 2.3 Peer writes — capability-gated RPCs (migration 052)

`tabatha.peer_create_intent(p_grant_id UUID, p_label TEXT, p_timer_minutes INT)`,
`tabatha.peer_add_checkpoint(p_grant_id UUID, p_text TEXT, p_progress_level TEXT)`,
`tabatha.peer_nudge(p_grant_id UUID, p_preset_key TEXT)` — each SECURITY
DEFINER, each re-validates the grant is live and the specific capability flag
is `true` before touching `focus_items`/`focus_checkpoints`/the nudge log.
Mutations from these RPCs stamp `tags._src = 'peer'` (or an equivalent
provenance marker) so the owner can always see a peer made the edit — same
provenance convention as `_src='sidecar'`/`_src='dispatch'` elsewhere in this
codebase.

`peer_nudge` writes to a small new table `tabatha.peer_nudges` (id, grant_id,
preset_key, created_at) rather than overloading `push_log` (migration 036) —
`push_log`'s shape is `(profile_id, kind, scope_key, day)` keyed to
server-triggered notification dedup, not peer-authored events; reusing it
would blur two different provenance models for a minor storage saving. The
owner's client subscribes to `peer_nudges` via realtime (same publication
mechanism as migration 011/033/045) and surfaces it as a banner, optionally
riding the #182 Chaperone pre-recorded audio channel per CeeCee's idea — the
nudge write is the only new plumbing; audio playback reuses #182's existing
trigger→pre-recorded-line pipeline unchanged.

---

## 3. Build breakdown — units, file-level scope

**Unit 1 — Schema.** Migrations 051 (`peer_grants` + `get_peer_view` RPC) and
052 (`peer_create_intent`/`peer_add_checkpoint`/`peer_nudge` RPCs +
`peer_nudges` table + realtime publication add). No dependency.

**Unit 2 — Mint UI.** `sidecar/src/screens/SettingsScreen.tsx` (new "Peers"
section) + new `sidecar/src/data/peers.ts` (`mintPeerGrant(label, visibility,
capabilities, expiresAt)`, `listPeerGrants()`, `revokePeerGrant(id)`). Depends
on Unit 1.

**Unit 3 — Redeem flow.** A route reachable without an existing Tabatha login
(e.g. `sidecar/src/screens/PeerRedeemScreen.tsx` + routing entry) — peer
enters the code, client calls `signInAnonymously()` then a redeem RPC that
attaches `peer_auth_user_id` and clears `code_hash`/`code_expires_at`. Depends
on Unit 1.

**Unit 4 — PeerView component.** New `sidecar/src/screens/PeerView.tsx` —
structurally derived from `ContextView.tsx` (same landscape/kiosk shell) but
reading `get_peer_view()` instead of the owner's own `useFocus`/`useCheckpoints`
hooks, conditionally rendering each element per the visibility map, and
showing capability-gated action buttons (add intent / add task / update
checkpoint / nudge) only where the grant allows. Depends on Unit 1, 3.

**Unit 5 — Multi-peer management.** List/revoke UI in the same Settings
section as Unit 2 (peer label, granted-at, last-seen, capability summary,
revoke button). Depends on Unit 2.

**Unit 6 (v2, not built now) — Tabatha-to-Tabatha peer invites.** Real-account
peers: an invite sent to another profile's `peer_profile_id` instead of an
anonymous redeem, reusing the org-invite notification shape. Also where
Olympus pro-gating (`feature_key = 'peer_view_multi'` or similar, once
Olympus's schema exists) would attach — v1 ships ungated/free per the brief
("Free-for-now, pro-flagged later").

---

## 4. Per-element visibility set (v1)

`brand`, `dayCountdown`, `currentTime`, `focusLabel`, `timer`, `upNext`,
`checkpoints` — the same element set `ContextView.tsx` already renders (brand
BL / day-countdown TR / time BM / giant focus+timer / up-next), each toggled
independently in `visibility`. No new element concepts invented; Peer View is
a *subset-and-permission* view over what CV already draws, not a new design.

---

## 5. Dependencies section

| Depends on | For |
|---|---|
| `pair-watch`'s code mint/redeem UX pattern (shipped) | Unit 2/3 UX shape only, not its session mechanism |
| `ContextView.tsx` element set (shipped) | Unit 4's visibility map vocabulary |
| #182 Chaperone pre-recorded audio pipeline (shipped v0) | Nudge-button audio ride-along (optional, not blocking) |
| Olympus `feature_permissions` (draft) | Soft — v2 pro-gating of multi-peer only |

| Blocks | Why |
|---|---|
| Nothing else in this brain-dump | Peer View is a leaf feature |

---

## Parallelability Review

- **Zones touched:** Sidecar-only (`sidecar/src/screens/`, `sidecar/src/data/`),
  plus Supabase migrations (shared resource, sequential).
- **Shared files modified:** `sidecar/src/screens/SettingsScreen.tsx` (Units
  2/5 add a section — additive, low conflict risk) — no extension-side files.
- **Conflicts with active worktrees:** none known; migrations 051-052 must
  not collide with any other branch also claiming post-045 numbers (Plan 044
  claims 053-055, Plan 045 claims 056-057; fix-wave-3 needs no migration and
  leaves 050 unclaimed — re-verify all at build time since only one branch
  should hold a given migration number at once, per
  `docs/parallel-development-workflow.md`).
- **Can run parallel with other work:** Yes — fully isolated to Sidecar +
  its own migration files, zero overlap with Plan 042/044/045 code (schema
  numbering aside).
- **Max branch lifetime estimate:** ~4-5 days (6 units, most independent).
- **Scope-split points:** Unit 1 (schema) ships alone first and unblocks
  everything else. Units 2+5 (Settings UI) are one slice; Units 3+4
  (redeem + PeerView) are a second slice, since a peer can't be tested
  without both. Unit 6 is explicitly v2, not part of this branch.
