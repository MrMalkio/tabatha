-- ============================================================
-- Tabatha Migration 019 — Owner read views (Workstream D3)
-- ============================================================
-- Day-one owner visibility into team time + context WITHOUT building a
-- dashboard or relaxing RLS. RLS stays own-rows-only for authenticated
-- users; the owner reads aggregated team data via the SERVICE ROLE
-- (Supabase dashboard / table editor / service-role key), which bypasses RLS.
--
-- These views are therefore granted to `service_role` ONLY — never to
-- `authenticated` or `anon`. An ordinary signed-in extension user gains no
-- cross-member visibility from this migration.
--
-- CREATE OR REPLACE for idempotency (matches migrations 012/018).
-- ============================================================

-- ── v_owner_clock_daily ─────────────────────────────────────
-- Clock time per profile per day, joined to the profile for a friendly name.
CREATE OR REPLACE VIEW tabatha.v_owner_clock_daily AS
SELECT
  cs.profile_id,
  p.display_name,
  p.email,
  cs.org_id,
  cs.team_id,
  (cs.clocked_in_at AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date AS day,
  COUNT(*)                         AS sessions,
  COALESCE(SUM(cs.total_ms), 0)    AS total_ms,
  COALESCE(SUM(cs.work_ms), 0)     AS work_ms,
  COALESCE(SUM(cs.break_ms), 0)    AS break_ms
FROM tabatha.clock_sessions cs
JOIN tabatha.profiles p ON p.id = cs.profile_id
GROUP BY
  cs.profile_id, p.display_name, p.email, cs.org_id, cs.team_id,
  (cs.clocked_in_at AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date;

COMMENT ON VIEW tabatha.v_owner_clock_daily IS
  'Owner read view: clock time per profile/day. Owner reads via service role / table editor; not client-exposed.';

-- ── v_owner_desktop_daily ───────────────────────────────────
-- Desktop activity per profile per day per category.
CREATE OR REPLACE VIEW tabatha.v_owner_desktop_daily AS
SELECT
  da.profile_id,
  p.display_name,
  p.email,
  da.org_id,
  da.team_id,
  (COALESCE(da.started_at, da.timestamp, da.synced_at)
     AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date AS day,
  COALESCE(da.category, 'unknown') AS category,
  COUNT(*)                          AS events,
  COALESCE(SUM(da.duration_ms), 0)  AS duration_ms
FROM tabatha.desktop_activity da
JOIN tabatha.profiles p ON p.id = da.profile_id
GROUP BY
  da.profile_id, p.display_name, p.email, da.org_id, da.team_id,
  (COALESCE(da.started_at, da.timestamp, da.synced_at)
     AT TIME ZONE COALESCE(p.timezone, 'America/New_York'))::date,
  COALESCE(da.category, 'unknown');

COMMENT ON VIEW tabatha.v_owner_desktop_daily IS
  'Owner read view: desktop activity per profile/day/category. Owner reads via service role / table editor; not client-exposed.';

-- ── v_owner_intent_recent ───────────────────────────────────
-- Recent browser intents (last 14 days), newest first.
CREATE OR REPLACE VIEW tabatha.v_owner_intent_recent AS
SELECT
  ih.profile_id,
  p.display_name,
  p.email,
  ih.action,
  ih.context,
  ih.focus_id,
  ih.url,
  ih.domain,
  ih.timestamp
FROM tabatha.intent_history ih
JOIN tabatha.profiles p ON p.id = ih.profile_id
WHERE ih.timestamp >= now() - INTERVAL '14 days'
ORDER BY ih.timestamp DESC;

COMMENT ON VIEW tabatha.v_owner_intent_recent IS
  'Owner read view: browser intents from the last 14 days. Owner reads via service role / table editor; not client-exposed.';

-- ── Grants: service_role ONLY ───────────────────────────────
-- Explicitly REVOKE from public/authenticated/anon so these never leak to
-- ordinary signed-in users, then grant SELECT to service_role only.
REVOKE ALL ON tabatha.v_owner_clock_daily   FROM PUBLIC, authenticated, anon;
REVOKE ALL ON tabatha.v_owner_desktop_daily FROM PUBLIC, authenticated, anon;
REVOKE ALL ON tabatha.v_owner_intent_recent FROM PUBLIC, authenticated, anon;

GRANT SELECT ON tabatha.v_owner_clock_daily   TO service_role;
GRANT SELECT ON tabatha.v_owner_desktop_daily TO service_role;
GRANT SELECT ON tabatha.v_owner_intent_recent TO service_role;
