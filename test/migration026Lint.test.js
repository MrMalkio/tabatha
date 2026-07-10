// NB-03 — migration-lint guard for 026_org_admin_helpers.sql.
// (Renumbered from 022 during cortex-branch merge; 022–025 are Cortex migrations.)
// A live SQL-shape test isn't feasible under `node --test` (no Postgres),
// so this inspects the migration text (same file-inspection style as
// test/manifestKey.test.js) and asserts the Koda-mandated hardening is
// present on EVERY helper: SECURITY DEFINER, SET search_path = '', and the
// REVOKE (PUBLIC + anon) / GRANT (authenticated) pair per function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const migrationPath = fileURLToPath(
  new URL('../supabase/migrations/026_org_admin_helpers.sql', import.meta.url)
);
const sql = await readFile(migrationPath, 'utf8');

// name → argument type list as it must appear in REVOKE/GRANT statements.
const FUNCTIONS = {
  current_profile_id: '',
  is_org_wide_admin: 'uuid',
  my_managed_team_ids: '',
  my_visible_member_profile_ids: 'uuid',
  can_manage_profile: 'uuid,\\s*uuid',
};

// Split into per-function blocks: each starts at its CREATE OR REPLACE and
// runs until the next one (so the block includes body + its REVOKE/GRANT).
const blocks = sql.split(/(?=CREATE OR REPLACE FUNCTION)/).slice(1);

test('026 defines exactly the five NB-03 helper functions', () => {
  assert.equal(blocks.length, Object.keys(FUNCTIONS).length,
    `expected ${Object.keys(FUNCTIONS).length} CREATE OR REPLACE FUNCTION statements, found ${blocks.length}`);
  for (const name of Object.keys(FUNCTIONS)) {
    assert.match(sql, new RegExp(`CREATE OR REPLACE FUNCTION tabatha\\.${name}\\s*\\(`),
      `missing CREATE OR REPLACE FUNCTION tabatha.${name}`);
  }
});

for (const [name, argTypes] of Object.entries(FUNCTIONS)) {
  test(`026 hardening — tabatha.${name}`, () => {
    const block = blocks.find(b =>
      new RegExp(`^CREATE OR REPLACE FUNCTION tabatha\\.${name}\\s*\\(`).test(b));
    assert.ok(block, `no CREATE block found for tabatha.${name}`);

    // SECURITY DEFINER on the function itself.
    assert.match(block, /SECURITY DEFINER/,
      `tabatha.${name} must be SECURITY DEFINER`);

    // Hardened empty search_path (020 precedent) — NOT 015's "tabatha, public".
    assert.match(block, /SET search_path\s*=\s*''/,
      `tabatha.${name} must SET search_path = ''`);

    // REVOKE from PUBLIC and anon, GRANT to authenticated — per function,
    // with the exact signature so the statements bind to THIS overload.
    const sig = `tabatha\\.${name}\\s*\\(\\s*${argTypes}\\s*\\)`;
    assert.match(block, new RegExp(`REVOKE ALL ON FUNCTION ${sig} FROM PUBLIC,\\s*anon`),
      `tabatha.${name} must REVOKE ALL FROM PUBLIC, anon`);
    assert.match(block, new RegExp(`GRANT EXECUTE ON FUNCTION ${sig} TO authenticated`),
      `tabatha.${name} must GRANT EXECUTE TO authenticated`);
  });
}

test('026 body objects are schema-qualified (safe under empty search_path)', () => {
  // With search_path = '' any unqualified relation would fail at runtime.
  // Guard the tables the helpers touch: every reference must carry tabatha.
  assert.doesNotMatch(sql, /\bFROM\s+(?!tabatha\.|pg_)(profiles|org_members|team_members|teams)\b/i,
    'found an unqualified FROM <table> reference');
  assert.doesNotMatch(sql, /\bJOIN\s+(?!tabatha\.)(profiles|org_members|team_members|teams)\b/i,
    'found an unqualified JOIN <table> reference');
});

test('026 keeps manager OUT of the org-wide admin set', () => {
  // The is_org_wide_admin role list must be exactly owner/admin.
  const m = sql.match(/is_org_wide_admin[\s\S]*?om\.role IN \(([^)]*)\)/);
  assert.ok(m, 'could not locate the role IN (...) list inside is_org_wide_admin');
  const roles = [...m[1].matchAll(/'([a-z_]+)'/g)].map(x => x[1]).sort();
  assert.deepEqual(roles, ['admin', 'owner'],
    `is_org_wide_admin must check exactly owner/admin, got: ${roles.join(', ')}`);
  assert.ok(!roles.includes('manager'), 'manager must NEVER be org-wide');
});
