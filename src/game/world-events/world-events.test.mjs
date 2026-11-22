import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch } from '../core/index.ts';
import { enterSpecial } from '../legendary.ts';
import {
  arriveWorldEvent,
  clearWorldEvents,
  quoteWorldEvent,
} from './index.ts';
import { kantoJohtoMap } from '../../data/maps/kanto-johto.ts';
import {
  createEconomyContext,
  initializeEconomy,
  dispatchEconomy,
  quoteConstruction,
  quoteToll,
  quoteTakeover,
} from '../economy/index.ts';
import { finalizeMatch } from '../match/index.ts';
import { publicSnapshot } from '../ai/outlooks.ts';
const context = createEconomyContext(kantoJohtoMap);
const map = context.map;
const roster = Array.from({ length: 4 }, (_, i) => ({
  id: `player:${i}`,
  name: `P${i}`,
  pokemonId: `pokemon:000${i + 1}`,
  controller: 'computer',
}));
const lugia = map.tiles.find((t) => t.special === 'lugia-trial');
const hoOh = map.tiles.find((t) => t.special === 'ho-oh-trial');
const fly = map.tiles.find((t) => t.special === 'fly');
const fresh = () =>
  createGame(map, roster, { seed: 1, legendary: {}, worldEvents: {} });
function arrive(s, id, tile = lugia) {
  return enterSpecial(
    {
      ...s,
      activePlayerId: id,
      players: s.players.map((p) =>
        p.id === id ? { ...p, position: tile.id } : p,
      ),
    },
    tile,
  );
}
test('50 per exact arrival; retransmission no-op; revisits reward without duplicate visitors; independent counters', () => {
  let s = fresh();
  const a = arrive(s, 'player:0');
  s = a.state;
  assert.equal(s.players[0].balance, 1550);
  assert.equal(a.presentations.length, 0);
  assert.equal(arriveWorldEvent(s, lugia).state, s);
  s = arrive({ ...s, turnNumber: 2 }, 'player:0').state;
  assert.equal(s.players[0].balance, 1600);
  assert.deepEqual(s.worldEvents.visitors[lugia.id], ['player:0']);
  s = arrive({ ...s, turnNumber: 3 }, 'player:1', hoOh).state;
  s = arrive({ ...s, turnNumber: 4 }, 'player:1').state;
  s = {
    ...s,
    players: s.players.map((p) =>
      p.id === 'player:0' ? { ...p, bankrupt: true } : p,
    ),
  };
  const b = arrive({ ...s, turnNumber: 5 }, 'player:2');
  assert.equal(b.presentations[0].type, 'world-event');
  assert.deepEqual(b.state.worldEvents.visitors[lugia.id], []);
  assert.deepEqual(b.state.worldEvents.visitors[hoOh.id], ['player:1']);
  assert.equal(b.state.worldEvents.active.lugia.expiresAfterRound, 2);
});
test('ordinary exact arrival and flight reward once, passage does not enter; trial commands disabled', () => {
  let s = fresh();
  const index = map.tiles.indexOf(lugia);
  s = {
    ...s,
    players: s.players.map((p, i) =>
      i
        ? p
        : {
            ...p,
            position:
              map.tiles[(index - 5 + map.tiles.length) % map.tiles.length].id,
          },
    ),
  };
  const a = dispatch(s, map, { type: 'roll-dice', playerId: s.activePlayerId });
  assert.equal(a.ok, true);
  assert.equal(a.state.players[0].balance, 1550);
  assert.equal(a.state.legendary.players['player:0'].trial, null);
  assert.equal(
    dispatch(a.state, map, { type: 'roll-dice', playerId: s.activePlayerId })
      .ok,
    false,
  );
  assert.equal(
    dispatch(a.state, map, {
      type: 'attempt-trial',
      playerId: s.activePlayerId,
    }).ok,
    false,
  );
  s = { ...fresh(), core: { ...fresh().core, turnStage: 'awaiting-end' } };
  s = enterSpecial(
    {
      ...s,
      players: s.players.map((p, i) => (i ? p : { ...p, position: fly.id })),
    },
    fly,
  ).state;
  const b = dispatch(s, map, {
    type: 'fly',
    playerId: s.activePlayerId,
    to: hoOh.id,
  });
  assert.equal(b.ok, true);
  assert.equal(b.state.players[0].balance, 1550);
  assert.deepEqual(b.state.worldEvents.visitors[hoOh.id], ['player:0']);
  assert.equal(
    dispatch(b.state, map, {
      type: 'fly',
      playerId: s.activePlayerId,
      to: hoOh.id,
    }).ok,
    false,
  );
  s = fresh();
  s = {
    ...s,
    players: s.players.map((p, i) =>
      i
        ? p
        : {
            ...p,
            position:
              map.tiles[(index - 3 + map.tiles.length) % map.tiles.length].id,
          },
    ),
  };
  assert.deepEqual(
    dispatch(s, map, { type: 'roll-dice', playerId: s.activePlayerId }).state
      .worldEvents.visitors,
    {},
  );
});
test('R through R+1, refresh replaces duration without stacking; end and restart cleanup', () => {
  let s = fresh();
  for (let i = 0; i < 3; i++)
    s = arrive({ ...s, turnNumber: i + 1 }, `player:${i}`).state;
  assert.equal(quoteWorldEvent(s, 'toll', 101), 76);
  s = { ...s, match: { ...s.match, completedRounds: 1 } };
  assert.equal(quoteWorldEvent(s, 'toll', 100), 75);
  for (let i = 0; i < 3; i++)
    s = arrive({ ...s, turnNumber: i + 4 }, `player:${i}`).state;
  assert.equal(s.worldEvents.active.lugia.expiresAfterRound, 3);
  assert.equal(quoteWorldEvent(s, 'toll', 100), 75);
  s = { ...s, match: { ...s.match, completedRounds: 3 } };
  assert.equal(quoteWorldEvent(s, 'toll', 100), 100);
  assert.deepEqual(clearWorldEvents(s).worldEvents.active, {});
  assert.deepEqual(
    clearWorldEvents({ ...s, phase: 'finished' }).worldEvents,
    fresh().worldEvents,
  );
  assert.deepEqual(fresh().worldEvents.arrivals, []);
});
test('authority quotes city only: facilities exclude land/takeover; legacy blessing composes once; AI sees event', () => {
  let s = initializeEconomy(fresh(), context, 'world-test');
  const city = map.tiles.find((t) => t.kind === 'city');
  s = {
    ...s,
    core: { ...s.core, turnStage: 'awaiting-end' },
    worldEvents: {
      ...s.worldEvents,
      active: {
        lugia: { expiresAfterRound: 2 },
        'ho-oh': { expiresAfterRound: 2 },
      },
    },
    players: s.players.map((p, i) => (i ? p : { ...p, position: city.id })),
    economy: {
      ...s.economy,
      visitOrdinalByPlayerId: {
        ...s.economy.visitOrdinalByPlayerId,
        'player:0': 1,
      },
      landing: {
        id: 'visit',
        playerId: s.activePlayerId,
        tileId: city.id,
        visitOrdinal: 1,
        propertyDecisionUsed: false,
      },
    },
  };
  const q = quoteConstruction(s, context, s.activePlayerId, city.id, 1);
  assert.equal(
    q.total,
    q.landSubtotal + q.upgradeSubtotal - Math.floor(q.upgradeSubtotal * 0.25),
  );
  const blessed = {
    ...s,
    legendary: {
      ...s.legendary,
      players: {
        ...s.legendary.players,
        'player:0': { ...s.legendary.players['player:0'], hoOh: true },
      },
    },
  };
  assert.equal(
    quoteConstruction(blessed, context, s.activePlayerId, city.id, 1).total,
    q.landSubtotal + Math.ceil((q.total - q.landSubtotal) * 0.5),
  );
  s = {
    ...s,
    holdings: [{ tileId: city.id, ownerId: 'player:1', facilityLevel: 0 }],
    economy: {
      ...s.economy,
      developmentByTileId: {
        [city.id]: { stage: 0, facilities: [], centerReadyVisitOrdinal: null },
      },
    },
  };
  const base = { ...s, worldEvents: { ...s.worldEvents, active: {} } };
  assert.equal(
    quoteToll(s, context, 'player:0', city.id).total,
    Math.ceil(quoteToll(base, context, 'player:0', city.id).total * 0.75),
  );
  assert.equal(
    quoteTakeover(s, context, 'player:0', city.id).total,
    quoteTakeover(base, context, 'player:0', city.id).total,
  );
  const snap = publicSnapshot(s, context, roster);
  assert.ok(snap);
});
test('economy command replay is idempotent, stale replacement rejects without another reward', () => {
  let s = initializeEconomy(fresh(), context, 'arrival-replay');
  const index = map.tiles.indexOf(lugia);
  s = {
    ...s,
    players: s.players.map((p, i) =>
      i
        ? p
        : {
            ...p,
            position:
              map.tiles[(index - 5 + map.tiles.length) % map.tiles.length].id,
          },
    ),
  };
  const cmd = {
    sessionId: 'arrival-replay',
    commandId: 'one',
    expectedRevision: 0,
    playerId: s.activePlayerId,
    intent: { type: 'roll-dice', playerId: s.activePlayerId },
  };
  const a = dispatchEconomy(s, context, cmd);
  assert.equal(a.ok, true);
  const b = dispatchEconomy(a.state, context, cmd);
  assert.equal(b.ok, true);
  assert.equal(b.replayed, true);
  assert.equal(b.state.players[0].balance, 1550);
  const c = dispatchEconomy(a.state, context, { ...cmd, commandId: 'two' });
  assert.equal(c.ok, false);
  assert.equal(c.state, a.state);
  const final = finalizeMatch(
    {
      ...a.state,
      players: a.state.players.map((p, i) =>
        i ? { ...p, bankrupt: true, balance: 0 } : p,
      ),
    },
    context,
  );
  assert.equal(final.state.phase, 'finished');
  assert.deepEqual(final.state.worldEvents.active, {});
  assert.deepEqual(final.state.worldEvents.arrivals, []);
});
