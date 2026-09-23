# Shared Focuses & Org-Level Context — Concept Exploration (Feature #221)

**Status:** concept exploration (no build) — Soren (Opus) deep-think track, dispatched by CeeCee
**Driver:** Malkio (voice brain-dump, 2026-07-21) · **Author:** Soren
**Feature doc:** `docs/features/221-shared-focus-org-context.md`
**Adjacent scope:** #216 Peer View (Plan 043), #220 Task-Sync Provider Abstraction (Plan 045),
Olympus admin console (`2026-07-20-flux-zeus-admin-design.md`), Plan 042 Conversational Tabatha,
Sidecar Context View (v0.2.0+)
**Grounded against:** `supabase/migrations/001–050`, `sidecar/src/data/{focus,events}.ts`,
`sidecar/src/screens/ContextView.tsx`, Plans 042/043, Olympus design

> This is a thinking document, not a build plan. Its job is to make the idea concrete enough
> that Malkio can say yes/no fast, and that whoever writes the eventual implementation plan
> inherits a settled shape instead of re-deriving one. Everything marked **(Soren)** is my own
> proposal, not Malkio's brief — he explicitly welcomed agent ideas on this track.

---

## 0. The one-sentence thesis

Today a focus is a private object owned by one profile. **#221 is the claim that when the same
*work* is being pursued by more than one participant — human or agent — that work has an
identity of its own, and the org should be able to see the shape of it in real time, without
that visibility ever becoming a productivity surveillance tool.** The whole concept lives or
dies on holding both halves of that sentence at once: *shared context* and *consent-first*.

The good news from the schema archaeology: Tabatha is already ~70% built for the *data* half of
this. `focus_items` already carries `org_id`/`team_id` (migration 002). `browser_profile_status`
(migration 010, realtime-published) already materializes every install's live focus axis
(`active_focus_label`, `focus_state`, `focus_started_at`, `focus_elapsed_ms`, `focus_timer_ends_at`)
and clock axis. `focus_events` (034) already gives an uncapped per-participant interval log. The
missing pieces are almost entirely about **identity** (what makes two focuses "the same work"),
**visibility policy** (who may see whose numbers), and a **new read surface** (the board) — not
about inventing time-tracking or presence from scratch.

---

## 1. Use cases

Each scenario names actors, the surface they touch, and what "good" looks like. The point of
leading with use cases is that the data model (§2) should be chosen to serve *these*, not the
other way round.

### 1.1 The dev epic — humans + agents on one thing (the flagship)

**Actors:** Malkio + one human dev + 4 fleet agents (e.g. Soren, Cindra, Koda, CeeCee).
**Surface:** Malkio's office TV (Team Context View), plus each participant's own phone/extension.
**Scenario:** "Plan 043 Peer View" is an epic. It has sub-focuses (schema, mint UI, redeem flow,
PeerView component). Two humans and four agents are working pieces of it, some concurrently. On
the wall screen Malkio sees, at a glance: the epic name, its funnel stage, who is *live on it
right now* (green), who's paused/idle, which sub-focus each participant is on, and a running
"person-hours today" figure.
**Good looks like:** Malkio can answer "where is Plan 043 actually at, and is anyone blocked?"
in three seconds without opening Asana or pinging anyone. The agents appear as first-class
participants (their task-claims and moves show as activity) but sit in a visually distinct lane
so four agents don't drown out two humans.

### 1.2 The support / on-call rotation

**Actors:** 3-person support team, shift-based.
**Surface:** a shared "Support — Today" board on a team screen; each rep's extension.
**Scenario:** Tickets arrive as focuses (some pulled from a task provider, some created ad-hoc).
"Working on it" here is bursty and hand-off-heavy — a rep grabs a ticket, resolves or escalates,
grabs the next. The shared context is the *queue and who's holding what*, not a single long epic.
**Good looks like:** no two reps unknowingly pick up the same ticket (the board shows a ticket
"claimed by Dana 40s ago"); a manager sees coverage (who's clocked in, current load) without
seeing a per-keystroke productivity score. When Dana clocks out mid-ticket, the board surfaces
the ticket as "needs re-pickup," not as "Dana abandoned it."

### 1.3 The office wall screen (Malkio's original ask)

**Actors:** everyone in the org, passively; a manager, actively.
**Surface:** a TV in the office running the Team Context View in a kiosk/landscape mode — the
"Context View, plural" that Malkio described.
**Scenario:** ambient awareness. Not a dashboard someone stares at — a background signal of "what
is this org pointed at today." It rotates or splits between a *person-lane* mode (card per person)
and a *focus-lane* mode (card per shared focus/epic).
**Good looks like:** it feels like a team heartbeat, not a monitoring camera. A person who's
heads-down deep in one focus for three hours looks *good* on it (sustained focus), not suspicious.
Someone at lunch shows "away," not "idle 47m" in red.

### 1.4 The client-visible variant

**Actors:** an external stakeholder (client, partner) with no Tabatha account.
**Surface:** a public-ish, heavily-redacted board — reuses Peer View's anonymous-session grant.
**Scenario:** a client wants to see progress on their project's epic without a standup. They get
a link showing the epic, its funnel stage, sub-focus completion, and an *aggregate* "active this
week" heartbeat — never any individual's name, hours, or idle time.
**Good looks like:** the client feels informed and trusts that work is happening; no team member
feels watched-through-a-client's-eyes. This is the tier where the surveillance risk is highest,
so it is the *most* redacted by default: aggregate-and-anonymous only.

### 1.5 The invented one — **Focus Convergence / "gravity"** (Soren)

Malkio's framing is top-down: *create* a shared focus, then people join it. I want to add the
**bottom-up** path, because I think it's the one that will actually get used and it's the one
that best protects the product's soul.

**Actors:** any 2+ participants who, independently and without coordinating, start focuses that
resolve to the same underlying work (same anchor — see §2).
**Surface:** a gentle prompt on each participant's phone/extension; nothing on any board yet.
**Scenario:** Cindra creates a focus "peer view schema" from the Asana task; an hour later Koda,
reviewing, creates his own focus anchored to the same task. The system *notices the convergence*
and asks each of them, separately: **"Koda is also on this task right now — make this a shared
focus?"** Neither is forced; a shared focus only exists if someone opts in.
**Good looks like:** shared focuses *emerge from real overlap* rather than being administratively
declared and then half-empty. And critically — **convergence detection is the consent gate**: the
system never auto-publishes "these two people are on the same thing" to a board; it first asks the
two people. This is the design primitive that keeps #221 an awareness aid instead of a snitch.
(This recurs in §4 as a design principle: *the system may notice overlap privately; it may only
surface it with consent.*)

---

## 2. The shared-focus model

The core modeling question: **what makes two focuses "the same work," and where does that
sameness live?** I evaluate three shapes, then recommend a hybrid.

### Shape (a) — `org_focus` entity + membership links

A new table `tabatha.org_focuses` (id, org_id, label, funnel_stage, anchor, visibility_tier,
created_by, …) and a link table `org_focus_participants` joining each personal `focus_items.id`
to an `org_focus.id`.

- **Pro:** clean canonical object; obvious home for org-level metadata (tier, board pin, manager
  owner, display name). Sub-focus nesting is a self-FK on `org_focuses`.
- **Con:** heaviest migration. Introduces a *second* source of truth for "what is this focus"
  that must be reconciled with every participant's personal `focus_items` row (the N-copies
  problem doesn't disappear — it becomes an N-copies-plus-one-canonical reconciliation problem).
  Offline participants can't mint org rows. Agents need a participant row minted for them.

### Shape (b) — pure link-table / implicit cluster over `focus_items`

No new entity. A "shared focus" is *derived*: the set of `focus_items` across profiles that share
a common cluster key (e.g. identical `tags.task`, or same external task id, or an explicit
"same-as" link table). The cluster is a query, not a stored object.

- **Pro:** minimal migration; nothing owns the focus, so nothing to reconcile; every participant
  keeps their own row and their own offline behavior, untouched.
- **Con:** no home for the org-level metadata that #221 *needs* (visibility tier, "is this pinned
  to the board," display name that isn't just one person's label). Clustering on free-text
  `tags.task` is fragile. There's nowhere to hang a manager's decision "this epic is
  internal-tier."

### Shape (c) — external-task-anchored

The external task (Asana/Anasa GID, i.e. `tasks_registry.task_id` when
`external_platform='asana'`) **is** the shared-focus identity. Tabatha stores only *participation*:
who has a focus/activity against that task id.

- **Pro:** the anchor is *already globally unique and identical across profiles* — the grounding
  fact from migration 035 is that when `external_platform='asana'`, `task_id` **is** the Asana
  GID directly, so the same task synced by two people produces two `tasks_registry` rows sharing
  one `task_id` string. That string is a free, collision-proof cluster key. Directly realizes
  #220's "same external task ⇒ same shared focus." Sub-focus nesting comes free from
  `task_relations` (`kind='subtask'`).
- **Con:** only works for focuses that *have* an external task. Plenty of focuses are ad-hoc
  ("write the concept doc," "clear the inbox") with no Asana task behind them. Can't be the
  *only* mechanism.

### Recommendation — **anchor-first, entity-thin (c + a-lite)** (Soren)

Neither pure shape wins; the right answer is a hybrid that takes (c)'s join mechanism and adds the
*thinnest possible* slice of (a) for metadata that genuinely has no other home.

1. **Cluster key = an "anchor."** An anchor is either (i) an external task id
   (`tasks_registry.task_id` — the #220 join, the common case for real epics) or (ii) a minted
   internal anchor id for ad-hoc shared work with no external task. Same anchor ⇒ same shared
   focus. This makes (c) the default and covers (b)'s ad-hoc case without free-text fragility.
2. **A thin `shared_focuses` row keyed on `(org_id, anchor)`** — *not* a copy of a focus, just the
   org-level facts with nowhere else to live: `visibility_tier`, `display_label` (overrides the
   messy per-person labels), `pinned_to_board`, `owner_profile_id` (who curates it), `status`,
   timestamps. It is created lazily — the first time convergence is confirmed (§1.5) or a manager
   pins one. It does **not** own participants' focus state; it *annotates* a cluster.
3. **Participation is derived, not copied.** A profile participates in a shared focus if it has a
   `focus_items` row whose anchor matches (via `tags.task`/external id) **or** a `focus_events`
   row against a matching `focus_client_id`. No `focus_items` row is ever duplicated or moved. The
   N-copies problem dissolves because we stop trying to make one canonical copy — we accept N
   personal copies and *compute the union*.

**Why this shape wins on each axis Malkio cares about:**

| Axis | How the hybrid handles it |
|---|---|
| **Privacy** | Personal `focus_items`/`focus_events` rows keep their existing owner-scoped RLS untouched. The board reads through a *new, deliberately-scoped* RPC (§5), never by widening RLS on the personal tables — same architecture Peer View chose for the same reason. |
| **Offline** | Participants' local-first focus flow is unchanged; the anchor is just a tag. A device offline still works its focus; convergence/board catch up on sync. Nothing about #221 blocks the offline path. |
| **Migration burden** | Low. `focus_items` already has `org_id`/`team_id` (mig 002); `tasks_registry.task_id` already is the cross-profile key; `focus_events` already logs per-participant time; `browser_profile_status` already carries live focus. New surface = one thin `shared_focuses` table + one participation-resolving RPC + board read grants. No change to the personal write path. |
| **Agent participation** | An agent is just another profile whose `focus_events`/`browser_profile_status` rows carry a matching anchor (§6). It joins the cluster by the same rule as a human. No special-case participant table. |
| **Sub-focus nesting** | Free from existing `task_relations` (`kind='subtask'`) for external-anchored epics; for ad-hoc, sub-anchors reference a parent anchor. The board renders the tree from edges that already exist. |

**Rejected:** pure (a) (migration-heavy, reintroduces reconciliation), pure (b) (no home for tier
metadata, fragile key), pure (c) (can't represent ad-hoc shared work).

---

## 3. Participation & activity semantics

Once we can *cluster*, we have to define what the cluster *means* per participant. This section is
where the surveillance risk is technically located, so the definitions are deliberately
conservative.

### 3.1 What counts as "working on it" — three distinct signals, kept distinct

1. **Membership** (intentional): the participant has opted into the shared focus (confirmed a
   convergence prompt, or was added and accepted). Membership is durable and consent-based.
2. **Presence** (live): the participant has an *active* focus in the cluster *right now* —
   `browser_profile_status.focus_state='active'` with `active_focus_id`/label matching the anchor.
   This is what turns a board card green. It is ephemeral and honest (it reflects the actual live
   state that already drives the Context View).
3. **Tracked time** (historical): derived from `focus_events` intervals (pair `start`/`resume` →
   `pause`/`resolve`, exactly as `computeIntervals` already does) grouped by `profile_id` within
   the cluster.

Keeping these three apart matters: a manager-private view might show all three; an internal
wall-screen shows membership + presence but **not** precise tracked-time-per-person by default; a
public view shows only an *aggregate* of presence.

**The critical arbitration delta (Soren):** today, "current focus" is an *account-global* winner —
`pickMostRecentActive` returns the single active row with the latest `tags._startedAt`, and
starting a focus anywhere pauses all other actives (the cross-surface arbitration rule in
`focus.ts`). In a shared/org context this must **not** generalize to "one current focus per org."
Presence is **per participant**: two humans can both be genuinely, simultaneously active on the
same shared focus, and the board must show both as live. The existing account-level arbiter stays
account-level; the board composes N participants' individual current-focus states. This is a real
semantic fork and worth stating loudly so nobody accidentally makes a shared focus single-holder.

### 3.2 How time aggregates — and the honesty trap

- **Per participant:** `computeIntervals(events_for_that_profile_in_cluster)` → their tracked ms.
- **Per shared focus:** here's the trap. Summing participant intervals gives **person-hours**
  (2 people × 1h each = 2 person-hours), which is *not* the same as **elapsed wall-clock span**
  (they overlapped, so maybe 1.2h of real calendar time). The board must **label which it shows**
  and, I'd argue, show *both*: "3.5 person-hours across 2 people · 2h 10m elapsed." Conflating them
  is how a dashboard silently lies. (Soren: I'd make elapsed-span the headline and person-hours the
  subtitle — elapsed reads as "how long has this epic been alive today," which is the ambient
  question, and person-hours reads as effort, which is the manager question.)

### 3.3 Drift & pause in a shared context

- One participant pausing **does not** pause the shared focus. The shared focus is "live" while
  *any* participant has an open interval. Pause/drift stay personal signals.
- **Drift is never shared by default (Soren).** Personal drift (`focus_state='drifted'`, the "you
  wandered off" signal) is an intimate self-accountability nudge. Broadcasting "Bob has drifted" to
  a team board is exactly the surveillance failure mode. On a shared board, a drifted participant
  should read as simply *not currently present* (same as paused/away), never as a distinct
  "drifted" shame state visible to others. Drift stays between the user and their own Tabatha.
- Backburner/snooze (context kinds in `focus_events`) similarly stay personal; a shared focus
  isn't backburnered because one of five people snoozed their copy.

---

## 4. Visibility tiers & privacy

This is the heart of the product-soul question. Malkio named three tiers; I want to define them
precisely and, more importantly, define the **defaults**, because defaults are the actual privacy
policy.

### 4.1 The three tiers

| Tier | Audience | Sees per-person time? | Sees identities? | Default for a new shared focus |
|---|---|---|---|---|
| **Manager-private** | org owner/managers (`org_members.role IN ('manager','admin')`, or team `owner/manager`) | Yes — but only with participant opt-in (see 4.3) | Yes | — |
| **Internal** | any org member, incl. wall screen | **No** (presence only) by default | Yes | ✅ default tier |
| **Public / client** | anonymous grant holder (Peer View machinery) | No | **No** (aggregate only) | opt-in per focus |

**Recommendation (Soren): the default tier for a newly-formed shared focus is *Internal,
presence-only*.** Not manager-private (that would make the feature feel top-down and watched), not
public. Internal-presence-only means: "the org can see this work exists and who's currently on it,
but not a per-person time ledger." Escalating to manager-visible numbers is a deliberate, logged
act — and gated on participant consent (4.3).

### 4.2 Interaction with existing mechanisms

- **Reuse Peer View's element-visibility vocabulary** (`brand`, `timer`, `focusLabel`, `upNext`,
  `checkpoints`, `dayCountdown` — the JSONB `visibility` map in `peer_grants`). A board's tier is,
  concretely, a preset over that same vocabulary plus a few org-level additions
  (`perPersonTime`, `participantNames`, `aggregateHeartbeat`). Don't invent a second visibility
  language.
- **`device_settings` (mig 045) is the natural home for board mode.** The office TV is a
  `browser_profiles` row; whether it renders person-lane vs focus-lane, and which org's board, is a
  per-device setting with the existing highest-precedence resolution
  (`device > contextView > sidecar > defaults`). Pairing already names the device (mig 040 + 045).
- **The existing manager-read precedent is a fence, not a foundation.** Migration 001's "Managers
  see team time" policy already lets managers read `time_entries` for `realm IN
  ('professional','work','business')` — i.e. Tabatha *already* decided personal-realm time is never
  manager-visible. #221 must inherit that fence: **shared focuses in a `personal` realm are never
  manager-visible, full stop**, regardless of tier. This is an existing, load-bearing privacy
  decision and #221 should not quietly regress it.

### 4.3 Who sees whose numbers — the consent rule (Soren, load-bearing)

Time-per-person is the single most sensitive datum here. My recommended rule:

> **A participant's precise tracked time is visible to a manager only if (a) the shared focus is in
> a work/professional realm, AND (b) the participant has consented to per-person time visibility for
> this org — a one-time, revocable setting, defaulting OFF.** Absent consent, the manager sees the
> participant's *presence* (on it / not) and their *contribution to the aggregate*, never their
> individual hour count.

Yes, this means a manager might see "5 people, 12 person-hours on this epic today" without being
able to attribute the hours per-person unless people opted in. **That is the correct default for an
attention aid.** The org-level question "is this epic getting real effort" is answerable from the
aggregate; the per-person breakdown is a management-relationship decision, not a system default.
If Malkio's orgs are small high-trust teams that *want* full transparency, the consent toggle can
default ON *per org* by a manager setting — but the ecosystem default ships OFF.

### 4.4 The surveillance red line (explicit)

Tabatha's concept is "an attention aid, not a boss-watching tool." Concretely, #221 must **never**:

- rank or score participants against each other, or compute any "productivity" metric;
- surface personal *drift* to anyone but the drifting user (§3.3);
- show idle-shaming ("idle 47m") — away is away, neutrally;
- let a manager see a personal-realm focus;
- auto-publish convergence/overlap without the consent prompt (§1.5);
- make per-person time visible without opt-in (§4.3).

And it must **always**: let a participant see exactly what the org sees about them (symmetry), and
let them leave a shared focus or revoke per-person visibility at any time, instantly (realtime
revoke, same as device-signout mig 045). **Design test:** if a feature would make a focused,
honest worker feel *watched* rather than *supported*, it's wrong — cut it or gate it harder.

---

## 5. Team Context View (the board)

### 5.1 What it renders — two modes, one data source

- **Person-lane mode:** a grid of participant cards. Each card: name/avatar, live dot
  (green=present / grey=away / amber=paused), current focus label, optional timer. This is
  "who's doing what." Sourced almost entirely from `browser_profile_status` (already realtime,
  already has the focus axis) joined to org membership.
- **Focus-lane mode:** a card/column per shared focus (epic), with participants as chips inside,
  sub-focuses nested (from `task_relations` subtask edges), funnel stage, and the dual time
  readout (§3.2). This is "state of the work."
- **Toggle or auto-rotate** between them (per-device setting). Malkio's office-TV ask is satisfied
  by either; I'd ship person-lane first (cheapest, closest to existing Context View) and focus-lane
  second.

Both modes reuse the **Context View render shell** — this is "Context View, org mode," not a new
design language, exactly as Peer View is "Context View, subset mode." Same brand/timer/countdown
vocabulary, same landscape kiosk chrome.

### 5.2 How it authenticates

A team board is an **org-scoped read**, which is the key difference from every existing surface
(all of which are single-profile-scoped). A board on a TV cannot simply ride one employee's login —
that would leak that employee's *personal* data and break when they sign out.

**Recommendation (Soren):** mint a dedicated **board grant** — generalize Peer View's
`peer_grants` machinery (anonymous session + hashed short code + SECURITY DEFINER read RPC) into an
org audience. Concretely: a manager mints a board grant scoped to `(org_id, tier, visibility_map)`;
the TV redeems the code into an anonymous session whose `auth.uid()` is recorded against the grant;
all board reads go through **one `get_org_board(grant_id)` SECURITY DEFINER RPC** that returns only
what the tier permits. Same trust-model win Peer View proved: the board session can *never* read
outside its grant, because an anonymous uid has no `profiles` row and falls through every existing
owner-scoped RLS policy (Koda verified this property for Peer View — it transfers directly). The
board grant is the org-level sibling of the peer grant.

### 5.3 Realtime fan-out cost

- The board watches N participants' rows across up to 3 realtime tables (`browser_profile_status`,
  `focus_items`, `focus_events`). For a 6-person board that's small; the honest concern is that
  RLS-per-row realtime can't easily serve an *anonymous board session* rows it doesn't own.
- **Recommendation:** for v1, the board reads via a **short-interval poll of `get_org_board`**
  (5–10s — presence doesn't need sub-second latency for ambient awareness), not per-row realtime
  subscriptions. This sidesteps the "anonymous session can't subscribe to other people's rows"
  problem entirely and bounds cost at one RPC call per interval regardless of participant count.
  Realtime push (a server aggregator broadcasting to a board channel) is a v2 optimization if
  poll latency ever feels stale. Do **not** try to make an anonymous board session subscribe
  directly to N members' `focus_events` — that's a fan-out and RLS headache with no v1 payoff.

---

## 6. Agents as participants

The fleet already works Asana tasks under persona identities (Soren, CeeCee, Koda, Cindra… each
with a real Asana user GID). #221's promise is that these show up on the board *alongside* humans.

### 6.1 Identity mapping

**Recommendation (Soren): give each agent persona a real `profiles` row**, marked with an agent
account type (e.g. `profiles.settings.kind='agent'` or, if Olympus's `account_type` enum is
extended, `account_type='agent'`). Reasons: an agent-as-profile means its activity flows through
the *exact same substrate* as a human — `focus_events`, `browser_profile_status`, cluster
membership — with zero special-case participant table. Agents become genuinely first-class, which
is the stated goal. The alternative (a synthetic bridge that fabricates participation without a
profile) saves one row per agent and costs a permanent special case everywhere the board reads.

### 6.2 How agent activity is sourced

Agents don't run a Sidecar with a heartbeat, so their `focus_events`/`browser_profile_status` must
be *emitted by a bridge*. The honest source of truth for "what is an agent doing" is **Asana**
(and Anasa): task assignment, task moves between stages, and comments. A small server-side bridge
maps:

- agent claims / is assigned / moves a task into an in-progress stage → emit a `focus_events`
  `start` (or `resume`) for that agent profile against the task's anchor, and update its
  `browser_profile_status` focus axis (`active_focus_label = task name`, `focus_state='active'`);
- agent moves task to done / posts a completion comment → emit `resolve`;
- agent goes quiet past a threshold → `pause` (so a crashed agent doesn't show eternally "live").

This reuses #220's task-sync plumbing (the webhook/cron that already watches Asana task changes) —
the bridge is an additional consumer of events Tabatha is *already ingesting*, not new polling.

### 6.3 Preventing agent noise from drowning human signal

Real risk: 4 agents emitting task-move events could visually dominate a 2-human board. Mitigations
(Soren):

1. **Separate lane.** Humans render first/prominent; agents in a distinct, collapsible "Agents (4)"
   section, collapsed by default in person-lane mode.
2. **Coarser event granularity.** Agent `focus_events` are emitted at *task-claim/stage* granularity
   (naturally low-frequency), never per-comment or per-tool-call. Dedupe rapid moves.
3. **Presence weighting.** Any "is this epic active" rollup weights *human* presence over agent
   presence — an epic with 4 agents and 0 humans present reads as "agents running," not the same
   green as "team actively on it." (Soren: this keeps the board honest about where human attention
   actually is, which is the whole point of Tabatha.)
4. **A per-board "show agents" toggle** so a pure-human standup view is one tap away.

---

## 7. Boundaries — deltas vs adjacent scope

The single most useful thing this document can do is draw crisp lines so #221 doesn't silently
absorb, or get absorbed by, its neighbors.

### 7.1 vs Plan 043 Peer View

| | Peer View (#216 / Plan 043) | Shared Focus / Org Context (#221) |
|---|---|---|
| **Direction** | 1 owner → 1 outsider | many participants ↔ org |
| **Viewer** | someone *without* an account (assistant, parent) | org members + a board grant |
| **Subject** | one person's *view* | shared *work* + aggregation |
| **Owns** | `peer_grants`, per-element visibility, capability-gated write RPCs | `shared_focuses`, cluster resolution, board RPC, tiers |
| **Trust model** | anonymous session, owner-scoped | anonymous *board* session, org-scoped |

**They share machinery, not tables.** #221 should *reuse* Peer View's grant pattern (anonymous
session + hashed code + SECURITY DEFINER read RPC) generalized to an org audience kind, and reuse
its `visibility` JSONB vocabulary. They should **not** merge into one table: Peer View is a 1:1
leaf feature; #221 is an org aggregation layer. Peer View has no concept of shared work or
person-hours; #221 has no concept of an account-less personal-view-sharer. **Verdict:** adjacent,
library-sharing siblings. Peer View ships first and unblocked; #221 builds on its proven grant lib.

### 7.2 vs Olympus (admin console)

Olympus owns **capability and tier gating** — *who is allowed* to do/see anything, via
`feature_permissions` (per-profile and per-org rows) resolved by `get_effective_permissions`.
#221's tiers and "can this org have a team board at all" are naturally **Olympus feature keys**
(`shared_focus`, `team_board`, maybe `team_board_public` for the client-visible tier). Olympus does
**not** own the board's data model or render — it gates access to it. **Clean split:** Olympus =
the permission/plan layer (is `team_board` on for this org's plan?); #221 = the shared-work data +
board surface that *asks* Olympus. #221 should depend on Olympus softly (default-allow when Olympus
absent, per its resolver's rule 4), never hard-block on it.

### 7.3 vs #220 Task-Sync Provider Abstraction

#220 **provides the anchor.** "Same external task ⇒ same shared focus" is literally the #220 join,
and the grounding fact that `tasks_registry.task_id` is the raw Asana GID (identical across
profiles) is what makes anchor-based clustering free. #221 **reads** the task registry; it does not
re-implement sync. The one dependency to name: today `tasks_registry` is per-profile, so #221's
convergence detection needs *the same `task_id` present in ≥2 profiles' registries* as its "shared
task" primitive — that's a query over existing rows, no new sync. When #220 adds Anasa/Notion/etc.
as providers, anchors from those providers cluster identically for free. **Verdict:** #221 depends
on #220 for external anchors; ad-hoc (internal-anchor) shared focuses need no provider.

### 7.4 vs Context View

The Team Context View is **"Context View, org mode"** — same render shell, new data scope and
grant. It is *not* a rewrite of Context View and *not* "Context View v3" in the sense of replacing
the personal one. Personal Context View, Peer View, and Team Context View are three audiences of
one shell.

### 7.5 Path recommendation — **a new plan**

This is too big and too cross-cutting to bolt onto Plan 043 (it spans a new schema slice, a new
board surface, an agent-activity bridge, and Olympus gating). It should be **its own numbered
implementation plan**, authored explicitly to *reuse* 043's grant library, Context View's shell,
#220's anchors, and Olympus's gating — a composition of proven pieces, not a greenfield build. On
migration numbering: the highest on disk is `050`; 046–049 are reserved (Olympus), 051–052 (Peer
View), 053–055 (Plan 044), 056–057 (Plan 045). #221 should claim the **next genuinely free block
after those reservations** and re-verify with `ls supabase/migrations` at build time — do not
hardcode a number now. Sequencing: it should land *after* Peer View (grant lib) and ideally after
#220 (anchors), with Olympus soft-optional.

---

## 8. Open questions for Malkio

Each has my recommended default so you can yes/no fast.

1. **Top-down or bottom-up first?** Do we build "manager declares a shared focus, people join"
   (top-down) or "system detects convergence and asks" (bottom-up, §1.5) first?
   **Soren default: bottom-up convergence first** — it's the consent-first path, it makes shared
   focuses emerge from real overlap instead of shipping empty declared ones, and it doubles as the
   privacy gate. Top-down "pin an epic to the board" is a fast follow.

2. **Default visibility tier for a new shared focus?**
   **Default: Internal, presence-only** (org can see it exists + who's live, not per-person time).
   Confirm this isn't too open for your orgs, or too closed.

3. **Per-person time visibility — opt-in or org-default?**
   **Default: opt-in, OFF ecosystem-wide, with a per-org manager toggle to flip the default ON for
   high-trust teams.** Confirm you want the shipped default OFF (my strong recommendation for the
   product's soul) vs. ON for your own orgs.

4. **Agents as real `profiles` rows?**
   **Default: yes** — each persona gets a profile marked agent-kind, activity emitted by an
   Asana-driven bridge (§6.2). Confirm you're comfortable with fleet agents holding real Tabatha
   profiles (vs. a lighter synthetic-participation bridge).

5. **Board auth — dedicated board grant vs. a service "kiosk account"?**
   **Default: dedicated board grant** (generalized Peer View anonymous session, org-scoped, §5.2) —
   cleaner revoke story, no shared password. Confirm vs. a simpler shared kiosk login.

6. **Client-visible (public) tier in v1, or defer?**
   **Default: defer to v2.** It's the highest surveillance/leak risk and the least-used of the
   three; ship manager-private + internal first, add public/client once the redaction rules are
   battle-tested. Confirm.

7. **Realm boundary for shared focuses — enforce the existing personal-realm fence?**
   **Default: yes, hard** — personal-realm focuses are never org/manager-visible, inheriting the
   migration-001 "managers see team time only for work realms" decision (§4.2). Confirm you don't
   want any personal-realm exception.

8. **Scope of "org" — organizations, teams, or both?** The schema has both `org_members` and
   `team_members` (richer role set: owner/manager/sub_manager/user/read_only), and `focus_items`
   carries both `org_id` and `team_id`.
   **Default: model shared focuses at the *team* level primarily** (teams are where actual shared
   work happens; the richer role enum maps better to board tiers), with org as the umbrella for
   cross-team boards. Confirm team-first vs org-first.

9. **Person-hours vs elapsed on the board headline (§3.2)?**
   **Default: elapsed span as headline, person-hours as subtitle.** Trivial to flip; confirm which
   number you want to lead with on the wall screen.

---

## Appendix — grounding facts this concept rests on

- `focus_items` (mig 001) already carries `org_id`/`team_id` (mig 002), `priority` (021),
  `browser_profile_id` (009); sub-focus/parent is **not** a column (lives in `tags`/`task_relations`).
- `focus_events` (mig 034, realtime) — `kind IN (start,pause,resume,resolve,extend,snooze,
  backburner,unbackburner)`; per-participant time via interval pairing (`computeIntervals`).
- `tasks_registry.task_id` **is** the Asana GID when `external_platform='asana'` (mig 035) — the
  free cross-profile cluster key; `task_relations` (`subtask`/`depends_on`) gives nesting.
- `browser_profile_status` (mig 010, realtime) already materializes each install's live focus axis
  (`active_focus_label`, `focus_state`, `focus_started_at`, `focus_elapsed_ms`, `focus_timer_ends_at`)
  and clock axis — the ready-made board substrate.
- `org_members` (roles user/manager/admin) is many-to-many; `team_members` richer
  (owner/manager/sub_manager/user/read_only); `profiles.default_org_id`/`default_team_id` (mig 005).
- Existing privacy fence: mig 001 "Managers see team time" is **work-realm-only** — the precedent
  #221 must inherit.
- Realtime publication today: `browser_profile_status` (010), `profiles` (011), `focus_items` (033),
  `focus_events` (034), `browser_profiles` (045).
- Peer View (043): `peer_grants` + anonymous session + `get_peer_view` SECURITY DEFINER RPC +
  `visibility`/`capabilities` JSONB — the generalizable grant machinery.
- Olympus: `feature_permissions` (per-profile + per-org rows), `get_effective_permissions` resolver,
  default-allow when uncataloged — the gating layer #221 asks, not owns.
