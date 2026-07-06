-- ============================================================
-- Tabatha Migration 023 — Work Schedule + Work Profiles + Required Hours
-- (NB-01 + NB-02, combined per the Koda-vetted plans on Asana
--  GIDs 1216226128693003 / 1216226128636974)
-- ============================================================
-- HOURS MODEL (Malkio-approved, BINDING):
--   • Per-member REQUIRED-HOURS minimums settable at ANY combination of
--     DAILY / WEEKLY / MONTHLY cadences. Each cadence is an INDEPENDENT
--     floor (anti-back-loading: meeting the weekly floor does NOT excuse
--     missed daily floors).
--   • Users can MOVE/shift expected hours to another day — the system
--     prompts and RECORDS it (schedule_change_requests kind 'shift_hours').
--   • BOTH profile types must ACCOUNT for unworked time: a shortfall vs a
--     cadence minimum prompts make-up/shift OR a logged reason; unaccounted
--     shortfalls surface to the OA (shortfall_ledger resolution 'unresolved').
--   • Profile types (on the MEMBERSHIP — org_members — per Koda):
--       'dedicated_hours' — fixed weekly schedule (work_schedule_slots) +
--                           adherence + minimums.
--       'self_managed'    — NO fixed schedule, but minimums + accounting
--                           still apply (must clock in/out + log context).
--
-- WEEKDAY CONVENTION: weekday 0 = Monday … 6 = Sunday (matches the
-- Mon-first DAYS order in src/workshifts — NB-01 open question 2 default).
--
-- SHORTFALL LEDGER: rows are created ON PROMPT (client detects a shortfall
-- at/near a cadence-window close and inserts). Periods are NEVER
-- pre-materialized. UNIQUE(org_id, profile_id, cadence, period_start)
-- makes the prompt-time insert idempotent.
--
-- RLS consumes migration 022's SECURITY DEFINER helpers:
--   tabatha.current_profile_id(), tabatha.is_org_wide_admin(uuid),
--   tabatha.my_visible_member_profile_ids(uuid),
--   tabatha.can_manage_profile(uuid, uuid).
-- Members read their own rows; OA/team-manager scope reads & writes per
-- can_manage_profile; members may INSERT their own schedule_change_requests
-- and read them; ONLY the can_manage_profile scope may approve (status).
--
-- RPCs follow the 020/022 hardening precedent: SECURITY DEFINER,
-- SET search_path = '', fully schema-qualified bodies, REVOKE from
-- PUBLIC + anon, GRANT to authenticated.
--
-- IDEMPOTENT throughout: IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY
-- IF EXISTS + CREATE. Safe to re-run.
-- Run order: after 022 (helpers). DO NOT APPLY before 022 is on prod.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- (0) org_members.work_profile_type — profile type lives on the
--     MEMBERSHIP (per-org), not the global profile (Koda).
-- ────────────────────────────────────────────────────────────
ALTER TABLE tabatha.org_members
  ADD COLUMN IF NOT EXISTS work_profile_type TEXT NOT NULL DEFAULT 'self_managed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'org_members_work_profile_type_check'
      AND conrelid = 'tabatha.org_members'::regclass
  ) THEN
    ALTER TABLE tabatha.org_members
      ADD CONSTRAINT org_members_work_profile_type_check
      CHECK (work_profile_type IN ('dedicated_hours', 'self_managed'));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- (1) work_requirements — per-member required-hours floors.
--     One OPEN row (effective_to IS NULL) per (org, profile, cadence).
--     Historical rows keep effective_from/effective_to for auditability.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tabatha.work_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES tabatha.organizations(id) ON DELETE CASCADE,
  team_id UUID NULL REFERENCES tabatha.teams(id) ON DELETE SET NULL,
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly')),
  min_minutes INTEGER NOT NULL CHECK (min_minutes >= 0),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE NULL,
  created_by UUID NULL REFERENCES tabatha.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_work_requirements_member
  ON tabatha.work_requirements (org_id, profile_id, cadence);

-- One open floor per cadence per member per org.
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_requirements_open
  ON tabatha.work_requirements (org_id, profile_id, cadence)
  WHERE effective_to IS NULL;

-- ────────────────────────────────────────────────────────────
-- (2) work_schedule_slots — the fixed weekly schedule
--     (dedicated_hours members). Multiple slots per weekday are
--     allowed (split shifts); minutes are minutes-from-midnight.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tabatha.work_schedule_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES tabatha.organizations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=Mon … 6=Sun
  start_minute INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute INTEGER NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  set_by UUID NULL REFERENCES tabatha.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_minute > start_minute)
);

CREATE INDEX IF NOT EXISTS idx_work_schedule_slots_member
  ON tabatha.work_schedule_slots (org_id, profile_id, weekday);

-- ────────────────────────────────────────────────────────────
-- (3) schedule_change_requests — member-filed proposals.
--     kind 'slot_change'  payload: { "slots": [{weekday,start_minute,end_minute}, …] }
--     kind 'shift_hours'  payload: { "from_date", "to_date", "minutes", "shortfall_ledger_id"? }
--     kind 'make_up'      payload: { "date", "minutes", "shortfall_ledger_id"? }
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tabatha.schedule_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES tabatha.organizations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE, -- who the change is FOR
  requested_by UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('slot_change', 'shift_hours', 'make_up')),
  payload JSONB NOT NULL DEFAULT '{}',
  reason TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by UUID NULL REFERENCES tabatha.profiles(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_change_requests_pending
  ON tabatha.schedule_change_requests (org_id, status);
CREATE INDEX IF NOT EXISTS idx_schedule_change_requests_member
  ON tabatha.schedule_change_requests (profile_id, created_at DESC);

-- ────────────────────────────────────────────────────────────
-- (4) shortfall_ledger — accounting for unworked time.
--     Created on prompt (client-side detection), never pre-materialized.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tabatha.shortfall_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES tabatha.organizations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly')),
  missing_minutes INTEGER NOT NULL CHECK (missing_minutes > 0),
  resolution TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (resolution IN ('unresolved', 'made_up', 'shifted', 'excused')),
  reason TEXT NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotent prompt-time inserts: one ledger row per member/cadence/period.
CREATE UNIQUE INDEX IF NOT EXISTS uq_shortfall_ledger_period
  ON tabatha.shortfall_ledger (org_id, profile_id, cadence, period_start);
CREATE INDEX IF NOT EXISTS idx_shortfall_ledger_unresolved
  ON tabatha.shortfall_ledger (org_id, resolution);

-- ────────────────────────────────────────────────────────────
-- (5) RLS
-- ────────────────────────────────────────────────────────────
ALTER TABLE tabatha.work_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.work_schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.schedule_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.shortfall_ledger ENABLE ROW LEVEL SECURITY;

-- work_requirements: member reads own; managers read/write their scope.
DROP POLICY IF EXISTS "Members read own requirements" ON tabatha.work_requirements;
CREATE POLICY "Members read own requirements" ON tabatha.work_requirements
  FOR SELECT USING (
    profile_id = tabatha.current_profile_id()
    OR tabatha.can_manage_profile(org_id, profile_id)
  );

DROP POLICY IF EXISTS "Managers write requirements" ON tabatha.work_requirements;
CREATE POLICY "Managers write requirements" ON tabatha.work_requirements
  FOR ALL USING (tabatha.can_manage_profile(org_id, profile_id))
  WITH CHECK (tabatha.can_manage_profile(org_id, profile_id));

-- work_schedule_slots: member reads own; managers read/write their scope.
-- Members do NOT write slots directly — they file schedule_change_requests.
DROP POLICY IF EXISTS "Members read own schedule slots" ON tabatha.work_schedule_slots;
CREATE POLICY "Members read own schedule slots" ON tabatha.work_schedule_slots
  FOR SELECT USING (
    profile_id = tabatha.current_profile_id()
    OR tabatha.can_manage_profile(org_id, profile_id)
  );

DROP POLICY IF EXISTS "Managers write schedule slots" ON tabatha.work_schedule_slots;
CREATE POLICY "Managers write schedule slots" ON tabatha.work_schedule_slots
  FOR ALL USING (tabatha.can_manage_profile(org_id, profile_id))
  WITH CHECK (tabatha.can_manage_profile(org_id, profile_id));

-- schedule_change_requests: members INSERT + read their own; the manager
-- scope reads all in-scope rows. Status decisions (UPDATE) are ONLY the
-- manager scope — the decide_change_request RPC is the intended path.
DROP POLICY IF EXISTS "Members read own change requests" ON tabatha.schedule_change_requests;
CREATE POLICY "Members read own change requests" ON tabatha.schedule_change_requests
  FOR SELECT USING (
    profile_id = tabatha.current_profile_id()
    OR requested_by = tabatha.current_profile_id()
    OR tabatha.can_manage_profile(org_id, profile_id)
  );

DROP POLICY IF EXISTS "Members file own change requests" ON tabatha.schedule_change_requests;
CREATE POLICY "Members file own change requests" ON tabatha.schedule_change_requests
  FOR INSERT WITH CHECK (
    requested_by = tabatha.current_profile_id()
    AND (
      profile_id = tabatha.current_profile_id()
      OR tabatha.can_manage_profile(org_id, profile_id)
    )
    AND status = 'pending'
    AND decided_by IS NULL
    AND decided_at IS NULL
  );

DROP POLICY IF EXISTS "Managers decide change requests" ON tabatha.schedule_change_requests;
CREATE POLICY "Managers decide change requests" ON tabatha.schedule_change_requests
  FOR UPDATE USING (tabatha.can_manage_profile(org_id, profile_id))
  WITH CHECK (tabatha.can_manage_profile(org_id, profile_id));

-- shortfall_ledger: member inserts/reads/resolves their OWN rows (the
-- prompt flow is client-side); manager scope reads + writes for oversight.
DROP POLICY IF EXISTS "Members read own shortfalls" ON tabatha.shortfall_ledger;
CREATE POLICY "Members read own shortfalls" ON tabatha.shortfall_ledger
  FOR SELECT USING (
    profile_id = tabatha.current_profile_id()
    OR tabatha.can_manage_profile(org_id, profile_id)
  );

DROP POLICY IF EXISTS "Members log own shortfalls" ON tabatha.shortfall_ledger;
CREATE POLICY "Members log own shortfalls" ON tabatha.shortfall_ledger
  FOR INSERT WITH CHECK (
    profile_id = tabatha.current_profile_id()
    OR tabatha.can_manage_profile(org_id, profile_id)
  );

DROP POLICY IF EXISTS "Members resolve own shortfalls" ON tabatha.shortfall_ledger;
CREATE POLICY "Members resolve own shortfalls" ON tabatha.shortfall_ledger
  FOR UPDATE USING (
    profile_id = tabatha.current_profile_id()
    OR tabatha.can_manage_profile(org_id, profile_id)
  )
  WITH CHECK (
    profile_id = tabatha.current_profile_id()
    OR tabatha.can_manage_profile(org_id, profile_id)
  );

-- ────────────────────────────────────────────────────────────
-- (6) RPC — set_member_schedule
--     Replaces a member's weekly slot set atomically. Manager-scope gated
--     (can_manage_profile). Validates every slot before touching rows.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tabatha.set_member_schedule(
  p_org_id uuid,
  p_profile_id uuid,
  p_slots jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid;
  v_slot jsonb;
  v_weekday int;
  v_start int;
  v_end int;
  v_count int := 0;
BEGIN
  v_caller := tabatha.current_profile_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT tabatha.can_manage_profile(p_org_id, p_profile_id) THEN
    RAISE EXCEPTION 'Not authorized to manage this member''s schedule';
  END IF;
  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' THEN
    RAISE EXCEPTION 'p_slots must be a JSON array';
  END IF;

  -- Validate first (all-or-nothing).
  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
    v_weekday := (v_slot->>'weekday')::int;
    v_start := (v_slot->>'start_minute')::int;
    v_end := (v_slot->>'end_minute')::int;
    IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6 THEN
      RAISE EXCEPTION 'Invalid weekday: %', v_slot->>'weekday';
    END IF;
    IF v_start IS NULL OR v_start < 0 OR v_start > 1439
       OR v_end IS NULL OR v_end < 1 OR v_end > 1440
       OR v_end <= v_start THEN
      RAISE EXCEPTION 'Invalid slot minutes: % - %', v_slot->>'start_minute', v_slot->>'end_minute';
    END IF;
  END LOOP;

  DELETE FROM tabatha.work_schedule_slots
  WHERE org_id = p_org_id AND profile_id = p_profile_id;

  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
    INSERT INTO tabatha.work_schedule_slots
      (org_id, profile_id, weekday, start_minute, end_minute, set_by, updated_at)
    VALUES (
      p_org_id, p_profile_id,
      (v_slot->>'weekday')::int,
      (v_slot->>'start_minute')::int,
      (v_slot->>'end_minute')::int,
      v_caller, now()
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'slots', v_count);
END;
$$;

REVOKE ALL ON FUNCTION tabatha.set_member_schedule(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tabatha.set_member_schedule(uuid, uuid, jsonb) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- (7) RPC — set_work_requirements
--     Upserts the member's cadence floors. For each entry
--     { cadence, min_minutes } the currently-open row for that cadence is
--     closed (effective_to = yesterday) and, when min_minutes is not null,
--     a new open row is inserted. min_minutes: null clears the cadence.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tabatha.set_work_requirements(
  p_org_id uuid,
  p_profile_id uuid,
  p_requirements jsonb,
  p_team_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid;
  v_req jsonb;
  v_cadence text;
  v_min int;
  v_set int := 0;
  v_cleared int := 0;
BEGIN
  v_caller := tabatha.current_profile_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT tabatha.can_manage_profile(p_org_id, p_profile_id) THEN
    RAISE EXCEPTION 'Not authorized to set this member''s requirements';
  END IF;
  IF p_requirements IS NULL OR jsonb_typeof(p_requirements) <> 'array' THEN
    RAISE EXCEPTION 'p_requirements must be a JSON array';
  END IF;

  FOR v_req IN SELECT * FROM jsonb_array_elements(p_requirements) LOOP
    v_cadence := v_req->>'cadence';
    IF v_cadence IS NULL OR v_cadence NOT IN ('daily', 'weekly', 'monthly') THEN
      RAISE EXCEPTION 'Invalid cadence: %', v_cadence;
    END IF;
    IF v_req->>'min_minutes' IS NULL OR jsonb_typeof(v_req->'min_minutes') = 'null' THEN
      v_min := NULL;
    ELSE
      v_min := (v_req->>'min_minutes')::int;
      IF v_min < 0 THEN
        RAISE EXCEPTION 'min_minutes must be >= 0, got %', v_min;
      END IF;
    END IF;

    -- Close the currently-open floor for this cadence (history preserved).
    UPDATE tabatha.work_requirements
    SET effective_to = GREATEST(effective_from, CURRENT_DATE - 1),
        updated_at = now()
    WHERE org_id = p_org_id
      AND profile_id = p_profile_id
      AND cadence = v_cadence
      AND effective_to IS NULL;

    IF v_min IS NULL THEN
      v_cleared := v_cleared + 1;
    ELSE
      INSERT INTO tabatha.work_requirements
        (org_id, team_id, profile_id, cadence, min_minutes, effective_from, created_by, updated_at)
      VALUES (p_org_id, p_team_id, p_profile_id, v_cadence, v_min, CURRENT_DATE, v_caller, now());
      v_set := v_set + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'set', v_set, 'cleared', v_cleared);
END;
$$;

REVOKE ALL ON FUNCTION tabatha.set_work_requirements(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tabatha.set_work_requirements(uuid, uuid, jsonb, uuid) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- (8) RPC — set_member_work_profile
--     Sets org_members.work_profile_type. RPC (not raw UPDATE) so members
--     can never self-escalate/change their own accountability model and
--     the value set is validated server-side.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tabatha.set_member_work_profile(
  p_org_id uuid,
  p_profile_id uuid,
  p_type text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid;
  v_updated int;
BEGIN
  v_caller := tabatha.current_profile_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT tabatha.can_manage_profile(p_org_id, p_profile_id) THEN
    RAISE EXCEPTION 'Not authorized to set this member''s work profile';
  END IF;
  IF p_type IS NULL OR p_type NOT IN ('dedicated_hours', 'self_managed') THEN
    RAISE EXCEPTION 'Invalid work_profile_type: %', p_type;
  END IF;

  UPDATE tabatha.org_members
  SET work_profile_type = p_type
  WHERE org_id = p_org_id AND profile_id = p_profile_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'No membership found for that org/profile';
  END IF;

  RETURN jsonb_build_object('ok', true, 'work_profile_type', p_type);
END;
$$;

REVOKE ALL ON FUNCTION tabatha.set_member_work_profile(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tabatha.set_member_work_profile(uuid, uuid, text) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- (9) RPC — decide_change_request
--     Manager-scope approval/rejection, atomic. On approve:
--       • kind 'slot_change' → applies payload.slots to work_schedule_slots
--         (same validation as set_member_schedule).
--       • kind 'shift_hours' / 'make_up' → records the decision; if the
--         payload references a shortfall_ledger row, its resolution is
--         stamped 'shifted' / 'made_up' respectively (the accounting).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tabatha.decide_change_request(
  p_request_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_caller uuid;
  v_req tabatha.schedule_change_requests%ROWTYPE;
  v_slot jsonb;
  v_weekday int;
  v_start int;
  v_end int;
  v_ledger_id uuid;
BEGIN
  v_caller := tabatha.current_profile_id();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  SELECT * INTO v_req
  FROM tabatha.schedule_change_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Change request not found';
  END IF;
  IF NOT tabatha.can_manage_profile(v_req.org_id, v_req.profile_id) THEN
    RAISE EXCEPTION 'Not authorized to decide this request';
  END IF;
  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'Request already decided (%)', v_req.status;
  END IF;

  UPDATE tabatha.schedule_change_requests
  SET status = p_decision,
      decided_by = v_caller,
      decided_at = now(),
      updated_at = now()
  WHERE id = p_request_id;

  IF p_decision = 'approved' THEN
    IF v_req.kind = 'slot_change'
       AND jsonb_typeof(v_req.payload->'slots') = 'array' THEN
      -- Validate then replace the member's slots (mirrors set_member_schedule).
      FOR v_slot IN SELECT * FROM jsonb_array_elements(v_req.payload->'slots') LOOP
        v_weekday := (v_slot->>'weekday')::int;
        v_start := (v_slot->>'start_minute')::int;
        v_end := (v_slot->>'end_minute')::int;
        IF v_weekday IS NULL OR v_weekday < 0 OR v_weekday > 6
           OR v_start IS NULL OR v_start < 0 OR v_start > 1439
           OR v_end IS NULL OR v_end < 1 OR v_end > 1440
           OR v_end <= v_start THEN
          RAISE EXCEPTION 'Request payload contains an invalid slot: %', v_slot;
        END IF;
      END LOOP;

      DELETE FROM tabatha.work_schedule_slots
      WHERE org_id = v_req.org_id AND profile_id = v_req.profile_id;

      FOR v_slot IN SELECT * FROM jsonb_array_elements(v_req.payload->'slots') LOOP
        INSERT INTO tabatha.work_schedule_slots
          (org_id, profile_id, weekday, start_minute, end_minute, set_by, updated_at)
        VALUES (
          v_req.org_id, v_req.profile_id,
          (v_slot->>'weekday')::int,
          (v_slot->>'start_minute')::int,
          (v_slot->>'end_minute')::int,
          v_caller, now()
        );
      END LOOP;
    ELSIF v_req.kind IN ('shift_hours', 'make_up') THEN
      -- Stamp the referenced shortfall (if any) as accounted-for.
      v_ledger_id := NULLIF(v_req.payload->>'shortfall_ledger_id', '')::uuid;
      IF v_ledger_id IS NOT NULL THEN
        UPDATE tabatha.shortfall_ledger
        SET resolution = CASE v_req.kind WHEN 'shift_hours' THEN 'shifted' ELSE 'made_up' END,
            reason = COALESCE(v_req.reason, reason),
            resolved_at = now(),
            updated_at = now()
        WHERE id = v_ledger_id
          AND org_id = v_req.org_id
          AND profile_id = v_req.profile_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', p_decision, 'kind', v_req.kind);
END;
$$;

REVOKE ALL ON FUNCTION tabatha.decide_change_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION tabatha.decide_change_request(uuid, text) TO authenticated;
