import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';

const source = await readFile(new URL('./queue.ts', import.meta.url), 'utf8');
const { createEffectQueue } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`
);
const fly = {
  id: 'fly-1',
  type: 'fly',
  playerId: 'player:1',
  from: 'tile:0',
  to: 'tile:8',
};
const trial = {
  id: 'trial-1',
  type: 'trial-intro',
  legendary: 'lugia',
  playerId: 'player:1',
  tileId: 'tile:8',
};
const tick = () => Promise.resolve();

test('flight finishes before trial; duplicate requests never replay and lock spans the queue', async () => {
  const started = [],
    releases = [],
    locks = [];
  const queue = createEffectQueue(
    (request) =>
      new Promise((resolve) => {
        started.push(request.id);
        releases.push(resolve);
      }),
    (value) => locks.push(value),
  );
  const pending = queue.enqueue([fly, trial, fly]);
  assert.deepEqual(locks, [true], 'lock is synchronous');
  await tick();
  assert.deepEqual(started, ['fly-1']);
  queue.enqueue([trial]);
  releases.shift()();
  await tick();
  assert.deepEqual(started, ['fly-1', 'trial-1']);
  releases.shift()();
  await pending;
  await queue.enqueue([fly, trial]);
  assert.deepEqual(started, ['fly-1', 'trial-1']);
  assert.deepEqual(locks, [true, false]);
});

test('skip aborts only the active presentation, never drops the following landing trial', async () => {
  const started = [],
    locks = [];
  const queue = createEffectQueue(
    (request, signal) =>
      new Promise((resolve) => {
        started.push(request.id);
        signal.addEventListener('abort', resolve, { once: true });
      }),
    (value) => locks.push(value),
  );
  const pending = queue.enqueue([fly, trial]);
  await tick();
  queue.skip();
  queue.skip();
  await tick();
  assert.deepEqual(started, ['fly-1', 'trial-1']);
  queue.skip();
  await pending;
  assert.deepEqual(locks, [true, false]);
});

test('restart aborts active work, drops queued work and allows a fresh session to reuse IDs', async () => {
  const started = [],
    locks = [];
  const queue = createEffectQueue(
    (request, signal) =>
      new Promise((resolve) => {
        started.push(request.id);
        signal.addEventListener('abort', resolve, { once: true });
      }),
    (value) => locks.push(value),
  );
  const old = queue.enqueue([fly, trial]);
  await tick();
  queue.reset();
  const next = queue.enqueue([fly]);
  await tick();
  await tick();
  assert.deepEqual(started, ['fly-1', 'fly-1']);
  assert.deepEqual(
    locks,
    [true, false, true],
    'old cleanup cannot unlock the new session',
  );
  queue.skip();
  await Promise.all([old, next]);
  assert.equal(locks.at(-1), false);
});

test('reset before the drain microtask cannot steal a new session event', async () => {
  const started = [];
  const queue = createEffectQueue(
    async (request) => {
      started.push(request.id);
    },
    () => {},
  );
  const old = queue.enqueue([fly]);
  queue.reset();
  await queue.enqueue([trial]);
  await old;
  assert.deepEqual(started, ['trial-1']);
});

test('unmount resolves active work and prevents subsequent presentation', async () => {
  const started = [];
  const queue = createEffectQueue(
    (request, signal) =>
      new Promise((resolve) => {
        started.push(request.id);
        signal.addEventListener('abort', resolve, { once: true });
      }),
    () => {},
  );
  const pending = queue.enqueue([fly, trial]);
  await tick();
  queue.destroy();
  await pending;
  await queue.enqueue([trial]);
  assert.deepEqual(started, ['fly-1']);
});
