-- ============================================================
-- Tabatha Schema — Phase 1 Multi-Tenant Expansion
-- Migration: 002_add_team_time_tracking
-- Purpose: Teams, Invite Tokens, Granular Time Logs, User Status
-- ============================================================

-- ════════════════════════════════════════════
-- TEAMS (Sub-divisions of Organizations)
-- ════════════════════════════════════════════

CREATE TABLE tabatha.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES tabatha.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tabatha.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES tabatha.teams(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  -- Roles: owner (org level usually, but can be here), manager, sub_manager, user, read_only
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('owner', 'manager', 'sub_manager', 'user', 'read_only')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(team_id, profile_id)
);

-- Note: We will handle dropping the old org_members_role_check constraint in a custom script or assume users can be 'admin' = 'manager' for org level. 
-- For safety, we will just alter the column to add a new check, but Postgres requires finding the auto-named constraint.
-- As a workaround, we will rely on application logic or team_members for the new roles.

-- ════════════════════════════════════════════
-- INVITE TOKENS (Manager -> Staff linking)
-- ════════════════════════════════════════════

CREATE TABLE tabatha.invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  org_id UUID NOT NULL REFERENCES tabatha.organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE CASCADE, -- Optional team binding
  created_by UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user',
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  used_at TIMESTAMPTZ,
  used_by UUID REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════
-- USER STATUS (Time off, late announcements)
-- ════════════════════════════════════════════

CREATE TABLE tabatha.user_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'away', 'do_not_disturb', 'offline', 'time_off', 'late')),
  message TEXT,
  until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger for updated_at on user_status
CREATE TRIGGER user_status_updated_at
  BEFORE UPDATE ON tabatha.user_status
  FOR EACH ROW EXECUTE FUNCTION tabatha.update_updated_at();

-- ════════════════════════════════════════════
-- GRANULAR TIME LOGS (Decoupled Immutable Chunks)
-- ════════════════════════════════════════════

CREATE TABLE tabatha.time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE CASCADE,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE CASCADE,
  url TEXT,
  domain TEXT,
  intent_label TEXT,
  category TEXT,
  -- We distinguish billable time if necessary based on category in the UI
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_ms BIGINT NOT NULL,
  mode TEXT DEFAULT 'strict' CHECK (mode IN ('strict', 'subtle', 'retroactive')),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add org/team references to existing tables
ALTER TABLE tabatha.focus_items ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES tabatha.organizations(id) ON DELETE CASCADE;
ALTER TABLE tabatha.focus_items ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES tabatha.teams(id) ON DELETE CASCADE;

ALTER TABLE tabatha.intent_history ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES tabatha.organizations(id) ON DELETE CASCADE;
ALTER TABLE tabatha.intent_history ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES tabatha.teams(id) ON DELETE CASCADE;

ALTER TABLE tabatha.time_entries ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES tabatha.organizations(id) ON DELETE CASCADE;
ALTER TABLE tabatha.time_entries ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES tabatha.teams(id) ON DELETE CASCADE;

-- ════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS) FOR NEW TABLES
-- ════════════════════════════════════════════

ALTER TABLE tabatha.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.invite_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.user_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.time_logs ENABLE ROW LEVEL SECURITY;

-- TEAMS: Users can see teams in orgs they are members of
CREATE POLICY "Users see teams in their orgs" ON tabatha.teams
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM tabatha.org_members 
      WHERE profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
    )
  );

-- TEAM MEMBERS: Users can see rosters of teams in their orgs
CREATE POLICY "Users see team rosters in their orgs" ON tabatha.team_members
  FOR SELECT USING (
    team_id IN (
      SELECT id FROM tabatha.teams WHERE org_id IN (
        SELECT org_id FROM tabatha.org_members 
        WHERE profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
      )
    )
  );

-- USER STATUS: Users see own status and status of people in their orgs
CREATE POLICY "Users see status of org members" ON tabatha.user_status
  FOR SELECT USING (
    profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()) OR
    profile_id IN (
      SELECT om.profile_id FROM tabatha.org_members om
      WHERE om.org_id IN (
        SELECT org_id FROM tabatha.org_members WHERE profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
      )
    )
  );

CREATE POLICY "Users can insert/update own status" ON tabatha.user_status
  FOR ALL USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

-- TIME LOGS: Users see own time logs. Managers see logs of team members.
CREATE POLICY "Users see own time logs" ON tabatha.time_logs
  FOR SELECT USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Managers see team time logs" ON tabatha.time_logs
  FOR SELECT USING (
    team_id IN (
      SELECT team_id FROM tabatha.team_members 
      WHERE profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
      AND role IN ('owner', 'manager', 'sub_manager')
    )
  );

CREATE POLICY "Users can insert own time logs" ON tabatha.time_logs
  FOR INSERT WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

-- INVITE TOKENS: Managers can create tokens.
CREATE POLICY "Managers can manage tokens" ON tabatha.invite_tokens
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM tabatha.org_members 
      WHERE profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
      AND role IN ('owner', 'manager', 'admin')
    )
  );

-- ════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════

CREATE INDEX idx_teams_org ON tabatha.teams(org_id);
CREATE INDEX idx_team_members_team ON tabatha.team_members(team_id);
CREATE INDEX idx_team_members_profile ON tabatha.team_members(profile_id);
CREATE INDEX idx_time_logs_profile_start ON tabatha.time_logs(profile_id, start_time DESC);
CREATE INDEX idx_time_logs_team ON tabatha.time_logs(team_id);
CREATE INDEX idx_invite_tokens_token ON tabatha.invite_tokens(token);
