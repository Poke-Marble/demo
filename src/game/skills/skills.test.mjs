import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch } from '../core/index.ts';
import { kantoJohtoMap } from '../../data/maps/kanto-johto.ts';
import {
  createEconomyContext,
  initializeEconomy,
  dispatchEconomy,
  getLegalActions,
  quoteToll,
  quoteTakeover,
  validateEconomyState,
} from '../economy/index.ts';
import {
  hasAdvantage,
  skillDiscountedAmount,
  completeSkillBasicTurn,
  clearFinishedSkills,
} from './index.ts';

const c = createEconomyContext(kantoJohtoMap);
const map = c.map;
const id = 'player:1',
  rival = 'player:2';
const city = 'tile:kj:blackthorn';
const fresh = (
  pokemon = 'pokemon:0004',
  defender = 'pokemon:0001',
  seed = 42,
) =>
  initializeEconomy(
    createGame(
      map,
      [
        { id, name: 'A', pokemonId: pokemon },
        { id: rival, name: 'B', pokemonId: defender },
      ],
      { seed, skills: true, legendary: {} },
    ),
    c,
    'skills:test',
  );
function own(s, tileId = city, stage = 0, ownerId = rival) {
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
function approaching(s, target = city, distance = 7) {
  const i = map.tiles.findIndex((t) => t.id === target);
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === id
        ? {
            ...p,
            position:
              map.tiles[(i - distance + map.tiles.length) % map.tiles.length]
                .id,
          }
        : p,
    ),
  };
}
const command = (s, intent) => ({
  sessionId: s.economy.sessionId,
  commandId: `command:${s.economy.revision}`,
  expectedRevision: s.economy.revision,
  playerId: s.activePlayerId,
  intent,
});
function act(s, intent) {
  const r = dispatchEconomy(s, c, command(s, intent));
  assert.ok(r.ok, r.error);
  return r;
}
const legal = (s) => getLegalActions(s, c, s.activePlayerId).actions;
function landing(s, target = city) {
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === id ? { ...p, position: target } : p,
    ),
    core: { ...s.core, turnStage: 'awaiting-end' },
    economy: {
      ...s.economy,
      visitOrdinalByPlayerId: { ...s.economy.visitOrdinalByPlayerId, [id]: 1 },
      landing: {
        id: 'landing:test',
        playerId: id,
        tileId: target,
        visitOrdinal: 1,
        propertyDecisionUsed: false,
      },
    },
  };
}
function blessed(s, rate = 0.5) {
  return {
    ...s,
    legendary: {
      ...s.legendary,
      rules: { ...s.legendary.rules, tollDiscount: rate },
      players: {
        ...s.legendary.players,
        [id]: { ...s.legendary.players[id], lugia: true },
      },
    },
  };
}

test('only four asymmetric advantages exist; no grass/electric cycle or resistance penalty', () => {
  const types = ['fire', 'water', 'grass', 'electric'];
  const pairs = types
    .flatMap((a) =>
      types.filter((b) => hasAdvantage(a, b)).map((b) => `${a}:${b}`),
    )
    .sort();
  assert.deepEqual(pairs, [
    'electric:water',
    'fire:grass',
    'grass:water',
    'water:fire',
  ]);
});

for (const [pokemon, adjustment] of [
  ['pokemon:0001', -1],
  ['pokemon:0007', 1],
]) {
  test(`${pokemon}: public dice precede movement; keep free, adjusted real landing spends once, JSON/replay safe`, () => {
    const original = fresh(pokemon);
    const revealed = act(original, { type: 'roll-dice', playerId: id });
    assert.ok(revealed.state.core.pendingDice);
    assert.equal(
      revealed.state.players[0].position,
      original.players[0].position,
    );
    assert.equal(
      revealed.state.players[0].balance,
      original.players[0].balance,
    );
    assert.equal(
      revealed.events.some((e) => e.type === 'tile-landed'),
      false,
    );
    const s = JSON.parse(JSON.stringify(revealed.state));
    assert.deepEqual(legal(s), legal(revealed.state));
    assert.deepEqual(
      legal(s)
        .map((a) => a.intent.adjustment)
        .sort(),
      [0, adjustment].sort(),
    );
    const wrong = dispatchEconomy(
      s,
      c,
      command(s, {
        type: 'resolve-dice',
        playerId: id,
        adjustment: -adjustment,
      }),
    );
    assert.equal(wrong.ok, false);
    assert.equal(wrong.state, s);
    assert.equal(
      dispatchEconomy(s, c, command(s, { type: 'end-turn', playerId: id })).ok,
      false,
    );
    const kept = act(s, { type: 'resolve-dice', playerId: id, adjustment: 0 });
    assert.equal(kept.state.skills.players[id].pp, 3);
    assert.equal(kept.state.skills.players[id].usedThisBasicTurn, false);
    const intent = { type: 'resolve-dice', playerId: id, adjustment };
    const moved = act(s, intent);
    const sum = s.core.pendingDice.values.reduce((a, b) => a + b, 0);
    assert.equal(
      moved.events.find((e) => e.type === 'dice-rolled').distance,
      sum + adjustment,
    );
    assert.equal(
      moved.state.players[0].position,
      map.tiles[sum + adjustment].id,
    );
    assert.equal(moved.state.skills.players[id].pp, 2);
    assert.equal(moved.state.skills.players[id].usedThisBasicTurn, true);
    assert.equal(moved.state.core.rngState, s.core.rngState);
    const replay = dispatchEconomy(moved.state, c, command(s, intent));
    assert.ok(replay.ok && replay.replayed);
    assert.equal(replay.state, moved.state);
    assert.equal(replay.events.length, 0);
    assert.equal(
      dispatchEconomy(moved.state, c, command(moved.state, intent)).ok,
      false,
    );
  });
}

test('adjusted landing enters actual trial before any settlement, without rejecting spent PP', () => {
  const trial = map.tiles.find(
    (t) => t.kind === 'special' && t.special === 'lugia-trial',
  );
  const s = approaching(fresh('pokemon:0001'), trial.id, 6);
  const reveal = act(s, { type: 'roll-dice', playerId: id }).state;
  const r = act(reveal, { type: 'resolve-dice', playerId: id, adjustment: -1 });
  assert.equal(r.state.players[0].position, trial.id);
  assert.ok(r.state.legendary.players[id].trial);
  assert.equal(r.state.skills.players[id].pp, 2);
  assert.equal(
    legal(r.state).some((a) => a.intent.type === 'use-skill'),
    false,
  );
});

test('movement at 2/12 cannot spend PP for a clamped no-op', () => {
  for (const [pokemon, values] of [
    ['pokemon:0001', [1, 1]],
    ['pokemon:0007', [6, 6]],
  ]) {
    const s = fresh(pokemon);
    const pending = { ...s, core: { ...s.core, pendingDice: { values } } };
    assert.equal(legal(pending).length, 1);
    assert.equal(
      act(pending, { type: 'resolve-dice', playerId: id, adjustment: 0 }).state
        .skills.players[id].pp,
      3,
    );
  }
});

test('Ember and shared breakthrough quote before mandatory toll, no stacking; replay never spends twice', () => {
  const before = approaching(own(fresh(), city, 3));
  const s = act(before, { type: 'roll-dice', playerId: id }).state;
  assert.ok(s.economy.pendingToll);
  assert.equal(s.players[1].balance, 1500);
  const choices = legal(s);
  assert.deepEqual(
    choices.map((a) => a.intent.type),
    ['pay-toll', 'use-skill', 'use-skill'],
  );
  assert.equal(choices[1].quote.total, quoteToll(s, c, id, city).total - 125);
  assert.equal(choices[2].quote.total, quoteToll(s, c, id, city).total - 85);
  const choice = choices[1];
  const r = act(s, choice.intent);
  assert.equal(r.state.skills.players[id].pp, 2);
  assert.equal(r.state.skills.players[id].prepared, null);
  assert.equal(r.receipt.quote.total, choice.quote.total);
  assert.equal(
    r.events.find((e) => e.type === 'skill-activated').activation.skillSavings,
    125,
  );
  const replay = dispatchEconomy(r.state, c, command(s, choice.intent));
  assert.ok(replay.ok && replay.replayed);
  assert.equal(replay.state, r.state);
  const conflict = dispatchEconomy(r.state, c, {
    ...command(s, choice.intent),
    intent: choices[2].intent,
  });
  assert.equal(conflict.error, 'duplicate-command-conflict');
  assert.equal(
    legal(r.state).some((a) => a.intent.type === 'use-skill'),
    false,
  );
});

test('no passive type discount, weakness penalty or free movement landing bonus; every starter can choose common toll skill', () => {
  for (const pokemon of [
    'pokemon:0001',
    'pokemon:0007',
    'pokemon:0004',
    'pokemon:0025',
  ]) {
    let s = approaching(own(fresh(pokemon), city, 1));
    const baseline = quoteToll(s, c, id, city).total;
    const rolled = act(s, { type: 'roll-dice', playerId: id }).state;
    s = rolled.core.pendingDice
      ? act(rolled, { type: 'resolve-dice', playerId: id, adjustment: 0 }).state
      : rolled;
    assert.equal(quoteToll(s, c, id, city).total, baseline);
    const common = legal(s).find((a) => a.intent.mode === 'breakthrough');
    assert.ok(common);
    const paid = act(s, common.intent);
    assert.equal(paid.state.skills.players[id].pp, 2);
    assert.ok(baseline - paid.receipt.quote.total <= 60);
  }
});

test('Thunder Shock immediately acquires legal city with capped quote; failed/unaffordable/immune intent never spends', () => {
  const s = landing(own(fresh('pokemon:0025', 'pokemon:0007'), city, 2));
  const skill = legal(s).find((a) => a.intent.type === 'use-skill');
  assert.ok(skill);
  assert.equal(quoteTakeover(s, c, id, city).total - skill.quote.total, 125);
  const r = act(s, skill.intent);
  assert.equal(r.state.holdings[0].ownerId, id);
  assert.equal(r.state.skills.players[id].pp, 2);
  assert.equal(r.state.players[1].balance, 1500 + skill.quote.total);
  for (const [tile, stage] of [
    [city, 3],
    [map.tiles.find((t) => t.kind === 'landmark').id, 0],
  ]) {
    const immune = landing(own(fresh('pokemon:0025'), tile, stage), tile);
    assert.equal(
      legal(immune).some((a) => a.intent.type === 'use-skill'),
      false,
    );
    const fail = dispatchEconomy(
      immune,
      c,
      command(immune, {
        type: 'use-skill',
        mode: 'signature',
        tileId: tile,
        landingId: immune.economy.landing.id,
      }),
    );
    assert.equal(fail.ok, false);
    assert.equal(fail.state, immune);
  }
  const poor = {
    ...s,
    players: s.players.map((p) => (p.id === id ? { ...p, balance: 0 } : p)),
  };
  const fail = dispatchEconomy(poor, c, command(poor, skill.intent));
  assert.equal(fail.ok, false);
  assert.equal(fail.state.skills.players[id].pp, 3);
});

test('blessing + skill composed once; net extra savings capped even for odd amounts, minimal payable 1', () => {
  for (const gross of [1, 3, 7, 101, 311, 999, 99999])
    for (const rate of [0, 0.15, 0.5, 1]) {
      const baseline = gross - Math.floor(gross * rate);
      const value = skillDiscountedAmount(gross, rate, {
        rateBps: 3500,
        cap: 125,
      });
      assert.ok(value >= 1);
      assert.ok(baseline - value <= 125);
    }
  const s = act(approaching(blessed(own(fresh(), city, 3))), {
    type: 'roll-dice',
    playerId: id,
  }).state;
  const base = quoteToll(s, c, id, city).total;
  const skill = legal(s).find((a) => a.intent.mode === 'signature');
  assert.ok(base - skill.quote.total <= 125);
  const r = act(s, skill.intent);
  assert.equal(r.state.legendary.players[id].lugia, false);
  assert.equal(r.state.players[0].balance, 1500 - skill.quote.total);
  assert.equal(r.state.players[1].balance, 1500 + skill.quote.total);
  assert.equal(r.state.skills.players[id].pp, 2);
});

test('discounted debt preserves prepared skill and blessing across JSON/liquidation, consumes neither twice', () => {
  let before = approaching(
    own(own(blessed(fresh()), city, 3), 'tile:kj:indigo', 2, id),
  );
  before = {
    ...before,
    players: before.players.map((p) =>
      p.id === id ? { ...p, balance: 1 } : p,
    ),
  };
  const landed = act(before, { type: 'roll-dice', playerId: id }).state;
  const choice = legal(landed).find((a) => a.intent.mode === 'signature');
  const used = act(landed, choice.intent);
  assert.ok(used.state.economy.pendingDebt);
  assert.equal(used.state.skills.players[id].pp, 2);
  let s = JSON.parse(JSON.stringify(used.state));
  validateEconomyState(s, c);
  assert.equal(
    legal(s).some((a) => a.intent.type === 'use-skill'),
    false,
  );
  const sale = legal(s).find((a) => a.intent.type === 'sell-property');
  assert.ok(sale);
  const r = act(s, sale.intent);
  assert.equal(r.state.economy.pendingDebt, null);
  assert.equal(r.state.skills.players[id].prepared, null);
  assert.equal(r.state.skills.players[id].pp, 2);
  assert.equal(r.state.legendary.players[id].lugia, false);
});

test('basic-turn completion only unlocks per-turn use; PP never refills; finished clears preparation', () => {
  let s = act(
    landing(own(fresh('pokemon:0025'), city, 0)),
    legal(landing(own(fresh('pokemon:0025'), city, 0))).find(
      (a) => a.intent.type === 'use-skill',
    ).intent,
  ).state;
  const originalPP = s.skills.players[id].pp;
  s = act(s, { type: 'end-turn', playerId: id }).state;
  assert.equal(s.skills.players[id].pp, originalPP);
  assert.equal(s.skills.players[id].usedThisBasicTurn, false);
  assert.equal(completeSkillBasicTurn(s, id, 1), s);
  const prepared = {
    ...s,
    skills: {
      ...s.skills,
      players: {
        ...s.skills.players,
        [id]: {
          ...s.skills.players[id],
          prepared: { kind: 'toll', mode: 'breakthrough', tileId: city },
        },
      },
    },
  };
  assert.equal(
    clearFinishedSkills({ ...prepared, phase: 'finished' }).skills.players[id]
      .prepared,
    null,
  );
});

test('flight arrival cannot offer any toll skill; trial/pending flight and no PP cannot activate', () => {
  const fly = map.tiles.find(
    (t) => t.kind === 'special' && t.special === 'fly',
  );
  let s = own(fresh(), city, 0);
  s = {
    ...s,
    players: s.players.map((p) =>
      p.id === id ? { ...p, position: fly.id } : p,
    ),
    core: { ...s.core, turnStage: 'awaiting-end' },
    legendary: {
      ...s.legendary,
      pendingFly: { playerId: id, turn: s.turnNumber },
    },
  };
  const flown = act(s, { type: 'fly', playerId: id, to: city });
  assert.equal(flown.state.economy.pendingToll ?? null, null);
  assert.equal(flown.state.skills.players[id].pp, 3);
  assert.equal(
    flown.events.some((e) => e.type === 'toll-settled'),
    true,
  );
  const depleted = {
    ...fresh('pokemon:0001'),
    skills: {
      ...fresh().skills,
      players: {
        ...fresh().skills.players,
        [id]: { pp: 0, usedThisBasicTurn: false, prepared: null },
      },
    },
  };
  const rolled = act(depleted, { type: 'roll-dice', playerId: id });
  assert.equal(rolled.state.core.pendingDice, undefined);
});

test('invalid serialized skill version/PP or pending dice rejected without changing state or RNG', () => {
  for (const change of [
    { schemaVersion: 2 },
    { players: { [id]: { pp: -1, usedThisBasicTurn: false, prepared: null } } },
  ]) {
    const s = fresh('pokemon:0001');
    const bad = { ...s, skills: { ...s.skills, ...change } };
    const r = dispatchEconomy(
      bad,
      c,
      command(bad, { type: 'roll-dice', playerId: id }),
    );
    assert.equal(r.ok, false);
    assert.equal(r.state, bad);
  }
  const s = fresh('pokemon:0001');
  const bad = { ...s, core: { ...s.core, pendingDice: { values: [99, 1] } } };
  assert.equal(
    dispatch(bad, map, { type: 'resolve-dice', playerId: id, adjustment: 0 })
      .ok,
    false,
  );
});
