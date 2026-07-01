-- ============================================================
-- Tabatha Migration 020 — create_organization RPC (self-serve org creation)
-- ============================================================
-- FIX-09 (9B). Onboarding gap: there was no in-app way to CREATE an
-- organization. Users could only join an existing org via an invite token
-- (redeem_invite_token, migrations 003/018), but tokens can only be minted by
-- an org owner (create_invite_token, migration 012) — a chicken-and-egg
-- deadlock for the very first user of any org. This RPC lets an authenticated
-- caller bootstrap a brand-new org and become its owner in one transaction.
--
-- What it does, idempotently and atomically:
--   1. creates a tabatha.organizations row (name + generated unique slug),
--   2. inserts an 'owner' org_members row for the caller,
--   3. stamps the caller's profile default_org_id (COALESCE — never clobbers
--      an existing default) so syncService attributes rows to the new org.
--
-- SECURITY DEFINER + search_path = public, mirroring create_invite_token
-- (012) and redeem_invite_token (018). Client calls it schema-qualified:
--   supabase.schema('tabatha').rpc('create_organization', { p_name })
--
-- Run order: after 001 (schema), 005 (profile default columns), 012/018.
-- Safe to re-run (CREATE OR REPLACE + guarded constraint reconciliation).
-- ============================================================

-- ── (0) Reconcile the org_members.role CHECK constraint ─────
-- migration 001 created org_members with a restrictive initial CHECK:
--     CHECK (role IN ('user', 'manager', 'admin'))
-- which does NOT permit 'owner'. But migration 012's create_invite_token and
-- this RPC's owner-membership insert both rely on role = 'owner'. Migration
-- 002 explicitly deferred fixing this (see its note). Reconcile it here: drop
-- the old constraint (Postgres auto-names it org_members_role_check) and add a
-- permissive one covering every role the app uses. Idempotent — IF EXISTS on
-- the drop, and we DROP-then-ADD the named constraint so re-runs are clean.
ALTER TABLE tabatha.org_members
  DROP CONSTRAINT IF EXISTS org_members_role_check;

ALTER TABLE tabatha.org_members
  ADD CONSTRAINT org_members_role_check
  CHECK (role IN ('owner', 'manager', 'sub_manager', 'admin', 'user', 'read_only'));

-- ── (1) create_organization RPC ─────────────────────────────
CREATE OR REPLACE FUNCTION tabatha.create_organization(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_name       TEXT;
  v_base_slug  TEXT;
  v_slug       TEXT;
  v_suffix     INT := 0;
  v_org_id     UUID;
BEGIN
  -- Identify the caller
  SELECT id INTO v_profile_id
  FROM tabatha.profiles
  WHERE auth_user_id = auth.uid();
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No profile for authenticated user');
  END IF;

  -- Validate + normalise the name
  v_name := btrim(coalesce(p_name, ''));
  IF v_name = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization name is required');
  END IF;
  IF length(v_name) > 120 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization name too long (max 120 chars)');
  END IF;

  -- Build a URL-safe base slug from the name: lowercase, non-alphanumerics to
  -- dashes, collapse repeats, trim leading/trailing dashes. Fall back to 'org'
  -- if the name has no slug-able characters (e.g. all symbols).
  v_base_slug := regexp_replace(lower(v_name), '[^a-z0-9]+', '-', 'g');
  v_base_slug := btrim(v_base_slug, '-');
  IF v_base_slug = '' THEN
    v_base_slug := 'org';
  END IF;

  -- Find a free slug (organizations.slug is UNIQUE NOT NULL). Loop appending a
  -- numeric suffix until we get one that isn't taken.
  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM tabatha.organizations WHERE slug = v_slug) LOOP
    v_suffix := v_suffix + 1;
    v_slug := v_base_slug || '-' || v_suffix::text;
  END LOOP;

  -- (1) create the organization
  INSERT INTO tabatha.organizations (name, slug, owner_id)
  VALUES (v_name, v_slug, v_profile_id)
  RETURNING id INTO v_org_id;

  -- (2) owner membership for the caller. ON CONFLICT keeps this idempotent if
  -- the unique (org_id, profile_id) row somehow already exists.
  INSERT INTO tabatha.org_members (org_id, profile_id, role)
  VALUES (v_org_id, v_profile_id, 'owner')
  ON CONFLICT (org_id, profile_id) DO NOTHING;

  -- (3) stamp the profile default so sync attributes rows to this org. No
  -- team is created here, so default_team_id is left untouched. COALESCE
  -- preserves any default the user already had from a prior org.
  UPDATE tabatha.profiles
     SET default_org_id = COALESCE(default_org_id, v_org_id)
   WHERE id = v_profile_id;

  RETURN jsonb_build_object(
    'success', true,
    'org_id',  v_org_id,
    'name',    v_name,
    'slug',    v_slug,
    'role',    'owner'
  );
END;
$$;

-- Lock down execution: authenticated users only (mirrors create_invite_token).
REVOKE ALL ON FUNCTION tabatha.create_organization(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.create_organization(TEXT) TO authenticated;
