// NB-01/NB-02 — migration-lint guard for 027_schedule_profiles_requirements.sql
// (same file-inspection style as test/migration022Lint.test.js: no Postgres
// under `node --test`, so we assert the SQL text carries the Koda-mandated
// shape — tables + CHECKs, RLS enabled, and per-RPC hardening: SECURITY
// DEFINER, SET search_path = '', REVOKE (PUBLIC + anon) / GRANT (authenticated)).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(
  new URL('../supabase/migrations/027_schedule_profiles_requirements.sql', import.meta.url)
);
const sql = await readFile(migrationPath, 'utf8');

// ── tables ──────────────────────────────────────────────────

const TABLES = [
  'work_requirements',
  'work_schedule_slots',
  'schedule_change_requests',
  'shortfall_ledger',
];

test('027 creates the four NB-01/NB-02 tables idempotently', () => {
  for (const t of TABLES) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS tabatha\\.${t}\\b`),
      `missing CREATE TABLE IF NOT EXISTS tabatha.${t}`);
  }
});

test('027 enables RLS on every new table', () => {
  for (const t of TABLES) {
    assert.match(sql, new RegExp(`ALTER TABLE tabatha\\.${t} ENABLE ROW LEVEL SECURITY`),
      `RLS not enabled on tabatha.${t}`);
  }
});

test('027 adds work_profile_type to org_members (membership grain, per Koda)', () => {
  assert.match(sql, /ALTER TABLE tabatha\.org_members\s+ADD COLUMN IF NOT EXISTS work_profile_type/,
    'org_members.work_profile_type column add missing');
  assert.match(sql, /DEFAULT 'self_managed'/, 'work_profile_type must default to self_managed');
});

// ── CHECK constraint domains (the binding enum sets) ────────

function checkList(re, label) {
  const m = sql.match(re);
  assert.ok(m, `could not locate the ${label} CHECK list`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort();
}

test('027 cadence CHECK is exactly daily/weekly/monthly (both tables)', () => {
  const matches = [...sql.matchAll(/cadence TEXT NOT NULL[^,]*CHECK \(cadence IN \(([^)]*)\)\)/g)];
  assert.equal(matches.length, 2, 'expected a cadence CHECK on work_requirements AND shortfall_ledger');
  for (const m of matches) {
    const vals = [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort();
    assert.deepEqual(vals, ['daily', 'monthly', 'weekly']);
  }
});

test('027 request kind CHECK is slot_change/shift_hours/make_up', () => {
  assert.deepEqual(
    checkList(/CHECK \(kind IN \(([^)]*)\)\)/, 'kind'),
    ['make_up', 'shift_hours', 'slot_change']
  );
});

test('027 request status CHECK is pending/approved/rejected', () => {
  assert.deepEqual(
    checkList(/CHECK \(status IN \(([^)]*)\)\)/, 'status'),
    ['approved', 'pending', 'rejected']
  );
});

test('027 shortfall resolution CHECK is unresolved/made_up/shifted/excused', () => {
  assert.deepEqual(
    checkList(/CHECK \(resolution IN \(([^)]*)\)\)/, 'resolution'),
    ['excused', 'made_up', 'shifted', 'unresolved']
  );
});

test('027 work_profile_type CHECK is dedicated_hours/self_managed', () => {
  assert.deepEqual(
    checkList(/CHECK \(work_profile_type IN \(([^)]*)\)\)/, 'work_profile_type'),
    ['dedicated_hours', 'self_managed']
  );
});

test('027 weekday convention: 0..6 SMALLINT on schedule slots', () => {
  assert.match(sql, /weekday SMALLINT NOT NULL CHECK \(weekday BETWEEN 0 AND 6\)/,
    'weekday must be SMALLINT constrained to 0..6');
});

test('027 shortfall ledger has the idempotency unique index (per prompt-time inserts)', () => {
  assert.match(sql,
    /CREATE UNIQUE INDEX IF NOT EXISTS uq_shortfall_ledger_period\s+ON tabatha\.shortfall_ledger \(org_id, profile_id, cadence, period_start\)/,
    'missing uq_shortfall_ledger_period unique index');
});

// ── RLS consumes the 026 helpers ────────────────────────────

test('027 policies use migration 026 helpers (current_profile_id / can_manage_profile)', () => {
  assert.match(sql, /tabatha\.current_profile_id\(\)/, 'policies must use tabatha.current_profile_id()');
  assert.match(sql, /tabatha\.can_manage_profile\(org_id, profile_id\)/, 'policies must scope via tabatha.can_manage_profile');
});

test('027 members can INSERT their own change requests but only as pending', () => {
  const m = sql.match(/"Members file own change requests"[\s\S]*?FOR INSERT WITH CHECK \(([\s\S]*?)\);/);
  assert.ok(m, 'missing the member INSERT policy on schedule_change_requests');
  assert.match(m[1], /requested_by = tabatha\.current_profile_id\(\)/);
  assert.match(m[1], /status = 'pending'/);
});

test('027 status decisions (UPDATE) are manager-scope only', () => {
  const m = sql.match(/"Managers decide change requests"[\s\S]*?FOR UPDATE USING \(([\s\S]*?)\)\s*WITH CHECK/);
  assert.ok(m, 'missing the manager UPDATE policy on schedule_change_requests');
  assert.match(m[1], /tabatha\.can_manage_profile\(org_id, profile_id\)/);
  assert.doesNotMatch(m[1], /current_profile_id\(\) *(?:OR|$)/,
    'members must not be able to update (decide) change requests');
});

// ── RPC hardening (020/026 precedent) ───────────────────────

const FUNCTIONS = {
  set_member_schedule: 'uuid,\\s*uuid,\\s*jsonb',
  set_work_requirements: 'uuid,\\s*uuid,\\s*jsonb,\\s*uuid',
  set_member_work_profile: 'uuid,\\s*uuid,\\s*text',
  decide_change_request: 'uuid,\\s*text',
};

const blocks = sql.split(/(?=CREATE OR REPLACE FUNCTION)/).slice(1);

test('027 defines exactly the four NB-01/NB-02 RPCs', () => {
  assert.equal(blocks.length, Object.keys(FUNCTIONS).length,
    `expected ${Object.keys(FUNCTIONS).length} CREATE OR REPLACE FUNCTION statements, found ${blocks.length}`);
  for (const name of Object.keys(FUNCTIONS)) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION tabatha\\.${name}\\s*\\(`),
      `missing CREATE OR REPLACE FUNCTION tabatha.${name}`);
  }
});

for (const [name, argTypes] of Object.entries(FUNCTIONS)) {
  test(`027 hardening — tabatha.${name}`, () => {
    const block = blocks.find(b =>
      new RegExp(`^CREATE OR REPLACE FUNCTION tabatha\\.${name}\\s*\\(`).test(b));
    assert.ok(block, `no CREATE block found for tabatha.${name}`);

    assert.match(block, /SECURITY DEFINER/, `tabatha.${name} must be SECURITY DEFINER`);
    assert.match(block, /SET search_path\s*=\s*''/, `tabatha.${name} must SET search_path = ''`);

    const sig = `tabatha\\.${name}\\s*\\(\\s*${argTypes}\\s*\\)`;
    assert.match(block, new RegExp(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC,\\s*anon`),
      `tabatha.${name} must REVOKE ALL FROM PUBLIC, anon`);
    assert.match(block, new RegExp(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated`),
      `tabatha.${name} must GRANT EXECUTE TO authenticated`);

    // Privilege check present: every RPC gates on can_manage_profile.
    assert.match(block, /tabatha\.can_manage_profile\(/, `tabatha.${name} must gate via can_manage_profile`);
  });
}

test('027 function bodies are schema-qualified (safe under empty search_path)', () => {
  assert.doesNotMatch(sql,
    /\b(?:FROM|INTO|UPDATE|JOIN)\s+(?!tabatha\.|pg_|jsonb_|v_)(profiles|org_members|work_requirements|work_schedule_slots|schedule_change_requests|shortfall_ledger)\b/i,
    'found an unqualified table reference');
});
