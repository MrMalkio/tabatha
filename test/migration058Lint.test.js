// Security fix wave (2026-07-21 audit, NOW #2) — migration-lint guard for
// 058_browser_profiles_lifecycle_guard.sql (same file-inspection style as
// test/migration027Lint.test.js: no Postgres under `node --test`, so this
// asserts the SQL text carries the required shape).
//
// This migration was ALSO functionally exercised against a real local
// Postgres (via `supabase start`'s throwaway Docker stack, never the live
// linked project) during development: same-session revoked_at clear
// rejected, different-session clear allowed, no-session-id claim rejected,
// service_role allowed unconditionally, `paused` toggling free, unrelated
// column updates (e.g. last_seen_at) free — all six matched the expected
// behavior. That run is not reproducible from `node --test` (no Docker
// dependency in this repo's test suite), so this file is the durable,
// CI-checkable half of the verification; the functional run is recorded in
// the migration's own header comment and the dispatching task's report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(
  new URL('../supabase/migrations/058_browser_profiles_lifecycle_guard.sql', import.meta.url)
);
const sql = await readFile(migrationPath, 'utf8');

test('058 declares itself NOT APPLIED to the live database', () => {
  assert.match(sql, /NOT APPLIED/, 'migration must flag itself as unapplied for the placeholder+repair protocol');
});

test('058 defines the guard trigger function, SECURITY DEFINER, empty search_path', () => {
  assert.match(sql, /CREATE OR REPLACE FUNCTION tabatha\.guard_browser_profiles_revoke\(\)/);
  assert.match(sql, /RETURNS TRIGGER/);
  assert.match(sql, /SECURITY DEFINER/);
  assert.match(sql, /SET search_path = ''/, 'must run under an empty search_path (fully-qualified refs only)');
});

test('058 only fully-qualifies auth.* calls (compatible with empty search_path)', () => {
  assert.match(sql, /auth\.role\(\)/);
  assert.match(sql, /auth\.jwt\(\)\s*->>\s*'session_id'/);
});

test('058 bypasses the guard unconditionally for service_role', () => {
  const m = sql.match(/CREATE OR REPLACE FUNCTION tabatha\.guard_browser_profiles_revoke[\s\S]*?\$\$;/);
  assert.ok(m, 'could not isolate the trigger function body');
  assert.match(m[0], /jwt_role\s*=\s*'service_role'\s*THEN\s*\n\s*RETURN NEW;/,
    'service_role must short-circuit to RETURN NEW before the revoked_at check');
});

test('058 guards ONLY the revoked_at non-null -> null transition', () => {
  assert.match(sql, /OLD\.revoked_at IS NOT NULL AND NEW\.revoked_at IS NULL/,
    'guard condition must be the exact clear-transition, not a broader check');
});

test('058 mirrors syncService.js reclaimAllowed(): reject unless a DIFFERENT known session', () => {
  const m = sql.match(/CREATE OR REPLACE FUNCTION tabatha\.guard_browser_profiles_revoke[\s\S]*?\$\$;/);
  const body = m[0];
  assert.match(body, /jwt_session_id IS NULL/, 'must reject when there is no current session id claim');
  assert.match(body, /OLD\.auth_session_id IS NULL/, 'must reject legacy rows with no stamped session id (conservative, matches app-code default)');
  assert.match(body, /OLD\.auth_session_id::text = jwt_session_id/, 'must reject when the current session is the SAME one that was revoked');
  assert.match(body, /RAISE EXCEPTION/, 'must hard-reject (raise), not silently no-op, on an unauthorized clear attempt');
});

test('058 does NOT reference or gate on the `paused` column (soft flag stays free by design)', () => {
  const m = sql.match(/CREATE OR REPLACE FUNCTION tabatha\.guard_browser_profiles_revoke[\s\S]*?\$\$;/);
  assert.doesNotMatch(m[0], /\bpaused\b/i, 'the trigger body must never gate on paused');
});

test('058 revokes EXECUTE from PUBLIC/anon/authenticated (trigger-only function)', () => {
  assert.match(sql, /REVOKE ALL ON FUNCTION tabatha\.guard_browser_profiles_revoke\(\) FROM PUBLIC, anon, authenticated/);
});

test('058 wires the trigger idempotently (DROP IF EXISTS before CREATE, BEFORE UPDATE FOR EACH ROW)', () => {
  assert.match(sql, /DROP TRIGGER IF EXISTS trg_browser_profiles_revoke_guard ON tabatha\.browser_profiles/);
  assert.match(sql, /CREATE TRIGGER trg_browser_profiles_revoke_guard\s*\n\s*BEFORE UPDATE ON tabatha\.browser_profiles\s*\n\s*FOR EACH ROW/);
  assert.match(sql, /EXECUTE FUNCTION tabatha\.guard_browser_profiles_revoke\(\)/);
});

test('058 does not touch INSERT (guard is UPDATE-only, matching "clear" being an update-only transition)', () => {
  assert.doesNotMatch(sql, /BEFORE INSERT/);
  assert.doesNotMatch(sql, /AFTER INSERT/);
});
