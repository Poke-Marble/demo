import test from 'node:test';
import assert from 'node:assert/strict';
import { createIntegratedPreview } from './adapter.ts';
import { settleAbilities } from './settlement.ts';
import { createInitialRoster } from '../setup.ts';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto.ts';
import {
  createEconomyContext,
  dispatchEconomy,
  quoteSale,
  quoteToll,
  getLegalActions,
} from '../../../game/economy/index.ts';
import { finalizeVictory } from '../../../game/victory/index.ts';
const c = createEconomyContext(kantoJohtoMap);
function fresh() {
  const p = createIntegratedPreview({ seed: 42 });
  p.adapter.start({
    mapId: c.map.id,
    participants: createInitialRoster('pokemon:0007'),
  });
  return p.getState();
}
const balance = (s, n, id = 'player:1') => ({
  ...s,
  players: s.players.map((p) => (p.id === id ? { ...p, balance: n } : p)),
});
function own(s, tileId, ownerId = 'player:2', stage = 0) {
  return {
    ...s,
    holdings: [...s.holdings, { tileId, ownerId, facilityLevel: stage }],
    economy: {
      ...s.economy,
      developmentByTileId: {
        ...s.economy.developmentByTileId,
        ...(c.properties[tileId].kind === 'city'
          ? {
              [tileId]: {
                stage,
                facilities: ['shop', 'center', 'final'].slice(0, stage),
                centerReadyVisitOrdinal: stage >= 2 ? 0 : null,
              },
            }
          : {}),
      },
    },
  };
}
function at(s, tileId) {
  return {
    ...s,
    core: { ...s.core, turnStage: 'awaiting-end' },
    players: s.players.map((p) =>
      p.id === s.activePlayerId ? { ...p, position: tileId } : p,
    ),
    economy: {
      ...s.economy,
      visitOrdinalByPlayerId: {
        ...s.economy.visitOrdinalByPlayerId,
        [s.activePlayerId]: 1,
      },
      landing: {
        id: 'fixture-visit',
        playerId: s.activePlayerId,
        tileId,
        visitOrdinal: 1,
        propertyDecisionUsed: false,
      },
    },
  };
}
function act(s, intent) {
  const command = {
    sessionId: s.economy.sessionId,
    commandId: `boundary:${s.economy.revision}`,
    expectedRevision: s.economy.revision,
    playerId: s.activePlayerId,
    intent,
  };
  const result = dispatchEconomy(s, c, command);
  assert.ok(result.ok, result.error);
  return { result, command, ...settleAbilities(s, c, result) };
}
function approaching(s, target) {
  const i = c.map.tiles.findIndex((t) => t.id === target);
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === s.activePlayerId
        ? { ...p, position: c.map.tiles[(i - 7 + 32) % 32].id }
        : p,
    ),
  };
}

test('START reward precedes toll: 500 activates, 501 does not; replay grants zero twice', () => {
  const target = c.map.tiles[6].id;
  for (const amount of [300, 301]) {
    const before = approaching(
      balance(own(fresh(), target, 'player:2', 1), amount),
      target,
    );
    const { result, next, command } = act(before, {
      type: 'roll-dice',
      playerId: before.activePlayerId,
    });
    assert.ok(result.events.some((e) => e.type === 'start-rewarded'));
    assert.ok(result.events.some((e) => e.type === 'toll-settled'));
    assert.equal(
      next.abilityOutbox.some(
        (a) => a.playerId === 'player:1' && a.abilityId === 'torrent',
      ),
      amount === 300,
    );
    const replay = dispatchEconomy(next, c, command);
    assert.ok(replay.ok && replay.replayed);
    assert.equal(settleAbilities(next, c, replay).next, next);
  }
});

test('last sale funds debt above 500: uses settlement cash, clears debt, no torrent refund', () => {
  let s = own(
    own(fresh(), 'tile:kj:blackthorn', 'player:2', 3),
    'tile:kj:indigo',
    'player:1',
  );
  s = approaching(balance(s, 490), 'tile:kj:blackthorn');
  const debt = act(s, { type: 'roll-dice', playerId: s.activePlayerId });
  assert.ok(debt.next.economy.pendingDebt);
  assert.equal(debt.next.abilityOutbox.length, 0);
  const sale = getLegalActions(debt.next, c, s.activePlayerId).actions.find(
    (a) => a.intent.type === 'sell-property',
  );
  assert.ok(
    quoteSale(debt.next, c, s.activePlayerId, sale.intent.tileId).total + 490 >
      500,
  );
  const settled = act(debt.next, sale.intent);
  assert.equal(settled.next.economy.pendingDebt, null);
  assert.ok(settled.next.abilityReceipts.some((t) => t.kind === 'toll'));
  assert.equal(
    settled.next.abilityOutbox.some((a) => a.playerId === 'player:1'),
    false,
  );
});

test('partial recovery bankruptcy uses original turn, excludes bankrupt refund, static paid once', () => {
  let s = own(fresh(), 'tile:kj:blackthorn', 'player:2', 3);
  s = {
    ...s,
    players: s.players.map((p) =>
      p.id === 'player:2' ? { ...p, pokemonId: 'pokemon:0025' } : p,
    ),
  };
  s = approaching(balance(s, 100), 'tile:kj:blackthorn');
  const { next, result } = act(s, {
    type: 'roll-dice',
    playerId: s.activePlayerId,
  });
  assert.ok(
    result.events.some(
      (e) => e.type === 'toll-settled' && e.recovered === 100 && e.forgiven > 0,
    ),
  );
  assert.ok(next.turnNumber > s.turnNumber);
  assert.equal(next.abilityReceipts[0].turn, s.turnNumber);
  assert.equal(next.players[0].balance, 0);
  assert.equal(next.players[0].bankrupt, true);
  assert.deepEqual(
    next.abilityOutbox.map((a) => [a.playerId, a.amount]),
    [['player:2', 5]],
  );
});

test('four victory boundaries follow a legal settled acquisition / bankruptcy (controlled fixtures)', () => {
  const cities = c.map.tiles.filter((t) => t.kind === 'city');
  const groups = c.map.cityGroups
    .filter((_, i) => [0, 2, 4].includes(i))
    .flatMap((g) => g.cityIds);
  const lines = cities.filter((t) => t.side === 'south').map((t) => t.id);
  const landmarks = c.map.tiles
    .filter((t) => t.kind === 'landmark')
    .map((t) => t.id);
  for (const [ids, reason] of [
    [groups, 'three-city-groups'],
    [lines, 'one-side-cities'],
    [landmarks, 'four-landmarks'],
  ]) {
    let s = balance(fresh(), 10000);
    for (const id of ids.slice(0, -1)) s = own(s, id, 'player:1');
    s = at(s, ids.at(-1));
    const legal = getLegalActions(s, c, 'player:1').actions.find((a) =>
      ['construct-property', 'buy-landmark'].includes(a.intent.type),
    );
    assert.ok(legal);
    const { next } = act(s, legal.intent);
    const final = finalizeVictory(next, c.map, { actorId: 'player:1' });
    assert.ok(final.ok);
    assert.equal(final.state.phase, 'finished');
    assert.equal(final.state.victory.reason, reason);
    assert.equal(getLegalActions(final.state, c, 'player:1').actions.length, 0);
  }
  let s = own(fresh(), 'tile:kj:blackthorn', 'player:2', 3);
  s = {
    ...s,
    players: s.players.map((p, i) =>
      i > 1 ? { ...p, balance: 0, bankrupt: true } : p,
    ),
  };
  s = approaching(balance(s, 100), 'tile:kj:blackthorn');
  assert.ok(quoteToll(s, c, 'player:1', 'tile:kj:blackthorn').total > 100);
  const { next } = act(s, { type: 'roll-dice', playerId: 'player:1' });
  const final = finalizeVictory(next, c.map, { actorId: 'player:1' });
  assert.ok(final.ok);
  assert.equal(final.state.victory.reason, 'last-player-standing');
  assert.equal(final.state.victory.winnerId, 'player:2');
});

test('blessing and ability share one discounted base receipt and replay neither consumes nor pays twice', () => {
  let s = own(fresh(), 'tile:kj:blackthorn', 'player:2', 3);
  s = {
    ...s,
    legendary: {
      ...s.legendary,
      players: {
        ...s.legendary.players,
        'player:1': { ...s.legendary.players['player:1'], lugia: true },
      },
    },
  };
  s = approaching(balance(s, 400), 'tile:kj:blackthorn');
  const quoted = quoteToll(s, c, 'player:1', 'tile:kj:blackthorn');
  assert.equal(quoted.total, 310);
  const { next, command } = act(s, { type: 'roll-dice', playerId: 'player:1' });
  assert.equal(next.legendary.players['player:1'].lugia, false);
  assert.equal(next.abilityReceipts[0].paid, 310);
  assert.equal(
    next.abilityOutbox.find((a) => a.playerId === 'player:1').amount,
    60,
  );
  assert.equal(next.players[0].balance, 150);
  const replay = dispatchEconomy(next, c, command);
  assert.ok(replay.ok && replay.replayed);
  assert.equal(settleAbilities(next, c, replay).next, next);
});
