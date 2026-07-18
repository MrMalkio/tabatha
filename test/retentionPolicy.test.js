// Tests for the pure retention-planning helper (Cortex C3 — Storage & Retention).
// Computes a deterministic deletion plan from an inventory + policy, with no
// chrome / supabase / DOM dependencies.
// Run: node --test test/retentionPolicy.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRetention } from '../src/utils/retentionPolicy.js';

const DAY = 86400000;
const NOW = 1_000_000_000_000;
// Helper: an item whose ts is `days` old relative to NOW.
const aged = (id, days, bytes, partition) => ({
  id,
  ts: NOW - days * DAY,
  bytes,
  partition
});

// Sum bytes of the inventory items whose ids appear in `ids`.
const bytesOf = (inv, ids) =>
  inv.filter((i) => ids.includes(i.id)).reduce((s, i) => s + i.bytes, 0);

// ── nothing to do ────────────────────────────────────────────────
test('under all caps: nothing deleted', () => {
  const inv = [
    aged('a', 1, 100, 'personal'),
    aged('b', 2, 100, 'org')
  ];
  const policy = {
    personal: { maxAgeDays: 30, maxBytes: 10000 },
    org: { maxAgeDays: 30, maxBytes: 10000 }
  };
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 999999 });
  assert.deepEqual(r.toDelete, []);
  assert.equal(r.freedBytes, 0);
  assert.equal(r.keptBytes, 200);
});

test('empty inventory: empty plan', () => {
  const r = planRetention([], { personal: { maxAgeDays: 1 } }, { now: NOW, freeBytes: 0 });
  assert.deepEqual(r.toDelete, []);
  assert.equal(r.freedBytes, 0);
  assert.equal(r.keptBytes, 0);
});

// ── age prune ────────────────────────────────────────────────────
test('age prune: deletes only items older than maxAgeDays', () => {
  const inv = [
    aged('young', 5, 100, 'personal'),
    aged('edge', 30, 100, 'personal'), // exactly 30d → not older than 30d, kept
    aged('old', 31, 100, 'personal')
  ];
  const policy = { personal: { maxAgeDays: 30 } };
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 999999 });
  assert.deepEqual(r.toDelete, ['old']);
  assert.equal(r.freedBytes, 100);
  assert.equal(r.keptBytes, 200);
});

test('age prune respects per-partition maxAgeDays independently', () => {
  const inv = [
    aged('p-old', 10, 100, 'personal'),
    aged('p-young', 4, 100, 'personal'),
    aged('o-old', 10, 100, 'org'),
    aged('o-young', 4, 100, 'org')
  ];
  const policy = {
    personal: { maxAgeDays: 7 }, // p-old (10d) deleted
    org: { maxAgeDays: 90 } // nothing in org old enough
  };
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 999999 });
  assert.deepEqual(r.toDelete.sort(), ['p-old']);
  assert.equal(r.keptBytes, 300);
});

test('omitted maxAgeDays skips age prune for that partition', () => {
  const inv = [
    aged('ancient', 5000, 100, 'personal')
  ];
  const policy = { personal: { maxBytes: 10000 } }; // no maxAgeDays
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 999999 });
  assert.deepEqual(r.toDelete, []);
  assert.equal(r.keptBytes, 100);
});

// ── space cap ────────────────────────────────────────────────────
test('space cap: deletes oldest-first until under maxBytes', () => {
  // 4 items, 100 bytes each = 400 total. cap 250 → must drop to <=250,
  // so delete the 2 oldest (leaving 200).
  const inv = [
    aged('newest', 1, 100, 'personal'),
    aged('mid1', 2, 100, 'personal'),
    aged('mid2', 3, 100, 'personal'),
    aged('oldest', 4, 100, 'personal')
  ];
  const policy = { personal: { maxBytes: 250 } };
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 999999 });
  assert.deepEqual(r.toDelete.sort(), ['mid2', 'oldest'].sort());
  assert.equal(r.keptBytes, 200);
  assert.equal(r.freedBytes, 200);
});

test('space cap: exactly at cap deletes nothing', () => {
  const inv = [
    aged('a', 1, 100, 'personal'),
    aged('b', 2, 100, 'personal')
  ];
  const policy = { personal: { maxBytes: 200 } };
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 999999 });
  assert.deepEqual(r.toDelete, []);
  assert.equal(r.keptBytes, 200);
});

test('space cap runs after age prune (age-deleted items do not count toward bytes)', () => {
  // old item would push over cap, but it is age-pruned first; survivors fit.
  const inv = [
    aged('old', 40, 200, 'personal'),
    aged('a', 1, 100, 'personal'),
    aged('b', 2, 100, 'personal')
  ];
  const policy = { personal: { maxAgeDays: 30, maxBytes: 250 } };
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 999999 });
  // old removed by age; remaining 200 <= 250 → nothing more deleted.
  assert.deepEqual(r.toDelete, ['old']);
  assert.equal(r.keptBytes, 200);
});

test('omitted maxBytes skips space cap for that partition', () => {
  const inv = [
    aged('a', 1, 100000, 'personal'),
    aged('b', 2, 100000, 'personal')
  ];
  const policy = { personal: { maxAgeDays: 30 } }; // no maxBytes
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 999999 });
  assert.deepEqual(r.toDelete, []);
  assert.equal(r.keptBytes, 200000);
});

// ── partition independence ───────────────────────────────────────
test('org overflow does not delete personal items (budgets independent)', () => {
  const inv = [
    // personal well under its cap
    aged('p1', 1, 100, 'personal'),
    aged('p2', 2, 100, 'personal'),
    // org massively over its cap
    aged('o-new', 1, 500, 'org'),
    aged('o-old', 5, 500, 'org')
  ];
  const policy = {
    personal: { maxBytes: 10000 },
    org: { maxBytes: 500 } // org must drop to <=500 → delete o-old
  };
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 999999 });
  assert.deepEqual(r.toDelete, ['o-old']);
  // no personal ids touched
  assert.ok(!r.toDelete.includes('p1'));
  assert.ok(!r.toDelete.includes('p2'));
  assert.equal(r.keptBytes, 700); // p1+p2+o-new
});

// ── global min-free-disk ─────────────────────────────────────────
test('minFreeBytes triggers extra cross-partition deletion oldest-first', () => {
  // No age/space constraints hit. freeBytes low; need to free more.
  const inv = [
    aged('newest', 1, 100, 'personal'),
    aged('mid', 5, 100, 'org'),
    aged('oldest', 10, 100, 'personal')
  ];
  const policy = { minFreeBytes: 250 };
  // free currently 100; need +150 more → delete oldest first across all.
  // oldest(100) → free 200, still <250 → mid(100) → free 300 >=250, stop.
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 100 });
  assert.deepEqual(r.toDelete.sort(), ['mid', 'oldest'].sort());
  assert.equal(r.freedBytes, 200);
  assert.equal(r.keptBytes, 100);
});

test('minFreeBytes already satisfied: no extra deletion', () => {
  const inv = [
    aged('a', 1, 100, 'personal'),
    aged('b', 2, 100, 'org')
  ];
  const policy = { minFreeBytes: 500 };
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 500 });
  assert.deepEqual(r.toDelete, []);
  assert.equal(r.keptBytes, 200);
});

test('minFreeBytes counts bytes already freed by age/space rules', () => {
  const inv = [
    aged('old', 40, 100, 'personal'), // age-pruned → contributes to freed
    aged('a', 1, 100, 'personal'),
    aged('b', 2, 100, 'org')
  ];
  const policy = { personal: { maxAgeDays: 30 }, minFreeBytes: 180 };
  // age prune frees 100. freeBytes 50 + 100 = 150 < 180 → need 30 more.
  // oldest survivor across all is 'b' (2d) vs 'a' (1d) → 'b' is older.
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 50 });
  assert.ok(r.toDelete.includes('old'));
  assert.ok(r.toDelete.includes('b'));
  assert.ok(!r.toDelete.includes('a'));
  assert.equal(r.freedBytes, 200);
  assert.equal(r.keptBytes, 100);
});

test('minFreeBytes deletes everything if still not enough', () => {
  const inv = [
    aged('a', 1, 100, 'personal'),
    aged('b', 2, 100, 'org')
  ];
  const policy = { minFreeBytes: 100000 };
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 0 });
  assert.deepEqual(r.toDelete.sort(), ['a', 'b'].sort());
  assert.equal(r.freedBytes, 200);
  assert.equal(r.keptBytes, 0);
});

test('omitted minFreeBytes skips the global constraint', () => {
  const inv = [aged('a', 1, 100, 'personal')];
  const policy = { personal: { maxBytes: 10000 } }; // no minFreeBytes
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 0 });
  assert.deepEqual(r.toDelete, []);
  assert.equal(r.keptBytes, 100);
});

// ── accounting + purity ──────────────────────────────────────────
test('freedBytes + keptBytes == total inventory bytes', () => {
  const inv = [
    aged('a', 40, 111, 'personal'),
    aged('b', 1, 222, 'personal'),
    aged('c', 40, 333, 'org'),
    aged('d', 1, 444, 'org')
  ];
  const policy = {
    personal: { maxAgeDays: 30 },
    org: { maxAgeDays: 30 }
  };
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 999999 });
  const total = inv.reduce((s, i) => s + i.bytes, 0);
  assert.equal(r.freedBytes + r.keptBytes, total);
  assert.equal(r.freedBytes, bytesOf(inv, r.toDelete));
});

test('toDelete contains each id at most once (age + space + global overlap)', () => {
  const inv = [
    aged('old', 40, 300, 'personal'), // age-pruned
    aged('big1', 1, 300, 'personal'),
    aged('big2', 2, 300, 'personal')
  ];
  // maxAgeDays deletes old; maxBytes 300 forces more deletion; minFreeBytes
  // also large — all three rules would target overlapping items.
  const policy = {
    personal: { maxAgeDays: 30, maxBytes: 300 },
    minFreeBytes: 100000
  };
  const r = planRetention(inv, policy, { now: NOW, freeBytes: 0 });
  const unique = new Set(r.toDelete);
  assert.equal(unique.size, r.toDelete.length);
});

test('does not mutate inputs', () => {
  const inv = [aged('a', 40, 100, 'personal'), aged('b', 1, 100, 'personal')];
  const invCopy = JSON.parse(JSON.stringify(inv));
  const policy = { personal: { maxAgeDays: 30, maxBytes: 50 }, minFreeBytes: 100 };
  const policyCopy = JSON.parse(JSON.stringify(policy));
  planRetention(inv, policy, { now: NOW, freeBytes: 0 });
  assert.deepEqual(inv, invCopy);
  assert.deepEqual(policy, policyCopy);
});
