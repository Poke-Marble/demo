import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';

const moduleURL = (source) =>
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source)).replaceAll("'", '%27')}`;
const load = async (path) => readFile(new URL(path, import.meta.url), 'utf8');
const sample = moduleURL(await load('../../../data/sample-map.ts'));
const setup = moduleURL(await load('../setup.ts'));
const map = moduleURL(await load('./projection-map.ts'));
const base = moduleURL(
  (await load('./adapter.ts'))
    .replaceAll('../../../data/sample-map', sample)
    .replaceAll('../setup', setup)
    .replaceAll('./projection-map', map),
);
const { createSpecialDemoAdapter } = await import(
  moduleURL(
    (await load('./special-adapter.ts'))
      .replaceAll("from './adapter'", `from '${base}'`)
      .replaceAll("from '../setup'", `from '${setup}'`),
  )
);

test('all result fixtures preserve the 1 human + 3 computer roster and publish fixed notices', () => {
  const demo = createSpecialDemoAdapter();
  const updates = [];
  demo.adapter.subscribe((update) => updates.push(update));
  for (const scenario of ['success', 'failure', 'rope'])
    demo.scenario(scenario);
  assert.equal(
    demo.adapter.getView().participants.filter((p) => p.controller === 'human')
      .length,
    1,
  );
  assert.equal(
    demo.adapter
      .getView()
      .participants.filter((p) => p.controller === 'computer').length,
    3,
  );
  assert.match(updates[0].view.notice, /성공 확정/);
  assert.match(updates[1].view.notice, /실패 확정/);
  assert.match(updates[2].view.notice, /보상 없이 종료/);
  assert.equal(new Set(updates.map((u) => u.effects[0].id)).size, 3);
  assert.equal(updates[0].emotionCues[0].reaction, 'joy');
  assert.equal(updates[1].emotionCues[0].reaction, 'distress');
  assert.equal(updates[2].emotionCues.length, 0);
});

test('portrait fixture targets all four or one computer, and named toll event never changes balances', () => {
  const demo = createSpecialDemoAdapter();
  const updates = [];
  demo.adapter.subscribe((update) => updates.push(update));
  const before = demo.adapter.getView().state;
  demo.emotion('joy');
  assert.equal(updates.at(-1).emotionCues.length, 4);
  const computer = demo.adapter.getView().participants[2].id;
  demo.emotion('bankrupt', computer);
  assert.equal(updates.at(-1).emotionCues.length, 1);
  assert.equal(updates.at(-1).emotionCues[0].playerId, computer);
  demo.toll();
  assert.equal(updates.at(-1).events[0].type, 'toll-paid');
  assert.equal(
    demo.adapter.getView().state,
    before,
    'scripted reactions do not implement economics',
  );
  const last = updates.at(-1);
  demo.replay();
  assert.equal(updates.at(-1).id, last.id);
});

test('selection cancellation and stale/duplicate confirmation never move twice', () => {
  const demo = createSpecialDemoAdapter();
  const updates = [];
  demo.adapter.subscribe((update) => updates.push(update));
  const start = demo.adapter.getView().state.players[0].position;
  demo.scenario('fly');
  const selection = demo.adapter.getView().flightSelection;
  demo.adapter.selectFlightDestination(
    'stale',
    selection.destinations[0].tileId,
  );
  demo.adapter.selectFlightDestination(selection.id, 'tile:illegal');
  assert.equal(updates.length, 1);
  demo.adapter.selectFlightDestination(selection.id, null);
  assert.equal(demo.adapter.getView().state.players[0].position, start);
  assert.equal(demo.adapter.getView().flightSelection, undefined);
  demo.scenario('fly-trial');
  const next = demo.adapter.getView().flightSelection;
  demo.adapter.selectFlightDestination(next.id, next.destinations[1].tileId);
  const count = updates.length;
  demo.adapter.selectFlightDestination(next.id, next.destinations[1].tileId);
  assert.equal(updates.length, count);
  assert.deepEqual(
    updates.at(-1).effects.map((e) => e.type),
    ['fly', 'trial-intro'],
  );
  assert.equal(updates.at(-1).effects[0].to, updates.at(-1).effects[1].tileId);
});

test('restart publishes setup invalidation and creates a fresh session; redelivery preserves IDs', () => {
  const demo = createSpecialDemoAdapter();
  const updates = [];
  demo.adapter.subscribe((update) => updates.push(update));
  demo.scenario('success');
  const first = updates.at(-1).effects[0].id;
  demo.replay();
  assert.equal(updates.at(-1).effects[0].id, first);
  demo.adapter.restart();
  assert.equal(updates.at(-2).view.state.phase, 'setup');
  demo.scenario('success');
  assert.notEqual(updates.at(-1).effects[0].id, first);
});
