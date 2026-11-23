import test from 'node:test';
import assert from 'node:assert/strict';
import { cashDeltaText, createCashDeltaGate } from './model.ts';

// Contract tests: amounts below are snapshot fixtures, not game outcomes.
const view = (revision, balances = [1000, 1000, 1000, 1000], extra = {}) => ({
  state: {
    phase: 'playing',
    mapId: 'map:test',
    economy: { sessionId: 'one', revision },
    players: balances.map((balance, i) => ({ id: `player:${i + 1}`, balance })),
    ...extra,
  },
});
const update = (next, id) => ({
  view: next,
  events: [],
  ...(id ? { id } : {}),
});

test('all four actual snapshot deltas, both toll sides, sale and reward without event vocabulary', () => {
  const gate = createCashDeltaGate(view(0));
  assert.deepEqual(gate.accept(update(view(1, [800, 1200, 1300, 600]))), [
    { playerId: 'player:1', amount: -200 },
    { playerId: 'player:2', amount: 200 },
    { playerId: 'player:3', amount: 300 },
    { playerId: 'player:4', amount: -400 },
  ]);
  assert.deepEqual(gate.accept(update(view(2, [800, 1200, 1300, 600]))), []);
});

test('repeated, cloned, delayed ACK and stale revisions never replay or rewind baseline', () => {
  const gate = createCashDeltaGate(view(0));
  const paid = update(view(1, [700, 1000, 1000, 1000]), 'purchase');
  assert.equal(gate.accept(paid)[0].amount, -300);
  assert.deepEqual(gate.accept(paid), []);
  assert.deepEqual(gate.accept(JSON.parse(JSON.stringify(paid))), []);
  assert.deepEqual(
    gate.accept(update(view(1, [700, 1000, 1000, 1000]), 'ack')),
    [],
  );
  assert.deepEqual(gate.accept(update(view(0), 'stale')), []);
  assert.equal(
    gate.accept(update(view(2, [650, 1000, 1000, 1000])))[0].amount,
    -50,
  );
});

test('debt waiting is silent; partial settlement emits recovered cash only, later ACK silent', () => {
  const gate = createCashDeltaGate(view(0));
  assert.deepEqual(gate.accept(update(view(1))), []);
  assert.deepEqual(gate.accept(update(view(2, [750, 1250, 1000, 1000]))), [
    { playerId: 'player:1', amount: -250 },
    { playerId: 'player:2', amount: 250 },
  ]);
  assert.deepEqual(gate.accept(update(view(3, [750, 1250, 1000, 1000]))), []);
});

test('setup, starting capital, reset and new session only establish baseline', () => {
  const gate = createCashDeltaGate(view(0, [0, 0, 0, 0], { phase: 'setup' }));
  assert.deepEqual(gate.accept(update(view(0))), []);
  assert.equal(gate.accept(update(view(1, [900, 1000, 1000, 1000]))).length, 1);
  const setup = view(0, [0, 0, 0, 0], { phase: 'setup' });
  gate.reset(setup);
  assert.deepEqual(gate.accept(update(setup)), []);
  assert.deepEqual(gate.accept(update(view(0))), []);
  assert.deepEqual(
    gate.accept(
      update(
        view(0, [2000, 2000, 2000, 2000], {
          economy: { sessionId: 'two', revision: 0 },
        }),
      ),
    ),
    [],
  );
});

test('plain snapshots still dedupe unchanged balances; new players are not income', () => {
  const plain = (balances) => view(0, balances, { economy: undefined });
  const gate = createCashDeltaGate(plain([1000]));
  assert.deepEqual(gate.accept(update(plain([900, 1000]))), [
    { playerId: 'player:1', amount: -100 },
  ]);
  assert.deepEqual(gate.accept(update(plain([900, 1000]))), []);
});

test('signed currency matches game grouping and uses noncolor signs', () => {
  assert.equal(cashDeltaText(1300), '+1,300 ₽');
  assert.equal(cashDeltaText(-200), '−200 ₽');
});
