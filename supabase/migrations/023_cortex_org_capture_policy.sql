-- ============================================================
-- Tabatha Migration 023 — Cortex Org Capture Policy (Plan 043 T4, cluster C12)
-- ============================================================
-- Org admins can REQUIRE capture-on-clock-in for team members and set the org
-- retention plan (time + space). Enforcement is client-side (the extension /
-- companion flip capture on when a mandate applies at clock-in); this table is
-- the policy source of truth. Personal-partition capture is NEVER governed
-- here — the personal/org boundary (migration 022) is untouched.
--
-- RLS mirrors the manager-scoping pattern from migration 012 (SECURITY DEFINER
-- helpers from migration 015 where applicable). NOT YET APPLIED — staged for
-- Phase 4. Additive only.
-- ============================================================

CREATE TABLE IF NOT EXISTS tabatha.org_capture_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES tabatha.organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE CASCADE,  -- null = org-wide
  capture_required BOOLEAN NOT NULL DEFAULT false,               -- mandate: capture ON while clocked in
  capture_mode TEXT NOT NULL DEFAULT 'context'
    CHECK (capture_mode IN ('context', 'frames')),               -- context-only vs full frames
  retention_max_age_days INTEGER NOT NULL DEFAULT 90,
  retention_max_bytes BIGINT,                                    -- null = no space cap
  sensitive_rules JSONB NOT NULL DEFAULT '[]'::jsonb,            -- org-level C2 rules (merged with personal)
  updated_by UUID REFERENCES tabatha.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, team_id)
);

ALTER TABLE tabatha.org_capture_policy ENABLE ROW LEVEL SECURITY;

-- Members read the policy that governs them (they must know a mandate exists).
CREATE POLICY "Members read their org capture policy" ON tabatha.org_capture_policy
  FOR SELECT
  USING (
    org_id IN (
      SELECT p.default_org_id FROM tabatha.profiles p WHERE p.auth_user_id = auth.uid()
    )
  );

-- Only org admins/managers write policy (mirrors migration 012 scoping).
CREATE POLICY "Admins manage org capture policy" ON tabatha.org_capture_policy
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tabatha.org_members m
      JOIN tabatha.profiles p ON p.id = m.profile_id
      WHERE m.org_id = org_capture_policy.org_id
        AND p.auth_user_id = auth.uid()
        AND m.role IN ('owner', 'admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tabatha.org_members m
      JOIN tabatha.profiles p ON p.id = m.profile_id
      WHERE m.org_id = org_capture_policy.org_id
        AND p.auth_user_id = auth.uid()
        AND m.role IN ('owner', 'admin', 'manager')
    )
  );

CREATE INDEX IF NOT EXISTS idx_org_capture_policy_org ON tabatha.org_capture_policy(org_id, team_id);
