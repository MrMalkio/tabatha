// Cortex Phase 1 T4 — captureArtifacts pure helpers (TDD: written first).
// Redaction-rect math + partition-aware filename/path building for frame writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRedactionRects,
  buildCaptureFilename,
  buildCapturePath
} from '../src/utils/captureArtifacts.js';

const DIMS = { width: 1000, height: 800 };

// ── computeRedactionRects ──────────────────────────────────

test('computeRedactionRects: bottom 80% → rect covering bottom 640px', () => {
  const rects = computeRedactionRects([{ region: 'bottom', percent: 80 }], DIMS);
  assert.deepEqual(rects, [{ x: 0, y: 160, w: 1000, h: 640 }]);
});

test('computeRedactionRects: top 25%', () => {
  const rects = computeRedactionRects([{ region: 'top', percent: 25 }], DIMS);
  assert.deepEqual(rects, [{ x: 0, y: 0, w: 1000, h: 200 }]);
});

test('computeRedactionRects: left / right split the width', () => {
  assert.deepEqual(
    computeRedactionRects([{ region: 'left', percent: 50 }], DIMS),
    [{ x: 0, y: 0, w: 500, h: 800 }]
  );
  assert.deepEqual(
    computeRedactionRects([{ region: 'right', percent: 10 }], DIMS),
    [{ x: 900, y: 0, w: 100, h: 800 }]
  );
});

test('computeRedactionRects: full region covers everything regardless of percent', () => {
  assert.deepEqual(
    computeRedactionRects([{ region: 'full', percent: 5 }], DIMS),
    [{ x: 0, y: 0, w: 1000, h: 800 }]
  );
});

test('computeRedactionRects: percent clamped to [0,100]; 0% drops the rect', () => {
  assert.deepEqual(
    computeRedactionRects([{ region: 'bottom', percent: 250 }], DIMS),
    [{ x: 0, y: 0, w: 1000, h: 800 }]
  );
  assert.deepEqual(computeRedactionRects([{ region: 'bottom', percent: 0 }], DIMS), []);
});

test('computeRedactionRects: multiple rules → multiple rects; unknown region ignored', () => {
  const rects = computeRedactionRects(
    [
      { region: 'bottom', percent: 50 },
      { region: 'diagonal', percent: 50 },
      { region: 'top', percent: 10 }
    ],
    DIMS
  );
  assert.equal(rects.length, 2);
});

test('computeRedactionRects: empty/nullish input → []', () => {
  assert.deepEqual(computeRedactionRects([], DIMS), []);
  assert.deepEqual(computeRedactionRects(null, DIMS), []);
});

test('computeRedactionRects: rounds to integer pixels', () => {
  const rects = computeRedactionRects([{ region: 'bottom', percent: 33 }], { width: 101, height: 101 });
  for (const r of rects) {
    for (const v of Object.values(r)) assert.equal(Number.isInteger(v), true);
  }
});

// ── buildCaptureFilename ───────────────────────────────────

const REC = {
  ts: '2026-07-10T03:12:45.123Z',
  surface: 'browser',
  partition: 'personal'
};

test('buildCaptureFilename: filesystem-safe timestamp + surface + partition', () => {
  const name = buildCaptureFilename(REC);
  assert.equal(name, '2026-07-10T03-12-45-123Z_browser_personal.jpg');
});

test('buildCaptureFilename: screen index suffix for multi-monitor same-timestamp sets', () => {
  const name = buildCaptureFilename(REC, { screenIndex: 2 });
  assert.equal(name, '2026-07-10T03-12-45-123Z_browser_personal_s2.jpg');
});

test('buildCaptureFilename: custom extension', () => {
  assert.match(buildCaptureFilename(REC, { ext: 'png' }), /\.png$/);
});

test('buildCaptureFilename: missing fields fall back safely', () => {
  const name = buildCaptureFilename({ ts: '2026-07-10T00:00:00.000Z' });
  assert.equal(name, '2026-07-10T00-00-00-000Z_unknown_personal.jpg');
});

// ── buildCapturePath ───────────────────────────────────────

test('buildCapturePath: root/partition/YYYY-MM/filename with forward slashes', () => {
  const p = buildCapturePath('Tabatha/Cortex/captures', REC, 'f.jpg');
  assert.equal(p, 'Tabatha/Cortex/captures/personal/2026-07/f.jpg');
});

test('buildCapturePath: org partition is a separate subtree', () => {
  const p = buildCapturePath('Tabatha/Cortex/captures', { ...REC, partition: 'org' }, 'f.jpg');
  assert.equal(p, 'Tabatha/Cortex/captures/org/2026-07/f.jpg');
});

test('buildCapturePath: sanitizes backslashes, duplicate + trailing slashes, and .. traversal', () => {
  const p = buildCapturePath('..\\evil\\\\path//', REC, 'f.jpg');
  assert.equal(p.includes('..'), false);
  assert.equal(p.includes('\\'), false);
  assert.equal(p.includes('//'), false);
  assert.match(p, /^evil\/path\/personal\/2026-07\/f\.jpg$/);
});

test('buildCapturePath: empty root falls back to default store', () => {
  const p = buildCapturePath('', REC, 'f.jpg');
  assert.match(p, /^Tabatha\/Cortex\/captures\/personal\//);
});
