-- ============================================================
-- Tabatha Migration 030 — Sidecar Web Push subscriptions
-- Project: mtdgoahskcibjbhfvofx (schema `tabatha`)
--
-- Stores Web Push subscriptions registered by the Tabby Sidecar mobile web
-- app. The `send-focus-push` edge function reads these with the service role
-- and fans out timer-expiry / checkpoint notifications so the phone receives
-- the same modals the extension would surface.
--
-- Additive only: new table + new RLS. No existing table/RLS touched.
-- ============================================================

CREATE TABLE IF NOT EXISTS tabatha.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  ua TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ok_at TIMESTAMPTZ,
  last_error TEXT,
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile
  ON tabatha.push_subscriptions(profile_id);

ALTER TABLE tabatha.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Owner can manage only their own subscriptions.
DROP POLICY IF EXISTS "Users manage own push subs" ON tabatha.push_subscriptions;
CREATE POLICY "Users manage own push subs"
  ON tabatha.push_subscriptions
  FOR ALL
  USING (
    profile_id IN (
      SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    profile_id IN (
      SELECT id FROM tabatha.profiles WHERE auth_user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON tabatha.push_subscriptions TO authenticated;

-- Tracks which focus_items have already fired a given push kind so the cron
-- job doesn't re-notify every minute. Keyed by (focus row, kind).
CREATE TABLE IF NOT EXISTS tabatha.push_dedup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES tabatha.profiles(id) ON DELETE CASCADE,
  focus_item_id UUID NOT NULL REFERENCES tabatha.focus_items(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (focus_item_id, kind)
);

ALTER TABLE tabatha.push_dedup ENABLE ROW LEVEL SECURITY;
-- No authenticated policy: only the service role (edge fn) reads/writes this.
