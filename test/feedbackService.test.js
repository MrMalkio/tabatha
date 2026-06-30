// Workstream B2 — in-app feedback → Asana (edge-function brokered).
// Verifies the SUBMIT_FEEDBACK handler posts a well-formed request to the
// feedback-to-asana edge function, carries version + identity context, and
// surfaces non-OK / validation errors. fetch is mocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installChromeMock } from '../testutils/chromeMock.js';

installChromeMock({
  store: { _browserProfile: { localId: 'local-abc', machineId: 'machine-xyz' } },
});
const feedback = await import('../src/background/services/feedbackService.js');

function mockFetch(impl) {
  const calls = [];
  const fn = async (url, opts) => { calls.push({ url, opts }); return impl(url, opts); };
  fn.calls = calls;
  return fn;
}

const okResponse = () => ({ ok: true, status: 201, async json() { return { data: { gid: '123' } }; } });

test('SUBMIT_FEEDBACK posts a well-formed request to the edge function', async () => {
  const fetchImpl = mockFetch(okResponse);
  feedback.configureFeedbackService({ fetchImpl });

  const r = await feedback.handleMessage('SUBMIT_FEEDBACK', {
    kind: 'bug', text: 'Timer is wrong', context: { surface: 'popup', url: 'https://x.test' },
  });

  assert.equal(r.ok, true);
  assert.equal(fetchImpl.calls.length, 1);
  const { url, opts } = fetchImpl.calls[0];
  assert.match(url, /\/functions\/v1\/feedback-to-asana$/);
  assert.equal(opts.method, 'POST');
  assert.equal(opts.headers['Content-Type'], 'application/json');
  assert.match(opts.headers['Authorization'], /^Bearer .+/);
  const body = JSON.parse(opts.body);
  assert.equal(body.kind, 'bug');
  assert.equal(body.text, 'Timer is wrong');
});

test('SUBMIT_FEEDBACK includes version and identity context', async () => {
  const fetchImpl = mockFetch(okResponse);
  feedback.configureFeedbackService({ fetchImpl });

  await feedback.handleMessage('SUBMIT_FEEDBACK', {
    kind: 'idea', text: 'Add dark mode', context: { surface: 'settings' },
  });

  const body = JSON.parse(fetchImpl.calls[0].opts.body);
  assert.equal(body.version, '6.0.0'); // from chrome.runtime.getManifest()
  assert.ok(body.submittedAt, 'submittedAt present');
  assert.equal(body.context.surface, 'settings');
  assert.equal(body.context.machineId, 'machine-xyz');
  assert.equal(body.context.localId, 'local-abc');
});

test('SUBMIT_FEEDBACK rejects empty text without calling fetch', async () => {
  const fetchImpl = mockFetch(okResponse);
  feedback.configureFeedbackService({ fetchImpl });

  const r = await feedback.handleMessage('SUBMIT_FEEDBACK', { kind: 'bug', text: '   ' });
  assert.equal(r.ok, false);
  assert.ok(r.error);
  assert.equal(fetchImpl.calls.length, 0);
});

test('SUBMIT_FEEDBACK returns an error on a non-OK response', async () => {
  const fetchImpl = mockFetch(async () => ({ ok: false, status: 500, statusText: 'Internal Error', async text() { return 'boom'; } }));
  feedback.configureFeedbackService({ fetchImpl });

  const r = await feedback.handleMessage('SUBMIT_FEEDBACK', { kind: 'bug', text: 'crash' });
  assert.equal(r.ok, false);
  assert.match(r.error, /500/);
});

test('SUBMIT_FEEDBACK surfaces a network/timeout error', async () => {
  const fetchImpl = mockFetch(async () => { throw new Error('timeout'); });
  feedback.configureFeedbackService({ fetchImpl });

  const r = await feedback.handleMessage('SUBMIT_FEEDBACK', { kind: 'bug', text: 'hangs' });
  assert.equal(r.ok, false);
  assert.match(r.error, /timeout/i);
});

test('handleMessage ignores unrelated message types', async () => {
  const r = await feedback.handleMessage('SOMETHING_ELSE', {});
  assert.equal(r, undefined);
});
