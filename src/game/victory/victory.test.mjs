import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kantoJohtoMap as map } from '../../data/maps/kanto-johto.ts';
import { sampleMap } from '../../data/sample-map.ts';
import {
  defaultVictoryConfig,
  evaluateVictory,
  finalizeVictory,
} from './index.ts';

const a = 'player:a';
const b = 'player:b';
const c = 'player:c';
const cityTiles = map.tiles.filter((tile) => tile.kind === 'city');
const landmarkIds = map.tiles
  .filter((tile) => tile.kind === 'landmark')
  .map((tile) => tile.id);
const idsOfGroups = (groups) => groups.flatMap((group) => group.cityIds);
const onSide = (side) =>
  cityTiles.filter((tile) => tile.side === side).map((tile) => tile.id);
const holdings = (ids, ownerId = a, facilityLevel = 0) =>
  ids.map((tileId) => ({ tileId, ownerId, facilityLevel }));
const makeState = (patch = {}) => ({
  schemaVersion: 1,
  mapId: map.id,
  phase: 'playing',
  players: [a, b, c].map((id) => ({
    id,
    name: id,
    pokemonId: 'pokemon:0001',
    position: map.tiles[0].id,
    balance: 0,
    bankrupt: false,
  })),
  activePlayerId: a,
  turnNumber: 1,
  holdings: [],
  victory: null,
  ...patch,
});
const evaluate = (patch, options) =>
  evaluateVictory(makeState(patch), map, options);
function success(result) {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
}
function error(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('v3 has 8 disjoint groups, 24 cities, 4 landmarks and six cities per side', () => {
  assert.equal(map.id, 'map:kanto-johto:v3');
  assert.equal(map.cityGroups.length, 8);
  assert.equal(cityTiles.length, 24);
  assert.equal(new Set(idsOfGroups(map.cityGroups)).size, 24);
  assert.equal(landmarkIds.length, 4);
  for (const side of ['south', 'west', 'north', 'east'])
    assert.equal(onSide(side).length, 6);
  for (const group of map.cityGroups) {
    assert.equal(group.cityIds.length, 3);
    assert.ok(group.cityIds.every((id) => !landmarkIds.includes(id)));
    const result = success(evaluate({ holdings: holdings(group.cityIds) }));
    assert.equal(result.victory, null);
  }
});

test('all 56 choices of three actual groups win at level zero; one missing city fails group condition', () => {
  let count = 0;
  for (let i = 0; i < 8; i++)
    for (let j = i + 1; j < 8; j++)
      for (let k = j + 1; k < 8; k++) {
        const ids = idsOfGroups([
          map.cityGroups[i],
          map.cityGroups[j],
          map.cityGroups[k],
        ]);
        const result = success(evaluate({ holdings: holdings(ids) }));
        assert.deepEqual(result.victory, {
          winnerId: a,
          reason: 'three-city-groups',
        });
        assert.equal(result.candidates[0].completedGroupIds.length, 3);
        const missing = success(evaluate({ holdings: holdings(ids.slice(1)) }));
        assert.ok(
          missing.candidates.every(
            (candidate) => !candidate.reasons.includes('three-city-groups'),
          ),
        );
        count++;
      }
  assert.equal(count, 56);
});

test('each line requires only its six normal cities, never its landmark or corner', () => {
  for (const side of ['south', 'west', 'north', 'east']) {
    const ids = onSide(side);
    assert.equal(
      success(evaluate({ holdings: holdings(ids) })).victory.reason,
      'one-side-cities',
    );
    assert.equal(
      success(evaluate({ holdings: holdings(ids.slice(1)) })).victory,
      null,
    );
    assert.equal(
      success(
        evaluate({ holdings: holdings([...ids.slice(1), landmarkIds[0]]) }),
      ).victory,
      null,
    );
  }
});

test('four separate landmarks win, three fail, and POI cities remain normal cities', () => {
  assert.equal(
    success(evaluate({ holdings: holdings(landmarkIds) })).victory.reason,
    'four-landmarks',
  );
  assert.equal(
    success(evaluate({ holdings: holdings(landmarkIds.slice(1)) })).victory,
    null,
  );
  const poi = cityTiles.filter(
    (tile) => tile.placeKind === 'point-of-interest',
  );
  assert.ok(poi.length >= 4);
  assert.equal(
    success(evaluate({ holdings: holdings(poi.map((tile) => tile.id)) }))
      .victory,
    null,
  );
  const ids = idsOfGroups(map.cityGroups.slice(0, 3));
  const before = success(evaluate({ holdings: holdings(ids, a, 0) }));
  const after = success(evaluate({ holdings: holdings(ids, a, 3) }));
  assert.deepEqual(before, after);
});

test('last survivor wins without property; zero survivors and bankruptcy residue reject', () => {
  const state = makeState();
  const players = state.players.map((player) => ({
    ...player,
    bankrupt: player.id !== b,
  }));
  assert.deepEqual(success(evaluate({ players })).victory, {
    winnerId: b,
    reason: 'last-player-standing',
  });
  error(
    evaluate({
      players: players.map((player) => ({ ...player, bankrupt: true })),
    }),
    'no-survivors',
  );
  error(
    evaluate({ players, holdings: holdings([cityTiles[0].id]) }),
    'bankrupt-owner',
  );
  assert.equal(success(evaluate({})).victory, null);
});

test('actor priority precedes reason priority; fallback is roster order, not active player', () => {
  const owned = [...holdings(onSide('south'), a), ...holdings(landmarkIds, b)];
  assert.equal(success(evaluate({ holdings: owned })).victory.winnerId, a);
  assert.equal(
    success(evaluate({ holdings: owned, activePlayerId: b })).victory.winnerId,
    a,
  );
  assert.equal(
    success(evaluate({ holdings: owned }, { actorId: b })).victory.winnerId,
    b,
  );
  assert.equal(
    success(evaluate({ holdings: owned }, { actorId: c })).victory.winnerId,
    a,
  );
  const players = makeState().players.map((player) => ({
    ...player,
    bankrupt: player.id === c,
  }));
  assert.equal(
    success(evaluate({ holdings: owned, players }, { actorId: c })).victory
      .winnerId,
    a,
  );
  error(evaluate({}, { actorId: 'player:missing' }), 'invalid-actor');
});

test('all matching reasons are exposed; reason priority is configurable', () => {
  const state = makeState({
    players: makeState().players.map((player) => ({
      ...player,
      bankrupt: player.id !== a,
    })),
    holdings: holdings([...cityTiles.map((tile) => tile.id), ...landmarkIds]),
  });
  const result = success(evaluateVictory(state, map));
  assert.deepEqual(
    result.candidates[0].reasons,
    defaultVictoryConfig.reasonPriority,
  );
  const config = {
    ...defaultVictoryConfig,
    reasonPriority: [...defaultVictoryConfig.reasonPriority].reverse(),
  };
  assert.equal(
    success(evaluateVictory(state, map, { config })).victory.reason,
    'four-landmarks',
  );
});

test('sample, malformed groups, empty lines and unattainable configuration reject', () => {
  error(evaluateVictory(makeState(), sampleMap), 'incomplete-map');
  const bad = (patch) => evaluateVictory(makeState(), { ...map, ...patch });
  error(bad({ id: 'map:wrong' }), 'map-mismatch');
  error(bad({ tiles: [...map.tiles, map.tiles[0]] }), 'invalid-map');
  error(
    bad({ cityGroups: [...map.cityGroups, map.cityGroups[0]] }),
    'invalid-map',
  );
  error(bad({ cityGroups: map.cityGroups.slice(1) }), 'invalid-map');
  for (const cityIds of [
    [],
    [landmarkIds[0]],
    ['tile:missing'],
    [cityTiles[0].id, cityTiles[0].id],
  ])
    error(
      bad({
        cityGroups: [
          { ...map.cityGroups[0], cityIds },
          ...map.cityGroups.slice(1),
        ],
      }),
      'invalid-map',
    );
  error(
    bad({
      tiles: map.tiles.map((tile) =>
        tile.kind === 'city' ? { ...tile, side: 'north' } : tile,
      ),
    }),
    'invalid-map',
  );
  for (const patch of [
    { groupsToWin: 0 },
    { groupsToWin: 9 },
    { groupsToWin: 1.5 },
    { landmarksToWin: 5 },
    { landmarksToWin: NaN },
    { reasonPriority: [] },
    { reasonPriority: Array(4).fill('four-landmarks') },
    {
      reasonPriority: [
        'unknown',
        ...defaultVictoryConfig.reasonPriority.slice(1),
      ],
    },
  ])
    error(
      evaluate({}, { config: { ...defaultVictoryConfig, ...patch } }),
      'invalid-config',
    );
  assert.equal(
    success(
      evaluate(
        { holdings: holdings(landmarkIds.slice(0, 2)) },
        {
          config: { ...defaultVictoryConfig, landmarksToWin: 2 },
        },
      ),
    ).victory.reason,
    'four-landmarks',
  );
});

test('ownership must be unique, purchasable and attached to an existing living owner', () => {
  const first = holdings([cityTiles[0].id]);
  for (const ownerId of [a, b])
    error(
      evaluate({ holdings: [...first, { ...first[0], ownerId }] }),
      'duplicate-holding',
    );
  for (const tileId of [
    map.tiles[0].id,
    'tile:missing',
    ...map.tiles
      .filter((tile) => tile.kind === 'special')
      .map((tile) => tile.id),
  ])
    error(evaluate({ holdings: holdings([tileId]) }), 'invalid-property');
  error(
    evaluate({ holdings: holdings([cityTiles[0].id], 'player:missing') }),
    'unknown-owner',
  );
  for (const players of [
    [],
    makeState().players.slice(0, 1),
    Array(5).fill(makeState().players[0]),
    [makeState().players[0], makeState().players[0]],
  ])
    error(evaluate({ players }), 'invalid-players');
  error(evaluate({ activePlayerId: 'player:missing' }), 'invalid-players');
  error(evaluate({ phase: 'setup' }), 'invalid-phase');
  error(
    evaluate({ victory: { winnerId: a, reason: 'four-landmarks' } }),
    'invalid-victory',
  );
});

test('finalization is pure, preserves extensions, emits once and is idempotent after JSON reload', () => {
  const state = freeze(
    makeState({ holdings: holdings(landmarkIds), extra: { kept: true } }),
  );
  const before = JSON.stringify(state);
  const result = success(
    finalizeVictory(
      state,
      freeze(JSON.parse(JSON.stringify(map))),
      freeze({ actorId: a }),
    ),
  );
  assert.equal(JSON.stringify(state), before);
  assert.equal(result.state.phase, 'finished');
  assert.deepEqual(result.state.victory, {
    winnerId: a,
    reason: 'four-landmarks',
  });
  assert.equal(result.state.extra, state.extra);
  assert.equal(result.state.players, state.players);
  assert.deepEqual(result.events, [
    { type: 'game-won', playerId: a, reason: 'four-landmarks' },
  ]);
  const again = success(
    finalizeVictory(result.state, map, { actorId: 'player:ignored' }),
  );
  assert.equal(again.state, result.state);
  assert.deepEqual(again.events, []);
  assert.equal(again.evaluation.status, 'already-finished');
  const loaded = JSON.parse(JSON.stringify(result.state));
  assert.equal(success(finalizeVictory(loaded, map)).state, loaded);
  const noWin = makeState();
  assert.equal(success(finalizeVictory(noWin, map)).state, noWin);
  const invalid = makeState({ holdings: holdings(['tile:missing']) });
  const rejected = finalizeVictory(invalid, map);
  error(rejected, 'invalid-property');
  assert.equal(rejected.state, invalid);
  assert.deepEqual(rejected.events, []);
});

test('finished records are trusted, but malformed phase/victory and dirty ownership reject', () => {
  const victory = { winnerId: a, reason: 'four-landmarks' };
  // No retrospective ownership proof: the committed winner remains authoritative.
  assert.deepEqual(
    success(evaluate({ phase: 'finished', victory })).victory,
    victory,
  );
  for (const record of [
    null,
    { ...victory, winnerId: 'player:missing' },
    { ...victory, reason: 'unknown' },
  ])
    error(evaluate({ phase: 'finished', victory: record }), 'invalid-victory');
  error(
    evaluate({
      phase: 'finished',
      victory,
      holdings: holdings(['tile:missing']),
    }),
    'invalid-property',
  );
  const players = makeState().players.map((player) => ({
    ...player,
    bankrupt: player.id === a,
  }));
  error(evaluate({ phase: 'finished', victory, players }), 'invalid-victory');
});
