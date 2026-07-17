import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ANASA_BASE_URL,
  anasaTaskHref,
  asanaTaskHref,
  hasAsanaTask,
} from '../src/utils/taskDestinationLinks.js';

test('Asana destination prefers the source permalink and falls back to its GID', () => {
  assert.equal(asanaTaskHref({
    externalContext: { provider: 'asana', externalId: '123', url: 'https://app.asana.com/0/1/123' },
  }), 'https://app.asana.com/0/1/123');
  assert.equal(asanaTaskHref({ asanaGid: '456' }), 'https://app.asana.com/0/0/456/f');
  assert.equal(hasAsanaTask({ name: 'Local only' }), false);
});

test('Anasa destination opens a known mirror directly or searches by task name', () => {
  assert.equal(anasaTaskHref({
    name: 'Linked',
    externalContext: { provider: 'asana', anasaTaskId: 'task/abc' },
  }), `${DEFAULT_ANASA_BASE_URL}/tasks/task%2Fabc`);
  assert.equal(
    anasaTaskHref({ name: 'Ship & verify' }, 'https://anasa.tailnet.example/'),
    'https://anasa.tailnet.example/tasks?search=Ship%20%26%20verify',
  );
});
