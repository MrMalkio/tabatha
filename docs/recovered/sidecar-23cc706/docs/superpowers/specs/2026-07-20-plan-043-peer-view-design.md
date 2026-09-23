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

---

## Koda vet + expansion (2026-07-20)

### Security review — "prove a peer session can never read outside its grant"

The core trust-model argument (§1) is sound and I verified its load-bearing
assumption directly: `profiles` rows are **only** ever created inside
`redeem_invite_token` (migrations 042/043/044) — there is no `auth.users`
insert trigger anywhere in `supabase/migrations/` that auto-provisions a
`profiles` row for a freshly-created auth user. That means an anonymous
peer's `auth.uid()` genuinely has no matching `profiles` row, so it falls
through every existing owner-scoped RLS policy
(`profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())`)
to an empty result set — the peer gets real containment from the *existing*
tables for free, without Peer View touching a single existing policy. The
"RPC not raw RLS" architecture (§2.2) is the right call for exactly the
reason stated (future-column-proofing), and matches this repo's own
`get_effective_permissions` precedent from the Olympus doc. **This part:
PROCEED.**

Three concrete gaps found that block a clean PROCEED on the schema as
written:

1. **Anonymous sign-ins are currently disabled at the project level.**
   `supabase/config.toml:167` — `enable_anonymous_sign_ins = false`. Unit 3's
   entire redeem flow (`signInAnonymously()`) is a no-op against the live
   project until this flips to `true`. Not a design flaw, but an unstated
   prerequisite with real blast radius: flipping it project-wide also
   enables `enable_anonymous_sign_ins`'s rate limit
   (`anonymous_users = 30`/hour/IP, already configured, good) but also means
   *any* client — not just Peer View's redeem screen — can now call
   `signInAnonymously()` against this project and get a JWT with
   `role = authenticated`. Verified this is safe as long as no other RLS
   policy in the schema grants on bare `role = authenticated` without an
   owning-profile subquery — spot-checked `focus_items`, `focus_checkpoints`,
   `task_relations`, `watch_pairing_codes`: all gate through the
   `profile_id IN (SELECT ... auth_user_id = auth.uid())` pattern, so an
   anonymous session sees nothing extra. **Revise (build-time step, not a
   design change):** flip the config flag and re-run a project-wide RLS
   audit sweep (grep every `GRANT ... TO authenticated` for one that
   *doesn't* have an owning-profile predicate) as an explicit Unit 1 sub-step
   before shipping, not an assumption.
2. **No brute-force lockout column — a real regression vs. the pattern this
   doc claims to reuse.** `watch_pairing_codes` (migration 040) has
   `attempts INT NOT NULL DEFAULT 0` specifically so the redeem edge function
   can lock a code after 5 bad guesses (migration 040's own header comment:
   "added an `attempts` counter so the redeem edge fn can lock a code after 5
   bad guesses"). `peer_grants` as drafted in §2.1 has no equivalent column —
   only `code_hash`/`code_expires_at`/`redeemed_at`. §1 claims Peer View
   "reuses the code mint/redeem UX (short numeric code, hashed, time-limited,
   single-use)" — the brute-force defense is part of that UX in the pattern
   it's citing, and got dropped in the copy. **Revise, exact:** add
   `attempts INT NOT NULL DEFAULT 0` to `tabatha.peer_grants` (migration 051)
   and have the redeem RPC/edge function reject once `attempts >= 5`,
   incrementing on every failed-hash lookup, mirroring `pair-watch`'s logic
   exactly.
3. **`get_peer_view`'s SQL body is a comment, not code — the one place this
   doc most needs to show its work.** §2.2 states the function "verifies
   `auth.uid()` matches the grant's peer identity and grant is live" but
   only as prose inside the function body, not as an actual `WHERE` clause.
   For a security-critical SECURITY DEFINER function taking a caller-supplied
   `p_grant_id`, the binding requirement should be spelled out in the design
   doc itself, not left to build-time interpretation. **Revise, exact —
   require this WHERE clause (or equivalent) to appear literally in migration
   051's SQL, and treat any implementation lacking every clause as
   non-compliant with this design:**
   ```sql
   WHERE id = p_grant_id
     AND peer_auth_user_id = auth.uid()
     AND revoked_at IS NULL
     AND (grant_expires_at IS NULL OR grant_expires_at > now())
   ```
   The same four-clause liveness check (owner match + not revoked + not
   expired) must be duplicated verbatim at the top of every migration-052 RPC
   (`peer_create_intent`, `peer_add_checkpoint`, `peer_nudge`) *before* the
   capability-flag check, not just "re-validates the grant is live" as
   prose. Recommend factoring it into one shared
   `tabatha.assert_live_peer_grant(p_grant_id UUID) RETURNS tabatha.peer_grants`
   helper (raises/returns null on any failure) that all four RPCs call first,
   so the four-clause check exists in exactly one place instead of being
   hand-copied four times with the attendant risk of one copy drifting.

None of these are architecture-level objections — the anonymous-session +
capability-gated-RPC model is the right shape. They're the difference
between "the trust model is sound" (true) and "the schema as literally
written enforces it" (not yet — needs the three revisions above).

### Verdicts per unit

| Unit | Verdict | Notes |
|---|---|---|
| **Unit 1 (Schema)** | **REVISE-WITH-EXACT-REVISION** | Add `attempts` column (#2 above), spell out `get_peer_view`/write-RPC liveness WHERE clauses (#3 above), flip `enable_anonymous_sign_ins` + run the RLS grant sweep (#1 above) as an explicit sub-step. |
| **Unit 2 (Mint UI)** | **PROCEED** | Depends on Unit 1's revision landing first. |
| **Unit 3 (Redeem flow)** | **PROCEED, blocked on config** | Cannot function until `enable_anonymous_sign_ins = true` is applied to the live project — call this out as a literal pre-build checklist item, not folded into "Unit 1: none". |
| **Unit 4 (PeerView component)** | **PROCEED** | Deriving from `ContextView.tsx`'s shell is the right reuse call — same visibility-map vocabulary, no new design language invented. |
| **Unit 5 (Multi-peer management)** | **PROCEED** | |
| **Unit 6 (v2, Tabatha-to-Tabatha)** | **DEFER** | Correctly scoped out; no objection. |

### Koda additions

- **Peer-view mutual "body-doubling" sessions.** This ties directly to
  parked feature #215 (Body Doubling). Right now Peer View is
  strictly asymmetric (owner broadcasts, peer optionally nudges/adds). A
  cheap v1.5 extension: a `capabilities.mutualPresence: true` flag that,
  when set, has the *peer's* own `signInAnonymously()` session write a tiny
  presence heartbeat (`peer_grants.last_seen_at`, one new column, no new
  table) that the **owner's** Context View/PeerView surfaces back as "Mom is
  watching" — turning a one-way viewing grant into a lightweight
  co-presence signal without building #215's full session model. This is
  the single cheapest bridge from "Peer View exists" to "body doubling
  exists" — worth flagging now so #215, when it's unparked, designs against
  a `peer_grants` row that already has a presence column rather than
  re-inventing one.
- **Peer nudge escalation ladder.** Today `peer_nudge` is one flat action
  (a preset-key banner + optional #182 audio ping). A peer who's genuinely
  worried (the "Mom checking in" case, not the "assistant flagging a
  meeting" case) has no way to signal urgency differently than a routine
  nudge. Cheap addition: `peer_nudge(p_grant_id, p_preset_key, p_urgency)`
  with `p_urgency IN ('low','normal','high')` — `high` skips the #182 quiet-
  hours gate that Unit 4 of Plan 042 otherwise respects (an urgent peer
  nudge is exactly the kind of thing that should interrupt quiet hours; a
  routine one shouldn't). Small addition to the `peer_nudges` table
  (one column) and to the capability-gate check.
- **Grant templates.** `visibility`/`capabilities` are per-grant JSONB with
  no starting point in the mint UI as scoped — every peer grant starts from
  a blank slate. A tiny, purely client-side addition (no schema change):
  ship 2-3 named presets in the Mint UI ("Just watching" — brand/timer/
  focusLabel/upNext only, zero capabilities; "Can nudge me" — adds
  `nudge: true`; "Full assistant" — everything but checkpoints) that
  pre-fill the JSONB before the user fine-tunes. Removes the blank-JSONB-
  form cold-start problem for the common cases without adding any new
  schema surface.
- **Revoke-on-suspicious-pattern auto-flag.** Since `peer_nudges` and every
  peer-authored mutation already carry `tags._src = 'peer'`, a cheap
  client-side (not server-enforced, just a UI hint) addition: if a single
  `peer_grants` row generates an unusual burst of writes in a short window
  (e.g. >10 nudges in 5 minutes), surface a "this peer has been unusually
  active — review?" banner in the owner's Settings Peers section. Doesn't
  require new schema (queryable from existing `peer_nudges.created_at` +
  `tags._src` on checkpoints/focus_items), just a client-side query + a
  banner. Cheap abuse-signal for a feature whose entire premise is "give a
  scoped credential to someone who isn't you."
