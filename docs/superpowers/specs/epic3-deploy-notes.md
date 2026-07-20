# Epic 3 v1 — Deploy Notes (Tabby Sidecar <-> Asana task sync)

**Built by:** Cirra (driver) · **Owner:** CeeCee · **Asana task:** `1216679133391329`
**Design:** `docs/superpowers/specs/2026-07-18-epic3-asana-sync-design.md`, Koda-vetted (binding revision applied: `kind='blocks'` dropped from `task_relations`, derived via reverse query instead — see migration 035 §4 / `tabatha.task_blocks` view)
**Scope:** v1 = read + start-task only. No mutation pushback (Tabatha -> Asana) yet.

This doc is the exact list of steps CeeCee needs at integration. Nothing in this
branch was applied, deployed, or had secrets set — code + migration only, per
the build brief.

---

## 1. Apply the migration

```
supabase/migrations/035_task_sync_foundation.sql
```

Standard push against the linked Flux project (`mtdgoahskcibjbhfvofx`):

```powershell
$env:SUPABASE_DB_PASSWORD = '<Flux_DB_Pass>'
npx supabase db push --linked
```

Additive only — new tables (`task_relations`, `integration_credentials`),
`ALTER TABLE ... ADD COLUMN IF NOT EXISTS` on `tasks_registry`, new views
(`task_dependencies`, `task_blocks`), new SECURITY DEFINER functions, and a
new `pg_cron` job (`asana-task-sync`, every 5 min). Does not touch
`task_links` (001), `push_dedup`, or `focus_events`. Safe to re-run.

**Depends on migration 031 already being applied** (for the `sidecar_cron_key`
Vault secret the new cron job reuses — no new secret needed for cron auth).
If for any reason 031 hasn't landed on the target project yet, `select
vault.create_secret('<service_role_key>', 'sidecar_cron_key');` first (031's
own instructions).

**No manual Vault bootstrap needed for Asana itself.** Unlike `sidecar_cron_key`,
there is no static Asana secret to create by hand — each user's PAT and each
connection's webhook HMAC secret are written to Vault programmatically by
`connect-asana` / `asana-webhook` via the new
`tabatha.set_vault_secret` / `upsert_asana_credential` / `set_asana_webhook_secret`
RPCs (service_role only). Verify after applying:

```sql
select proname from pg_proc where pronamespace = 'tabatha'::regnamespace
  and proname like '%asana%' or proname like '%vault%' or proname like 'sync_%';
```

should list: `get_vault_secret`, `set_vault_secret`, `upsert_asana_credential`,
`set_asana_webhook_gid`, `set_asana_webhook_secret`, `revoke_asana_credential`,
`sync_upsert_asana_task`, `sync_mark_task_dirty`, `sync_mark_remote_deleted`,
`sync_upsert_task_relation`, `sync_tombstone_stale_relations`,
`sync_touch_last_synced`.

---

## 2. Deploy the three edge functions

```powershell
npx supabase functions deploy connect-asana
npx supabase functions deploy asana-webhook --no-verify-jwt
npx supabase functions deploy sync-asana-tasks
```

- `connect-asana` and `sync-asana-tasks` keep the platform default
  (`verify_jwt = true`) — same pattern as `feedback-to-asana` /
  `send-focus-push`: the gateway just requires *a* valid signed JWT (anon-key
  JWTs qualify), and each function layers its own real-auth check on top
  (`connect-asana` rejects anon/anon-key-only callers; `sync-asana-tasks` is
  cron-only, invoked with the `sidecar_cron_key` service-role bearer).
- `asana-webhook` **must** be deployed with JWT verification off — Asana's
  handshake/event POSTs carry no Supabase-compatible bearer at all. This is
  already declared in `supabase/config.toml` (`[functions.asana-webhook]
  verify_jwt = false`), which the CLI picks up automatically on
  `supabase functions deploy` without the flag too, but `--no-verify-jwt` is
  included above as a belt-and-suspenders in case config.toml isn't read for
  a given deploy path.

**No `supabase secrets set` needed for any of the three.** All three only use
the platform-auto-injected `SUPABASE_URL` / `SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` — there is no static `ASANA_PAT` the way
`feedback-to-asana` has one, because every PAT here is per-user and lives in
Vault, resolved at call time via `tabatha.get_vault_secret`.

---

## 3. Smoke test (after both of the above)

1. Get a real Asana PAT (Asana -> My Settings -> Apps -> Manage Developer Apps
   -> Personal Access Tokens).
2. `POST {SUPABASE_URL}/functions/v1/connect-asana` with a signed-in user's
   access token as `Authorization: Bearer <token>` and body `{"pat":"<PAT>"}`.
   Expect `200 { ok: true, workspaceGid, userTaskListGid, webhookRegistered }`.
   - If `webhookRegistered: false`, that's non-fatal by design (see §4) — the
     cron reconcile still covers that profile every 5 minutes.
3. Check `tabatha.integration_credentials` for the new row (`status='active'`,
   `vault_secret_name` set, `webhook_gid` set if step 2 registered one).
4. Manually invoke `sync-asana-tasks` once instead of waiting for cron:
   `POST {SUPABASE_URL}/functions/v1/sync-asana-tasks` with the service-role
   key as bearer. Expect a JSON summary
   (`profilesScanned/profilesSynced/tasksSynced/tasksRemoteDeleted/errors`).
5. Check `tabatha.tasks_registry` for new rows with
   `external_platform='asana'` and `tabatha.task_relations` for any
   subtask/dependency edges on tasks that have them.
6. If the webhook registered, edit the connected user's Asana task (name or
   completion) and confirm `sync_state` flips to `pending_pull` on the
   corresponding row within seconds (via `asana-webhook`'s event delivery),
   then confirm the next `sync-asana-tasks` pass (or a manual invoke) fills
   in the real fields and flips it back to `synced`.

---

## 4. Known v1 limitations / deviations from the design doc's literal sketch

Flagging these explicitly, per the build brief's "report deviations" ask:

1. **`tasks_registry` trigger was rewritten, not shipped as originally
   sketched.** The design doc's `bump_task_local_updated_at()` had no way to
   distinguish a genuine local edit from the sync engine's own pull-driven
   write — both look identical to Postgres (`NEW.local_updated_at IS NOT
   DISTINCT FROM OLD.local_updated_at`). Taken literally it would have
   re-bumped `local_updated_at` on every remote pull, permanently breaking
   the §2.2 LWW comparison. Fixed with a transaction-local GUC
   (`app.tabatha_sync_write`) that every sync-write RPC sets before touching
   `tasks_registry`; see migration 035's comment on the trigger for the full
   reasoning. This is a correctness fix, not a scope change.
2. **Conflict resolution moved server-side into `tabatha.sync_upsert_asana_task`**
   rather than being computed in the edge function's JS. A read-then-write
   gap in Deno would have been a real TOCTOU race against concurrent webhook
   deliveries; doing the bucket-A LWW comparison inside one SECURITY DEFINER
   function makes it atomic per task.
3. **Webhook resource is the user's "My Tasks" list, not the whole
   workspace.** The design doc didn't fully specify webhook resource scope.
   Workspace-level Asana webhooks require Business/Enterprise tier; "My
   Tasks" webhooks are more broadly available and match the `assignee=me`
   pull scope exactly. Webhook registration is best-effort and non-fatal on
   failure either way — cron is the guaranteed baseline per design §3.2.
4. **v1 pull scope is `assignee=me`, not "everything the PAT can see."** The
   design doc's mapping table implies a personal Tasks view; this build
   picked the assignee-scoped default explicitly since the design didn't
   nail down project/workspace selection UI (that's Epic 4's territory).
   `completed_since` is a fixed 30-day lookback constant
   (`COMPLETED_SINCE_LOOKBACK_MS` in `sync-asana-tasks/index.ts`) so recently
   completed tasks still sync their status down without pulling full
   history — tunable later.
5. **Deletion detection is a full-gid diff against the current `assignee=me`
   sweep**, not a per-task 404 probe. Cheaper (one list call instead of N
   GETs) and catches unassign/reassign the same way as an actual delete,
   which is an acceptable v1 approximation — the design doc left this
   underspecified ("webhook / 404 on next poll") and this is the concrete
   mechanism chosen.
6. **`tabatha.revoke_asana_credential` exists but isn't wired to an
   endpoint.** No disconnect flow was in the build brief's 3 functions; this
   RPC is ready infrastructure for that near-certain fast-follow (Settings ->
   Integrations -> "Disconnect Asana").
7. **`tabatha.task_dependencies` / `tabatha.task_blocks` views were added**
   beyond the literal migration-content list (`task_relations` /
   `tasks_registry` ALTER / `integration_credentials`) to directly
   operationalize Koda's "derive blocked-by via reverse query" instruction —
   RLS-safe (`security_invoker = true`) thin views over `task_relations`, no
   new storage. Epic 4's Tasks view can query `task_blocks` directly instead
   of reimplementing the reverse join.
8. **v1 supports one Asana workspace per connection** (the PAT owner's
   first). Multi-workspace selection is out of scope here, same as the
   design doc's own open item.
9. **Asana identity used for the self-task/comments came through as
   "Caspera"**, not "Cirra" — the `asana-plugin` MCP connector available in
   this environment is bound to a single agent identity regardless of the
   `--as` request; `asana-cli.cmd` exists on PATH but wasn't substituted in
   given the MCP path already worked functionally. Worth a note for whoever
   owns agent-identity routing, not an Epic 3 blocker.

---

## 5. Cron / rate-limit tunables (all in `sync-asana-tasks/index.ts`)

| Constant | Value | Purpose |
|---|---|---|
| `MIN_RESYNC_INTERVAL_MS` | 4 min | guards against overlapping cron runs |
| `COMPLETED_SINCE_LOOKBACK_MS` | 30 days | how far back completed tasks still sync status |
| `MAX_LIST_PAGES` / `LIST_PAGE_LIMIT` | 5 / 100 | cap of 500 tasks/profile/pass |
| `MAX_SUBTASK_PARENTS_PER_PASS` | 50 | cap on per-pass subtask detail fetches |
| `PROFILE_CONCURRENCY` | 3 | profiles processed in parallel (different PATs = independent rate-limit buckets, per design §3.2) |

Cron schedule itself (`*/5 * * * *`) is registered in migration 035, not in
code — change there if the cadence needs to move.
