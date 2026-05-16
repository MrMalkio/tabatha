-- ============================================================
-- Tabatha Migration 006 — Grant tabatha schema perms to API roles
-- ============================================================
-- The application code queries Tabatha tables via `supabase.schema('tabatha').from(...)`
-- After v4.0.0 regression we found two distinct PostgREST errors blocking sync:
--
--   PGRST106 "Invalid schema: tabatha"      — schema not in PostgREST exposed list
--   42501   "permission denied for schema"   — schema exposed but anon/authenticated
--                                              lack USAGE
--
-- The first is fixed by adding `tabatha` to `[api].schemas` in supabase/config.toml
-- and running `supabase config push` (PostgREST configuration, not a SQL change).
--
-- The second — what this migration does — is the per-role grant: anon, authenticated,
-- and service_role need USAGE on the schema plus SELECT/INSERT/UPDATE/DELETE on
-- tables. RLS is already enabled on every tabatha table (migration 001 §RLS), so
-- the grants only open the API door; per-table policies still gate row visibility.
--
-- Safe to re-run — every statement is idempotent.
-- ============================================================

GRANT USAGE ON SCHEMA tabatha TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA tabatha TO anon, authenticated, service_role;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA tabatha TO anon, authenticated, service_role;
GRANT EXECUTE                        ON ALL FUNCTIONS IN SCHEMA tabatha TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA tabatha GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tabatha GRANT USAGE, SELECT                  ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA tabatha GRANT EXECUTE                        ON FUNCTIONS TO anon, authenticated, service_role;
