// Org-hours v1 (migration 060). Pure-function tests for
// src/utils/orgHours.js — the client-side shaping of
// tabatha.get_org_hours_summary's row output. No network, no chrome.*.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  splitOrgHoursRows,
  formatHoursDuration,
  daysAgoIsoDate,
  todayIsoDate,
} from '../src/utils/orgHours.js';

function aggRow(overrides = {}) {
  return {
    member_profile_id: null,
    display_name: null,
    total_ms: 0,
    work_ms: 0,
    break_ms: 0,
    session_count: 0,
    is_aggregate_only: true,
    ...overrides,
  };
}

function memberRow(overrides = {}) {
  return {
    member_profile_id: 'profile-1',
    display_name: 'Alice',
    total_ms: 0,
    work_ms: 0,
    break_ms: 0,
    session_count: 0,
    is_aggregate_only: false,
    ...overrides,
  };
}

// ── splitOrgHoursRows ──

test('splitOrgHoursRows: null/undefined/empty input never throws', () => {
  assert.deepEqual(splitOrgHoursRows(null), { aggregate: null, members: [], unattributedWorkMs: 0 });
  assert.deepEqual(splitOrgHoursRows(undefined), { aggregate: null, members: [], unattributedWorkMs: 0 });
  assert.deepEqual(splitOrgHoursRows([]), { aggregate: null, members: [], unattributedWorkMs: 0 });
});

test('splitOrgHoursRows: caller not an org member (RPC returns zero rows) -> no aggregate, no members', () => {
  const result = splitOrgHoursRows([]);
  assert.equal(result.aggregate, null);
  assert.equal(result.members.length, 0);
});

test('splitOrgHoursRows: aggregate-only org (nobody opted in) -> aggregate present, members empty, everything unattributed', () => {
  const rows = [aggRow({ total_ms: 36000000, work_ms: 32400000, break_ms: 3600000, session_count: 4 })];
  const result = splitOrgHoursRows(rows);
  assert.deepEqual(result.aggregate, { totalMs: 36000000, workMs: 32400000, breakMs: 3600000, sessionCount: 4 });
  assert.equal(result.members.length, 0);
  assert.equal(result.unattributedWorkMs, 32400000); // 100% of the aggregate is from non-opted-in members
});

test('splitOrgHoursRows: opted-in member never appears twice and non-opted-in member never gets a named row (per RPC contract) -> named + aggregate coexist correctly', () => {
  const rows = [
    aggRow({ total_ms: 72000000, work_ms: 64800000, break_ms: 7200000, session_count: 8 }), // org-wide total: Alice (opted in) + Bob (not opted in)
    memberRow({ member_profile_id: 'alice', display_name: 'Alice', total_ms: 36000000, work_ms: 32400000, break_ms: 3600000, session_count: 4 }),
  ];
  const result = splitOrgHoursRows(rows);
  assert.equal(result.members.length, 1);
  assert.equal(result.members[0].displayName, 'Alice');
  assert.equal(result.members[0].workMs, 32400000);
  // Bob's hours (not opted in) never get a named row, but they're still in
  // the aggregate — the difference is exactly Bob's contribution.
  assert.equal(result.unattributedWorkMs, 64800000 - 32400000);
});

test('splitOrgHoursRows: members sorted by workMs descending', () => {
  const rows = [
    aggRow({ work_ms: 100 }),
    memberRow({ member_profile_id: 'low', display_name: 'Low', work_ms: 10 }),
    memberRow({ member_profile_id: 'high', display_name: 'High', work_ms: 90 }),
    memberRow({ member_profile_id: 'mid', display_name: 'Mid', work_ms: 50 }),
  ];
  const result = splitOrgHoursRows(rows);
  assert.deepEqual(result.members.map(m => m.profileId), ['high', 'mid', 'low']);
});

test('splitOrgHoursRows: a row with no member_profile_id is never treated as a named member, even if is_aggregate_only is false (defensive)', () => {
  const rows = [
    aggRow(),
    memberRow({ member_profile_id: null, display_name: 'Should be dropped', is_aggregate_only: false }),
  ];
  const result = splitOrgHoursRows(rows);
  assert.equal(result.members.length, 0);
});

test('splitOrgHoursRows: unattributedWorkMs never goes negative even if member sum somehow exceeds aggregate', () => {
  const rows = [
    aggRow({ work_ms: 10 }),
    memberRow({ member_profile_id: 'a', work_ms: 100 }),
  ];
  const result = splitOrgHoursRows(rows);
  assert.equal(result.unattributedWorkMs, 0);
});

// ── formatHoursDuration ──

test('formatHoursDuration: zero/falsy/negative -> 0m', () => {
  assert.equal(formatHoursDuration(0), '0m');
  assert.equal(formatHoursDuration(null), '0m');
  assert.equal(formatHoursDuration(undefined), '0m');
  assert.equal(formatHoursDuration(-500), '0m');
});

test('formatHoursDuration: sub-hour durations render as minutes only', () => {
  assert.equal(formatHoursDuration(60000), '1m');
  assert.equal(formatHoursDuration(59 * 60000), '59m');
});

test('formatHoursDuration: hour-scale durations render as "Xh Ym"', () => {
  assert.equal(formatHoursDuration(90 * 60000), '1h 30m');
  assert.equal(formatHoursDuration(2 * 3600000), '2h 0m');
});

// ── date helpers ──

test('todayIsoDate: matches YYYY-MM-DD shape', () => {
  assert.match(todayIsoDate(), /^\d{4}-\d{2}-\d{2}$/);
});

test('daysAgoIsoDate: 1 day range returns today\'s date (inclusive)', () => {
  assert.equal(daysAgoIsoDate(1), todayIsoDate());
});

test('daysAgoIsoDate: returns a date strictly before today for N > 1', () => {
  const today = todayIsoDate();
  const weekAgo = daysAgoIsoDate(7);
  assert.ok(weekAgo <= today); // ISO date strings compare lexicographically = chronologically
  assert.notEqual(weekAgo, today);
});
