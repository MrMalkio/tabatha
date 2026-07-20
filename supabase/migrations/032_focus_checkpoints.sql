-- ============================================================
-- Tabatha Migration 032 — Focus checkpoint notes (Sidecar)
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- The extension keeps checkpoint notes inside the local focus object and does
-- NOT sync them, so the Sidecar can't read/write desktop checkpoints. This
-- table gives checkpoint notes a synced home keyed by the focus's client_id
-- (the same id used in focus_items.client_id), so the Sidecar can add + show a
-- checkpoint timeline. The extension can adopt this table later for full
-- round-trip. Additive only; owner-RLS.
-- ============================================================

CREATE TABLE IF NOT EXISTS tabatha.focus_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  focus_client_id TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  progress_level TEXT NOT NULL DEFAULT 'none'
    CHECK (progress_level IN ('none','little','lot','almost_done','stuck')),
  source TEXT NOT NULL DEFAULT 'sidecar',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_focus_checkpoints_lookup
  ON tabatha.focus_checkpoints(profile_id, focus_client_id, created_at DESC);

ALTER TABLE tabatha.focus_checkpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own checkpoints" ON tabatha.focus_checkpoints;
CREATE POLICY "Users manage own checkpoints"
  ON tabatha.focus_checkpoints
  FOR ALL
  USING (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()))
  WITH CHECK (profile_id IN (SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON tabatha.focus_checkpoints TO authenticated;
