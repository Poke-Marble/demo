import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch } from './index.ts';
import { nextRandom } from './random.ts';

const map = {
  id: 'map:test',
  completeness: 'sample',
  cityGroups: [],
  tiles: Array.from({ length: 8 }, (_, i) => ({
    id: `tile:${i}`,
    nameKo: `${i}`,
    kind: i === 0 ? 'start' : 'landmark',
  })),
};
const roster = Array.from({ length: 4 }, (_, i) => ({
  id: `player:${i}`,
  name: `Player ${i}`,
  pokemonId: `pokemon:000${i + 1}`,
}));
const make = (count = 2, options = {}) =>
  createGame(map, roster.slice(0, count), options);
const roll = (state, board = map, hooks = {}) =>
  dispatch(
    state,
    board,
    { type: 'roll-dice', playerId: state.activePlayerId },
    hooks,
  );
const end = (state, hooks = {}) =>
  dispatch(
    state,
    map,
    { type: 'end-turn', playerId: state.activePlayerId },
    hooks,
  );
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    Object.values(value).forEach(freeze);
  }
  return value;
}

test('initializes 2–4 players in supplied order and copies inputs', () => {
  for (const count of [2, 3, 4]) {
    const state = make(count);
    assert.equal(state.players.length, count);
    assert.equal(state.turnNumber, 1);
    assert.equal(state.activePlayerId, roster[0].id);
    assert.equal(state.players[0].position, 'tile:0');
    assert.equal(state.players[0].balance, 1500);
    assert.notEqual(state.players[0], roster[0]);
  }
  for (const players of [
    [],
    roster.slice(0, 1),
    [...roster, roster[0]],
    [roster[0], roster[0]],
  ]) {
    assert.throws(() => createGame(map, players), RangeError);
  }
  for (const seed of [-1, 0x100000000, NaN, 1.5])
    assert.throws(() => make(2, { seed }), RangeError);
  assert.throws(() => make(2, { rules: { startReward: -1 } }), RangeError);
  assert.throws(
    () => createGame({ ...map, tiles: [map.tiles[1]] }, roster.slice(0, 2)),
    RangeError,
  );
});

test('seeded dice are deterministic, bounded, replayable and immutable', () => {
  let left = freeze(make(4, { seed: 1234 }));
  let right = make(4, { seed: 1234 });
  const seen = new Set();
  for (let i = 0; i < 100; i++) {
    const before = JSON.stringify(left);
    const a = roll(left);
    const b = roll(right);
    assert.equal(a.ok, true);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(left), before);
    const dice = a.events[0].values;
    assert.equal(dice.length, 2);
    dice.forEach((die) => {
      assert.ok(die >= 1 && die <= 6);
      seen.add(die);
    });
    left = freeze(end(a.state).state);
    right = end(b.state).state;
  }
  assert.equal(seen.size, 6);
  assert.deepEqual(nextRandom(1), {
    state: 1831565814,
    value: 0.6270739405881613,
  });
  const saved = JSON.parse(JSON.stringify(left));
  assert.deepEqual(roll(saved), roll(left));
});

test('rejects wrong turn, duplicate rolls, early end, unsupported and finished actions atomically', () => {
  const state = freeze(make());
  const rejected = [
    [
      dispatch(state, map, { type: 'roll-dice', playerId: 'player:1' }),
      'wrong-player',
    ],
    [end(state), 'roll-required'],
    [
      dispatch(state, map, {
        type: 'buy-city',
        playerId: 'player:0',
        tileId: 'tile:1',
      }),
      'unsupported-action',
    ],
  ];
  for (const [result, error] of rejected) {
    assert.equal(result.ok, false);
    assert.equal(result.error, error);
    assert.equal(result.state, state);
    assert.deepEqual(result.events, []);
  }
  const rolled = roll(state).state;
  assert.equal(roll(rolled).error, 'already-rolled');
  for (const type of ['roll-dice', 'end-turn', 'buy-city']) {
    assert.equal(
      dispatch({ ...state, phase: 'finished' }, map, {
        type,
        playerId: 'player:0',
      }).error,
      'game-not-playing',
    );
  }
  assert.equal(roll(state, { ...map, id: 'map:other' }).error, 'invalid-state');
});

test('wraps board and rewards each start crossing, including exact landing and shifted start', () => {
  for (const startIndex of [0, 3]) {
    const board = {
      ...map,
      tiles: map.tiles.map((tile, i) => ({
        ...tile,
        kind: i === startIndex ? 'start' : 'landmark',
      })),
    };
    for (let seed = 0; seed < 30; seed++) {
      const state = createGame(board, roster.slice(0, 2), {
        seed,
        rules: { startReward: 17 },
      });
      const distance = roll(state, board).events[0].values.reduce(
        (a, b) => a + b,
        0,
      );
      for (const from of [0, 1, 7]) {
        const input = {
          ...state,
          players: state.players.map((p, i) =>
            i === 0 ? { ...p, position: `tile:${from}` } : p,
          ),
        };
        const result = roll(input, board);
        const passes = Math.floor(
          (((from - startIndex + 8) % 8) + distance) / 8,
        );
        assert.equal(
          result.state.players[0].position,
          `tile:${(from + distance) % 8}`,
        );
        assert.equal(result.state.players[0].balance, 1500 + passes * 17);
        assert.equal(
          result.events.find((e) => e.type === 'start-rewarded')?.passes ?? 0,
          passes,
        );
      }
    }
  }
  const small = { ...map, tiles: map.tiles.slice(0, 2) };
  const result = roll(createGame(small, roster.slice(0, 2)), small);
  assert.ok(result.events.find((e) => e.type === 'start-rewarded').passes >= 1);
});

test('cycles supplied order, skips bankrupt players and continues doubles', () => {
  let state = make(4);
  state = {
    ...state,
    players: state.players.map((p, i) => ({
      ...p,
      bankrupt: i === 1 || i === 3,
    })),
  };
  assert.equal(end(roll(state).state).state.activePlayerId, 'player:2');
  assert.equal(
    end(roll(end(roll(state).state).state).state).state.activePlayerId,
    'player:0',
  );
  let doublesSeed = 0;
  while (true) {
    const result = roll(make(2, { seed: doublesSeed }));
    if (result.events[0].values[0] === result.events[0].values[1]) {
      assert.equal(end(result.state).state.activePlayerId, 'player:0');
      assert.equal(end(result.state).state.turnNumber, 1);
      break;
    }
    doublesSeed++;
  }
});

test('landing and turn-end effects integrate bankruptcy and external victory', () => {
  const state = freeze(make(3));
  const landed = roll(state, map, {
    onLand: (snapshot, tile) => {
      assert.equal(snapshot.players[0].position, tile.id);
      return {
        players: snapshot.players.map((p, i) => ({ ...p, bankrupt: i < 2 })),
      };
    },
  });
  assert.equal(end(landed.state).state.activePlayerId, 'player:2');
  const finished = end(roll(state).state, {
    onEndTurn: () => ({
      victory: { winnerId: 'player:0', reason: 'last-player-standing' },
      events: [
        {
          type: 'game-won',
          playerId: 'player:0',
          reason: 'last-player-standing',
        },
      ],
    }),
  });
  assert.equal(finished.state.phase, 'finished');
  assert.equal(finished.state.turnNumber, 1);
  assert.equal(roll(finished.state).error, 'game-not-playing');
  const allOut = end(roll(state).state, {
    onEndTurn: (s) => ({
      players: s.players.map((p) => ({ ...p, bankrupt: true })),
    }),
  });
  assert.equal(allOut.state.phase, 'finished');
  assert.equal(allOut.state.victory, null);
  const invalid = roll(state, map, { onLand: () => ({ players: [] }) });
  assert.equal(invalid.error, 'invalid-hook-effect');
  assert.equal(invalid.state, state);
  assert.equal(invalid.state.core.rngState, 1);
});

test('known seed movement, last survivor and landing victory have explicit outcomes', () => {
  const state = make(2, { seed: 1 });
  const moved = roll({
    ...state,
    players: state.players.map((p, i) =>
      i === 0 ? { ...p, position: 'tile:7' } : p,
    ),
  });
  assert.deepEqual(moved.events[0].values, [4, 1]);
  assert.equal(moved.state.players[0].position, 'tile:4');
  assert.equal(moved.state.players[0].balance, 1700);
  const survivor = end(moved.state, {
    onEndTurn: (s) => ({
      players: s.players.map((p, i) => ({ ...p, bankrupt: i === 1 })),
    }),
  });
  assert.equal(survivor.state.activePlayerId, 'player:0');
  assert.equal(survivor.state.phase, 'playing');
  assert.equal(survivor.state.turnNumber, 2);
  assert.equal(survivor.state.core.turnStage, 'awaiting-roll');
  const won = roll(state, map, {
    onLand: () => ({
      victory: { winnerId: 'player:0', reason: 'four-landmarks' },
    }),
  });
  assert.equal(won.state.phase, 'finished');
  assert.equal(end(won.state).error, 'game-not-playing');
  const invalid = roll(state, map, {
    onLand: (s) => ({
      players: s.players.map((p, i) =>
        i === 0 ? { ...p, position: 'tile:0' } : p,
      ),
    }),
  });
  assert.equal(invalid.error, 'invalid-hook-effect');
  assert.equal(invalid.state, state);
});
