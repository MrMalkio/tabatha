-- ============================================================
-- Tabatha Migration 058 — State-aware guard on browser_profiles.revoked_at
-- ============================================================
-- NUMBERING: 058 is the next unreserved migration number in this worktree
-- (highest present here is 045). Per this fix's dispatch brief, 051-057 are
-- reserved for Plans 043-045's in-flight work elsewhere in the fleet and are
-- deliberately skipped rather than reused — this migration does not depend on
-- and must not assume any of 046-057 exist.
--
-- SECURITY FINDING (2026-07-21 audit, NOW #2 — Koda, re-verified against
-- Rook #13 / root cause of #11 and #12):
--   The 6.7.54 "session-aware reclaim" fix (see src/background/services/
--   syncService.js, ensureBrowserProfileRow ~L152-274) added an APPLICATION-
--   CODE check before the extension will clear revoked_at back to NULL:
--     reclaimAllowed(row) = row.revoked_at IS NOT NULL
--                       AND currentSessionId() IS NOT NULL
--                       AND row.auth_session_id IS NOT NULL
--                       AND row.auth_session_id <> currentSessionId()
--   i.e. "only a DIFFERENT GoTrue session than the one that got revoked may
--   un-revoke this row." That closes the bug for the extension's own normal
--   sync code path, but migration 016's write RLS on browser_profiles is a
--   bare same-profile check with no session-identity awareness:
--     FOR UPDATE USING (profile_id = current_profile_id())
--                WITH CHECK (profile_id = current_profile_id())
--   and migration 045 (which added revoked_at itself) explicitly left that
--   policy untouched. A revoked session's still-valid JWT hitting
--   PostgREST directly (curl, a modified client, anything that isn't this
--   extension's own guarded code path) can PATCH revoked_at back to NULL on
--   its own row with zero server-side resistance — the remote-sign-out
--   guarantee the Devices panel advertises doesn't actually hold at the data
--   layer, only in the one client that happens to check first. Scope is
--   same-profile_id only (an attacker still can't touch a stranger's row),
--   but it defeats the specific security control this migration exists to
--   restore.
--
-- FIX: a BEFORE UPDATE trigger that mirrors reclaimAllowed() server-side —
-- the one enforcement point that can't be bypassed by talking to PostgREST
-- directly. Deliberately a trigger rather than a bare RLS WITH CHECK because
-- the rule needs OLD.auth_session_id (RLS WITH CHECK only sees NEW), and a
-- trigger can raise a precise error instead of a generic policy-violation.
--
-- SCOPE — deliberately narrow:
--   * Only the revoked_at NON-NULL -> NULL transition (the "un-revoke")
--     is guarded. Setting revoked_at (NULL -> non-null, i.e. a sign-out) is
--     untouched — device-signout already goes through service_role, and nothing
--     stops a device honestly revoking itself.
--   * `paused` is explicitly NOT guarded — Malkio's 0.13.3 self-service Resume
--     (paused-screen lockout fix) depends on a device being able to flip its
--     own `paused` flag freely. Pausing/unpausing is a soft, mutually-revocable
--     convenience flag by design, not a security boundary; only revoked_at is.
--   * Every other column update (last_seen_at, profile_name, device_settings,
--     etc.) is untouched, INSERTs are untouched (trigger is UPDATE-only, and a
--     fresh row's revoked_at is never non-null), and service_role (edge
--     functions, admin tooling — see supabase/functions/device-signout, which
--     is the only other writer of revoked_at in this repo) bypasses the guard
--     unconditionally, matching migration 028's existing "service_role
--     bypasses RLS" convention extended here to bypass this trigger too.
--   * Legacy rows with no stamped auth_session_id (pre-6.7.54 rows that
--     haven't synced since) CANNOT reclaim via this path either — same
--     conservative "no session id on file -> never auto-reclaim" stance the
--     app-code rule already takes, so this migration never regresses a row
--     from "can reclaim" to "can't" relative to today's app behavior.
--
-- NOT APPLIED — this migration has NOT been run against the live database.
-- Validated by: manual review against the actual reclaimAllowed() logic in
-- syncService.js (line numbers above), the 016/045/028 migrations it builds
-- on, every writer of revoked_at in the repo (device-signout edge function,
-- syncService.js — grepped, no other writer exists), and psql syntax review.
-- CeeCee/whoever owns Supabase migrations this cycle: apply via the normal
-- placeholder + repair protocol, do not apply directly from an agent session.
--
-- IDEMPOTENT: safe to re-run (CREATE OR REPLACE FUNCTION, DROP TRIGGER IF
-- EXISTS before CREATE TRIGGER).
-- ============================================================

CREATE OR REPLACE FUNCTION tabatha.guard_browser_profiles_revoke()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  jwt_role text;
  jwt_session_id text;
BEGIN
  -- service_role (edge functions / admin tooling) bypasses this guard
  -- unconditionally — it already bypasses RLS by convention in this project
  -- (see migration 028's comment), this trigger mirrors that for consistency.
  jwt_role := coalesce(auth.role(), '');
  IF jwt_role = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Only the "clear" transition is guarded. Any other change (including
  -- setting revoked_at, or touching unrelated columns) passes straight through.
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
    -- GoTrue's `session_id` JWT claim — the same claim
    -- src/background/services/syncService.js's currentSessionId() reads
    -- client-side. auth.jwt() is Supabase's standard JWT-claims accessor
    -- (same auth schema that already backs auth.uid() in migration 015).
    jwt_session_id := auth.jwt() ->> 'session_id';

    -- Mirror of reclaimAllowed() in syncService.js: reclaim requires a
    -- KNOWN current session that DIFFERS from the session stamped on the
    -- row when it was revoked. Any of "no current session id", "row never
    -- had one stamped (legacy)", or "same session that got revoked" -> reject.
    IF jwt_session_id IS NULL
       OR OLD.auth_session_id IS NULL
       OR OLD.auth_session_id::text = jwt_session_id THEN
      RAISE EXCEPTION
        'browser_profiles.revoked_at cannot be cleared by the session that was revoked (row id=%, profile_id=%)',
        OLD.id, OLD.profile_id
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Least-privilege: this function is only ever meant to fire as a trigger
-- (Postgres already refuses a direct call to a RETURNS TRIGGER function
-- outside trigger context — "trigger functions can only be called as
-- triggers"), but migration 006's schema-wide default privileges grant
-- EXECUTE on every new tabatha function to anon/authenticated/service_role,
-- so revoke it explicitly here for defense-in-depth and to match this
-- project's SECURITY DEFINER hardening convention (see migration 027).
REVOKE ALL ON FUNCTION tabatha.guard_browser_profiles_revoke() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_browser_profiles_revoke_guard ON tabatha.browser_profiles;
CREATE TRIGGER trg_browser_profiles_revoke_guard
  BEFORE UPDATE ON tabatha.browser_profiles
  FOR EACH ROW
  EXECUTE FUNCTION tabatha.guard_browser_profiles_revoke();
