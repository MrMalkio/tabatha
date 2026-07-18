# Epic 3 Design Gate: Tabby Sidecar ↔ Asana Task Sync

**Parent plan:** Implementation Plan 040 (`docs/superpowers/specs/2026-07-18-sidecar-timeline-voice-tasks-design.md`), Addenda 4-5
**Status:** DESIGN GATE — Koda vets before build (per Addendum 5)
**Driver:** Cirra · **Owner:** CeeCee · **Asana task:** `1216678966654349`
**Date:** 2026-07-18
**Depends on:** `focus_events` foundation (Epic 2/4), migration numbering coordinated against whatever epic claims 034 first (see §1.3)

---

## 0. Binding inputs (do not relitigate here)

From Plan 040 Addendum 4-5, these are locked and this doc must honor them:

- Task source is **Asana REST via the user's PAT**, never the Asana MCP (deterministic sync code, not LLM-driven).
- Mapping is **1:1** on name, description, subtasks, dependencies, **and** blockers, both directions.
- A **relation table is mandatory** for deps/blockers — JSONB arrays are rejected.
- A **conflict-resolution strategy must be decided in this doc**, not deferred to build time.
- Epic 3 is **design-gated**: Koda vets this doc before anyone writes code.

---

## 1. Schema

### 1.1 Naming collision — `task_links` already exists, don't reuse it

Addendum 5 item 3 names the new table `task_links(from_task, to_task, kind, source, updated_at)`. That
name collides with an **existing, differently-shaped table** from migration `001_create_tabatha_schema.sql`:

```sql
CREATE TABLE tabatha.task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('asana', 'clickup')),
  external_id TEXT NOT NULL,
  external_url TEXT,
  project_name TEXT,
  task_name TEXT,
  total_time_ms BIGINT DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, platform, external_id)
);
```

`tabatha.task_links` is a **platform-integration cache row** (one row per external task, holding time
totals and a display URL) — not an edge/relation table between two Tabatha tasks. It's unused by the
current Sidecar (`sidecar/src/data/tasks.ts` reads only `tasks_registry`) but is live schema; reusing its
name for a structurally unrelated table would either require an incompatible ALTER or silently shadow it.

**Decision: new table, new name — `tabatha.task_relations`.** This is the literal example the task brief
itself offered as the "better shape" option, and it sidesteps the collision cleanly.

```sql
CREATE TABLE tabatha.task_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  from_task TEXT NOT NULL,   -- tasks_registry.task_id
  to_task   TEXT NOT NULL,   -- tasks_registry.task_id
  kind      TEXT NOT NULL CHECK (kind IN ('subtask', 'depends_on', 'blocks')),
  source    TEXT NOT NULL DEFAULT 'asana' CHECK (source IN ('asana', 'tabatha')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,          -- tombstone, see §2.2 — never hard-delete a synced edge
  UNIQUE(profile_id, from_task, to_task, kind)
);

CREATE INDEX idx_task_relations_from ON tabatha.task_relations(profile_id, from_task) WHERE deleted_at IS NULL;
CREATE INDEX idx_task_relations_to   ON tabatha.task_relations(profile_id, to_task)   WHERE deleted_at IS NULL;
```

`kind='subtask'` is directional parent→child. `depends_on`/`blocks` are literal inverses of each other
(`blocks(A,B) == depends_on(B,A)`) — Asana's API exposes both `dependencies` and `dependents` as separate
fields on a task, so **storing both explicitly (rather than deriving one via a reverse query) mirrors the
source of truth 1:1** and avoids a join-heavy "is X blocked" query on every Tasks-view render. The sync
engine writes both directions atomically in one edge-fn pass to prevent drift between the pair. Flagged
below (§5) as the item I'm least sure about — the alternative (store only `depends_on`, derive `blocks` by
reverse query) is simpler and drift-proof by construction; Koda should pressure-test which one wins.

### 1.2 `tasks_registry` additions

Current shape (migration `008_add_batch1_sync_tables.sql`) has no per-field update timestamp — only
`synced_at`, which the *sync engine itself* stamps, so it can't be used to detect "did the user edit this
locally since the last sync." Needed additions:

```sql
ALTER TABLE tabatha.tasks_registry
  ADD COLUMN external_platform TEXT NOT NULL DEFAULT 'tabatha' CHECK (external_platform IN ('tabatha', 'asana')),
  ADD COLUMN local_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN external_updated_at TIMESTAMPTZ,      -- Asana task.modified_at, task-level granularity (see §2)
  ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'synced'
    CHECK (sync_state IN ('synced', 'pending_push', 'pending_pull', 'conflict', 'remote_deleted', 'error')),
  ADD COLUMN sync_error TEXT;

-- Reuse task_id as the Asana GID directly when external_platform='asana' (Asana GIDs are globally
-- unique numeric strings; they won't collide with the existing `sidecar-<uuid>` local-id format), so
-- task_relations.from_task/to_task can point straight at tasks_registry.task_id with no extra id column.

CREATE OR REPLACE FUNCTION tabatha.bump_task_local_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.local_updated_at IS NOT DISTINCT FROM OLD.local_updated_at THEN
    NEW.local_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tasks_registry_local_touch
  BEFORE UPDATE ON tabatha.tasks_registry
  FOR EACH ROW EXECUTE FUNCTION tabatha.bump_task_local_updated_at();
```

### 1.3 PAT storage — `tabatha.integration_credentials`

`sidecar_cron_key` (migration `031_sidecar_push_cron.sql`) is a single global Vault secret read by one
cron job — fine for a service-role bearer, wrong shape for a **per-user** PAT in a multi-tenant product.
New mapping table (never stores the PAT itself — only Vault secret names, resolved server-side only):

```sql
CREATE TABLE tabatha.integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('asana')),
  vault_secret_name TEXT NOT NULL UNIQUE,   -- e.g. 'asana_pat_' || profile_id
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),
  UNIQUE(profile_id, provider)
);
ALTER TABLE tabatha.integration_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own integration credentials" ON tabatha.integration_credentials
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));
-- RLS lets the owner see connection status, never the secret value — vault.decrypted_secrets is only
-- readable from the edge function under the service role, same isolation as sidecar_cron_key.
```

A `connect-asana` edge function receives the PAT once (Settings → Integrations → "Connect Asana"),
calls `vault.create_secret(pat, 'asana_pat_' || profile_id)`, and inserts the credential row. The raw PAT
never lands in a client-readable table.

### 1.4 Migration sketch

Two epics are both reaching for the next free migration slot (`focus_events` for Epic 2/4, this one for
Epic 3) — repo currently ends at `033_realtime_focus_status.sql`. Recommend: **`034_focus_events.sql`**
goes to whichever epic lands first (per the plan's build sequence, that's Epic 2/4, ahead of Epic 3 in
every version of the sequence), and this epic's migration is **`035_task_sync_foundation.sql`**
(`task_relations` + `tasks_registry` columns + `integration_credentials`). Whoever actually builds first
should re-check `.headbox/plan-registry.md`'s Migration Status table immediately before writing the file
name, since parallel epics may have already claimed 034/035 by then.

---

## 2. Conflict resolution

### 2.1 The granularity problem (why literal "per-field LWW" doesn't cleanly work)

Addendum 5 poses the choice as "per-field last-writer-wins with `updated_at` vectors vs Asana-wins-on-tie."
Asana's task API only exposes **one** `modified_at` timestamp per task — there's no per-field timestamp
(name vs. notes vs. completed each changing modified_at identically). A literal per-field vector would
need to be reconstructed from Asana's story/activity feed (`asana_get_stories_for_task`), which is a real
capability but adds a second API call per task per sync pass and per-field diffing logic. Given the
"decide it here" mandate, I'm not deferring, but I am narrowing the resolution unit — see §2.2.

### 2.2 Decision: per-bucket last-writer-wins on task-level timestamps, Asana wins on exact tie

- **Bucket A (Asana-native fields — name, description/notes, completed/completed_at, subtasks,
  dependencies, blockers):** resolved as **one atomic unit** by comparing
  `tasks_registry.local_updated_at` (bumped by the new trigger on any local write) against the Asana
  task's `modified_at` fetched at sync time. Newer wins for the whole bucket on that pass. This is honest
  about what Asana's API can actually tell us — false field-level precision would be worse than an
  explicit coarser rule.
- **Bucket B (Tabatha-only fields — `funnel_stage` when no matching Stage custom field exists,
  `linked_intents`, focus_events-derived time in v3):** **Tabatha always wins** — Asana never
  independently mutates these outside of a push Epic 3 itself issued, so there is no real race to resolve.
- **Exact tie (same second, both buckets):** **Asana wins.** At Asana's `modified_at` granularity, a
  same-second collision is far more likely to be "our own push read back" than a genuine simultaneous
  double-edit, so defaulting to the external system avoids a self-inflicted overwrite loop.
- `tasks_registry.sync_state = 'conflict'` is set only when the edge fn detects a **write it attempted to
  push was rejected or superseded mid-flight** (e.g. Asana returned a 412/409-equivalent, or the local
  row changed again between read and write) — it's an audit/debug flag, not a blocking UI state in v1/v2.

### 2.3 Tombstones

- **Deleted on Asana's side:** Anasa's own activity log (observed directly during this design pass, see
  §4) already shows the exact event to detect: `task:removed` webhook / 404 on next poll. Mirror that
  pattern — never hard-delete. Set `tasks_registry.archived = true`, `sync_state = 'remote_deleted'`.
  Existing sidecar queries already filter `.eq('archived', false)` (`sidecar/src/data/tasks.ts:44`), so
  the row silently drops out of the active list; Tasks view (Epic 4) can surface a dismissible "removed in
  Asana" toast for anything with `sync_state='remote_deleted'` and `archived=false` at the moment of
  transition, then flip `archived=true`.
- **Deleted on Tabatha's side:** Tabatha never has a hard-delete UI today (`useTasks` only exposes
  `complete`/`reopen`) — archiving a Tabatha-native task does nothing to Asana. Archiving an
  Asana-sourced task **never deletes the Asana task** (no destructive upstream writes, ever); it only
  stops future syncs for that row (`archived=true` already excludes it from the sync query pattern used
  throughout `syncService.js`).
- **Edge (relation) removed remotely:** on each pull for a given `from_task`, diff the freshly-fetched
  Asana `dependencies`/`dependents`/`subtasks` GID sets against existing `task_relations` rows with
  `source='asana'` for that `from_task`. Any row present locally but absent from the fresh fetch gets
  `deleted_at = now()` (soft-delete) rather than a hard `DELETE` — partial indexes already exclude
  `deleted_at IS NOT NULL` rows from active queries, and the row remains for audit/undo. Rows with
  `source='tabatha'` (created locally — e.g. linking two sidecar tasks with no Asana-side dependency yet)
  are pushed to Asana on the next push pass and re-labeled `source='asana'` once Asana confirms.

---

## 3. Sync engine placement

### 3.1 Decision: Supabase edge function (webhook-primary, cron-reconcile), not extension background

The deciding constraint is stated in the plan itself: **Sidecar-only users have no extension**, so an
edge function has to exist regardless of whatever else is built. Putting the canonical sync loop in the
extension as well would mean maintaining two independent Asana-sync implementations that can drift and
double-write. The extension does **not** get its own Asana API calls for Epic 3 — it participates only by
reading/writing the same `tasks_registry` / `task_relations` rows through the existing sync-service
upsert path it already has for `tasks_registry` (`syncService.js:638`), and the edge function is the only
thing that ever talks to `api.asana.com`.

This is deliberately **separate from the existing Plan 018 "Flux Asana Widget Server"**
(`docs/guides/asana-integration.md`) — that's a local, per-machine Express/HTTPS server, PAT in a local
`.env`, that pushes **clock-out time entries only** (no task pull, no subtasks, no deps). Different
transport (local server vs. cloud edge fn), different scope (time-entry push vs. full task sync), and
critically the widget requires a running desktop process — exactly what sidecar-only users don't have.
Do not try to fold Epic 3 into it. One open note for later (not blocking Epic 3): a user could plausibly
end up being asked for their Asana PAT twice (once for the widget's local `.env`, once for
`integration_credentials`) — worth a future consolidation pass, out of scope here.

### 3.2 Delivery: webhook-primary, cron as reconciliation net

Supabase edge functions already have public HTTPS URLs (`send-focus-push` proves the pattern is live in
this project), so **Asana webhooks are viable**, not just cron polling. Recommended hybrid, which is also
what Anasa itself already runs in production against this exact workspace (confirmed live, §4):

- On `connect-asana`, register an Asana webhook against the user's relevant project(s) pointing at a new
  `asana-webhook` edge function. Webhook events (`task:changed`, `task:removed`, `dependency:added`, etc.)
  drive near-real-time upserts into `tasks_registry` / `task_relations`.
- A `sync-asana-tasks` edge function on `pg_cron` (recommend **every 5 minutes**, looser than the 1-minute
  push cron since task sync isn't alert-latency-sensitive) does a `modified_since`-scoped reconciliation
  pull per connected profile — this is the safety net for missed/failed webhook deliveries and does the
  initial backfill on first connect.
- Rate-limit budget: Asana's per-token limits are generous but finite; cron pass processes profiles with a
  per-profile "next allowed sync" cursor (skip if `last_synced_at` < 5 min ago), caps concurrency (e.g. 3
  profiles in flight — different users' PATs are independent rate-limit buckets, so cross-profile
  parallelism is safe), and always uses Asana's `modified_since` param so a healthy profile's poll is a
  cheap near-empty diff, not a full re-pull.

---

## 4. Anasa recommendation

**Recommendation: direct-Asana (REST + PAT), not via-Anasa.** Based on a live reachability probe run
during this design pass (not assumed from docs):

- `http://100.105.219.43:3000/api/anasa/snapshot` is **reachable** from this environment — `401
  Authentication required`, not a connection failure. The service is up.
- Via the already-authenticated `anasa-live` MCP (agent identity `@cc`), `anasa_task_list` and
  `anasa_task_get` **work live** against real data: I listed the Flux Development project's tasks and
  fetched the actual Koda-vet task (`1216678720421332`) by its Asana GID. The returned shape confirms
  Anasa runs a genuine webhook-driven Asana mirror: `sourceOfTruth: "asana"`, `asanaGid`,
  `lastSyncedAt`, a `dependencies` array on the task object, and an `activity` log with entries reading
  `"Synced from Asana task 1216678720421332"` and `"Received task:removed webhook for Asana task
  1216678720421332; retained local row for review"` — i.e., Anasa already implements almost exactly the
  webhook-plus-soft-delete-tombstone pattern this design needs, and it's proven in production.
- **But its API surface (as exposed to agents) is read/comment/move-oriented** — `anasa_task_list/get`,
  `anasa_task_comment`, `anasa_task_move`. I found no task-create, field-edit, or dependency-write tool,
  and no multi-tenant workspace story: Anasa mirrors **one** Asana workspace (`gnge.co` /
  `9526911872029`) for GNGE's own internal ops. Tabby Sidecar users are Tabatha *customers*, each with
  their own unrelated Asana org — there's no mechanism for Anasa to mirror an arbitrary customer's
  workspace, and routing customer task data through an internal ops tool built for one company's agent
  roster would be a real scope/tenancy violation, not a shortcut.
- `docs/portfolio-track.md` frames Anasa the same way going in ("a candidate source... pending review")
  and only ever discusses it as useful for **the owner's own** tasks, never as product infrastructure —
  consistent with what I found live.
- **Where Anasa earns its keep here anyway:** as a reference implementation. Its webhook+reconcile+
  soft-delete-on-remove pattern (§3.2, §2.3) is exactly what this design borrows, now validated against a
  real running system rather than assumed. If Tabatha ever ships a self-dogfood "your own dev tasks" view
  fed by the same Flux Development project, that could read Anasa directly since Malkio's tasks already
  live there — but that's a distinct, later feature, not Epic 3 v1.

---

## 5. Mapping table

| Tabatha field | Asana field | Direction | Notes |
|---|---|---|---|
| `tasks_registry.task_id` | `task.gid` | pull key | when `external_platform='asana'`, reused directly (no separate id column, see §1.2) |
| `tasks_registry.name` | `task.name` | bidirectional | Bucket A, §2.2 |
| `tasks_registry.description` | `task.notes` | bidirectional | v1 plain text; `html_notes` considered for v2 rich formatting |
| `tasks_registry.status` (`active`/`completed`) | `task.completed` | bidirectional | universal — works even without any custom Stage field |
| `tasks_registry.completed_at` | `task.completed_at` | bidirectional | |
| `tasks_registry.funnel_stage` | `task.custom_fields['Stage']` (enum) | bidirectional, **best-effort** | Tabatha's own funnel values (`unsorted/todo/focus/addressing/resolved/roadblocked`) already line up almost 1:1 with this workspace's Stage custom field options — but that field is workspace-specific; most Asana users won't have it. Only synced when the field exists in the connected workspace; falls back to `status` alone otherwise. |
| `task_relations(kind='subtask')` | Asana subtask relationship | bidirectional | subtask itself is also pulled as its own `tasks_registry` row |
| `task_relations(kind='depends_on')` | `task.dependencies` | bidirectional | |
| `task_relations(kind='blocks')` | `task.dependents` | bidirectional | mirror of `depends_on`, written atomically (§1.1) |
| `tasks_registry.metadata.permalink` | `task.permalink_url` | pull-only | display link out to Asana |
| `focus_items` (new row on "Start task") | — | Tabatha-only | `tags.task_id = tasks_registry.task_id`; existing `linked_intents` JSONB on the task row gets the new focus's `client_id` appended (already the #186 pattern) |
| `focus_items` (new row on "Start subtask") | — | Tabatha-only | `tags._parent = <parent focus client_id>` (existing sub-intent mechanism, `sidecar/src/data/focus.ts:199`) **and** `tags.task_id = <subtask's tasks_registry.task_id>` — Epic 3 doesn't invent a new sub-intent mechanism, it just feeds Asana subtasks into the sub-intent picker as another creation source alongside manual sub-intents |
| `focus_events`-derived per-task time (Epic 2/4 dependency) | Asana native time tracking (`Actual Time`, Business+ tier) or a custom field/comment fallback | v3 only | gated "📱 Sidecar-tracked time" label per Addendum 5 item 2 until the extension also writes `focus_events` |

**Start task → intent, subtask → sub-intent flow:** Tasks view (Epic 4) shows Asana-sourced rows with
their subtask/dependency/blocker badges (from `task_relations`). Tapping **Start** on a task creates or
reuses a `focus_items` row tagged to that task and makes it the active/current focus. Its subtasks
(`task_relations` where `from_task = <task_id> AND kind='subtask'`) surface in the checkpoint panel /
Epic 2 timeline's subtask lane; picking one creates a sub-intent `focus_items` row exactly the way manual
sub-intents already work today, just task-sourced instead of user-typed.

---

## 6. Phasing

**v1 — read + start-task** (this design's minimum shippable slice):
- Migration `035_task_sync_foundation.sql` (§1)
- `connect-asana` + `asana-webhook` + `sync-asana-tasks` edge functions; PAT via Vault (§1.3, §3)
- One-directional Asana → Tabatha pull (tasks, subtasks, deps, blockers) into `tasks_registry` /
  `task_relations`
- Tasks view (Epic 4): Asana-sourced list, dependency/blocker badges, hide/collapse completed
- "Start task" → intent, "Start subtask" → sub-intent wiring (§5)
- **No mutation push yet** — completing/editing a task in Tabatha does not touch Asana; UI clearly labels
  Asana-sourced tasks as read-only until v2

**v2 — mutations back:**
- Push name/description/status edits Tabatha → Asana using the Bucket A/B resolution in §2.2
- Push locally-created subtask/dependency/blocker `task_relations` rows (`source='tabatha'`) to Asana,
  re-label `source='asana'` on confirmed write
- Tombstone handling live in both directions (§2.3)
- `sync_state='conflict'` surfaced as an audit/debug affordance, not a blocking modal

**v3 — time reconciliation:**
- Push `focus_events`-derived per-task time to Asana, respecting the plan-tier gate on native time
  tracking (fallback to a custom field/comment the user configures)
- Reconcile against the existing Plan 018 widget's `flux_time_entries` so a task's Asana time reflects
  both pipelines without double-counting (needs a source tag on each pushed entry)

---

## 7. Open items for Koda's vet

1. **Least sure:** §1.1's choice to store `kind='blocks'` as an explicit mirrored row of `depends_on`
   rather than deriving it via reverse query. It matches Asana's own `dependencies`/`dependents` split
   1:1, but doubles write surface for every dependency edge and depends on the edge fn always writing both
   directions atomically to avoid drift. The simpler alternative (`depends_on` only, derive `blocks` in
   the Tasks-view query) is safer against write-ordering bugs — trading a join at read time for one fewer
   write-consistency hazard.
2. §2.2 reinterprets Addendum 5's "per-field LWW" as **per-bucket, task-level-timestamp** LWW because
   Asana's API doesn't expose true per-field timestamps without a second story-feed call per task. Worth
   confirming this reading is acceptable before it's load-bearing in the implementation plan.
3. §1.1/§1.3 both introduce genuinely new tables (`task_relations`, `integration_credentials`) beyond what
   Addendum 5's one-line spec named — flagging the naming/shape deltas explicitly rather than silently
   diverging from the addendum's literal text.

---

## Parallelability Review

- **Zones touched:** new Supabase migration (additive only — new tables + `ALTER TABLE ADD COLUMN`, no
  drops/renames); three new edge functions; Sidecar `Tasks view` (Epic 4, separate epic) is the only UI
  consumer, no `sidecar/` app-shell changes required by this doc itself.
- **Shared files modified:** none directly by this design doc (it's a spec, not code). At build time, the
  only shared file touched is `.headbox/plan-registry.md`'s Migration Status table (claiming migration
  035) and `syncService.js`'s existing `tasks_registry` upsert path (already shared with Epic 2/4/Batch-1
  sync — additive read/write only, no signature changes expected).
- **Conflicts with active worktrees:** migration-number contention with whichever epic lands `034_focus_events.sql`
  first (Epic 2/4) — resolved by convention in §1.4 (034 → focus_events, 035 → this), reconfirm against
  the live registry before either actually writes a migration file. No extension `src/` changes at all in
  v1/v2 (the extension participates only via the existing sync-service tables), so this is parallel-safe
  with the 6.7.x/6.8.x extension line and Epic 9's extension-side work.
- **Can it run parallel with other active work?** Yes — isolated to new Supabase objects + new edge
  functions + the Sidecar Tasks view (Epic 4's zone). It is explicitly **design-gated** (Koda vet) before
  any build branch opens, per Addendum 5's delegation structure.
- **Max branch lifetime:** per Addendum 5's phasing, v1 alone is scoped to roughly a 3-5 day build once
  vetted; v2/v3 are separate follow-on branches, not one long-lived branch.
- **Scope-split points (if v1 alone exceeds ~1 week):** (a) migration + edge-fn pull engine first, land and
  verify Anasa-style webhook+reconcile actually round-trips against a real Asana workspace, *then* (b)
  wire the Tasks-view "Start task/subtask" UI as a fast-follow — the schema and sync engine are useful
  (and independently testable) before any UI consumes them.
