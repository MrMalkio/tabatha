-- ============================================================
-- Tabatha Migration 038 — update_profile_settings RPC (Epic 9)
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- Design doc: docs/superpowers/specs/2026-07-18-epic9-cv-customization-design.md
-- (Koda's Epic 3/8 vet flagged the cross-surface race this closes; CeeCee's
-- gate-clearing ruling at the foot of that doc confirms: allow-list is
-- hardcoded — extend only by migration; no backfill of the relocated
-- sidecar.* keys in v1; colors/intensity out of scope.)
--
-- Problem this fixes: both the Sidecar (sidecar/src/context/AuthContext.tsx)
-- and, as of Epic 9, the extension (src/settings/ContextViewPanel.jsx) need
-- to write into profiles.settings JSONB, each touching a different
-- top-level key ('sidecar' / 'chaperone' / 'contextView'). Prior to this
-- migration both writers did a client-side read-modify-write of the ENTIRE
-- settings column (fetch profile.settings into React state, splice one key,
-- UPDATE the whole object back) — a cross-surface race: if surface A reads
-- settings, surface B writes a different top-level key in between, and A's
-- write lands computed from its stale snapshot, A's write silently clobbers
-- B's update. This RPC replaces both writers with a single atomic,
-- server-side merge so two concurrent callers touching different (or even
-- the same) top-level keys never lose data to each other.
--
-- Mechanism: per top-level key present in p_patch, jsonb_set(...,
-- create_missing => true) with the new value computed as
-- (existing sub-object || incoming patch) — a one-level-deep merge, NOT a
-- blind replace of the sub-object and NOT a recursive/deep merge. A patch of
-- {contextView: {showTimeline: false}} preserves sibling keys already under
-- contextView (e.g. showDayCountdown) because only the 'showTimeline' key
-- inside contextView changes; sibling top-level keys (sidecar, chaperone)
-- are untouched entirely since they're not in p_patch. This mirrors the
-- design doc's mechanism (§1.1-1.2), generalized to accept a patch object
-- that may touch one or more top-level keys in a single call rather than a
-- single p_key parameter, so batched multi-key writes are possible later
-- without a signature change.
--
-- Auth: SECURITY DEFINER + SET search_path = '' (hardened per the
-- create_organization/020 precedent — every object in the body is fully
-- schema-qualified). p_profile_id is caller-supplied (not resolved purely
-- from auth.uid()) so the function explicitly verifies the caller's
-- auth.uid() owns that profile row before writing anything — same
-- ownership-check shape as migration 032's focus_checkpoints RLS policy
-- (`profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id =
-- auth.uid())`), just enforced inside the function body since a
-- SECURITY DEFINER function bypasses table RLS.
--
-- Row lock: SELECT ... FOR UPDATE on the target profiles row before
-- computing the merge, so two concurrent calls to this RPC for the SAME
-- profile serialize instead of racing (the second call's SELECT blocks
-- until the first's UPDATE commits, then sees the first call's result as
-- its merge base). Calls for DIFFERENT profiles never contend.
--
-- Allow-list: hardcoded to the three known top-level settings keys
-- ('sidecar', 'chaperone', 'contextView'). Unknown keys in p_patch are
-- rejected outright (whole call fails, nothing is written) rather than
-- silently ignored, so a typo doesn't look like a silent no-op success.
-- Adding a new top-level key later is a one-line array edit in a follow-up
-- migration, not a schema change.
--
-- Client call shape (both surfaces):
--   supabase.schema('tabatha').rpc('update_profile_settings', {
--     p_profile_id: profile.id,
--     p_patch: { contextView: { showTimeline: false } },
--   });
--
-- Run order: after 001 (schema + profiles table), 032 (ownership-check
-- pattern precedent). Safe to re-run (CREATE OR REPLACE).
-- ============================================================

CREATE OR REPLACE FUNCTION tabatha.update_profile_settings(
  p_profile_id UUID,
  p_patch      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_allowed   CONSTANT TEXT[] := ARRAY['sidecar', 'chaperone', 'contextView'];
  v_owner_id  UUID;
  v_settings  JSONB;
  v_key       TEXT;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_profile_id is required');
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_patch must be a JSON object');
  END IF;

  -- Ownership check: the authenticated caller must own the target profile
  -- row. Mirrors the RLS predicate used elsewhere (e.g. migration 032's
  -- focus_checkpoints policy) since SECURITY DEFINER bypasses table RLS.
  SELECT id INTO v_owner_id
  FROM tabatha.profiles
  WHERE id = p_profile_id
    AND auth_user_id = auth.uid();
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized for this profile');
  END IF;

  -- Reject unknown top-level keys up front — nothing is written if any key
  -- in the patch fails the allow-list, so a typo can't partially apply.
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    IF NOT (v_key = ANY(v_allowed)) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Unknown settings key: ' || v_key);
    END IF;
  END LOOP;

  -- Lock the row for the duration of this transaction so a concurrent call
  -- for the same profile serializes on the merge base instead of racing.
  SELECT settings INTO v_settings
  FROM tabatha.profiles
  WHERE id = p_profile_id
  FOR UPDATE;
  v_settings := COALESCE(v_settings, '{}'::jsonb);

  -- Apply each top-level key's patch as a one-level-deep merge into the
  -- existing sub-object at that key (create the key if absent).
  FOR v_key IN SELECT jsonb_object_keys(p_patch) LOOP
    v_settings := jsonb_set(
      v_settings,
      ARRAY[v_key],
      COALESCE(v_settings -> v_key, '{}'::jsonb) || (p_patch -> v_key),
      true
    );
  END LOOP;

  UPDATE tabatha.profiles
     SET settings   = v_settings,
         updated_at = now()
   WHERE id = p_profile_id;

  RETURN jsonb_build_object('success', true, 'settings', v_settings);
END;
$$;

-- Lock down execution: authenticated users only (mirrors create_organization/020).
REVOKE ALL ON FUNCTION tabatha.update_profile_settings(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tabatha.update_profile_settings(UUID, JSONB) TO authenticated;
