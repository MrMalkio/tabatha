// Plan 040 Addendum 7 — voice check-in parser unit tests (node:test, no
// new deps). Same mirror convention as timer-math.test.mjs: the source
// module (`sidecar/src/lib/voiceCheckin.ts`) imports `react-native` at
// module scope, so it can't be loaded under plain `node --test`; the pure
// functions are mirrored here VERBATIM with their source noted so drift is
// easy to catch on re-review:
//
//   inferProgressLevel / parseVoiceCommand / hhmmToMinutes / isQuietNowHHMM
//     <- sidecar/src/lib/voiceCheckin.ts (verbatim copies)
//
// If any source function changes, update the mirror + re-run this file.

import test from 'node:test';
import assert from 'node:assert/strict';

// ── mirror: sidecar/src/lib/voiceCheckin.ts ────────────────────────────
function inferProgressLevel(text) {
  const t = text.toLowerCase();
  if (/\bstuck\b/.test(t)) return 'stuck';
  if (/\balmost\b/.test(t)) return 'almost_done';
  if (/\ba lot\b|\bgreat\b|\bhuge\b/.test(t)) return 'lot';
  if (/\blittle\b/.test(t)) return 'little';
  return 'none';
}

function parseVoiceCommand(transcript) {
  const text = (transcript || '').trim();
  if (!text) return null;

  const extend = /(?:extend|add)\s+(\d+)\s*min/i.exec(text);
  if (extend) {
    const minutes = parseInt(extend[1], 10);
    if (Number.isFinite(minutes) && minutes > 0) return { kind: 'extend', minutes };
  }
  if (/^pause/i.test(text)) return { kind: 'pause' };
  if (/^resume/i.test(text)) return { kind: 'resume' };
  if (/^(?:done|finished|resolve)/i.test(text)) return { kind: 'resolve' };

  return { kind: 'checkpoint', text, level: inferProgressLevel(text) };
}

function hhmmToMinutes(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

function isQuietNowHHMM(start, end, at = new Date()) {
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (s == null || e == null || s === e) return false;
  const now = at.getHours() * 60 + at.getMinutes();
  return s < e ? now >= s && now < e : now >= s || now < e;
}

// ── verb route: extend ─────────────────────────────────────────────────

test('extend: "extend 10 minutes" → extend 10', () => {
  assert.deepEqual(parseVoiceCommand('extend 10 minutes'), { kind: 'extend', minutes: 10 });
});

test('extend: "add 5 min" → extend 5', () => {
  assert.deepEqual(parseVoiceCommand('add 5 min'), { kind: 'extend', minutes: 5 });
});

test('extend: matches mid-sentence and case-insensitively', () => {
  assert.deepEqual(parseVoiceCommand('please Extend 25 Minutes on this'), {
    kind: 'extend',
    minutes: 25,
  });
});

test('extend: zero minutes does NOT extend — falls through to checkpoint', () => {
  const cmd = parseVoiceCommand('add 0 minutes');
  assert.equal(cmd.kind, 'checkpoint');
});

test('extend: "add minutes" without a number is a checkpoint', () => {
  const cmd = parseVoiceCommand('add some minutes of polish');
  assert.equal(cmd.kind, 'checkpoint');
});

// ── verb routes: pause / resume / resolve ──────────────────────────────

test('pause: "pause" and "Pause the timer" → pause (anchored at start)', () => {
  assert.deepEqual(parseVoiceCommand('pause'), { kind: 'pause' });
  assert.deepEqual(parseVoiceCommand('Pause the timer'), { kind: 'pause' });
});

test('pause: NOT matched mid-sentence ("we should pause" is a checkpoint)', () => {
  assert.equal(parseVoiceCommand('we should pause soon').kind, 'checkpoint');
});

test('resume: "resume" → resume', () => {
  assert.deepEqual(parseVoiceCommand('resume'), { kind: 'resume' });
  assert.deepEqual(parseVoiceCommand('RESUME working'), { kind: 'resume' });
});

test('resolve: "done" / "finished" / "resolve" → resolve', () => {
  assert.deepEqual(parseVoiceCommand('done'), { kind: 'resolve' });
  assert.deepEqual(parseVoiceCommand('Finished'), { kind: 'resolve' });
  assert.deepEqual(parseVoiceCommand('resolve'), { kind: 'resolve' });
});

test('resolve: prefix-matches "resolved" and "finished it"', () => {
  assert.deepEqual(parseVoiceCommand('resolved'), { kind: 'resolve' });
  assert.deepEqual(parseVoiceCommand('finished it just now'), { kind: 'resolve' });
});

test('resolve: NOT matched mid-sentence ("almost done" is a checkpoint)', () => {
  const cmd = parseVoiceCommand('almost done with the draft');
  assert.equal(cmd.kind, 'checkpoint');
  assert.equal(cmd.level, 'almost_done');
});

// ── precedence & edge cases ────────────────────────────────────────────

test('extend wins over pause/resolve verbs later in the phrase', () => {
  // extend is checked first, so a transcript that contains both routes to extend
  assert.deepEqual(parseVoiceCommand('extend 15 minutes then done'), {
    kind: 'extend',
    minutes: 15,
  });
});

test('empty / whitespace / null transcripts → null (nothing applied)', () => {
  assert.equal(parseVoiceCommand(''), null);
  assert.equal(parseVoiceCommand('   '), null);
  assert.equal(parseVoiceCommand(null), null);
  assert.equal(parseVoiceCommand(undefined), null);
});

// ── checkpoint level inference ─────────────────────────────────────────

test('level: "stuck" → stuck', () => {
  const cmd = parseVoiceCommand('I am stuck on the auth flow');
  assert.equal(cmd.kind, 'checkpoint');
  assert.equal(cmd.level, 'stuck');
});

test('level: "almost" → almost_done', () => {
  assert.equal(parseVoiceCommand('this is almost wrapped up').level, 'almost_done');
});

test('level: "a lot" / "great" / "huge" → lot', () => {
  assert.equal(parseVoiceCommand('made a lot of headway').level, 'lot');
  assert.equal(parseVoiceCommand('great progress on the parser').level, 'lot');
  assert.equal(parseVoiceCommand('huge step forward today').level, 'lot');
});

test('level: "little" → little', () => {
  assert.equal(parseVoiceCommand('made a little progress').level, 'little');
});

test('level: no keyword → none, transcript preserved as the note text', () => {
  const cmd = parseVoiceCommand('refactored the settings card');
  assert.equal(cmd.kind, 'checkpoint');
  assert.equal(cmd.level, 'none');
  assert.equal(cmd.text, 'refactored the settings card');
});

test('level precedence: stuck beats other keywords in the same sentence', () => {
  assert.equal(parseVoiceCommand('great progress but now stuck').level, 'stuck');
});

test('level: keyword matching is word-bounded ("stuckness" is not stuck)', () => {
  assert.equal(parseVoiceCommand('exploring stuckness patterns').level, 'none');
});

// ── quiet hours (Epic 8 shape, read-only) ──────────────────────────────

function at(h, m) {
  const d = new Date(2026, 6, 18, h, m, 0, 0); // local time, like the source
  return d;
}

test('quiet hours: inside a same-day window', () => {
  assert.equal(isQuietNowHHMM('09:00', '17:00', at(12, 0)), true);
  assert.equal(isQuietNowHHMM('09:00', '17:00', at(8, 59)), false);
  assert.equal(isQuietNowHHMM('09:00', '17:00', at(17, 0)), false); // end-exclusive
});

test('quiet hours: wraps past midnight when start > end', () => {
  assert.equal(isQuietNowHHMM('22:00', '07:00', at(23, 30)), true);
  assert.equal(isQuietNowHHMM('22:00', '07:00', at(3, 0)), true);
  assert.equal(isQuietNowHHMM('22:00', '07:00', at(12, 0)), false);
});

test('quiet hours: absent or malformed shape skips silently (false)', () => {
  assert.equal(isQuietNowHHMM(undefined, undefined, at(23, 0)), false);
  assert.equal(isQuietNowHHMM(null, '07:00', at(23, 0)), false);
  assert.equal(isQuietNowHHMM('not-a-time', '07:00', at(23, 0)), false);
  assert.equal(isQuietNowHHMM('25:00', '07:00', at(23, 0)), false);
  assert.equal(isQuietNowHHMM('22:00', '22:00', at(23, 0)), false); // start === end → inert
});
