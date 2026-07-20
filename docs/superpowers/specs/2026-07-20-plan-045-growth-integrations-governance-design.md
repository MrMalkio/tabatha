# Implementation Plan 045: Growth & Integrations Governance

**Status:** draft — Koda review next
**Driver:** Malkio · **Author:** Cindra
**Current version:** Extension 6.7.44 · Sidecar 0.11.0 (invite signups + account_type
  shipped 0.9.0-0.11.0 per `docs/progress.md` 2026-07-20 entry)
**Target version on v1 completion:** Sidecar + Extension minor bumps (exact numbers
  per Headbox Rule 10 at commit time).
**Migration claim:** 056-057 (placeholder — Olympus claims 046-049, Plan 043
  claims 051-052, Plan 044 claims 053-055 (050 is left unclaimed — fix-wave-3
  needs no migration); re-verify via `ls supabase/migrations` before writing SQL).

Three independent sub-scopes (a/b/c below) — can ship as three separate
branches, no shared files between them beyond the migration-number
coordination already flagged in Plan 044.

---

## (a) Invite quotas + attribution

### What exists today (verified)

`create_invite_token(p_org_id, p_team_id, p_role, p_expires_in_hours, p_kind)`
(migration 044) is role-gated (org owner / team owner-manager-sub_manager /
"owner of at least one org" for demo/personal kinds) but has **no volume
limit** — a caller can mint unlimited tokens. `invite_tokens.created_by` is
stamped (real attribution exists at the token level) but there is **no
invite-graph** — no record of who a redeemed token turned into which new
profile, so "who invited whom" cannot be traversed today, only "who minted
this specific token."

### Design

**Quota:** every non-owner profile gets 5 invites total (all-time count of
tokens minted, matching the brief's literal "gets 5 invites," not "5
concurrently active"). Org owners are unlimited. v1 ships as a **self-contained
check inside `create_invite_token`** — a hardcoded `v_default_limit := 5`
constant plus the existing owner-role check already in the function — with
**no dependency on Olympus** (Olympus's `feature_permissions`/`constraints`
schema doesn't exist on disk yet, migrations 046-049 unbuilt). The brief's
own phrasing — "configurable later from Olympus" — reads as a stated v2 path,
not a v1 blocker: once Olympus ships, the constant swaps for a
`get_effective_permissions('invite_mint').constraints.limit` read, no
call-site rework needed since the function already isolates the limit into
one local variable.

**Attribution / invite graph:** new table `tabatha.invite_redemptions`
(migration 056):

```sql
CREATE TABLE tabatha.invite_redemptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_token_id    UUID NOT NULL REFERENCES tabatha.invite_tokens(id),
  inviter_profile_id UUID NOT NULL REFERENCES tabatha.profiles(id),
  invitee_profile_id UUID NOT NULL REFERENCES tabatha.profiles(id),
  kind               TEXT NOT NULL,          -- copied from invite_tokens.kind at redeem time
  redeemed_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON tabatha.invite_redemptions (inviter_profile_id);
CREATE INDEX ON tabatha.invite_redemptions (invitee_profile_id);
```

Stamped inside the existing redeem-invite RPC (the one migration 042
introduced, `redeem_invite_token` per prior plan history) at the point a new
profile is created from a token — a pure additive insert, not a rework of
that function's existing logic. **Known gap, stated explicitly:** this is
forward-only; invites redeemed before migration 056 lands are not
backfilled into the graph (a backfill would need to reconstruct attribution
from `invite_tokens.created_by` joined against `profiles.created_at`
heuristically — unreliable, out of scope, flagged rather than silently
dropped).

Quota-check query: `SELECT count(*) FROM invite_tokens WHERE created_by =
v_caller_profile_id` (all-time mint count) — simplest correct read of the
brief, reuses the existing `created_by` column, no new counter/materialized
column needed.

**v2:** Olympus `/provisioning` page (already scoped in
`2026-07-20-flux-zeus-admin-design.md` §4) becomes the configuration surface
— wraps `create_invite_token`, "does not reinvent it," per that doc's own
stated design. Migrating the hardcoded `5` to a per-plan-template value is a
one-line change inside the function once Olympus's resolver RPC exists.

---

## (b) Task-sync provider abstraction

### What exists today (verified)

Hardcoded to Asana at every layer: `integration_credentials.provider CHECK
IN ('asana')`, `tasks_registry.external_platform CHECK IN ('tabatha','asana')`,
`task_relations.source CHECK IN ('asana','tabatha')` (all migration 035);
RPC names are Asana-literal (`upsert_asana_credential`,
`sync_upsert_asana_task`, etc.); edge functions are Asana-named
(`connect-asana`, `sync-asana-tasks`, `asana-webhook`). No provider registry
or interface exists on the client side either (`sidecar/src/data/tasks.ts`'s
`external_platform` is a 2-value literal union).

### Design

**Schema (migration 057):** widen the three CHECK constraints above to
`('tabatha','asana','anasa','notion','clickup','google_tasks','monday')`.
**Coordination note:** Plan 044 §1 also widens `integration_credentials.provider`
(to add `'google_calendar'`) — same column, same migration slot risk;
whichever of Plan 044/045 lands second must rebase its ALTER onto the other's
widened CHECK, not clobber it. New catalog table:

```sql
CREATE TABLE tabatha.task_providers (
  provider_key  TEXT PRIMARY KEY,
  label         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'coming_soon' CHECK (status IN ('available','coming_soon')),
  icon          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0
);
INSERT INTO tabatha.task_providers (provider_key, label, status, sort_order) VALUES
  ('asana', 'Asana', 'available', 1),
  ('anasa', 'Anasa', 'coming_soon', 2),   -- flips to 'available' when Unit B3 ships
  ('notion', 'Notion', 'coming_soon', 3),
  ('clickup', 'ClickUp', 'coming_soon', 4),
  ('google_tasks', 'Google Tasks', 'coming_soon', 5),
  ('monday', 'Monday.com', 'coming_soon', 6);
```

Deliberately its own small table, not routed through Olympus's
`feature_permissions` — the "coming soon" badge here is a product-catalog
fact (this provider isn't built yet), not a per-user permission, so it
doesn't belong in a per-profile/per-org gating table even though it borrows
Olympus's `display_state` vocabulary for UI consistency.

**Client-side interface:** extract `TaskProvider` (`connect()`, `sync()`,
`createTask()`, `updateTask()`, `disconnect()`) — `src/services/taskProviders/`
(extension) and `sidecar/src/data/taskProviders/` (sidecar), each with
`asanaProvider` as the first real implementation (refactored out of today's
hardcoded calls, behavior-preserving) and `anasaProvider` as the second.
**Edge functions stay one-per-provider** (`connect-anasa`,
`sync-anasa-tasks`, alongside the existing `connect-asana`/`sync-asana-tasks`)
rather than one generalized multi-provider function — matches this repo's
existing preference for many small single-purpose edge functions over one
branching endpoint, and avoids forcing divergent OAuth-vs-API-key auth flows
through shared code prematurely.

**Anasa as a real second provider — open item, not designed here.** This
environment has live `mcp__anasa-live__*` agent tools (task list/get/move/
comment, inbox), but those are the *agent-facing* MCP surface, not
necessarily the same auth model a **user's own PAT/API-key connection** would
use from an edge function. **Flagged: needs a short audit of Anasa's own
user-facing API/auth surface before `connect-anasa`/`sync-anasa-tasks` can be
scoped precisely** — this doc does not fabricate that shape.

**Notion/ClickUp/Google Tasks/Monday** ship as `status='coming_soon'` rows
only — the Tasks connect screen renders them as disabled/greyed buttons
reading `task_providers.status`, no functional integration in v1.

---

## (c) Feedback/bug-report upgrade

### What exists today (verified)

`supabase/functions/feedback-to-asana/index.ts` payload is
`{kind, text, version, context, submittedAt}` — **no Title field**; the
Asana task title is synthesized server-side from a truncated `text`
(`${emoji} [${kind}] ${text.slice(0,80)}…`). **No custom-field mapping at
all** — bug and idea both post to the same single `ASANA_PROJECT_GID`, the
only distinction is the emoji and a `kind:` line inside the plain-text notes
body; **no Asana custom field GIDs exist anywhere in the code** (contrary to
the brief's assumption that "the board's real field GIDs are in the feedback
fn docs/code" — they are not; only the project GID is a secret). **No
name/email** — only the Supabase auth `userId` is embedded in the notes text.

### Design

**Title field:** add `title` to the feedback payload contract. Sidecar
feedback UI (wherever it currently collects `text` — needs a short UI grep
at build time to locate the exact form component) gets a required Title
input above the description field. Edge function uses `title` directly as
the Asana task name, dropping the truncated-`text` synthesis.

**Per-kind custom-field mapping — blocked on a real field audit, not
designed with fabricated GIDs.** The brief's assumption that field GIDs
already exist in code is factually wrong (verified above) — before Unit C2
can be built, someone needs to look at the actual target Asana project's
custom fields (a live `asana_get_project`/project-field lookup, not a guess)
and identify which field distinguishes bug-type from idea-type tickets, if
one exists at all. **Flagged as a pre-build step**, not fabricated here. Once
identified, the shape is small: three new function secrets
(`ASANA_FEEDBACK_TYPE_FIELD_GID`, `ASANA_FEEDBACK_BUG_OPTION_GID`,
`ASANA_FEEDBACK_IDEA_OPTION_GID`), and one `custom_fields: {[FIELD_GID]:
optionGid}` addition to the existing task-creation call.

**Name + email:** `profiles.display_name` already exists at the `profiles`
level (migration 001, `display_name TEXT NOT NULL DEFAULT ''` — distinct
from `browser_profiles.display_name`, which is a per-device name added in
migration 045). Edge function adds a `profiles` lookup by the verified
user's `auth_user_id`, embeds `displayName` (falling back to
`email.split('@')[0]` if blank) and `email` (already available from the
verified JWT) into the notes text, replacing the bare `userId` line.

---

## Build breakdown — units

| Unit | Scope | Files | Depends on |
|---|---|---|---|
| **A1** | Invite quota + `invite_redemptions` | `supabase/migrations/056_*.sql`, `create_invite_token` update, redeem-RPC insert | none |
| **A2 (v2)** | Olympus-driven configurable quota | not built now | Olympus 046-049 |
| **B1** | Schema — widen CHECKs + `task_providers` catalog + seed | `supabase/migrations/057_*.sql` | Coordinate with Plan 044 §1 |
| **B2** | `TaskProvider` interface, Asana refactored as first impl | `src/services/taskProviders/`, `sidecar/src/data/taskProviders/` | B1 |
| **B3** | Anasa provider | `supabase/functions/connect-anasa/`, `supabase/functions/sync-anasa-tasks/`, `anasaProvider` client impl | B1, B2, pre-build Anasa auth audit |
| **B4** | "Coming soon" UI | Tasks connect screen (both surfaces) reading `task_providers.status` | B1 |
| **C1** | Title field | Sidecar feedback form (locate at build time), `feedback-to-asana/index.ts` | none |
| **C2** | Custom-field mapping | `feedback-to-asana/index.ts` + new secrets | Pre-build Asana field-GID audit |
| **C3** | Name + email in output | `feedback-to-asana/index.ts` | none |

---

## Dependencies section

| Depends on | For |
|---|---|
| Coordination with Plan 044 §1 (shared CHECK) | B1 |
| Pre-build Anasa API/auth audit | B3 |
| Pre-build Asana custom-field GID audit | C2 |
| Nothing else | A1, B2, B4, C1, C3 |

| Blocks | Why |
|---|---|
| Olympus `/provisioning` v2 wiring | A2 |

---

## Parallelability Review

- **Zones touched:** Sync zone (`syncService.js` untouched — this is new
  service files, not edits to it), Settings, new `taskProviders/` module
  (isolated), Supabase migrations + functions.
- **Shared files modified:** none in the 🔴/🟡 table — B1's migration is the
  only coordination point (with Plan 044, already flagged twice above).
- **Conflicts with active worktrees:** migration slot 056-057 vs 050-055
  claimed by the other three docs in this batch — re-verify at build time.
- **Can run parallel with other work:** Yes, strongly — (a), (b), (c) are
  three independent branches with no shared files between them; only B1
  needs a one-time handshake with Plan 044.
- **Max branch lifetime estimate:** (a) 2-3 days, (b) ~1 week (B3 gated on
  an external audit), (c) 2-3 days (C2 gated on an external audit).
- **Scope-split points:** already three natural branches (a/b/c); within
  (b), B3 (Anasa) can slip to its own follow-up branch if the auth audit
  takes longer than the rest of the unit set.
