import test from 'node:test';
/* global AbortController */
import assert from 'node:assert/strict';
import { createIntegratedPreview } from './adapter.ts';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto.ts';
import { createInitialRoster } from '../setup.ts';
import { facilityArt } from './map.ts';

const setup = (preview, pokemon = 'pokemon:0025') =>
  preview.adapter.start({
    mapId: kantoJohtoMap.id,
    participants: createInitialRoster(pokemon),
  });
test('uses the real story map, four unique partners and complete facility art bridge', () => {
  const p = createIntegratedPreview();
  setup(p);
  const v = p.adapter.getView();
  assert.equal(v.map.id, kantoJohtoMap.id);
  assert.equal(v.map.tiles.length, 32);
  assert.deepEqual(
    v.map.tiles
      .filter((t) => t.kind === 'special')
      .map((t) => v.map.tiles.indexOf(t)),
    [8, 16, 24],
  );
  assert.equal(v.participants[0].pokemonId, 'pokemon:0025');
  assert.equal(
    v.participants.filter((p) => p.controller === 'computer').length,
    3,
  );
  for (const tile of kantoJohtoMap.tiles.filter((t) => t.kind === 'city')) {
    assert.ok(tile.finalFacility);
    assert.ok(facilityArt[tile.finalFacility.key], tile.finalFacility.key);
    assert.equal(
      typeof v.map.tiles.find((t) => t.id === tile.id).finalFacility,
      'string',
    );
  }
});
test('real seeded dice movement provides every waypoint and rejects a second roll', () => {
  const p = createIntegratedPreview();
  setup(p);
  let latest;
  p.adapter.subscribe((u) => {
    latest = u;
  });
  p.adapter.dispatch({ type: 'roll-dice', playerId: 'player:1' });
  const rolled = latest.events.find((e) => e.type === 'dice-rolled');
  assert.equal(rolled.values.length, 2);
  assert.equal(
    latest.movement.path.length,
    rolled.values[0] + rolled.values[1],
  );
  const state = p.adapter.getView().state;
  p.adapter.dispatch({ type: 'roll-dice', playerId: 'player:1' });
  assert.equal(p.adapter.getView().state, state);
});
test('flight resolves engine state and queues fly before the trial intro; stale selection is ignored', () => {
  const p = createIntegratedPreview();
  setup(p);
  let latest;
  p.adapter.subscribe((u) => {
    latest = u;
  });
  const fly = kantoJohtoMap.tiles.find(
    (t) => t.kind === 'special' && t.special === 'fly',
  );
  const trial = kantoJohtoMap.tiles.find(
    (t) => t.kind === 'special' && t.special === 'lugia-trial',
  );
  p.arrive(fly.id);
  const selection = p.adapter.getView().flightSelection;
  assert.ok(selection.destinations.some((t) => t.tileId === trial.id));
  assert.ok(!selection.destinations.some((t) => t.tileId === fly.id));
  const balance = p.adapter.getView().state.players[0].balance;
  p.adapter.selectFlightDestination(selection.id, trial.id);
  assert.deepEqual(
    latest.effects.map((e) => e.type),
    ['fly', 'trial-intro'],
  );
  assert.equal(latest.view.state.players[0].position, trial.id);
  assert.equal(latest.view.state.players[0].balance, balance);
  assert.ok(latest.view.prompt.choices.some((c) => c.id === 'attempt'));
  const state = latest.view.state;
  p.adapter.selectFlightDestination(selection.id, trial.id);
  assert.equal(p.adapter.getView().state, state);
});
test('trial decisions use engine rules; rope releases movement and is consumed once', () => {
  const p = createIntegratedPreview();
  setup(p);
  const trial = kantoJohtoMap.tiles.find(
    (t) => t.kind === 'special' && t.special === 'ho-oh-trial',
  );
  p.arrive(trial.id);
  const id = p.adapter.getView().prompt.id;
  p.adapter.choose(id, 'rope');
  const state = p.adapter.getView().state;
  assert.equal(state.legendary.players['player:1'].ropes, 0);
  assert.equal(state.legendary.players['player:1'].trial, null);
  assert.equal(state.core.turnStage, 'awaiting-roll');
  p.adapter.choose(id, 'rope');
  assert.equal(p.adapter.getView().state, state);
});
test('construction preview accumulates stages without pretending to charge money; stale confirmations do not replay', () => {
  const p = createIntegratedPreview();
  setup(p);
  const city = 'tile:kj:pallet';
  const balance = p.adapter.getView().state.players[0].balance;
  for (let level = 0; level < 4; level++) {
    p.arrive(city);
    const prompt = p.adapter.getView().prompt;
    p.adapter.choose(prompt.id, 'construct');
    assert.equal(
      p.adapter.getView().state.holdings.find((h) => h.tileId === city)
        .facilityLevel,
      level,
    );
    p.adapter.choose(prompt.id, 'construct');
    assert.equal(
      p.adapter.getView().state.holdings.find((h) => h.tileId === city)
        .facilityLevel,
      level,
    );
  }
  assert.equal(p.adapter.getView().state.players[0].balance, balance);
  p.showBuildings(3);
  assert.equal(p.adapter.getView().state.holdings.length, 24);
  assert.equal(
    new Set(p.adapter.getView().state.holdings.map((h) => h.ownerId)).size,
    4,
  );
});
test('computer turns return to the human and restart aborts old work', async () => {
  const p = createIntegratedPreview({ computerDelayMs: 0 });
  setup(p);
  p.arrive('tile:kj:start');
  p.adapter.dispatch({ type: 'end-turn', playerId: 'player:1' });
  for (const id of ['player:2', 'player:3', 'player:4']) {
    assert.equal(p.adapter.getView().state.activePlayerId, id);
    await p.adapter.runComputerTurn(id, new AbortController().signal);
  }
  assert.equal(p.adapter.getView().state.activePlayerId, 'player:1');
  p.adapter.dispatch({ type: 'roll-dice', playerId: 'player:1' });
  p.adapter.restart();
  const state = p.adapter.getView().state;
  await p.adapter.runComputerTurn('player:2', new AbortController().signal);
  assert.equal(p.adapter.getView().state, state);
});
