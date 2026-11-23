/* global structuredClone */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kantoJohtoMap } from '../../data/maps/kanto-johto.ts';
import { createGame } from '../core/index.ts';
import { createMatch } from '../match/rounds.ts';
import {
  hasPendingSettlement,
  rankAssets,
  finalizeMatch,
} from '../match/index.ts';
import { publicSnapshot } from '../ai/outlooks.ts';
import { plan } from '../ai/planner.ts';
import {
  createEconomyContext,
  initializeEconomy,
  dispatchEconomy,
  getLegalActions,
  quoteConstruction,
  quoteStartBuild,
} from './index.ts';
const c = createEconomyContext(kantoJohtoMap);
test('only exact unadjusted START arrival creates an opportunity; old adjustments reject', () => {
  for (const adjustment of [-1, 1]) {
    const s = fresh();
    assert.equal(
      dispatchEconomy(
        s,
        c,
        command(s, { type: 'resolve-dice', playerId: id, adjustment }),
      ).ok,
      false,
    );
  }
  const noCities = fresh();
  noCities.holdings = [];
  noCities.economy.developmentByTileId = {};
  const noTargets = arrive(noCities).state;
  assert.equal(noTargets.economy.pendingStartBuild, null);
  assert.ok(dispatch(noTargets, { type: 'end-turn', playerId: id }).ok);
});

test('START quote and charge share modifiers and blessing; zero amount does not consume blessing', () => {
  for (const worldActive of [false, true]) {
    for (const multiplierBps of [5000, 0]) {
      const context = {
        ...c,
        modifiers: [
          {
            id: 'start-discount',
            kind: 'upgrade',
            playerId: id,
            multiplierBps,
          },
        ],
      };
      const base = fresh();
      if (worldActive)
        base.worldEvents = {
          visitors: {},
          arrivals: [],
          active: { 'ho-oh': { expiresAfterRound: 2 } },
        };
      const configured = initializeEconomy(
        createGame(map, roster, { seed: 1, legendary: {}, skills: true }),
        context,
        'discount-start',
      );
      let s = {
        ...base,
        economy: {
          ...base.economy,
          configurationKey: configured.economy.configurationKey,
        },
      };
      s.legendary = {
        ...s.legendary,
        players: {
          ...s.legendary.players,
          [id]: { ...s.legendary.players[id], hoOh: true },
        },
      };
      const arrived = dispatchEconomy(
        s,
        context,
        command(s, { type: 'resolve-dice', playerId: id, adjustment: 0 }),
      );
      assert.equal(arrived.ok, true, arrived.error);
      s = arrived.state;
      const a = getLegalActions(s, context, id).actions.find(
        (a) => a.intent.type === 'start-build',
      );
      assert.ok(a.quote.modifierIds.includes('start-discount'));
      const afterWorld = worldActive
        ? a.quote.upgradeSubtotal - Math.floor(a.quote.upgradeSubtotal * 0.25)
        : a.quote.upgradeSubtotal;
      assert.equal(
        a.quote.total,
        Math.ceil(Math.floor((afterWorld * multiplierBps) / 10000) * 0.5),
        'world then modifier then one blessing uses the canonical construction quote',
      );
      assert.equal(a.quote.consumesBlessing, multiplierBps !== 0);
      const result = dispatchEconomy(s, context, command(s, a.intent));
      assert.equal(result.ok, true, result.error);
      assert.equal(
        result.state.players[0].balance,
        s.players[0].balance - a.quote.total,
      );
      assert.equal(
        result.state.legendary.players[id].hoOh,
        multiplierBps === 0,
      );
      const replay = dispatchEconomy(
        result.state,
        context,
        command(s, a.intent),
      );
      assert.equal(replay.ok, true);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.state.players, result.state.players);
    }
  }
});
const map = c.map,
  id = 'player:0';
const city = map.tiles.find((t) => t.kind === 'city').id;
const landmark = map.tiles.find((t) => t.kind === 'landmark').id;
const start = map.tiles.findIndex((t) => t.kind === 'start');
const roster = ['0001', '0004', '0007', '0025'].map((n, i) => ({
  id: `player:${i}`,
  name: `P${i}`,
  pokemonId: `pokemon:${n}`,
}));
function fresh(stage = 0, balance = 10000, adjustment = 0) {
  let s = initializeEconomy(
    createGame(map, roster, { seed: 1, legendary: {}, skills: true }),
    c,
    'start-test',
  );
  const distance = 6 + adjustment;
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === id
        ? {
            ...p,
            balance,
            position:
              map.tiles[
                (start - distance + map.tiles.length) % map.tiles.length
              ].id,
          }
        : p,
    ),
    core: { ...s.core, pendingDice: { values: [3, 3] } },
    holdings: [{ tileId: city, ownerId: id, facilityLevel: stage }],
    economy: {
      ...s.economy,
      completedLapsByPlayerId: {
        ...s.economy.completedLapsByPlayerId,
        [id]: 3,
      },
      visitOrdinalByPlayerId: { ...s.economy.visitOrdinalByPlayerId, [id]: 4 },
      developmentByTileId: {
        [city]: {
          stage,
          facilities: ['shop', 'center', 'final'].slice(0, stage),
          centerReadyVisitOrdinal: stage >= 2 ? 3 : null,
        },
      },
    },
  };
}
function command(s, intent, commandId = `c${s.economy.revision}`) {
  return {
    sessionId: s.economy.sessionId,
    commandId,
    expectedRevision: s.economy.revision,
    playerId: id,
    intent,
  };
}
function dispatch(s, intent) {
  const r = dispatchEconomy(s, c, command(s, intent));
  assert.equal(r.ok, true, r.error);
  return r;
}
function arrive(s = fresh(), adjustment = 0) {
  return dispatch(s, { type: 'resolve-dice', playerId: id, adjustment });
}
function builds(s) {
  return getLegalActions(s, c, id).actions.filter(
    (a) => a.intent.type === 'start-build',
  );
}

test('exact normal arrival offers one next stage, preserves salary/lap and actual START landing', () => {
  const before = fresh(),
    r = arrive(before),
    s = r.state;
  assert.ok(s.economy.pendingStartBuild);
  assert.equal(r.events.filter((e) => e.type === 'start-rewarded').length, 1);
  assert.equal(
    s.players[0].balance,
    before.players[0].balance + s.core.rules.startReward,
  );
  assert.equal(s.economy.completedLapsByPlayerId[id], 4);
  const [a] = builds(s);
  assert.equal(a.quote.landSubtotal, 0);
  assert.equal(a.quote.toStage, 1);
  assert.equal(a.quote.total, c.properties[city].buildCosts[0]);
  const landing = structuredClone(s.economy.landing),
    ord = s.economy.visitOrdinalByPlayerId[id];
  const built = dispatch(s, a.intent).state;
  assert.equal(built.players[0].balance, s.players[0].balance - a.quote.total);
  assert.equal(built.holdings[0].facilityLevel, 1);
  assert.deepEqual(built.economy.landing, landing);
  assert.equal(built.economy.visitOrdinalByPlayerId[id], ord);
  assert.equal(built.economy.pendingStartBuild, null);
  assert.equal(built.economy.pendingDebt, null);
  assert.ok(dispatch(built, { type: 'end-turn', playerId: id }).ok);
});

test('initial, passing and flight never mint an opportunity', () => {
  assert.equal(
    initializeEconomy(createGame(map, roster, { seed: 1 }), c, 'initial')
      .economy.pendingStartBuild,
    undefined,
  );
  const pass = fresh();
  pass.players = pass.players.map((p) =>
    p.id === id
      ? {
          ...p,
          position:
            map.tiles[(start - 5 + map.tiles.length) % map.tiles.length].id,
        }
      : p,
  );
  assert.equal(arrive(pass).state.economy.pendingStartBuild, undefined);
  const flight = fresh();
  flight.core = {
    ...flight.core,
    pendingDice: undefined,
    turnStage: 'awaiting-end',
  };
  flight.legendary = {
    ...flight.legendary,
    pendingFly: { playerId: id, turn: flight.turnNumber },
  };
  flight.players = flight.players.map((p) =>
    p.id === id
      ? {
          ...p,
          position: map.tiles.find(
            (t) => t.kind === 'special' && t.special === 'fly',
          ).id,
        }
      : p,
  );
  const fly = dispatchEconomy(
    flight,
    c,
    command(flight, { type: 'fly', playerId: id, to: map.tiles[start].id }),
  );
  assert.equal(fly.ok, true, fly.error);
  assert.equal(fly.state.economy.pendingStartBuild, undefined);
});

test('skip, quote authentication, stale/replay and double clicks consume at most once', () => {
  const s = arrive().state,
    [a] = builds(s),
    envelope = command(s, a.intent, 'build');
  assert.equal(
    dispatchEconomy(s, c, command(s, { ...a.intent, quoteId: 'forged' })).ok,
    false,
  );
  assert.equal(
    dispatchEconomy(s, c, command(s, { type: 'end-turn', playerId: id })).error,
    'start-build-decision-required',
  );
  const built = dispatchEconomy(s, c, envelope);
  assert.ok(built.ok);
  const replay = dispatchEconomy(built.state, c, envelope);
  assert.equal(replay.replayed, true);
  assert.equal(replay.state.players[0].balance, built.state.players[0].balance);
  assert.equal(
    dispatchEconomy(built.state, c, { ...envelope, commandId: 'double' }).error,
    'stale-revision',
  );
  assert.equal(
    dispatchEconomy(built.state, c, command(built.state, a.intent)).ok,
    false,
  );
  const skip = dispatch(s, {
    type: 'skip-start-build',
    opportunityId: s.economy.pendingStartBuild.id,
  }).state;
  assert.equal(skip.players[0].balance, s.players[0].balance);
  assert.equal(skip.economy.pendingStartBuild, null);
  assert.ok(dispatch(skip, { type: 'end-turn', playerId: id }).ok);
});

test('only owned normal cities, stage unlocks and one increment; final requires existing center under every profile', () => {
  let s = arrive(fresh(2)).state;
  assert.equal(builds(s)[0].quote.toStage, 3);
  assert.equal(
    quoteStartBuild(s, c, id, city, s.economy.pendingStartBuild.id).eligible,
    true,
  );
  assert.throws(() =>
    quoteStartBuild(s, c, id, landmark, s.economy.pendingStartBuild.id),
  );
  const centerNow = {
    ...s,
    economy: {
      ...s.economy,
      developmentByTileId: {
        [city]: {
          ...s.economy.developmentByTileId[city],
          centerReadyVisitOrdinal: s.economy.landing.visitOrdinal,
        },
      },
    },
  };
  assert.equal(
    quoteStartBuild(centerNow, c, id, city, s.economy.pendingStartBuild.id)
      .eligible,
    false,
  );
  const locked = fresh(0);
  locked.economy.completedLapsByPlayerId = {
    ...locked.economy.completedLapsByPlayerId,
    [id]: 0,
  };
  const next = arrive(locked).state;
  assert.equal(builds(next)[0].quote.toStage, 1);
  assert.equal(
    quoteConstruction(next, c, id, city, 2, next.economy.pendingStartBuild.id)
      .eligible,
    false,
  );
  assert.equal(arrive(fresh(3)).state.economy.pendingStartBuild, null);
  const unaffordable = fresh(2, 0);
  unaffordable.core = {
    ...unaffordable.core,
    rules: { ...unaffordable.core.rules, startReward: 0 },
  };
  assert.equal(arrive(unaffordable).state.economy.pendingStartBuild, null);
});

test('pending opportunity defers asset ranking and finalization; no pending leaves match normal; AI sees same candidates', () => {
  const s = arrive().state;
  assert.equal(hasPendingSettlement(s), true);
  assert.throws(() => rankAssets(s, c));
  const expired = {
    ...s,
    match: {
      ...createMatch(
        'standard',
        roster.map((p) => p.id),
      ),
      completedRounds: 20,
    },
  };
  // Use the real match constructor shape, set completedRounds to its configured limit.
  expired.match = {
    ...expired.match,
    completedRounds: expired.match.roundLimit,
  };
  assert.equal(finalizeMatch(expired, c).state.phase, 'playing');
  const snap = publicSnapshot(
    s,
    c,
    roster.map((p) => ({ id: p.id, controller: 'computer' })),
  );
  assert.deepEqual(
    snap.candidates.map((a) => a.action),
    getLegalActions(s, c, id).actions.map((a) => a.intent),
  );
  const decision = plan(snap, 42);
  assert.ok(decision);
  assert.ok(
    ['start-build', 'skip-start-build'].includes(
      decision.candidate.action.type,
    ),
  );
  assert.equal(
    dispatch(s, decision.candidate.action).state.economy.pendingStartBuild,
    null,
  );
  const skip = dispatch(s, {
    type: 'skip-start-build',
    opportunityId: s.economy.pendingStartBuild.id,
  }).state;
  assert.equal(hasPendingSettlement(skip), false);
  assert.ok(rankAssets(skip, c).length);
  const expiredSkip = dispatch(expired, {
    type: 'skip-start-build',
    opportunityId: expired.economy.pendingStartBuild.id,
  }).state;
  assert.equal(
    finalizeMatch(expiredSkip, c).state.victory.reason,
    'round-limit-assets',
  );
});
