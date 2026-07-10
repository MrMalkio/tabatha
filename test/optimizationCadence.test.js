// Cortex Phase 4 T3 (Plan 043) — optimizationCadence pure helpers (TDD).
// Multi-cadence scheduling brain: decideCadenceRun (LOW/HIGH/none), the light
// intraday prompt builder, and cross-pass recommendation dedupe. UTC clocks
// keep the decision deterministic across timezones (see module header).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decideCadenceRun,
  buildIntradayPrompt,
  dedupeAgainstRecent,
  recommendationDedupeKey
} from '../src/utils/optimizationCadence.js';

const at = (h, m = 0, day = 10) => Date.UTC(2026, 6, day, h, m, 0);

// ── decideCadenceRun: HIGH/EOD ─────────────────────────────

test('decideCadenceRun: HIGH fires once at/after eodHour when not run today', () => {
  const d = decideCadenceRun(at(22, 30), {}, {});
  assert.deepEqual(d, { run: 'high', reason: 'eod-high-due' });
});

test('decideCadenceRun: HIGH does not re-fire once it already ran today', () => {
  const d = decideCadenceRun(at(23, 0), { lastHighRunAt: at(22, 5) }, {});
  assert.deepEqual(d, { run: null, reason: 'eod-complete' });
});

test('decideCadenceRun: HIGH fires again on a new day even if yesterday ran', () => {
  const d = decideCadenceRun(at(22, 30, 10), { lastHighRunAt: at(22, 5, 9) }, {});
  assert.equal(d.run, 'high');
});

// ── decideCadenceRun: LOW/intraday ─────────────────────────

test('decideCadenceRun: nothing before active hours', () => {
  const d = decideCadenceRun(at(6, 0), {}, {});
  assert.deepEqual(d, { run: null, reason: 'before-active-hours' });
});

test('decideCadenceRun: LOW suppressed inside the EOD guard window', () => {
  // 21:30, eod 22:00, guard 60min → only 30min before EOD → suppressed.
  const d = decideCadenceRun(at(21, 30), { lastLowRunAt: at(9, 0) }, {});
  assert.deepEqual(d, { run: null, reason: 'near-high-guard' });
});

test('decideCadenceRun: first LOW pass of the day fires immediately in active hours', () => {
  const d = decideCadenceRun(at(9, 0), {}, {});
  assert.deepEqual(d, { run: 'low', reason: 'low-first' });
});

test('decideCadenceRun: LOW fires once the interval has elapsed', () => {
  const d = decideCadenceRun(at(12, 0), { lastLowRunAt: at(9, 0) }, { intradayEveryMins: 120 });
  assert.deepEqual(d, { run: 'low', reason: 'low-interval' });
});

test('decideCadenceRun: LOW on cooldown before the interval elapses', () => {
  const d = decideCadenceRun(at(10, 0), { lastLowRunAt: at(9, 0) }, { intradayEveryMins: 120 });
  assert.deepEqual(d, { run: null, reason: 'low-cooldown' });
});

test('decideCadenceRun: defaults apply when config is empty', () => {
  // eodHour defaults to 22 → 9:00 with no last-low is a first LOW pass.
  assert.equal(decideCadenceRun(at(9, 0)).run, 'low');
  // 22:30 with no state → HIGH due under default eodHour.
  assert.equal(decideCadenceRun(at(22, 30)).run, 'high');
});

test('decideCadenceRun: accepts a Date and an epoch-ms number equivalently', () => {
  const epoch = at(12, 0);
  const a = decideCadenceRun(epoch, { lastLowRunAt: at(9, 0) }, {});
  const b = decideCadenceRun(new Date(epoch), { lastLowRunAt: at(9, 0) }, {});
  assert.deepEqual(a, b);
});

test('decideCadenceRun: state last-run timestamps take precedence over config', () => {
  // state says LOW ran 30min ago (cooldown); config claims it ran hours ago.
  const d = decideCadenceRun(
    at(10, 0),
    { lastLowRunAt: at(9, 30) },
    { intradayEveryMins: 120, lastLowRunAt: at(6, 0) }
  );
  assert.equal(d.reason, 'low-cooldown');
});

test('decideCadenceRun: invalid now returns a null run, never throws', () => {
  assert.deepEqual(decideCadenceRun(NaN, {}, {}), { run: null, reason: 'invalid-now' });
});

// ── buildIntradayPrompt ────────────────────────────────────

test('buildIntradayPrompt: returns the intraday version and the >=3x rule, scoped to recent', () => {
  const { version, text } = buildIntradayPrompt({});
  assert.equal(version, 'economize-intraday.v1');
  assert.ok(text.includes('>=3x'), 'keeps the ≥3× repeat rule');
  assert.ok(/recent/i.test(text), 'scopes to the recent window');
});

test('buildIntradayPrompt: embeds the slice candidates and record count', () => {
  const slice = {
    content: {
      windowStart: '2026-07-10T10:00:00.000Z',
      generatedAt: '2026-07-10T12:00:00.000Z',
      counts: { total: 5 },
      repeats: { candidates: [{ key: 'browser|mail.google.com||', count: 4 }] }
    }
  };
  const { text } = buildIntradayPrompt(slice);
  assert.ok(text.includes('mail.google.com'), 'lists the candidate key');
  assert.ok(text.includes('Records in slice: 5'), 'reports the slice record count');
});

// ── recommendationDedupeKey ────────────────────────────────

test('recommendationDedupeKey: stable regardless of evidence order', () => {
  const a = { type: 'digest', evidence: [{ key: 'b' }, { key: 'a' }] };
  const b = { type: 'digest', evidence: [{ key: 'a' }, { key: 'b' }] };
  assert.equal(recommendationDedupeKey(a), recommendationDedupeKey(b));
});

test('recommendationDedupeKey: differs by type and falls back to title', () => {
  const evd = [{ key: 'x' }];
  assert.notEqual(
    recommendationDedupeKey({ type: 'digest', evidence: evd }),
    recommendationDedupeKey({ type: 'hotkey', evidence: evd })
  );
  assert.equal(
    recommendationDedupeKey({ type: 'other', title: 'Batch The Thing' }),
    'other|batch the thing'
  );
});

// ── dedupeAgainstRecent ────────────────────────────────────

test('dedupeAgainstRecent: drops a new rec already emitted within the window', () => {
  const recent = [{ type: 'digest', evidence: [{ key: 'k' }], emittedAt: at(9, 0) }];
  const fresh = [{ type: 'digest', evidence: [{ key: 'k' }], emittedAt: at(11, 0) }];
  const { kept, dropped } = dedupeAgainstRecent(fresh, recent, 24);
  assert.equal(kept.length, 0);
  assert.equal(dropped.length, 1);
});

test('dedupeAgainstRecent: keeps a rec whose cooldown has expired', () => {
  const recent = [{ type: 'digest', evidence: [{ key: 'k' }], emittedAt: at(9, 0, 8) }];
  const fresh = [{ type: 'digest', evidence: [{ key: 'k' }], emittedAt: at(11, 0, 10) }];
  const { kept } = dedupeAgainstRecent(fresh, recent, 24); // > 24h apart
  assert.equal(kept.length, 1);
});

test('dedupeAgainstRecent: keeps a rec with a different key', () => {
  const recent = [{ type: 'digest', evidence: [{ key: 'a' }], emittedAt: at(9, 0) }];
  const fresh = [{ type: 'digest', evidence: [{ key: 'b' }], emittedAt: at(11, 0) }];
  const { kept, dropped } = dedupeAgainstRecent(fresh, recent, 24);
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 0);
});

test('dedupeAgainstRecent: missing timestamps → conservative drop on key match', () => {
  const recent = [{ type: 'hotkey', evidence: [{ key: 'k' }] }];
  const fresh = [{ type: 'hotkey', evidence: [{ key: 'k' }] }];
  const { dropped } = dedupeAgainstRecent(fresh, recent, 24);
  assert.equal(dropped.length, 1);
});
