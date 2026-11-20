import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { test } from 'node:test';
import { URL } from 'node:url';

const read = (file) => readFile(new URL(file, import.meta.url), 'utf8');
const moduleURL = (source) =>
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(source)).replaceAll("'", '%27')}`;
const ownerURL = moduleURL(await read('../art/ownership.ts'));
const { hudPlayers, playerAssets, cashEventsFromGameEvents, money } =
  await import(
    moduleURL(
      (await read('./model.ts')).replace(
        "from '../art/ownership'",
        `from '${ownerURL}'`,
      ),
    )
  );
function fixture() {
  const players = [
    {
      id: 'player:human',
      name: 'P1',
      pokemonId: 'pokemon:0025',
      balance: 1500,
      bankrupt: false,
    },
    {
      id: 'player:computer',
      name: 'COMPUTER 1',
      pokemonId: 'pokemon:0001',
      balance: 900,
      bankrupt: false,
    },
  ];
  return {
    state: {
      players,
      phase: 'playing',
      activePlayerId: players[0].id,
      holdings: [
        { tileId: 'tile:a', ownerId: players[0].id, facilityLevel: 3 },
        { tileId: 'tile:b', ownerId: players[0].id, facilityLevel: 0 },
        { tileId: 'tile:trial', ownerId: players[0].id, facilityLevel: 0 },
        { tileId: 'tile:missing', ownerId: players[0].id, facilityLevel: 0 },
        { tileId: 'tile:c', ownerId: players[1].id, facilityLevel: 1 },
      ],
    },
    participants: players.map((p, i) => ({
      ...p,
      controller: i === 0 ? 'human' : 'computer',
    })),
    map: {
      tiles: [
        { id: 'tile:a', nameKo: '특별한 이름의 일반 도시', kind: 'city' },
        { id: 'tile:b', nameKo: '작은 마을', kind: 'landmark' },
        { id: 'tile:c', kind: 'city' },
        { id: 'tile:trial', kind: 'special' },
      ],
    },
  };
}
test('ownership comes from holdings; category comes only from map.kind', () => {
  const view = fixture();
  const assets = playerAssets(view, 'player:human');
  assert.deepEqual(
    assets.cities.map((h) => h.tileId),
    ['tile:a'],
  );
  assert.deepEqual(
    assets.landmarks.map((h) => h.tileId),
    ['tile:b'],
  );
  view.state.holdings = view.state.holdings.filter(
    (h) => h.tileId !== 'tile:a',
  );
  assert.equal(playerAssets(view, 'player:human').cities.length, 0);
});
test('type identity survives seat reorder and participant order; active requires playing and solvent', () => {
  const view = fixture();
  const first = hudPlayers(view);
  assert.equal(first[0].theme.key, 'electric');
  assert.equal(first[0].controller, 'human');
  view.state.players.reverse();
  view.participants.reverse();
  const reordered = hudPlayers(view);
  assert.equal(reordered[1].theme.key, 'electric');
  assert.equal(reordered[1].active, true);
  assert.equal(reordered[0].theme.key, 'grass');
  view.state.players[1].bankrupt = true;
  assert.equal(hudPlayers(view)[1].active, false);
  view.state.players[1].bankrupt = false;
  view.state.phase = 'finished';
  assert.ok(hudPlayers(view).every((p) => !p.active));
});
test('no invented metadata, unknown pokemon is neutral, explicit zero values survive', () => {
  const view = fixture();
  assert.deepEqual(hudPlayers(view)[0].meta, {});
  view.state.players[0].pokemonId = 'pokemon:unknown';
  assert.equal(hudPlayers(view)[0].theme.key, 'neutral');
  const supplied = {
    totalAssets: 0,
    expectedIncome: 0,
    unpaidAmount: 0,
    abilityName: '명시적 특성',
  };
  assert.deepEqual(
    hudPlayers(view, { 'player:human': supplied })[0].meta,
    supplied,
  );
});
test('cash cues use confirmed amount events; no purchase, bankruptcy or balance-delta guess', () => {
  const event = {
    type: 'toll-paid',
    fromPlayerId: 'player:human',
    toPlayerId: 'player:computer',
    amount: 120,
  };
  const events = [
    event,
    { type: 'city-acquired', playerId: 'player:human', tileId: 'tile:a' },
    { type: 'player-bankrupt', playerId: 'player:computer' },
  ];
  const cash = cashEventsFromGameEvents('update:1', events);
  assert.deepEqual(
    cash.map((e) => e.amount),
    [-120, 120],
  );
  assert.deepEqual(
    cashEventsFromGameEvents('update:1', globalThis.structuredClone(events)),
    cash,
  );
  assert.notDeepEqual(cashEventsFromGameEvents('update:2', events), cash);
  for (const amount of [NaN, Infinity, -1, 0])
    assert.deepEqual(
      cashEventsFromGameEvents('invalid', [{ ...event, amount }]),
      [],
    );
  assert.equal(money(1500), '1,500 ₽');
});
