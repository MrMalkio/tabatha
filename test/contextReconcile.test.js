// Tests for the pure C10a context-reconciliation core (Cortex C10a). The
// proposer never mutates its inputs and returns a unified proposal set. No
// chrome / supabase / DOM deps. Run: node --test test/contextReconcile.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  reconcileId,
  collectFocusSessions,
  stampIntentByWindow,
  proposeReconciliations,
  summarizeProposals
} from '../src/utils/contextReconcile.js';

const iso = (ms) => new Date(ms).toISOString();
const M = 60000;
const BASE = Date.parse('2026-07-10T09:00:00.000Z');

function obs(offMin, fields = {}) {
  return {
    ts: iso(BASE + offMin * M),
    kind: fields.kind || 'context',
    surface: fields.surface || 'browser',
    app: fields.app ?? null,
    host: fields.host ?? null,
    title: fields.title ?? null,
    category: fields.category ?? null,
    focusId: fields.focusId ?? null,
    intentId: fields.intentId ?? null,
    partition: fields.partition ?? 'personal'
  };
}

// ── reconcileId ──────────────────────────────────────────────────
test('reconcileId is deterministic for identical inputs', () => {
  assert.equal(
    reconcileId('tab-intent-link', 7, 'A', 'B'),
    reconcileId('tab-intent-link', 7, 'A', 'B')
  );
});
test('reconcileId differs when before/after differ', () => {
  assert.notEqual(
    reconcileId('tab-intent-link', 7, 'A', 'B'),
    reconcileId('tab-intent-link', 7, 'A', 'C')
  );
});
test('reconcileId embeds kind and target', () => {
  assert.ok(reconcileId('focus-time', 'f1', 0, 1).startsWith('focus-time:f1:'));
});

// ── collectFocusSessions ─────────────────────────────────────────
test('collectFocusSessions maps items + history with nesting fields', () => {
  const engine = {
    items: { f1: { id: 'f1', label: 'Deep work', elapsedMs: 1000, taskId: 't9', tags: ['x'] } },
    history: [{ id: 'f2', label: 'Old', elapsedMs: 500 }]
  };
  const sessions = collectFocusSessions(engine);
  assert.equal(sessions.length, 2);
  const f1 = sessions.find(s => s.focusId === 'f1');
  assert.equal(f1.taskId, 't9');
  assert.deepEqual(f1.tags, ['x']);
  assert.equal(f1._source, 'items');
  assert.equal(sessions.find(s => s.focusId === 'f2')._source, 'history');
});

// ── stampIntentByWindow ──────────────────────────────────────────
test('stampIntentByWindow fills intentId from session window, never mutates input', () => {
  const observations = [obs(10, { host: 'a.com' })];
  const sessions = [{ focusId: 'f1', label: 'Writing', startedAt: iso(BASE), endedAt: iso(BASE + 60 * M) }];
  const out = stampIntentByWindow(observations, sessions);
  assert.equal(out[0].intentId, 'Writing');
  assert.equal(observations[0].intentId, null, 'input untouched');
});
test('stampIntentByWindow keeps an already-set intentId', () => {
  const observations = [obs(10, { host: 'a.com', intentId: 'Preset' })];
  const sessions = [{ focusId: 'f1', label: 'Writing', startedAt: iso(BASE), endedAt: iso(BASE + 60 * M) }];
  assert.equal(stampIntentByWindow(observations, sessions)[0].intentId, 'Preset');
});

// ── proposeReconciliations: tab-intent-link ──────────────────────
test('proposes a tab-intent-link when a tab sustains a different intent', () => {
  // Tab 1 is on quickbooks.com recorded as "Personal", but observed 4× under "Client X".
  const observations = [
    obs(0, { host: 'quickbooks.com', intentId: 'Client X', category: 'finance' }),
    obs(1, { host: 'quickbooks.com', intentId: 'Client X', category: 'finance' }),
    obs(2, { host: 'quickbooks.com', intentId: 'Client X', category: 'finance' }),
    obs(3, { host: 'quickbooks.com', intentId: 'Client X', category: 'finance' })
  ];
  const state = {
    observations,
    tabs: { 1: { url: 'https://quickbooks.com/x', intent: 'Personal', title: 'QB' } },
    focusEngine: { items: {}, history: [] }
  };
  const { proposals } = proposeReconciliations(state, { now: BASE + 10 * M });
  const link = proposals.find(p => p.kind === 'tab-intent-link');
  assert.ok(link, 'a link proposal exists');
  assert.equal(link.targetId, 1);
  assert.equal(link.before, 'Personal');
  assert.equal(link.after, 'Client X');
  assert.equal(link.confidence, 'high'); // host-run + category
  assert.ok(link.id.startsWith('tab-intent-link:1:'));
});

// ── proposeReconciliations: focus-time ───────────────────────────
test('proposes a focus-time correction when observed span dwarfs recorded ms', () => {
  const observations = [];
  for (let i = 0; i <= 30; i++) observations.push(obs(i, { focusId: 'f1', surface: 'browser' }));
  const state = {
    observations,
    tabs: {},
    focusEngine: {
      items: {},
      history: [{ id: 'f1', label: 'Report', elapsedMs: 2 * M, startedAt: iso(BASE), endedAt: iso(BASE + 30 * M) }]
    }
  };
  const { proposals } = proposeReconciliations(state, { now: BASE + 40 * M });
  const time = proposals.find(p => p.kind === 'focus-time');
  assert.ok(time, 'a focus-time proposal exists');
  assert.equal(time.targetId, 'f1');
  assert.equal(time.before, 2 * M);
  assert.ok(time.after > time.before);
  assert.ok(/Report/.test(time.why));
});

// ── proposeReconciliations: tab-group ────────────────────────────
test('proposes a tab-group move when a tab sustains a context unlike its group', () => {
  const observations = [
    obs(0, { host: 'figma.com', intentId: 'Design', category: 'design' }),
    obs(1, { host: 'figma.com', intentId: 'Design', category: 'design' }),
    obs(2, { host: 'figma.com', intentId: 'Design', category: 'design' })
  ];
  const state = {
    observations,
    tabs: {
      1: { url: 'https://figma.com/f', intent: 'Design', context: 'Finance', groupId: 5 },
      2: { url: 'https://ledger.com', context: 'Finance', groupId: 5 },
      3: { url: 'https://books.com', context: 'Finance', groupId: 5 }
    },
    focusEngine: { items: {}, history: [] }
  };
  const { proposals } = proposeReconciliations(state, { now: BASE + 10 * M });
  const grp = proposals.find(p => p.kind === 'tab-group');
  assert.ok(grp, 'a tab-group proposal exists');
  assert.equal(grp.targetId, 1);
  assert.equal(grp.before.context, 'Finance');
  assert.equal(grp.after.context, 'Design');
  assert.ok(grp.evidence.some(e => e.kind === 'group-context'));
});
test('no tab-group proposal when the tab already matches its group context', () => {
  const observations = [
    obs(0, { host: 'figma.com', intentId: 'Design' }),
    obs(1, { host: 'figma.com', intentId: 'Design' }),
    obs(2, { host: 'figma.com', intentId: 'Design' })
  ];
  const state = {
    observations,
    tabs: {
      1: { url: 'https://figma.com/f', context: 'Design', groupId: 5 },
      2: { url: 'https://x.com', context: 'Design', groupId: 5 }
    },
    focusEngine: { items: {}, history: [] }
  };
  const grp = proposeReconciliations(state, { now: BASE }).proposals.filter(p => p.kind === 'tab-group');
  assert.equal(grp.length, 0);
});

// ── proposeReconciliations: orphan-adopt ─────────────────────────
test('proposes orphan-adopt for a parentless focus with observations', () => {
  const observations = [
    obs(0, { focusId: 'f1', category: 'writing' }),
    obs(1, { focusId: 'f1', category: 'writing' }),
    obs(2, { focusId: 'f1', category: 'writing' })
  ];
  const state = {
    observations,
    tabs: {},
    focusEngine: {
      items: {
        f1: { id: 'f1', label: 'Draft memo', elapsedMs: 5 * M, startedAt: iso(BASE), endedAt: iso(BASE + 10 * M) },
        f2: { id: 'f2', label: 'Comms project', elapsedMs: 0, category: 'writing', taskId: 'root' }
      },
      history: []
    }
  };
  const { proposals } = proposeReconciliations(state, { now: BASE + 20 * M });
  const orphan = proposals.find(p => p.kind === 'orphan-adopt');
  assert.ok(orphan, 'an orphan-adopt proposal exists');
  assert.equal(orphan.targetId, 'f1');
  assert.equal(orphan.after.suggestedParent, 'Comms project'); // sibling category match
  assert.equal(orphan.confidence, 'high'); // has-observations + sibling-match
});
test('a focus WITH a parent is never proposed for adoption', () => {
  const observations = [obs(0, { focusId: 'f1' }), obs(1, { focusId: 'f1' })];
  const state = {
    observations,
    tabs: {},
    focusEngine: {
      items: { f1: { id: 'f1', label: 'Nested', taskId: 't1', startedAt: iso(BASE), endedAt: iso(BASE + 5 * M) } },
      history: []
    }
  };
  const orphans = proposeReconciliations(state, { now: BASE + 10 * M }).proposals.filter(p => p.kind === 'orphan-adopt');
  assert.equal(orphans.length, 0);
});

// ── day filtering + purity + shape ───────────────────────────────
test('day filter restricts to the requested UTC day', () => {
  const observations = [
    obs(0, { host: 'a.com', intentId: 'X', category: 'c' }),
    obs(1, { host: 'a.com', intentId: 'X', category: 'c' }),
    obs(2, { host: 'a.com', intentId: 'X', category: 'c' }),
    { ...obs(0, { host: 'a.com', intentId: 'X' }), ts: '2020-01-01T00:00:00.000Z' }
  ];
  const state = {
    observations,
    tabs: { 1: { url: 'https://a.com', intent: 'Y' } },
    focusEngine: { items: {}, history: [] },
    day: '2026-07-10'
  };
  const { proposals } = proposeReconciliations(state, { now: BASE + 10 * M });
  // The one-off 2020 record is excluded; the 2026-07-10 run still triggers a link.
  assert.ok(proposals.some(p => p.kind === 'tab-intent-link'));
});
test('proposeReconciliations never mutates the input observations', () => {
  const observations = [obs(0, { host: 'a.com' })];
  const snapshot = JSON.stringify(observations);
  proposeReconciliations({ observations, tabs: {}, focusEngine: { items: {}, history: [] } }, { now: BASE });
  assert.equal(JSON.stringify(observations), snapshot);
});
test('every proposal carries the unified shape', () => {
  const observations = [
    obs(0, { host: 'a.com', intentId: 'X', category: 'c' }),
    obs(1, { host: 'a.com', intentId: 'X', category: 'c' }),
    obs(2, { host: 'a.com', intentId: 'X', category: 'c' })
  ];
  const { proposals } = proposeReconciliations(
    { observations, tabs: { 1: { url: 'https://a.com', intent: 'Y' } }, focusEngine: { items: {}, history: [] } },
    { now: BASE + 5 * M }
  );
  for (const p of proposals) {
    for (const key of ['id', 'kind', 'targetId', 'why', 'evidence', 'confidence']) {
      assert.ok(key in p, `proposal has ${key}`);
    }
    assert.ok(Array.isArray(p.evidence));
    assert.ok('before' in p && 'after' in p);
  }
});
test('empty state yields an empty proposal set with a timestamp', () => {
  const out = proposeReconciliations({}, { now: BASE });
  assert.deepEqual(out.proposals, []);
  assert.equal(out.generatedAt, iso(BASE));
});

// ── summarizeProposals ───────────────────────────────────────────
test('summarizeProposals counts by kind and total', () => {
  const proposals = [
    { kind: 'tab-intent-link' }, { kind: 'tab-intent-link' },
    { kind: 'focus-time' }, { kind: 'tab-group' }, { kind: 'orphan-adopt' }
  ];
  const s = summarizeProposals(proposals);
  assert.equal(s.total, 5);
  assert.equal(s.counts.byKind['tab-intent-link'], 2);
  assert.equal(s.counts.byKind['focus-time'], 1);
  assert.equal(s.counts.byKind['tab-group'], 1);
  assert.equal(s.counts.byKind['orphan-adopt'], 1);
});
test('summarizeProposals tolerates empty/garbage input', () => {
  assert.equal(summarizeProposals([]).total, 0);
  assert.equal(summarizeProposals().total, 0);
  assert.equal(summarizeProposals([null, { kind: 'tab-group' }]).total, 2);
  assert.equal(summarizeProposals([null, { kind: 'tab-group' }]).counts.byKind['tab-group'], 1);
});
