-- ============================================================
-- Tabatha Migration 060 — Org-hours v1: opt-in worked-hours RPC
-- ============================================================
-- NUMBERING: remote-applied migrations top out at 050 (`supabase migration
-- list --linked` against project mtdgoahskcibjbhfvofx); locally on disk the
-- highest file is 058 (`058_browser_profiles_lifecycle_guard.sql`, itself
-- explicitly NOT YET APPLIED per its own header — "apply via placeholder +
-- repair protocol, do not apply directly from an agent session"). Per this
-- task's dispatch brief, 059 is reserved for a concurrent agent's in-flight
-- work elsewhere in the fleet. This migration takes the next genuinely free
-- number, 060, and does not depend on 058 or 059 existing.
--
-- CONSENT MODEL (Malkio-locked, 2026-07-23/24 — see
-- docs/superpowers/specs/2026-07-21-shared-focus-org-context-concept.md §4.3
-- and the prior audit's scoped spec in docs/audits/2026-07-21-SYNTHESIS.md
-- item 5 / docs/audits/2026-07-21-crosscutting-systems-audit.md Area 3):
--   • Org-hours sharing is AGGREGATE-ONLY BY DEFAULT.
--   • A member's own worked hours are broken out by name ONLY if that
--     member has set profiles.settings.share_hours_with_org = true
--     (per-person opt-in, default OFF/absent).
--   • The personal realm is NEVER shared, full stop, regardless of opt-in —
--     inherited from migration 001's original "Managers see team time" fence
--     (realm IN ('professional','work','business') only).
--
-- WHY THIS RPC CANNOT LEAK PERSONAL-REALM DATA (structural, not just
-- filtered): the source table, tabatha.clock_sessions (migration 008), has
-- NO realm column, no label, no domain, no task reference — it is a pure
-- shift duration ledger (total_ms / work_ms / break_ms per clock-in/out
-- session). There is no realm-tagged content in this table for a query to
-- leak, unlike tabatha.time_entries or tabatha.focus_items (both realm/label
-- bearing) or tabatha.desktop_activity / tabatha.intent_history (both
-- carrying window titles / URLs / domains) — none of which this migration
-- touches. This RPC reuses the same source migration 019's
-- v_owner_clock_daily view already aggregates (that view is service_role-only
-- by explicit design, per its own header comment, pending exactly the
-- consent model this migration now implements) but re-derives the
-- aggregation directly here (rather than selecting from the view) so the
-- opt-in/aggregate split can be expressed in one SECURITY DEFINER function
-- without regranting the view itself to `authenticated`.
--
-- AUTHORIZATION SHAPE:
--   • Caller must be an authenticated user with a tabatha.profiles row
--     (tabatha.current_profile_id(), from migration 026 — re-used, not
--     re-derived) AND a tabatha.org_members row for the requested org_id.
--     ANY role qualifies (owner/admin/manager/user/read_only) — this
--     deliberately does NOT gate on manager/owner the way migration 012's
--     browser_profiles/browser_profile_status RLS does. The #221 concept
--     doc's "Internal" visibility tier (§4.1) — the locked default — is
--     explicitly "any org member can see presence/aggregate," not
--     manager-only; org-hours v1's aggregate figure is the same shape of
--     fact. The *v1 UI* surface (TeamActivityPanel) still only renders for
--     managers in this migration's companion PR — that is a UI choice, not
--     a security boundary, and any org member could call this RPC directly
--     today with the same safe result.
--   • Membership is checked INSIDE the function body against
--     tabatha.org_members (mirrors migration 012/026's join shape), not
--     assumed from the caller-supplied p_org_id — a caller from a different
--     org (no matching org_members row) gets zero rows back, not an error,
--     so the function's behavior never confirms or denies that a given
--     org_id exists to a non-member (avoids an enumeration side-channel).
--
-- RETURN SHAPE: one anonymous aggregate row (member_profile_id IS NULL,
-- is_aggregate_only = true) summed across EVERY org member's clock_sessions
-- in range regardless of opt-in — this is the bucket a non-opted-in member's
-- hours always fold into — plus zero or more named rows
-- (is_aggregate_only = false), one per CURRENT org member who has
-- share_hours_with_org = true. A member who has not opted in never gets a
-- named row; a caller from a different org gets no rows at all (not even
-- the aggregate one).
--
-- Companion write RPC: tabatha.set_share_hours_with_org(profile_id, enabled)
-- is a small dedicated setter rather than an extension to migration 038's
-- update_profile_settings — that RPC's one-level-deep-merge mechanism
-- (`existing_subobject || patch_subobject`) assumes every allow-listed
-- top-level key holds a JSON *object*; share_hours_with_org is a scalar
-- boolean at the top level of profiles.settings, and `'{}'::jsonb || true`
-- is not a valid jsonb concatenation. Special-casing a scalar into that
-- already-relied-upon shared RPC (used by Sidecar + extension Context View
-- settings) would widen its blast radius for a one-key, single-purpose
-- write; a small dedicated function keeps this change isolated and trivial
-- to review. Ownership-check + row-lock shape is copied from 038 verbatim.
--
-- IDEMPOTENT: CREATE OR REPLACE throughout; CREATE INDEX IF NOT EXISTS.
-- Run order: after 001 (schema), 008 (clock_sessions), 026 (current_profile_id).
-- ============================================================

-- Supporting index: this RPC's primary filter is (org_id, clocked_in_at).
-- clock_sessions had no org_id index before this migration (only
-- idx_clock_sessions_profile_out on (profile_id, clocked_out_at)).
CREATE INDEX IF NOT EXISTS idx_clock_sessions_org_clocked_in
  ON tabatha.clock_sessions (org_id, clocked_in_at);

-- ── (1) get_org_hours_summary — the read RPC ─────────────────────────
CREATE OR REPLACE FUNCTION tabatha.get_org_hours_summary(
  p_org_id     UUID,
  p_start_date DATE DEFAULT (CURRENT_DATE - 6),
  p_end_date   DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  member_profile_id  UUID,
  display_name       TEXT,
  total_ms           BIGINT,
  work_ms            BIGINT,
  break_ms           BIGINT,
  session_count      INTEGER,
  is_aggregate_only  BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller_profile_id UUID;
  v_is_member         BOOLEAN;
BEGIN
  v_caller_profile_id := tabatha.current_profile_id();
  IF v_caller_profile_id IS NULL THEN
    RETURN; -- no authenticated profile for this session
  END IF;

  IF p_org_id IS NULL OR p_start_date IS NULL OR p_end_date IS NULL
     OR p_start_date > p_end_date THEN
    RETURN; -- invalid arguments: nothing to compute
  END IF;

  -- Org-membership check, enforced here rather than assumed. ANY role in
  -- org_members qualifies (see header — Internal tier is any-member, not
  -- manager-only). A caller who is not a member of p_org_id gets no rows at
  -- all below, silently — not an error — so this function never leaks
  -- whether p_org_id even exists to a non-member.
  SELECT EXISTS (
    SELECT 1 FROM tabatha.org_members om
    WHERE om.org_id = p_org_id AND om.profile_id = v_caller_profile_id
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN;
  END IF;

  -- ── Row 1: the anonymous org-wide aggregate ─────────────────────────
  -- Sums every clock_sessions row tagged to this org (cs.org_id — stamped
  -- at clock-in time, migration 008) in range, regardless of any member's
  -- opt-in state. No profile_id/display_name is attached to this row: it
  -- is the "aggregate-only by default" bucket every non-opted-in member's
  -- hours fold into. Always exactly one row (COALESCE guards the
  -- zero-sessions case to 0, not NULL, since there is no GROUP BY here).
  RETURN QUERY
  SELECT
    NULL::UUID,
    NULL::TEXT,
    COALESCE(SUM(cs.total_ms), 0)::BIGINT,
    COALESCE(SUM(cs.work_ms), 0)::BIGINT,
    COALESCE(SUM(cs.break_ms), 0)::BIGINT,
    COUNT(*)::INTEGER,
    TRUE
  FROM tabatha.clock_sessions cs
  WHERE cs.org_id = p_org_id
    AND cs.clocked_in_at >= p_start_date::timestamptz
    AND cs.clocked_in_at <  (p_end_date + 1)::timestamptz;

  -- ── Row(s) 2+: named per-member breakdown ───────────────────────────
  -- Only for profiles that are BOTH (a) a current org_members row for this
  -- org — a departed member's name never lingers in a breakdown even if
  -- their old settings flag was left on — AND (b) currently opted in via
  -- profiles.settings.share_hours_with_org = true. Everyone else's hours
  -- already counted in the aggregate row above and get no named row here.
  RETURN QUERY
  SELECT
    cs.profile_id,
    p.display_name,
    COALESCE(SUM(cs.total_ms), 0)::BIGINT,
    COALESCE(SUM(cs.work_ms), 0)::BIGINT,
    COALESCE(SUM(cs.break_ms), 0)::BIGINT,
    COUNT(*)::INTEGER,
    FALSE
  FROM tabatha.clock_sessions cs
  JOIN tabatha.profiles p ON p.id = cs.profile_id
  WHERE cs.org_id = p_org_id
    AND cs.clocked_in_at >= p_start_date::timestamptz
    AND cs.clocked_in_at <  (p_end_date + 1)::timestamptz
    AND COALESCE((p.settings ->> 'share_hours_with_org')::boolean, false) = true
    AND EXISTS (
      SELECT 1 FROM tabatha.org_members om2
      WHERE om2.org_id = p_org_id AND om2.profile_id = cs.profile_id
    )
  GROUP BY cs.profile_id, p.display_name;
END;
$$;

-- Least-privilege: authenticated only, never anon/PUBLIC (migration 006's
-- schema-wide default grants EXECUTE broadly; revoke explicitly per this
-- project's SECURITY DEFINER hardening convention, e.g. migrations 026/058).
REVOKE ALL ON FUNCTION tabatha.get_org_hours_summary(UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tabatha.get_org_hours_summary(UUID, DATE, DATE) TO authenticated;

-- ── (2) set_share_hours_with_org — the opt-in write RPC ──────────────
CREATE OR REPLACE FUNCTION tabatha.set_share_hours_with_org(
  p_profile_id UUID,
  p_enabled    BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_owner_id UUID;
  v_settings JSONB;
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_profile_id is required');
  END IF;
  IF p_enabled IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'p_enabled is required');
  END IF;

  -- Ownership check: caller's auth.uid() must own the target profile row.
  -- Same shape as migration 038's update_profile_settings — SECURITY
  -- DEFINER bypasses table RLS, so this check is the enforcement point.
  SELECT id INTO v_owner_id
  FROM tabatha.profiles
  WHERE id = p_profile_id AND auth_user_id = auth.uid();
  IF v_owner_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized for this profile');
  END IF;

  -- Row lock so two concurrent calls for the same profile serialize instead
  -- of racing (mirrors migration 038's FOR UPDATE pattern).
  SELECT settings INTO v_settings
  FROM tabatha.profiles
  WHERE id = p_profile_id
  FOR UPDATE;

  v_settings := jsonb_set(
    COALESCE(v_settings, '{}'::jsonb),
    ARRAY['share_hours_with_org'],
    to_jsonb(p_enabled),
    true
  );

  UPDATE tabatha.profiles
     SET settings   = v_settings,
         updated_at = now()
   WHERE id = p_profile_id;

  RETURN jsonb_build_object('success', true, 'share_hours_with_org', p_enabled);
END;
$$;

REVOKE ALL ON FUNCTION tabatha.set_share_hours_with_org(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tabatha.set_share_hours_with_org(UUID, BOOLEAN) TO authenticated;
