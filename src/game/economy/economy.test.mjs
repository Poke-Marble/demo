/* global structuredClone */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kantoJohtoMap } from '../../data/maps/kanto-johto.ts';
import { createGame } from '../core/index.ts';
import {
  createEconomyContext,
  initializeEconomy,
  validateEconomyState,
  dispatchEconomy,
  getLegalActions,
  quoteConstruction,
  quoteSale,
  quoteToll,
  quoteTakeover,
  recommendedEconomyProfile,
  economyProfileForPreset,
  verifyCommittedReceipt,
  assetValue,
} from './index.ts';

const context = createEconomyContext(kantoJohtoMap);
const map = context.map;
const id = 'player:0';
const other = 'player:1';
const city = map.tiles.find((t) => t.kind === 'city').id;
const city2 = map.tiles.find((t) => t.kind === 'city' && t.id !== city).id;
const landmark = map.tiles.find((t) => t.kind === 'landmark').id;
const roster = Array.from({ length: 4 }, (_, i) => ({
  id: `player:${i}`,
  name: `P${i}`,
  pokemonId: `pokemon:000${i + 1}`,
}));
const fresh = (rules = {}, c = context) =>
  initializeEconomy(
    {
      ...createGame(c.map, roster, { seed: 1, legendary: rules }),
      abilityExtension: { preserved: ['yes'] },
    },
    c,
    'test-session',
  );
function freeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    Object.values(v).forEach(freeze);
  }
  return v;
}
function at(s, tileId = city, ordinal = 1, laps = 1) {
  return {
    ...s,
    core: { ...s.core, turnStage: 'awaiting-end' },
    players: s.players.map((p) =>
      p.id === id ? { ...p, position: tileId } : p,
    ),
    economy: {
      ...s.economy,
      completedLapsByPlayerId: {
        ...s.economy.completedLapsByPlayerId,
        [id]: laps,
      },
      visitOrdinalByPlayerId: {
        ...s.economy.visitOrdinalByPlayerId,
        [id]: ordinal,
      },
      landing: {
        id: `visit:${ordinal}`,
        playerId: id,
        tileId,
        visitOrdinal: ordinal,
        propertyDecisionUsed: false,
      },
    },
  };
}
function withBalance(s, balance, playerId = id) {
  return {
    ...s,
    players: s.players.map((p) => (p.id === playerId ? { ...p, balance } : p)),
  };
}
function blessing(s, key = 'hoOh', playerId = id) {
  return {
    ...s,
    legendary: {
      ...s.legendary,
      players: {
        ...s.legendary.players,
        [playerId]: { ...s.legendary.players[playerId], [key]: true },
      },
    },
  };
}
function holding(s, tileId, ownerId = id, stage = 0) {
  return {
    ...s,
    holdings: [
      ...s.holdings.filter((h) => h.tileId !== tileId),
      { tileId, ownerId, facilityLevel: stage },
    ],
    economy: {
      ...s.economy,
      developmentByTileId: {
        ...s.economy.developmentByTileId,
        ...(context.properties[tileId].kind === 'city'
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
function command(
  s,
  intent,
  commandId = `cmd:${s.economy.revision}`,
  playerId = s.activePlayerId,
) {
  return {
    sessionId: s.economy.sessionId,
    commandId,
    expectedRevision: s.economy.revision,
    playerId,
    intent,
  };
}
function act(s, intent, c = context, commandId) {
  const before = JSON.stringify(s);
  const result = dispatchEconomy(freeze(s), c, command(s, intent, commandId));
  assert.equal(JSON.stringify(s), before, 'input mutation');
  assert.equal(result.ok, true, result.error);
  return result;
}
function fail(s, intent, error, c = context) {
  const before = JSON.stringify(s);
  const result = dispatchEconomy(freeze(s), c, command(s, intent));
  assert.equal(result.ok, false);
  if (error) assert.equal(result.error, error);
  assert.equal(result.state, s);
  assert.deepEqual(result.events, []);
  assert.deepEqual(result.presentations, []);
  assert.equal(JSON.stringify(s), before);
}
const build = (s, stage, tileId = city) => ({
  type: 'construct-property',
  tileId,
  targetStage: stage,
  landingId: s.economy.landing.id,
});

for (const preset of ['standard', 'quick']) {
  test(`${preset}: cumulative stages, personal lap gates, final revisit and configuration binding`, () => {
    const profile = economyProfileForPreset(preset);
    const c = createEconomyContext(kantoJohtoMap, profile);
    assert.deepEqual(
      c.profile.unlockLaps,
      preset === 'standard' ? [0, 0, 1, 2] : [0, 0, 1, 1],
    );
    assert.equal(c.profile.requireFinalRevisit, true);
    for (const tile of kantoJohtoMap.tiles.filter(
      (tile) => tile.kind === 'city',
    ))
      assert.equal(
        c.properties[tile.id].finalFacilityKey,
        tile.finalFacility.key,
      );
    let s = at(fresh({}, c), city, 1, 0);
    assert.equal(quoteConstruction(s, c, id, city, 0).eligible, true);
    assert.equal(quoteConstruction(s, c, id, city, 1).eligible, true);
    fail(s, build(s, 2), 'stage-locked', c);
    s = act(s, build(s, 1), c).state;
    assert.deepEqual(s.economy.developmentByTileId[city].facilities, ['shop']);
    s = at(s, city, 2, 1);
    s = act(s, build(s, 2), c).state;
    s = {
      ...s,
      economy: {
        ...s.economy,
        landing: { ...s.economy.landing, propertyDecisionUsed: false },
      },
    };
    assert.ok(
      quoteConstruction(s, c, id, city, 3).reasons.includes(
        'final-revisit-required',
      ),
    );
    s = at(s, city, 3, 1);
    assert.equal(
      quoteConstruction(s, c, id, city, 3).eligible,
      preset === 'quick',
    );
    s = at(s, city, 3, profile.unlockLaps[3]);
    const q = quoteConstruction(s, c, id, city, 3);
    assert.equal(q.landSubtotal, 0);
    assert.equal(q.upgradeSubtotal, c.properties[city].buildCosts[2]);
    s = act(s, build(s, 3), c).state;
    assert.deepEqual(s.economy.developmentByTileId[city].facilities, [
      'shop',
      'center',
      'final',
    ]);
    assert.equal(s.holdings[0].facilityLevel, 3);
    assert.equal(quoteTakeover(s, c, other, city).eligible, false);
    const alternate = createEconomyContext(
      kantoJohtoMap,
      economyProfileForPreset(preset === 'standard' ? 'quick' : 'standard'),
    );
    assert.throws(() => validateEconomyState(s, alternate));
    const changed = {
      ...c,
      profile: { ...c.profile, unlockLaps: [0, 0, 0, 0] },
    };
    assert.throws(
      () => validateEconomyState(s, changed),
      /configuration-mismatch/,
    );
    assert.deepEqual(
      profile.unlockLaps,
      preset === 'standard' ? [0, 0, 1, 2] : [0, 0, 1, 1],
    );
  });
}

test('omitted preset defaults to standard and invalid presets are rejected', () => {
  assert.equal(economyProfileForPreset(), recommendedEconomyProfile);
  assert.deepEqual(
    createEconomyContext(kantoJohtoMap).profile.unlockLaps,
    [0, 0, 1, 2],
  );
  assert.throws(
    () => economyProfileForPreset('invalid'),
    /invalid-rules-preset/,
  );
  assert.throws(() => {
    recommendedEconomyProfile.unlockLaps[3] = 0;
  }, TypeError);
});
function moveTo(s, tileId) {
  const index = map.tiles.findIndex((t) => t.id === tileId);
  return {
    ...s,
    core: {
      ...s.core,
      rules: { ...s.core.rules, startReward: 0 },
      turnStage: 'awaiting-roll',
    },
    players: s.players.map((p) =>
      p.id === id ? { ...p, position: map.tiles[(index - 5 + 32) % 32].id } : p,
    ),
    economy: { ...s.economy, landing: null },
  };
}

test('real map catalog has 24 cities, 4 nonbuilding landmarks, 8 groups, distinct final metadata', () => {
  assert.equal(map.tiles.length, 32);
  assert.equal(
    Object.values(context.properties).filter((p) => p.kind === 'city').length,
    24,
  );
  assert.equal(
    Object.values(context.properties).filter((p) => p.kind === 'landmark')
      .length,
    4,
  );
  assert.equal(map.cityGroups.length, 8);
  assert.equal(context.properties[city].finalFacilityKey, 'oak-lab');
  const missing = structuredClone(kantoJohtoMap);
  delete missing.tiles.find((t) => t.kind === 'city').economy;
  assert.throws(() => createEconomyContext(missing));
  const bad = structuredClone(kantoJohtoMap);
  bad.tiles.find((t) => t.kind === 'city').economy.upgradeCosts[0] = NaN;
  assert.throws(() => createEconomyContext(bad));
  assert.throws(() =>
    createEconomyContext(kantoJohtoMap, {
      ...recommendedEconomyProfile,
      saleRate: 2,
    }),
  );
});
test('construction pays land and every missing prefix once; 65+65 discounted together; quote is pure', () => {
  const tile = Object.values(context.properties).find(
    (p) => p.kind === 'city' && p.buildCosts[0] === 65,
  ).tileId;
  const s = blessing(at(fresh(), tile));
  const before = JSON.stringify(s);
  const q = quoteConstruction(freeze(s), context, id, tile, 2);
  assert.equal(q.landSubtotal, 130);
  assert.equal(q.upgradeSubtotal, 130);
  assert.equal(q.total, 195);
  assert.equal(q.discount, 65);
  assert.equal(JSON.stringify(s), before);
  const r = act(s, build(s, 2, tile));
  assert.equal(r.state.players[0].balance, 1500 - 195);
  assert.equal(r.state.legendary.players[id].hoOh, false);
  assert.deepEqual(r.state.economy.developmentByTileId[tile].facilities, [
    'shop',
    'center',
  ]);
  assert.deepEqual(r.state.abilityExtension, { preserved: ['yes'] });
  assert.equal(r.state.legendary.rules, s.legendary.rules);
  fail(r.state, build(r.state, 2, tile), 'property-decision-used');
});
test('exact balance succeeds; shortage leaves all money, blessing, ownership, RNG unchanged', () => {
  let s = blessing(at(fresh()));
  const q = quoteConstruction(s, context, id, city, 2);
  fail(withBalance(s, q.total - 1), build(s, 2), 'insufficient-funds');
  s = withBalance(s, q.total);
  const r = act(s, build(s, 2));
  assert.equal(r.state.players[0].balance, 0);
  assert.equal(r.state.players[0].bankrupt, false);
});
test('lap gates ignore global turns; final requires later actual landing and center ownership', () => {
  let s = { ...at(fresh(), city, 1, 0), turnNumber: 999 };
  fail(s, build(s, 2), 'stage-locked');
  s = at(s, city, 1, 2);
  fail(s, build(s, 3), 'final-revisit-required');
  s = act(s, build(s, 2)).state;
  fail(s, build(s, 3), 'property-decision-used');
  s = at(s, city, 2, 2);
  const q = quoteConstruction(s, context, id, city, 3);
  assert.equal(q.landSubtotal, 0);
  assert.equal(q.upgradeSubtotal, 50);
  assert.deepEqual(
    q.lineItems.map((i) => i.amount),
    [0, 0, 0, 50],
  );
  const upgraded = act(s, build(s, 3));
  assert.equal(upgraded.receipt.ownershipChanged, false);
  s = upgraded.state;
  assert.equal(s.holdings[0].facilityLevel, 3);
  fail(at(s, city, 3), build(at(s, city, 3), 3), 'already-built');
});
test('wrong actor, landing, ownership, target, session, stale and duplicate payload reject', () => {
  const s = at(fresh());
  fail(s, { ...build(s, 1), landingId: 'old' }, 'wrong-landing');
  fail(s, { ...build(s, 1), tileId: city2 }, 'wrong-landing');
  fail(s, { ...build(s, 1), targetStage: NaN }, 'invalid-target');
  fail(holding(s, city, other), build(s, 1), 'not-owner');
  for (const patch of [
    { sessionId: 'old' },
    { expectedRevision: 12 },
    { playerId: other },
  ]) {
    const r = dispatchEconomy(s, context, {
      ...command(s, build(s, 1)),
      ...patch,
    });
    assert.equal(r.ok, false);
    assert.equal(r.state, s);
  }
  const cmd = command(s, build(s, 1), 'unique');
  const first = dispatchEconomy(s, context, cmd);
  assert.equal(first.ok, true);
  const retry = dispatchEconomy(first.state, context, cmd);
  assert.equal(retry.ok, true);
  assert.equal(retry.replayed, true);
  assert.equal(retry.state, first.state);
  assert.deepEqual(retry.events, []);
  assert.deepEqual(retry.receipt, first.receipt);
  const conflict = dispatchEconomy(first.state, context, {
    ...cmd,
    intent: { ...cmd.intent, targetStage: 0 },
  });
  assert.equal(conflict.error, 'duplicate-command-conflict');
});
test('landmarks buy separately; START, trials, fly cannot be acquired or built', () => {
  for (const t of map.tiles.filter((t) => t.kind !== 'city')) {
    const s = at(fresh(), t.id);
    fail(s, build(s, 1, t.id), 'not-purchasable');
    if (t.kind !== 'landmark')
      fail(
        s,
        { type: 'buy-landmark', tileId: t.id, landingId: s.economy.landing.id },
        'not-purchasable',
      );
  }
  const s = at(fresh(), landmark);
  const r = act(s, {
    type: 'buy-landmark',
    tileId: landmark,
    landingId: s.economy.landing.id,
  });
  assert.equal(r.state.economy.developmentByTileId[landmark], undefined);
  assert.equal(r.state.holdings[0].facilityLevel, 0);
  const landed = holding(at(fresh(), landmark), landmark, other);
  assert.equal(
    quoteToll(landed, context, id, landmark).total,
    context.properties[landmark].baseToll,
  );
  assert.equal(quoteTakeover(landed, context, id, landmark).eligible, false);
});
test('group multiplier uses all owned camps; sale instantly breaks group; no toll stage sum', () => {
  let s = at(fresh());
  const group = map.cityGroups.find((g) => g.cityIds.includes(city));
  for (const tileId of group.cityIds) s = holding(s, tileId, other, 0);
  assert.equal(quoteToll(s, context, id, city).total, 20);
  s = {
    ...s,
    holdings: s.holdings.filter((h) => h.tileId !== city2),
    economy: {
      ...s.economy,
      developmentByTileId: Object.fromEntries(
        Object.entries(s.economy.developmentByTileId).filter(
          ([k]) => k !== city2,
        ),
      ),
    },
  };
  assert.equal(quoteToll(s, context, id, city).total, 10);
  s = holding(s, city, other, 2);
  assert.equal(quoteToll(s, context, id, city).total, 100);
  assert.equal(quoteToll(s, context, other, city).total, 0);
});
test('toll precedes takeover; rejected takeover never refunds toll; acquisition resets revisit', () => {
  let s = withBalance(holding(moveTo(fresh(), city), city, other, 2), 450);
  const r = act(s, { type: 'roll-dice', playerId: id });
  s = r.state;
  assert.equal(s.players[0].balance, 350);
  assert.equal(s.players[1].balance, 1600);
  const takeover = {
    type: 'takeover-property',
    tileId: city,
    landingId: s.economy.landing.id,
  };
  fail(s, takeover, 'insufficient-funds');
  s = withBalance(s, 400);
  s = act(s, takeover).state;
  assert.equal(s.players[0].balance, 0);
  assert.equal(s.players[1].balance, 2000);
  assert.equal(
    s.economy.developmentByTileId[city].centerReadyVisitOrdinal,
    s.economy.landing.visitOrdinal,
  );
  fail(s, build(s, 3), 'property-decision-used');
  assert.equal(
    quoteTakeover(holding(at(fresh()), city, other, 3), context, id, city)
      .eligible,
    false,
  );
});
test('sale uses catalog capital despite discounted purchase and prevents same-visit repurchase', () => {
  let s = blessing(at(fresh()));
  s = act(s, build(s, 2)).state;
  const q = quoteSale(s, context, id, city);
  assert.equal(q.total, 100);
  s = act(s, { type: 'sell-property', tileId: city }).state;
  assert.deepEqual(s.holdings, []);
  assert.equal(s.economy.developmentByTileId[city], undefined);
  fail(s, build(s, 0), 'property-decision-used');
});
test('pending debt locks play, holds blessing, and sale settles fixed debt exactly once', () => {
  let s = holding(
    withBalance(moveTo(blessing(fresh(), 'lugia'), city), 0),
    city,
    other,
    2,
  );
  s = holding(s, city2, id, 2);
  let r = act(s, { type: 'roll-dice', playerId: id });
  s = r.state;
  const debt = s.economy.pendingDebt;
  assert.equal(debt.amount, 50);
  assert.equal(s.players[1].balance, 1500);
  assert.equal(s.legendary.players[id].lugia, true);
  assert.deepEqual(
    getLegalActions(s, context, id)
      .actions.map((a) => a.intent.type)
      .sort(),
    ['declare-bankruptcy', 'sell-property'],
  );
  fail(s, { type: 'end-turn', playerId: id }, 'debt-pending');
  fail(s, { type: 'sell-property', tileId: city2 }, 'wrong-debt');
  const cmd = command(s, {
    type: 'sell-property',
    tileId: city2,
    debtId: debt.id,
  });
  r = dispatchEconomy(freeze(s), context, cmd);
  assert.equal(r.ok, true, r.error);
  s = r.state;
  assert.equal(s.economy.pendingDebt, null);
  assert.equal(s.legendary.players[id].lugia, false);
  assert.equal(s.players[1].balance, 1550);
  assert.equal(s.players[0].balance, 50);
  assert.equal(r.events.filter((e) => e.type === 'toll-settled').length, 1);
  assert.deepEqual(dispatchEconomy(s, context, cmd).events, []);
});
test('insolvent landing auto-liquidates before bankruptcy then advances turn with no creditor ownership', () => {
  let s = holding(
    withBalance(moveTo(blessing(fresh(), 'lugia'), city), 10),
    city,
    other,
    3,
  );
  s = holding(s, city2, id, 0);
  const r = act(s, { type: 'roll-dice', playerId: id });
  s = r.state;
  assert.equal(s.players[0].bankrupt, true);
  assert.equal(s.players[0].balance, 0);
  assert.equal(s.holdings.length, 1);
  assert.equal(s.holdings[0].ownerId, other);
  assert.equal(s.activePlayerId, other);
  assert.equal(s.economy.pendingDebt, null);
  assert.equal(s.legendary.players[id].lugia, false);
  const settled = r.events.find((e) => e.type === 'toll-settled');
  assert.equal(settled.amount, 100);
  assert.equal(settled.recovered, 60);
  assert.equal(settled.forgiven, 40);
  const types = r.events.map((e) => e.type);
  assert.ok(types.indexOf('property-sold') < types.indexOf('toll-settled'));
  assert.ok(types.indexOf('toll-settled') < types.indexOf('player-bankrupt'));
  assert.ok(types.indexOf('player-bankrupt') < types.indexOf('turn-ended'));
});
test('voluntary early bankruptcy liquidates all assets, pays only debt, discards excess', () => {
  let s = holding(withBalance(moveTo(fresh(), city), 0), city, other, 2);
  s = holding(s, city2, id, 3);
  s = act(s, { type: 'roll-dice', playerId: id }).state;
  const r = act(s, {
    type: 'declare-bankruptcy',
    debtId: s.economy.pendingDebt.id,
  });
  assert.equal(r.state.players[0].balance, 0);
  assert.equal(r.state.players[0].bankrupt, true);
  assert.equal(r.state.players[1].balance, 1600);
});
test('Lugia discount rounds down; 0, 0%, 100% consumption follows quoteBlessing', () => {
  for (const [gross, rate, expected, used] of [
    [101, 0.5, 51, true],
    [1, 0.5, 1, true],
    [0, 0.5, 0, false],
    [101, 0, 101, true],
    [101, 1, 0, true],
  ]) {
    const board = structuredClone(kantoJohtoMap);
    board.tiles.find((t) => t.id === city).economy.tollByLevel[0] = gross;
    const c = createEconomyContext(board);
    const s = holding(
      moveTo(blessing(fresh({ tollDiscount: rate }, c), 'lugia'), city),
      city,
      other,
    );
    const r = act(s, { type: 'roll-dice', playerId: id }, c);
    assert.equal(r.state.players[0].balance, 1500 - expected);
    assert.equal(r.state.legendary.players[id].lugia, !used);
  }
});
test('actual normal START crossings count separately, exact START counts, fly and trial waits do not', () => {
  const start = map.tiles.find((t) => t.kind === 'start').id;
  let s = moveTo(fresh(), start);
  s = {
    ...s,
    core: { ...s.core, rules: { ...s.core.rules, startReward: 200 } },
  };
  let r = act(s, { type: 'roll-dice', playerId: id });
  s = r.state;
  assert.equal(s.economy.completedLapsByPlayerId[id], 1);
  assert.equal(s.players[0].balance, 1700);
  const fly = map.tiles.find(
    (t) => t.kind === 'special' && t.special === 'fly',
  ).id;
  s = act(moveTo(fresh(), fly), { type: 'roll-dice', playerId: id }).state;
  assert.equal(s.economy.completedLapsByPlayerId[id], 0);
  s = act(s, { type: 'fly', playerId: id, to: start }).state;
  assert.equal(s.economy.completedLapsByPlayerId[id], 0);
  assert.equal(s.players[0].balance, 1500);
  const trial = map.tiles.find(
    (t) => t.kind === 'special' && t.special === 'lugia-trial',
  ).id;
  s = act(moveTo(fresh({ successChance: 0 }), trial), {
    type: 'roll-dice',
    playerId: id,
  }).state;
  const laps = s.economy.completedLapsByPlayerId[id];
  const visits = s.economy.visitOrdinalByPlayerId[id];
  s = act(s, { type: 'attempt-trial', playerId: id }).state;
  assert.equal(s.economy.completedLapsByPlayerId[id], laps);
  assert.equal(s.economy.visitOrdinalByPlayerId[id], visits);
  assert.deepEqual(
    getLegalActions(s, context, id)
      .actions.map((a) => a.intent.type)
      .sort(),
    ['end-turn', 'use-escape-rope'],
  );
});
test('flight to an existing center is a new visit enabling final, no lap increment', () => {
  const fly = map.tiles.find(
    (t) => t.kind === 'special' && t.special === 'fly',
  ).id;
  let s = holding(moveTo(fresh(), fly), city, id, 2);
  s = {
    ...s,
    economy: {
      ...s.economy,
      completedLapsByPlayerId: {
        ...s.economy.completedLapsByPlayerId,
        [id]: 2,
      },
    },
  };
  s = act(s, { type: 'roll-dice', playerId: id }).state;
  s = act(s, { type: 'fly', playerId: id, to: city }).state;
  assert.equal(s.economy.completedLapsByPlayerId[id], 2);
  assert.equal(quoteConstruction(s, context, id, city, 3).eligible, true);
});
test('invalid saved state and overflow fail atomically, including failed settlement blessing', () => {
  const s = at(fresh());
  for (const bad of [
    withBalance(s, -1),
    withBalance(s, NaN),
    {
      ...s,
      holdings: [{ tileId: city, ownerId: 'player:missing', facilityLevel: 0 }],
    },
    holding(s, city, id, 8),
  ])
    fail(bad, build(s, 1), 'invalid-state');
  let bad = holding(moveTo(blessing(fresh(), 'lugia'), city), city, other, 2);
  bad = withBalance(bad, Number.MAX_SAFE_INTEGER, other);
  fail(bad, { type: 'roll-dice', playerId: id }, 'invalid-state');
  const c = createEconomyContext(kantoJohtoMap, {
    ...recommendedEconomyProfile,
    groupTollMultiplier: Number.MAX_SAFE_INTEGER,
  });
  let grouped = at(fresh({}, c));
  for (const tileId of map.cityGroups[0].cityIds)
    grouped = holding(grouped, tileId, other, 3);
  assert.throws(() => quoteToll(grouped, c, id, city));
});
test('legal actions are stable, affordable, actor independent and every offered choice dispatches', () => {
  for (const s of [
    fresh(),
    at(fresh()),
    holding(at(fresh()), city, other),
    holding(at(fresh()), city, id, 2),
    at(fresh(), landmark),
  ]) {
    const actions = getLegalActions(s, context, id);
    assert.deepEqual(actions, getLegalActions(structuredClone(s), context, id));
    assert.deepEqual(getLegalActions(s, context, other).actions, []);
    assert.ok(actions.actions.length > 0);
    for (const a of actions.actions)
      assert.equal(
        dispatchEconomy(freeze(s), context, command(s, a.intent)).ok,
        true,
        JSON.stringify(a),
      );
  }
});
test('external modifier contract changes only matching component and records modifier ids', () => {
  const c = createEconomyContext(kantoJohtoMap, undefined, [
    { id: 'ability:test', kind: 'upgrade', playerId: id, multiplierBps: 8000 },
  ]);
  const s = blessing(at(fresh({}, c)));
  const q = quoteConstruction(s, c, id, city, 2);
  assert.equal(q.total, 140);
  assert.deepEqual(q.modifierIds, ['ability:test']);
  const r = act(s, build(s, 2), c);
  assert.equal(r.receipt.quote.total, 140);
  assert.equal(r.state.players[0].balance, 1360);
  assert.equal(verifyCommittedReceipt(r.state, c, r.receipt), true);
  assert.equal(
    verifyCommittedReceipt(r.state, c, {
      ...r.receipt,
      ownershipChanged: false,
    }),
    false,
  );
  assert.equal(assetValue(r.state, c, id), 1460);
  assert.equal(
    dispatchEconomy(
      r.state,
      context,
      command(r.state, { type: 'end-turn', playerId: id }),
    ).error,
    'configuration-mismatch',
  );
  assert.throws(() =>
    createEconomyContext(kantoJohtoMap, undefined, [
      { id: 'bad', kind: 'toll', playerId: id, multiplierBps: -1 },
    ]),
  );
});
test('JSON roundtrip retains receipts, all extensions, debt and legal behavior', () => {
  let s = act(at(fresh()), build(at(fresh()), 1)).state;
  s = JSON.parse(JSON.stringify(s));
  assert.doesNotThrow(() => validateEconomyState(s, context));
  assert.deepEqual(s.abilityExtension, { preserved: ['yes'] });
  assert.equal(
    getLegalActions(s, context, id).actions.some(
      (a) => a.intent.type === 'end-turn',
    ),
    true,
  );
});

test('saved debt rejects changed discount, missing visit token, and config drift atomically', () => {
  let s = holding(
    withBalance(moveTo(blessing(fresh(), 'lugia'), city), 0),
    city,
    other,
    2,
  );
  s = holding(s, city2, id, 2);
  s = act(s, { type: 'roll-dice', playerId: id }).state;
  const bad = {
    ...s,
    economy: {
      ...s.economy,
      pendingDebt: { ...s.economy.pendingDebt, amount: 1 },
    },
  };
  fail(
    bad,
    { type: 'declare-bankruptcy', debtId: s.economy.pendingDebt.id },
    'invalid-state',
  );
  const ready = at(fresh());
  fail(
    ready,
    { type: 'construct-property', tileId: city, targetStage: 1 },
    'wrong-landing',
  );
  const changed = createEconomyContext(kantoJohtoMap, {
    ...recommendedEconomyProfile,
    requireFinalRevisit: false,
  });
  fail(ready, build(ready, 1), 'configuration-mismatch', changed);
});
test('partial liquidation keeps fixed debt and blessing until final sale, without partial creditor credit', () => {
  const expensive = Object.values(context.properties).find(
    (p) => p.kind === 'city' && p.landCost === 310,
  ).tileId;
  let s = holding(
    withBalance(moveTo(blessing(fresh(), 'lugia'), expensive), 0),
    expensive,
    other,
    3,
  );
  const ownTiles = map.tiles
    .filter(
      (t) => t.kind === 'city' && context.properties[t.id].landCost === 100,
    )
    .map((t) => t.id);
  for (const tileId of ownTiles) s = holding(s, tileId, id, 2);
  // Toll 620 / 2 = 310; total sale assets 300 would auto-bankrupt, so add another property.
  s = holding(s, city2, id, 3);
  s = act(s, { type: 'roll-dice', playerId: id }).state;
  const debt = s.economy.pendingDebt;
  assert.equal(debt.amount, 310);
  const beforeCreditor = s.players[1].balance;
  const first = ownTiles.find((t) => t !== city2);
  s = act(s, { type: 'sell-property', tileId: first, debtId: debt.id }).state;
  assert.equal(s.economy.pendingDebt.amount, 310);
  assert.equal(s.players[1].balance, beforeCreditor);
  assert.equal(s.legendary.players[id].lugia, true);
  for (const h of [...s.holdings.filter((h) => h.ownerId === id)]) {
    s = act(s, {
      type: 'sell-property',
      tileId: h.tileId,
      debtId: debt.id,
    }).state;
    if (!s.economy.pendingDebt) break;
  }
  assert.equal(s.economy.pendingDebt, null);
  assert.equal(s.players[1].balance, beforeCreditor + 310);
  assert.equal(s.legendary.players[id].lugia, false);
});
test('four-player real-map simulation progresses through only legal actions and preserves invariants/replays', () => {
  let s = fresh();
  let generator = 997;
  for (let i = 0; i < 180; i++) {
    const legal = getLegalActions(s, context, s.activePlayerId).actions;
    assert.ok(legal.length > 0, `stuck at ${i}`);
    generator = (Math.imul(generator, 1664525) + 1013904223) >>> 0;
    const preferred = legal.filter(
      (a) => !['sell-property', 'declare-bankruptcy'].includes(a.intent.type),
    );
    const pool = preferred.length ? preferred : legal;
    const intent = pool[generator % pool.length].intent;
    const cmd = command(s, intent, `simulation:${i}`);
    const r = dispatchEconomy(freeze(s), context, cmd);
    assert.equal(r.ok, true, r.error);
    s = JSON.parse(JSON.stringify(r.state));
    validateEconomyState(s, context);
    assert.deepEqual(s.abilityExtension, { preserved: ['yes'] });
    assert.equal(dispatchEconomy(s, context, cmd).replayed, true);
    assert.equal(s.economy.revision, i + 1);
  }
  assert.ok(s.turnNumber > 20);
  assert.ok(
    Object.values(s.economy.completedLapsByPlayerId).some((n) => n > 0),
  );
  assert.ok(s.holdings.length > 0);
});
