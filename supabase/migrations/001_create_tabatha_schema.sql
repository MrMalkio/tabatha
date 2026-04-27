-- ============================================================
-- Tabatha Schema — Supabase Migration
-- Project: mtdgoahskcibjbhfvofx
-- Purpose: Core schema for Tabatha Attention OS backend
-- Run this in Supabase SQL Editor after unpausing the project
-- ============================================================

-- Create the tabatha schema namespace
CREATE SCHEMA IF NOT EXISTS tabatha;

-- ════════════════════════════════════════════
-- USERS & PROFILES
-- ════════════════════════════════════════════

-- Links Supabase auth users to Tabatha profiles
CREATE TABLE tabatha.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  email TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'manager', 'admin', 'owner')),
  default_realm TEXT NOT NULL DEFAULT 'professional' CHECK (default_realm IN ('business', 'professional', 'work', 'personal')),
  timezone TEXT DEFAULT 'America/New_York',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(auth_user_id)
);

-- ════════════════════════════════════════════
-- ORGANIZATIONS (for team mode)
-- ════════════════════════════════════════════

CREATE TABLE tabatha.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  owner_id UUID REFERENCES tabatha.profiles(id),
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tabatha.org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES tabatha.organizations(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'manager', 'admin')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, profile_id)
);

-- ════════════════════════════════════════════
-- FOCUS & INTENT DATA
-- ════════════════════════════════════════════

-- Synced focus items (from chrome.storage.local → Supabase)
CREATE TABLE tabatha.focus_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,           -- matches the local focus ID
  label TEXT NOT NULL,
  funnel_stage TEXT NOT NULL DEFAULT 'unsorted' CHECK (funnel_stage IN ('unsorted', 'todo', 'focus', 'addressing', 'resolved', 'roadblocked')),
  focus_state TEXT DEFAULT 'paused' CHECK (focus_state IN ('active', 'paused', 'drifted', 'completed')),
  timer_minutes INTEGER DEFAULT 15,
  tags JSONB DEFAULT '{}',           -- { realm, client, project, task }
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, client_id)
);

-- Intent history (rolling buffer synced from local)
CREATE TABLE tabatha.intent_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  action TEXT NOT NULL,              -- continue, side_quest, sugar_box, park, later, nevermind, skip_domain, inherit
  context TEXT,
  focus_id TEXT,
  url TEXT,
  domain TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════
-- TIME TRACKING
-- ════════════════════════════════════════════

-- Daily time summaries (aggregated per tab/category/intent)
CREATE TABLE tabatha.time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  realm TEXT DEFAULT 'professional',
  category TEXT,                     -- work, learning, entertainment, media, etc.
  intent_label TEXT,                 -- the focus/intent this time was under
  domain TEXT,                       -- e.g. github.com
  duration_ms BIGINT NOT NULL DEFAULT 0,
  tab_count INTEGER DEFAULT 1,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent duplicate daily entries
CREATE UNIQUE INDEX idx_time_entry_dedup 
  ON tabatha.time_entries(profile_id, date, category, intent_label, domain);

-- ════════════════════════════════════════════
-- TASK PLATFORM LINKS (Asana, ClickUp)
-- ════════════════════════════════════════════

CREATE TABLE tabatha.task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('asana', 'clickup')),
  external_id TEXT NOT NULL,         -- task GID / ID from the platform
  external_url TEXT,
  project_name TEXT,
  task_name TEXT,
  total_time_ms BIGINT DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profile_id, platform, external_id)
);

-- ════════════════════════════════════════════
-- BROWSER PROFILES (for multi-profile tracking)
-- ════════════════════════════════════════════

CREATE TABLE tabatha.browser_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  browser TEXT NOT NULL DEFAULT 'chrome',
  profile_name TEXT,                 -- Chrome profile name
  profile_path TEXT,                 -- Local profile directory path
  classification TEXT DEFAULT 'professional' CHECK (classification IN ('business', 'professional', 'work', 'personal')),
  extension_installed BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ════════════════════════════════════════════

ALTER TABLE tabatha.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.focus_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.intent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.task_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.browser_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users see own profile" ON tabatha.profiles
  FOR ALL USING (auth_user_id = auth.uid());

CREATE POLICY "Users see own focus" ON tabatha.focus_items
  FOR ALL USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users see own intents" ON tabatha.intent_history
  FOR ALL USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users see own time" ON tabatha.time_entries
  FOR ALL USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users see own task links" ON tabatha.task_links
  FOR ALL USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users see own browser profiles" ON tabatha.browser_profiles
  FOR ALL USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

-- Org members can see org data
CREATE POLICY "Members see own org" ON tabatha.organizations
  FOR SELECT USING (id IN (SELECT org_id FROM tabatha.org_members WHERE profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())));

CREATE POLICY "Members see org roster" ON tabatha.org_members
  FOR SELECT USING (org_id IN (SELECT org_id FROM tabatha.org_members WHERE profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())));

-- Managers/admins can see team time entries (professional/work only)
CREATE POLICY "Managers see team time" ON tabatha.time_entries
  FOR SELECT USING (
    profile_id IN (
      SELECT om2.profile_id FROM tabatha.org_members om1
      JOIN tabatha.org_members om2 ON om1.org_id = om2.org_id
      WHERE om1.profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid())
        AND om1.role IN ('manager', 'admin')
    )
    AND realm IN ('professional', 'work', 'business')
  );

-- ════════════════════════════════════════════
-- FUNCTIONS
-- ════════════════════════════════════════════

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION tabatha.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON tabatha.profiles
  FOR EACH ROW EXECUTE FUNCTION tabatha.update_updated_at();

-- ════════════════════════════════════════════
-- INDEXES
-- ════════════════════════════════════════════

CREATE INDEX idx_focus_items_profile ON tabatha.focus_items(profile_id);
CREATE INDEX idx_intent_history_profile_ts ON tabatha.intent_history(profile_id, timestamp DESC);
CREATE INDEX idx_time_entries_profile_date ON tabatha.time_entries(profile_id, date DESC);
CREATE INDEX idx_task_links_profile ON tabatha.task_links(profile_id);
CREATE INDEX idx_org_members_org ON tabatha.org_members(org_id);
CREATE INDEX idx_org_members_profile ON tabatha.org_members(profile_id);
