import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';

const source = await readFile(
  new URL('./emotions.ts', import.meta.url),
  'utf8',
);
const { createEmotionController, eventEmotionCues, reactions } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source))}`
);
const player = 'player:human';
const cue = (id, reaction, playerId = player) => ({ id, playerId, reaction });

test('temporary reactions return after 1600ms and duplicate delivery does not extend them', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const changed = [];
  const controller = createEmotionController((id) => changed.push(id));
  controller.apply(cue('income-1', 'joy'));
  t.mock.timers.tick(1500);
  controller.apply(cue('income-1', 'joy'));
  t.mock.timers.tick(100);
  assert.equal(controller.get(player), 'normal');
  assert.equal(changed.length, 2);
});

test('higher priority replaces reaction and stale timers cannot erase newer reactions', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = createEmotionController(() => {});
  controller.apply(cue('action', 'acting'));
  t.mock.timers.tick(800);
  controller.apply(cue('paid', 'distress'));
  controller.apply(cue('income', 'joy'));
  t.mock.timers.tick(800);
  assert.equal(controller.get(player), 'distress');
  t.mock.timers.tick(800);
  assert.equal(controller.get(player), 'normal');
});

test('all four players react independently; terminal expressions persist until reset', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = createEmotionController(() => {});
  for (let i = 0; i < 4; i++)
    controller.apply(cue(`joy-${i}`, 'joy', `player:${i}`));
  controller.apply(cue('bankrupt', 'bankrupt', 'player:1'));
  controller.apply(cue('win', 'victory', 'player:2'));
  controller.apply(cue('normal', 'normal', 'player:2'));
  controller.apply(cue('angry', 'angry', 'player:1'));
  t.mock.timers.tick(10000);
  assert.deepEqual(
    [0, 1, 2, 3].map((i) => controller.get(`player:${i}`)),
    ['normal', 'bankrupt', 'victory', 'normal'],
  );
  controller.reset();
  assert.equal(controller.get('player:1'), 'normal');
  controller.apply(cue('win', 'joy', 'player:2'));
  assert.equal(controller.get('player:2'), 'joy', 'new session can reuse IDs');
});

test('reset and unmount clear timers and prevent late notifications', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const changes = [];
  const controller = createEmotionController((id) => changes.push(id));
  controller.apply(cue('old', 'joy'));
  controller.reset();
  controller.apply(cue('new', 'pain'));
  controller.destroy();
  const count = changes.length;
  t.mock.timers.tick(10000);
  controller.apply(cue('late', 'joy'));
  assert.equal(changes.length, count);
  assert.equal(controller.get(player), 'normal');
});

test('event mapping uses payer, recipient and authoritative holding owner; balances alone do nothing', () => {
  const state = {
    activePlayerId: 'player:other',
    holdings: [{ tileId: 'tile:city', ownerId: 'player:owner' }],
    players: [{ id: player, balance: 999999 }],
  };
  const events = [
    {
      type: 'toll-paid',
      fromPlayerId: player,
      toPlayerId: 'player:com',
      amount: 0,
    },
    { type: 'facility-upgraded', tileId: 'tile:city', level: 2 },
    { type: 'facility-upgraded', tileId: 'tile:unknown', level: 2 },
    { type: 'city-acquired', playerId: player, tileId: 'tile:city' },
  ];
  assert.deepEqual(
    eventEmotionCues(events, state, 'update:1').map(
      ({ playerId, reaction }) => [playerId, reaction],
    ),
    [
      [player, 'distress'],
      ['player:com', 'joy'],
      ['player:owner', 'joy'],
      [player, 'joy'],
    ],
  );
  assert.deepEqual(eventEmotionCues([], state, 'update:2'), []);
  assert.equal(reactions.bankrupt.emotion, 'Sad');
  assert.equal(reactions.angry.emotion, 'Angry');
  assert.notEqual(reactions.bankrupt.label, reactions.angry.label);
});

test('snapshot hydration restores terminal moods without an event history', () => {
  const controller = createEmotionController(() => {});
  controller.syncState({
    players: [
      { id: player, bankrupt: true },
      { id: 'player:com', bankrupt: false },
    ],
    victory: { winnerId: 'player:com' },
  });
  assert.equal(controller.get(player), 'bankrupt');
  assert.equal(controller.get('player:com'), 'victory');
  controller.destroy();
});
