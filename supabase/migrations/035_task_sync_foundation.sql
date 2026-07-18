-- ============================================================
-- Tabatha Migration 035 — Task sync foundation (Epic 3 v1, Tabby Sidecar <-> Asana)
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- Design: docs/superpowers/specs/2026-07-18-epic3-asana-sync-design.md (Cirra)
-- Koda-vetted with one binding revision (applied here): `kind='blocks'` is
-- NOT mirror-written into task_relations. Only `subtask` / `depends_on` are
-- ever inserted; "what does task X block" is derived via a reverse query on
-- `depends_on` (see the `tabatha.task_blocks` view below), never stored.
--
-- Builds, in order:
--   1. tabatha.task_relations   — subtask / depends_on edges (soft-delete tombstones)
--   2. tabatha.tasks_registry   — additive ALTER (external sync bookkeeping)
--   3. tabatha.integration_credentials — Vault-pointer PAT/webhook storage (never the raw secret)
--   4. Read-only helper views (task_dependencies, task_blocks)
--   5. SECURITY DEFINER service-role-only RPCs the three edge functions call
--      (connect-asana / asana-webhook / sync-asana-tasks) — Vault access is
--      never exposed to PostgREST directly (vault schema isn't in the
--      exposed-schemas list), so every Vault read/write goes through one of
--      these narrow, single-purpose functions.
--   6. pg_cron registration for sync-asana-tasks, reusing the existing
--      `sidecar_cron_key` Vault secret from migration 031 — no new secret.
--
-- Does NOT touch tabatha.task_links (001, differently-shaped platform-time
-- cache — see design doc §1.1), tabatha.push_dedup, or tabatha.focus_events.
--
-- All new functions use SECURITY DEFINER + SET search_path = '' with fully
-- schema-qualified bodies, matching the migration 020 hardening precedent
-- (commit 8e8ba78). Additive only; safe to re-run (IF NOT EXISTS / OR REPLACE
-- / DROP ... IF EXISTS before CREATE throughout).
-- ============================================================

-- ── (1) task_relations ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tabatha.task_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  from_task TEXT NOT NULL,   -- tasks_registry.task_id
  to_task   TEXT NOT NULL,   -- tasks_registry.task_id
  kind      TEXT NOT NULL CHECK (kind IN ('subtask', 'depends_on')),
  source    TEXT NOT NULL DEFAULT 'asana' CHECK (source IN ('asana', 'tabatha')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,          -- tombstone — never hard-delete a synced edge
  UNIQUE(profile_id, from_task, to_task, kind)
);

CREATE INDEX IF NOT EXISTS idx_task_relations_from ON tabatha.task_relations(profile_id, from_task) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_task_relations_to   ON tabatha.task_relations(profile_id, to_task)   WHERE deleted_at IS NULL;

ALTER TABLE tabatha.task_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own task relations" ON tabatha.task_relations;
CREATE POLICY "Users manage own task relations"
  ON tabatha.task_relations
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON tabatha.task_relations TO authenticated, service_role;

-- ── (2) tasks_registry additions ────────────────────────────────────────
-- migration 008 gave tasks_registry only `synced_at` (stamped by the sync
-- engine itself) — no way to tell "did the user edit this locally since the
-- last sync." These columns add that, plus external-platform bookkeeping.

ALTER TABLE tabatha.tasks_registry
  ADD COLUMN IF NOT EXISTS external_platform TEXT NOT NULL DEFAULT 'tabatha' CHECK (external_platform IN ('tabatha', 'asana')),
  ADD COLUMN IF NOT EXISTS local_updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS external_updated_at TIMESTAMPTZ,      -- Asana task.modified_at, task-level granularity (design §2)
  ADD COLUMN IF NOT EXISTS sync_state TEXT NOT NULL DEFAULT 'synced'
    CHECK (sync_state IN ('synced', 'pending_push', 'pending_pull', 'conflict', 'remote_deleted', 'error')),
  ADD COLUMN IF NOT EXISTS sync_error TEXT;

-- Reuse task_id as the Asana GID directly when external_platform='asana'
-- (Asana GIDs are globally unique numeric strings; they won't collide with
-- the existing `sidecar-<uuid>` local-id format), so task_relations.from_task
-- / to_task point straight at tasks_registry.task_id with no extra id column.

-- Trigger: bump local_updated_at whenever a row changes WITHOUT the caller
-- explicitly setting it (the ordinary app-write pattern: `UPDATE ... SET
-- name = $1 WHERE id = $2`, never touching local_updated_at, is read by
-- Postgres as "unchanged" and the trigger below promotes that to now()).
--
-- Deviation from the design doc's original sketch: that version had no way
-- to distinguish a genuine local edit from the sync engine's own pull-driven
-- write, because "explicitly re-setting local_updated_at to its own old
-- value" and "not touching the column at all" are indistinguishable at the
-- SQL level — both leave NEW.local_updated_at = OLD.local_updated_at. Taken
-- literally, that trigger would re-bump local_updated_at on every remote
-- pull too, permanently poisoning the §2.2 LWW comparison (Asana would
-- almost never win after the first sync). Fixed here with a transaction-
-- local GUC (`app.tabatha_sync_write`) that the sync-write RPCs below set
-- before touching tasks_registry, so this trigger can tell the two apart.
CREATE OR REPLACE FUNCTION tabatha.bump_task_local_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF current_setting('app.tabatha_sync_write', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NEW.local_updated_at IS NOT DISTINCT FROM OLD.local_updated_at THEN
    NEW.local_updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_registry_local_touch ON tabatha.tasks_registry;
CREATE TRIGGER trg_tasks_registry_local_touch
  BEFORE UPDATE ON tabatha.tasks_registry
  FOR EACH ROW EXECUTE FUNCTION tabatha.bump_task_local_updated_at();

-- ── (3) integration_credentials ─────────────────────────────────────────
-- Never stores the PAT (or webhook HMAC secret) itself — only Vault secret
-- names, resolved server-side only via the RPCs in section (5). Mirrors the
-- sidecar_cron_key isolation pattern (migration 031) but per-user, since a
-- PAT is a per-tenant credential, not a single global service-role bearer.

CREATE TABLE IF NOT EXISTS tabatha.integration_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('asana')),
  vault_secret_name TEXT NOT NULL UNIQUE,        -- 'asana_pat_' || profile_id
  workspace_gid TEXT,                            -- Asana workspace resolved at connect time
  user_task_list_gid TEXT,                       -- the PAT owner's "My Tasks" resource — webhook target + query scope
  webhook_gid TEXT,                               -- Asana webhook resource id (set after creation)
  webhook_secret_name TEXT,                       -- Vault name for the per-webhook HMAC secret (set on handshake)
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_synced_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'error')),
  UNIQUE(profile_id, provider)
);

ALTER TABLE tabatha.integration_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own integration credentials" ON tabatha.integration_credentials;
CREATE POLICY "Users manage own integration credentials"
  ON tabatha.integration_credentials
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));
-- RLS lets the owner see connection status (for a Settings -> Integrations
-- "Connected as of ..." UI), never the secret value — vault.decrypted_secrets
-- is only ever read from inside a SECURITY DEFINER function below, called
-- from an edge function under the service role.

GRANT SELECT ON tabatha.integration_credentials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tabatha.integration_credentials TO service_role;

CREATE INDEX IF NOT EXISTS idx_integration_credentials_active
  ON tabatha.integration_credentials(provider, last_synced_at) WHERE status = 'active';

-- ── (4) Read-only relation views ────────────────────────────────────────
-- `WITH (security_invoker = true)` is required here: without it, a plain
-- Postgres view checks RLS as the view's OWNER (the migration-running role),
-- not the querying user, which would silently leak cross-tenant rows through
-- the view even though the base table's RLS is correct. Both views must
-- carry it.

CREATE OR REPLACE VIEW tabatha.task_dependencies
WITH (security_invoker = true) AS
SELECT profile_id, from_task AS task_id, to_task AS depends_on_task_id, updated_at
FROM tabatha.task_relations
WHERE kind = 'depends_on' AND deleted_at IS NULL;

GRANT SELECT ON tabatha.task_dependencies TO authenticated, service_role;

-- Koda's binding revision, operationalized: "what does task X block" is
-- never a stored row — it's the reverse of depends_on. A row
-- (from_task=A, to_task=B, kind='depends_on') means "A depends on B", i.e.
-- "B blocks A". So for a given task_id = B, the tasks it blocks are every A
-- with a depends_on edge pointing at B.
CREATE OR REPLACE VIEW tabatha.task_blocks
WITH (security_invoker = true) AS
SELECT profile_id, to_task AS task_id, from_task AS blocks_task_id, updated_at
FROM tabatha.task_relations
WHERE kind = 'depends_on' AND deleted_at IS NULL;

GRANT SELECT ON tabatha.task_blocks TO authenticated, service_role;

-- ── (5) Service-role RPCs used by the three edge functions ─────────────

-- Generic Vault accessors. `vault` is not in the PostgREST exposed-schemas
-- list (supabase/config.toml), so it can only ever be reached from inside a
-- SECURITY DEFINER function running under the migration-owning role.

CREATE OR REPLACE FUNCTION tabatha.get_vault_secret(p_secret_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_value TEXT;
BEGIN
  IF p_secret_name IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT decrypted_secret INTO v_value
  FROM vault.decrypted_secrets
  WHERE name = p_secret_name
  LIMIT 1;
  RETURN v_value;
END;
$$;

REVOKE ALL ON FUNCTION tabatha.get_vault_secret(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.get_vault_secret(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION tabatha.set_vault_secret(p_secret_name TEXT, p_value TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_id UUID;
BEGIN
  SELECT id INTO v_existing_id FROM vault.secrets WHERE name = p_secret_name;
  IF v_existing_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_existing_id, p_value);
  ELSE
    PERFORM vault.create_secret(p_value, p_secret_name);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION tabatha.set_vault_secret(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.set_vault_secret(TEXT, TEXT) TO service_role;

-- connect-asana: create/refresh a profile's Asana credential. Takes an
-- explicit p_profile_id (not derived from auth.uid()) because the edge
-- function itself already verified the caller's identity via their JWT
-- before calling this — that's exactly why this function is service_role
-- only, never authenticated: granting it to `authenticated` would let any
-- signed-in user pass an arbitrary profile_id and overwrite someone else's
-- Asana connection.
CREATE OR REPLACE FUNCTION tabatha.upsert_asana_credential(
  p_profile_id UUID,
  p_pat TEXT,
  p_workspace_gid TEXT,
  p_user_task_list_gid TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_name TEXT := 'asana_pat_' || p_profile_id::text;
BEGIN
  PERFORM tabatha.set_vault_secret(v_secret_name, p_pat);

  INSERT INTO tabatha.integration_credentials
    (profile_id, provider, vault_secret_name, workspace_gid, user_task_list_gid, status, connected_at)
  VALUES
    (p_profile_id, 'asana', v_secret_name, p_workspace_gid, p_user_task_list_gid, 'active', now())
  ON CONFLICT (profile_id, provider) DO UPDATE
    SET vault_secret_name  = EXCLUDED.vault_secret_name,
        workspace_gid      = EXCLUDED.workspace_gid,
        user_task_list_gid = EXCLUDED.user_task_list_gid,
        status             = 'active',
        connected_at       = now();

  RETURN jsonb_build_object('success', true, 'vault_secret_name', v_secret_name);
END;
$$;

REVOKE ALL ON FUNCTION tabatha.upsert_asana_credential(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.upsert_asana_credential(UUID, TEXT, TEXT, TEXT) TO service_role;

-- Set right after connect-asana creates the Asana webhook (has the gid
-- immediately from the create response; the HMAC secret is NOT in that
-- response — Asana delivers it async via the X-Hook-Secret handshake, which
-- is why it's a separate function called from asana-webhook instead).
CREATE OR REPLACE FUNCTION tabatha.set_asana_webhook_gid(p_profile_id UUID, p_webhook_gid TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE tabatha.integration_credentials
     SET webhook_gid = p_webhook_gid
   WHERE profile_id = p_profile_id AND provider = 'asana';
END;
$$;

REVOKE ALL ON FUNCTION tabatha.set_asana_webhook_gid(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.set_asana_webhook_gid(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION tabatha.set_asana_webhook_secret(p_profile_id UUID, p_secret TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_secret_name TEXT := 'asana_webhook_secret_' || p_profile_id::text;
BEGIN
  PERFORM tabatha.set_vault_secret(v_secret_name, p_secret);
  UPDATE tabatha.integration_credentials
     SET webhook_secret_name = v_secret_name
   WHERE profile_id = p_profile_id AND provider = 'asana';
END;
$$;

REVOKE ALL ON FUNCTION tabatha.set_asana_webhook_secret(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.set_asana_webhook_secret(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION tabatha.revoke_asana_credential(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE tabatha.integration_credentials
     SET status = 'revoked'
   WHERE profile_id = p_profile_id AND provider = 'asana';
END;
$$;

REVOKE ALL ON FUNCTION tabatha.revoke_asana_credential(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.revoke_asana_credential(UUID) TO service_role;
-- Not wired to an endpoint in v1 (no disconnect flow was in scope) — kept as
-- ready infrastructure for the near-certain fast-follow; see deploy-notes.

-- sync-asana-tasks: task-level upsert implementing the §2.2 bucket-A LWW
-- (Asana wins unless the local row was genuinely edited more recently than
-- this Asana snapshot; exact tie -> Asana wins). Bucket-B fields
-- (funnel_stage when no Stage custom field exists, linked_intents) are never
-- touched here — p_funnel_stage is only passed non-null when the caller
-- resolved an actual Asana Stage custom field for this task.
CREATE OR REPLACE FUNCTION tabatha.sync_upsert_asana_task(
  p_profile_id UUID,
  p_task_id TEXT,                       -- Asana task gid, reused directly as tasks_registry.task_id
  p_name TEXT,
  p_description TEXT,
  p_status TEXT,                        -- 'active' | 'completed'
  p_completed_at TIMESTAMPTZ,
  p_funnel_stage TEXT,                  -- NULL when no Stage custom field on this task
  p_external_updated_at TIMESTAMPTZ,     -- Asana task.modified_at
  p_permalink TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_id UUID;
  v_local_updated_at TIMESTAMPTZ;
  v_bucket_a_wins BOOLEAN;
BEGIN
  PERFORM set_config('app.tabatha_sync_write', 'on', true);

  SELECT id, local_updated_at INTO v_existing_id, v_local_updated_at
  FROM tabatha.tasks_registry
  WHERE profile_id = p_profile_id AND task_id = p_task_id;

  v_bucket_a_wins := v_existing_id IS NULL
    OR v_local_updated_at IS NULL
    OR v_local_updated_at <= p_external_updated_at;

  IF v_existing_id IS NULL THEN
    INSERT INTO tabatha.tasks_registry (
      profile_id, task_id, name, description, status, completed_at,
      funnel_stage, external_platform, external_updated_at, local_updated_at,
      sync_state, metadata, synced_at
    ) VALUES (
      p_profile_id, p_task_id, p_name, coalesce(p_description, ''), p_status, p_completed_at,
      coalesce(p_funnel_stage, 'unsorted'), 'asana', p_external_updated_at, p_external_updated_at,
      'synced', jsonb_build_object('permalink', p_permalink), now()
    );
  ELSIF v_bucket_a_wins THEN
    UPDATE tabatha.tasks_registry
       SET name = p_name,
           description = coalesce(p_description, ''),
           status = p_status,
           completed_at = p_completed_at,
           funnel_stage = coalesce(p_funnel_stage, funnel_stage),
           external_platform = 'asana',
           external_updated_at = p_external_updated_at,
           local_updated_at = p_external_updated_at,
           sync_state = 'synced',
           sync_error = NULL,
           archived = false,
           metadata = metadata || jsonb_build_object('permalink', p_permalink),
           synced_at = now()
     WHERE id = v_existing_id;
  ELSE
    -- Local edit is strictly newer than this Asana snapshot. v1 never pushes
    -- local edits back (design §6), so this branch exists only so a
    -- late-arriving webhook + cron double-delivery can't clobber a fresher
    -- local write out of order. Flag it (§2.2: audit signal, not a blocking
    -- UI state) without touching the fields Bucket A owns.
    UPDATE tabatha.tasks_registry
       SET external_updated_at = p_external_updated_at,
           sync_state = 'conflict'
     WHERE id = v_existing_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'task_id', p_task_id, 'bucket_a_applied', v_bucket_a_wins);
END;
$$;

REVOKE ALL ON FUNCTION tabatha.sync_upsert_asana_task(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.sync_upsert_asana_task(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TIMESTAMPTZ, TEXT) TO service_role;

-- Minimal placeholder upsert for webhook-driven "mark dirty" (design's
-- "marks tasks dirty / upserts minimal") — Asana's webhook event payload
-- carries the changed task's gid but not its fields, so this just ensures a
-- row exists in `pending_pull` state; the next sync-asana-tasks pass fills
-- in the real fields via sync_upsert_asana_task.
CREATE OR REPLACE FUNCTION tabatha.sync_mark_task_dirty(p_profile_id UUID, p_task_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('app.tabatha_sync_write', 'on', true);
  INSERT INTO tabatha.tasks_registry (
    profile_id, task_id, name, external_platform, sync_state, local_updated_at
  ) VALUES (
    p_profile_id, p_task_id, '(syncing…)', 'asana', 'pending_pull', now()
  )
  ON CONFLICT (profile_id, task_id) DO UPDATE
    SET sync_state = 'pending_pull';
END;
$$;

REVOKE ALL ON FUNCTION tabatha.sync_mark_task_dirty(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.sync_mark_task_dirty(UUID, TEXT) TO service_role;

-- Task-level tombstone (design §2.3: "never hard-delete... archived=true,
-- sync_state='remote_deleted'"). Called from both the webhook's task:removed
-- handler and the cron pass's full-gid-diff deletion detector.
CREATE OR REPLACE FUNCTION tabatha.sync_mark_remote_deleted(p_profile_id UUID, p_task_id TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM set_config('app.tabatha_sync_write', 'on', true);
  UPDATE tabatha.tasks_registry
     SET archived = true,
         archived_at = now(),
         sync_state = 'remote_deleted'
   WHERE profile_id = p_profile_id AND task_id = p_task_id AND external_platform = 'asana';
END;
$$;

REVOKE ALL ON FUNCTION tabatha.sync_mark_remote_deleted(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.sync_mark_remote_deleted(UUID, TEXT) TO service_role;

-- Edge (relation) upsert — resurrects a previously-tombstoned row if the
-- edge reappears in a fresh fetch (design §2.3).
CREATE OR REPLACE FUNCTION tabatha.sync_upsert_task_relation(
  p_profile_id UUID,
  p_from_task TEXT,
  p_to_task TEXT,
  p_kind TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO tabatha.task_relations (profile_id, from_task, to_task, kind, source, updated_at, deleted_at)
  VALUES (p_profile_id, p_from_task, p_to_task, p_kind, 'asana', now(), NULL)
  ON CONFLICT (profile_id, from_task, to_task, kind) DO UPDATE
    SET source = 'asana',
        updated_at = now(),
        deleted_at = NULL;
END;
$$;

REVOKE ALL ON FUNCTION tabatha.sync_upsert_task_relation(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.sync_upsert_task_relation(UUID, TEXT, TEXT, TEXT) TO service_role;

-- Edge tombstone diff (design §2.3): after a fresh fetch of `from_task`'s
-- dependencies/subtasks, soft-delete any source='asana' row of that kind
-- whose to_task is no longer in the fresh set.
CREATE OR REPLACE FUNCTION tabatha.sync_tombstone_stale_relations(
  p_profile_id UUID,
  p_from_task TEXT,
  p_kind TEXT,
  p_keep_to_tasks TEXT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE tabatha.task_relations
     SET deleted_at = now(), updated_at = now()
   WHERE profile_id = p_profile_id
     AND from_task = p_from_task
     AND kind = p_kind
     AND source = 'asana'
     AND deleted_at IS NULL
     AND NOT (to_task = ANY (coalesce(p_keep_to_tasks, ARRAY[]::text[])));
END;
$$;

REVOKE ALL ON FUNCTION tabatha.sync_tombstone_stale_relations(UUID, TEXT, TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.sync_tombstone_stale_relations(UUID, TEXT, TEXT, TEXT[]) TO service_role;

CREATE OR REPLACE FUNCTION tabatha.sync_touch_last_synced(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE tabatha.integration_credentials
     SET last_synced_at = now()
   WHERE profile_id = p_profile_id AND provider = 'asana';
END;
$$;

REVOKE ALL ON FUNCTION tabatha.sync_touch_last_synced(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.sync_touch_last_synced(UUID) TO service_role;

-- ── (6) pg_cron registration ─────────────────────────────────────────────
-- Design §3.2: cron every 5 minutes (looser than the 1-minute push cron —
-- task sync isn't alert-latency-sensitive), reusing the SAME `sidecar_cron_key`
-- Vault secret migration 031 already set up (a service-role bearer, not
-- Asana-specific — no new secret to provision).

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'asana-task-sync';

SELECT cron.schedule(
  'asana-task-sync',
  '*/5 * * * *',
  $job$
  SELECT net.http_post(
    url := 'https://mtdgoahskcibjbhfvofx.supabase.co/functions/v1/sync-asana-tasks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'sidecar_cron_key' LIMIT 1
      )
    ),
    body := '{}'::jsonb
  );
  $job$
);
