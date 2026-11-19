import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch } from './core/index.ts';
import { legalFlyDestinations, quoteBlessing } from './legendary.ts';
import { kantoJohtoMap } from '../data/maps/kanto-johto.ts';
import { toMapDefinition } from '../data/maps/types.ts';

const map = toMapDefinition(kantoJohtoMap);
const roster = Array.from({ length: 4 }, (_, i) => ({
  id: `player:${i}`,
  name: i ? `COMPUTER ${i}` : 'Human',
  pokemonId: `pokemon:000${i + 1}`,
}));
const make = (legendary = {}) =>
  createGame(map, roster, { seed: 1, legendary });
const act = (s, type, extra = {}, hooks = {}) =>
  dispatch(s, map, { type, playerId: s.activePlayerId, ...extra }, hooks);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}
function landAt(index, rules = {}) {
  let state = make(rules);
  state = {
    ...state,
    players: state.players.map((p, i) =>
      i ? p : { ...p, position: map.tiles[(index - 5 + 32) % 32].id },
    ),
  };
  const result = act(freeze(state), 'roll-dice');
  assert.equal(result.ok, true);
  assert.equal(result.state.players[0].position, map.tiles[index].id);
  return result;
}
function nextOwnTurn(state) {
  state = act(state, 'end-turn').state;
  while (state.activePlayerId !== 'player:0') {
    const data = state.legendary.players[state.activePlayerId];
    state = act(state, data.trial ? 'attempt-trial' : 'roll-dice').state;
    if (state.legendary.pendingFly)
      state = act(state, 'fly', { to: map.tiles[0].id }).state;
    if (
      state.legendary.players[state.activePlayerId].trial?.lastAttemptTurn !==
        state.turnNumber &&
      state.legendary.players[state.activePlayerId].trial
    )
      state = act(state, 'attempt-trial').state;
    const ended = act(state, 'end-turn');
    assert.equal(ended.ok, true);
    state = ended.state;
  }
  return state;
}
function rejects(state, type, error, extra = {}, hooks = {}) {
  const before = JSON.stringify(state);
  const result = act(freeze(state), type, extra, hooks);
  assert.equal(result.ok, false);
  assert.equal(result.error, error);
  assert.equal(result.state, state);
  assert.deepEqual(result.events, []);
  assert.equal(JSON.stringify(state), before);
}

test('opt-in preserves legacy state, dice, human + three computers and JSON replay', () => {
  const legacy = createGame(map, roster, { seed: 1 });
  assert.equal('legendary' in legacy, false);
  rejects(legacy, 'attempt-trial', 'legendary-disabled');
  const result = act(legacy, 'roll-dice');
  assert.deepEqual(result.events[0].values, [4, 1]);
  assert.equal('presentations' in result, false);
  assert.deepEqual(
    make().players.map((p) => p.name),
    roster.map((p) => p.name),
  );
  assert.deepEqual(
    act(JSON.parse(JSON.stringify(make())), 'roll-dice'),
    act(make(), 'roll-dice'),
  );
  for (const rules of [
    { successChance: NaN },
    { tollDiscount: 2 },
    { upgradeDiscount: -1 },
    { guaranteedAttempt: 0 },
    { initialRopes: 1.5 },
  ])
    assert.throws(() => make(rules), RangeError);
});

test('trial arrival, failed stays, one attempt per own turn and third guaranteed success', () => {
  const arrival = landAt(8, { successChance: 0 });
  assert.deepEqual(arrival.presentations, [
    {
      type: 'trial-intro',
      legendary: 'lugia',
      playerId: 'player:0',
      tileId: map.tiles[8].id,
    },
  ]);
  let state = arrival.state;
  rejects(state, 'end-turn', 'trial-pending');
  rejects(state, 'roll-dice', 'trial-pending');
  rejects(state, 'fly', 'trial-pending', { to: map.tiles[1].id });
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = act(freeze(state), 'attempt-trial');
    assert.equal(result.ok, true);
    assert.equal(result.events[0].attempt, attempt);
    assert.equal(result.events[0].success, attempt === 3);
    assert.equal(result.state.players[0].position, map.tiles[8].id);
    assert.equal(result.state.players[0].balance, state.players[0].balance);
    state = result.state;
    if (attempt < 3) {
      rejects(state, 'attempt-trial', 'trial-already-attempted');
      assert.equal(
        act(state, 'use-escape-rope').state.core.turnStage,
        'awaiting-roll',
      );
      rejects(state, 'roll-dice', 'trial-pending');
    } else {
      assert.equal(state.legendary.players['player:0'].trial, null);
      assert.equal(state.legendary.players['player:0'].lugia, true);
      rejects(state, 'roll-dice', 'already-rolled');
    }
    state = nextOwnTurn(state);
  }
  assert.equal(act(state, 'roll-dice').ok, true);
});

test('rope consumes inventory, grants no blessing and permits a current-turn roll', () => {
  let state = landAt(16, { successChance: 0 }).state;
  state = nextOwnTurn(act(state, 'attempt-trial').state);
  const escaped = act(freeze(state), 'use-escape-rope');
  assert.equal(escaped.ok, true);
  assert.deepEqual(escaped.events, [
    { type: 'rope-used', playerId: 'player:0' },
  ]);
  assert.equal(escaped.state.legendary.players['player:0'].ropes, 0);
  assert.equal(escaped.state.legendary.players['player:0'].hoOh, false);
  assert.equal(escaped.state.legendary.players['player:0'].trial, null);
  assert.equal(escaped.state.core.rngState, state.core.rngState);
  assert.equal(act(escaped.state, 'roll-dice').ok, true);
  rejects(escaped.state, 'use-escape-rope', 'trial-required');
  rejects(
    landAt(8, { initialRopes: 0 }).state,
    'use-escape-rope',
    'no-escape-rope',
  );
});

test('blessings are independent one-use quotes with integer rounding and no premature spending', () => {
  const won = act(
    landAt(16, { successChance: 1, upgradeDiscount: 0.25 }).state,
    'attempt-trial',
  ).state;
  const before = JSON.stringify(won);
  const unused = quoteBlessing(won, 'player:0', 'toll', 101);
  assert.equal(unused.consumed, false);
  const quote = quoteBlessing(freeze(won), 'player:0', 'upgrade', 101);
  assert.equal(quote.amount, 76);
  assert.equal(quote.consumed, true);
  assert.equal(JSON.stringify(won), before);
  assert.equal(quote.state.players[0].balance, won.players[0].balance);
  assert.equal(
    quoteBlessing(quote.state, 'player:0', 'upgrade', 101).amount,
    101,
  );
  assert.equal(quoteBlessing(won, 'player:0', 'upgrade', 0).state, won);
  const lugia = act(
    landAt(8, { successChance: 1 }).state,
    'attempt-trial',
  ).state;
  assert.equal(quoteBlessing(lugia, 'player:0', 'toll', 101).amount, 51);
  assert.throws(
    () => quoteBlessing(won, 'player:0', 'upgrade', -1),
    RangeError,
  );
});

test('flight validates destinations, suppresses START rewards and processes landing once', () => {
  const arrival = landAt(24);
  const state = arrival.state;
  assert.equal(legalFlyDestinations(state, map).length, 31);
  rejects(state, 'end-turn', 'flight-required');
  rejects(state, 'roll-dice', 'flight-required');
  rejects(state, 'fly', 'invalid-destination', { to: 'tile:missing' });
  rejects(state, 'fly', 'invalid-destination', { to: map.tiles[24].id });
  rejects(state, 'fly', 'wrong-player', {
    playerId: 'player:1',
    to: map.tiles[1].id,
  });
  let landings = 0;
  const fly = act(
    freeze(state),
    'fly',
    { to: map.tiles[0].id },
    {
      onLand: (s) => {
        landings++;
        return {
          players: s.players.map((p, i) =>
            i ? p : { ...p, balance: p.balance + 7 },
          ),
        };
      },
    },
  );
  assert.equal(fly.ok, true);
  assert.equal(landings, 1);
  assert.equal(fly.state.players[0].balance, state.players[0].balance + 7);
  assert.equal(
    fly.events.some((e) => e.type === 'start-rewarded'),
    false,
  );
  assert.equal(fly.state.core.rngState, state.core.rngState);
  assert.deepEqual(fly.presentations, [
    {
      type: 'fly',
      playerId: 'player:0',
      from: map.tiles[24].id,
      to: map.tiles[0].id,
    },
  ]);
  rejects(fly.state, 'fly', 'flight-required', { to: map.tiles[1].id });
  assert.equal(act(fly.state, 'end-turn').ok, true);
  rejects(
    state,
    'fly',
    'invalid-hook-effect',
    { to: map.tiles[1].id },
    { onLand: () => ({ players: [] }) },
  );
});

test('flight into each trial orders fly then intro and bypasses property hooks', () => {
  for (const index of [8, 16]) {
    const flown = act(
      landAt(24).state,
      'fly',
      { to: map.tiles[index].id },
      {
        onLand: () => {
          throw new Error('special tiles are not properties');
        },
      },
    );
    assert.equal(flown.ok, true);
    assert.deepEqual(
      flown.presentations.map((p) => p.type),
      ['fly', 'trial-intro'],
    );
    assert.equal(flown.state.legendary.pendingFly, null);
    rejects(flown.state, 'fly', 'trial-pending', { to: map.tiles[1].id });
    assert.equal(act(flown.state, 'attempt-trial').ok, true);
  }
});

test('normal flight landing integrates bankruptcy/victory and invalid saved extension rejects atomically', () => {
  const state = landAt(24).state;
  const result = act(
    state,
    'fly',
    { to: map.tiles[1].id },
    {
      onLand: (s) => ({
        players: s.players.map((p, i) => ({ ...p, bankrupt: i === 0 })),
        victory: { winnerId: 'player:1', reason: 'last-player-standing' },
      }),
    },
  );
  assert.equal(result.state.phase, 'finished');
  rejects(result.state, 'fly', 'game-not-playing', { to: map.tiles[2].id });
  const invalid = {
    ...state,
    legendary: {
      ...state.legendary,
      pendingFly: { playerId: 'player:1', turn: state.turnNumber },
    },
  };
  rejects(invalid, 'fly', 'invalid-legendary-state', { to: map.tiles[1].id });
});
