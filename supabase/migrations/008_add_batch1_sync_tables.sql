-- ============================================================
-- Tabatha Migration 008 - Batch 1 durable sync tables
-- ============================================================
-- Adds push-sync targets for local data that users build over time:
-- local org registry entities, completed clock sessions, and desktop/
-- companion activity. All client_id columns map to chrome.storage.local IDs.
-- ============================================================

CREATE TABLE IF NOT EXISTS tabatha.operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL,
  operation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, operation_id)
);

CREATE TABLE IF NOT EXISTS tabatha.initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL,
  initiative_id TEXT NOT NULL,
  operation_id TEXT,
  name TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, initiative_id)
);

CREATE TABLE IF NOT EXISTS tabatha.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL,
  client_id TEXT NOT NULL,
  initiative_id TEXT,
  name TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, client_id)
);

CREATE TABLE IF NOT EXISTS tabatha.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL,
  project_id TEXT NOT NULL,
  client_id TEXT,
  name TEXT NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, project_id)
);

CREATE TABLE IF NOT EXISTS tabatha.tasks_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL,
  task_id TEXT NOT NULL,
  project_id TEXT,
  client_id TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  funnel_stage TEXT NOT NULL DEFAULT 'unsorted',
  linked_intents JSONB NOT NULL DEFAULT '[]',
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, task_id)
);

CREATE TABLE IF NOT EXISTS tabatha.clock_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL,
  client_id TEXT NOT NULL,
  clocked_in_at TIMESTAMPTZ NOT NULL,
  clocked_out_at TIMESTAMPTZ NOT NULL,
  total_ms BIGINT NOT NULL DEFAULT 0,
  break_ms BIGINT NOT NULL DEFAULT 0,
  work_ms BIGINT NOT NULL DEFAULT 0,
  breaks JSONB NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'extension',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, client_id)
);

CREATE TABLE IF NOT EXISTS tabatha.desktop_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL,
  activity_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'companion',
  kind TEXT NOT NULL DEFAULT 'session',
  app_name TEXT,
  display_name TEXT,
  window_title TEXT,
  category TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  timestamp TIMESTAMPTZ,
  duration_ms BIGINT,
  payload JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, activity_id)
);

ALTER TABLE tabatha.operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.tasks_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.clock_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.desktop_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own operations" ON tabatha.operations
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users manage own initiatives" ON tabatha.initiatives
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users manage own clients" ON tabatha.clients
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users manage own projects" ON tabatha.projects
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users manage own tasks registry" ON tabatha.tasks_registry
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users manage own clock sessions" ON tabatha.clock_sessions
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users manage own desktop activity" ON tabatha.desktop_activity
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_operations_profile ON tabatha.operations(profile_id);
CREATE INDEX IF NOT EXISTS idx_initiatives_profile ON tabatha.initiatives(profile_id);
CREATE INDEX IF NOT EXISTS idx_clients_profile ON tabatha.clients(profile_id);
CREATE INDEX IF NOT EXISTS idx_projects_profile ON tabatha.projects(profile_id);
CREATE INDEX IF NOT EXISTS idx_tasks_registry_profile ON tabatha.tasks_registry(profile_id);
CREATE INDEX IF NOT EXISTS idx_clock_sessions_profile_out ON tabatha.clock_sessions(profile_id, clocked_out_at DESC);
CREATE INDEX IF NOT EXISTS idx_desktop_activity_profile_ts ON tabatha.desktop_activity(profile_id, timestamp DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  tabatha.operations,
  tabatha.initiatives,
  tabatha.clients,
  tabatha.projects,
  tabatha.tasks_registry,
  tabatha.clock_sessions,
  tabatha.desktop_activity
TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tabatha TO anon, authenticated, service_role;
