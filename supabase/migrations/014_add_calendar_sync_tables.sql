-- ============================================================
-- Tabatha Migration 014 - Unified Calendar Sync tables
-- ============================================================
-- Adds push-sync targets for local unified calendar:
-- calendars and calendar_events. All client_id columns map to chrome.storage.local IDs.
-- ============================================================

CREATE TABLE IF NOT EXISTS tabatha.calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL,
  calendar_id TEXT NOT NULL, -- local storage calendar ID
  name VARCHAR(255) NOT NULL,
  color VARCHAR(7) DEFAULT '#6366f1', -- Tailwind Indigo
  provider VARCHAR(50) DEFAULT 'native', -- 'native' | 'google' | 'outlook' | 'ical'
  provider_calendar_id VARCHAR(255),
  is_writable BOOLEAN DEFAULT TRUE,
  is_visible BOOLEAN DEFAULT TRUE,
  sync_token VARCHAR(555), -- GCal/Outlook delta token
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, calendar_id)
);

CREATE TABLE IF NOT EXISTS tabatha.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL,
  calendar_id TEXT NOT NULL, -- references tabatha_calendars.calendar_id
  event_id TEXT NOT NULL, -- local storage event ID
  title VARCHAR(555) NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  is_all_day BOOLEAN DEFAULT FALSE,
  color_override VARCHAR(7),
  location TEXT,
  
  -- Recurrence (Google/iCal standard RFC 5545)
  rrule TEXT, -- RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
  exdate TEXT, -- CSV of excluded timestamps
  
  -- Tabatha Attention OS Associations
  associated_focus_id VARCHAR(255), -- Link to a Tabatha Focus item
  associated_task_id TEXT, -- local task ID mapping
  
  -- Sync Metadata
  provider_event_id VARCHAR(255), -- External event ID (Google/Outlook)
  etag VARCHAR(255), -- For optimistic concurrency locking
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id, event_id)
);

ALTER TABLE tabatha.calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own calendars" ON tabatha.calendars
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users manage own calendar events" ON tabatha.calendar_events
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_calendars_profile ON tabatha.calendars(profile_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_profile ON tabatha.calendar_events(profile_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_dates ON tabatha.calendar_events(profile_id, start_time, end_time);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  tabatha.calendars,
  tabatha.calendar_events
TO anon, authenticated, service_role;
