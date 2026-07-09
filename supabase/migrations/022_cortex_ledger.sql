-- ============================================================
-- Tabatha Migration 022 — Cortex Observations Ledger (Plan 040 Phase 1)
-- ============================================================
-- Cortex (the AI observation & optimization layer) records a normalized stream
-- of "observations" (window/tab/app/focus/intent context + capture references)
-- and, separately, references to captured frames. Phase 1 is LOCAL-FIRST: the
-- ledger lives in chrome.storage.local (`cortexLedger`) and only syncs to these
-- tables as a cloud-BATCH BACKUP when the user opts in. Raw pixels never land
-- here — only derived observations + capture metadata (path/redaction state).
--
-- Partitioning: every row is 'personal' or 'org'. Org rows exist only for time
-- captured while clocked in and are governed by org retention; personal rows
-- never surface to the org. Mirrors the profile/org/team + RLS shape used by
-- migration 014 (calendar). NOT YET APPLIED — staged for the Phase 1 cloud-batch
-- increment (T4). Nullable columns + IF NOT EXISTS keep it additive.
-- ============================================================

CREATE TABLE IF NOT EXISTS tabatha.cortex_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL,
  team_id UUID REFERENCES tabatha.teams(id) ON DELETE SET NULL,
  browser_profile_id UUID,                       -- which install produced it (see migration 017)
  partition TEXT NOT NULL DEFAULT 'personal'
    CHECK (partition IN ('personal', 'org')),
  observed_at TIMESTAMPTZ NOT NULL,              -- the observation's own timestamp (rec.ts)
  kind TEXT,                                     -- 'capture' | 'context' | 'signal'
  surface TEXT,                                  -- 'browser' | 'os'
  app TEXT,
  host TEXT,
  title TEXT,
  category TEXT,
  focus_id TEXT,
  intent_id TEXT,
  capture_ref UUID,                              -- → cortex_capture_refs.id (nullable)
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tabatha.cortex_capture_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  org_id UUID REFERENCES tabatha.organizations(id) ON DELETE SET NULL,
  browser_profile_id UUID,
  partition TEXT NOT NULL DEFAULT 'personal'
    CHECK (partition IN ('personal', 'org')),
  captured_at TIMESTAMPTZ NOT NULL,
  surface TEXT,                                  -- 'browser' | 'os'
  screen_index INTEGER,                          -- multi-monitor: which screen (null = full/virtual)
  storage_uri TEXT,                              -- local path or external archive URI (never a pixel blob)
  redacted BOOLEAN NOT NULL DEFAULT false,
  redactions JSONB,                              -- applied redaction regions (C2)
  suppressed BOOLEAN NOT NULL DEFAULT false,     -- true = frame skipped by the Sensitive-Data Guard
  bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tabatha.cortex_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE tabatha.cortex_capture_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cortex observations" ON tabatha.cortex_observations
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE POLICY "Users manage own cortex capture refs" ON tabatha.cortex_capture_refs
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_cortex_obs_profile ON tabatha.cortex_observations(profile_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_cortex_obs_partition ON tabatha.cortex_observations(profile_id, partition, observed_at);
CREATE INDEX IF NOT EXISTS idx_cortex_caps_profile ON tabatha.cortex_capture_refs(profile_id, captured_at);
