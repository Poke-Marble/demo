import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../core/index.ts';
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
  completeSkillBasicTurn,
  clearFinishedSkills,
} from './index.ts';
import { nextRandom } from '../core/random.ts';

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

const skill = (s) => legal(s).find((a) => a.intent.type === 'use-skill');
const rollLanding = (s, target = city) =>
  act(
    {
      ...approaching(s, target),
      core: { ...s.core, pendingDice: { values: [3, 4] } },
    },
    { type: 'resolve-dice', playerId: id, adjustment: 0 },
  );
const trap = (s, tileId = city, ownerId = rival) => ({
  ...s,
  skills: { ...s.skills, traps: { ...s.skills.traps, [tileId]: ownerId } },
});

test('grass spends once before roll, consumes one seeded die, duplicates it and waits for roll action', () => {
  const before = fresh('pokemon:0001');
  const next = nextRandom(before.core.rngState);
  const armed = act(before, skill(before).intent).state;
  assert.equal(armed.players[0].position, before.players[0].position);
  assert.equal(armed.core.rngState, before.core.rngState);
  assert.equal(armed.skills.players[id].pp, 2);
  assert.equal(armed.skills.players[id].forceDoubleNextRoll, true);
  assert.equal(skill(armed), undefined);
  const result = act(JSON.parse(JSON.stringify(armed)), {
    type: 'roll-dice',
    playerId: id,
  });
  assert.equal(result.state.core.rngState, next.state);
  assert.deepEqual(
    result.events.find((e) => e.type === 'dice-rolled').values,
    Array(2).fill(Math.floor(next.value * 6) + 1),
  );
  assert.equal(result.state.skills.players[id].forceDoubleNextRoll, false);
  assert.equal(result.state.core.doubleChain.extraRollPending, true);
});

test('normal roll uses two seeded dice and old adjustment/breakthrough effects are rejected', () => {
  const s = fresh('pokemon:0007');
  const result = act(s, { type: 'roll-dice', playerId: id });
  assert.equal(
    result.state.core.rngState,
    nextRandom(nextRandom(s.core.rngState).state).state,
  );
  assert.equal(result.state.core.pendingDice, undefined);
  const pending = {
    ...s,
    core: { ...s.core, pendingDice: { values: [3, 4] } },
  };
  assert.equal(
    dispatchEconomy(
      pending,
      c,
      command(pending, { type: 'resolve-dice', playerId: id, adjustment: 1 }),
    ).ok,
    false,
  );
  const landed = rollLanding(own(s)).state;
  assert.equal(
    dispatchEconomy(
      landed,
      c,
      command(landed, { ...skill(landed).intent, mode: 'breakthrough' }),
    ).ok,
    false,
  );
});

for (const stage of [1, 2])
  test(`ember destroys stage ${stage} once and settles the authoritative lower toll`, () => {
    const before = rollLanding(own(fresh(), city, stage)).state;
    const base = quoteToll(before, c, id, city).total;
    const a = skill(before);
    assert.ok(a.quote.total < base);
    const cash = before.players[0].balance;
    const result = act(before, a.intent);
    const s = result.state;
    assert.equal(s.holdings[0].facilityLevel, stage - 1);
    assert.equal(s.holdings[0].ownerId, rival);
    assert.equal(s.economy.developmentByTileId[city].stage, stage - 1);
    assert.equal(s.players[0].balance, cash - quoteToll(s, c, id, city).total);
    assert.equal(s.skills.players[id].pp, 2);
    assert.equal(s.economy.pendingToll, null);
    validateEconomyState(s, c);
    const replay = dispatchEconomy(s, c, command(before, a.intent));
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.state, s);
  });

for (let [target, stage] of [
  [city, 0],
  [city, 3],
  ['tile:kj:mt-silver', 0],
])
  test(`ember protects ${target} stage ${stage}`, () => {
    // Choose the actual catalog landmark instead of relying on its label.
    if (!c.properties[target])
      target = Object.values(c.properties).find(
        (p) => p.kind === 'landmark',
      ).tileId;
    const s = rollLanding(own(fresh(), target, stage), target).state;
    assert.equal(skill(s), undefined);
  });

test('water explicitly waits before trap/money, waives once, disarms before paralysis, retains blessing', () => {
  const start = trap(own(blessed(fresh('pokemon:0007')), city, 2));
  const result = rollLanding(start);
  const s = result.state;
  assert.ok(s.economy.pendingToll);
  assert.equal(s.skills.players[id].paralyzed, false);
  assert.equal(s.skills.traps[city], rival);
  assert.equal(s.players[0].balance, start.players[0].balance);
  const use = skill(s);
  assert.equal(use.quote.total, 0);
  const after = act(s, use.intent).state;
  assert.equal(after.players[0].balance, start.players[0].balance);
  assert.equal(after.skills.traps[city], undefined);
  assert.equal(after.skills.players[id].paralyzed, false);
  assert.equal(after.skills.players[id].prepared, null);
  assert.equal(after.legendary.players[id].lugia, true);
  assert.equal(after.skills.players[id].pp, 2);
  assert.ok(quoteToll(after, c, id, city).total > 0);
  assert.equal(
    dispatchEconomy(after, c, { ...command(s, use.intent), commandId: 'stale' })
      .error,
    'stale-revision',
  );
});

test('declining water pays normal toll and trap sets a single next-turn skip; replay is inert', () => {
  const start = trap(own(fresh('pokemon:0007')));
  const s = rollLanding(start).state;
  const normal = quoteToll(s, c, id, city).total;
  const pay = legal(s).find((a) => a.intent.type === 'pay-toll');
  const after = act(s, pay.intent).state;
  assert.equal(after.players[0].balance, start.players[0].balance - normal);
  assert.equal(after.skills.players[id].paralyzed, true);
  assert.equal(after.skills.players[id].pp, 3);
  assert.equal(after.skills.traps[city], undefined);
  const passed = act(
    after,
    legal(after).find((a) => a.intent.type === 'pass-property').intent,
  ).state;
  const ended = act(passed, { type: 'end-turn', playerId: id }).state;
  const next = {
    ...ended,
    core: { ...ended.core, turnStage: 'awaiting-end' },
    economy: { ...ended.economy, landing: null },
  };
  const skip = act(next, { type: 'end-turn', playerId: rival });
  assert.equal(skip.state.activePlayerId, rival);
  assert.equal(skip.state.skills.players[id].paralyzed, false);
  assert.equal(
    skip.events.filter((e) => e.type === 'turn-ended' && e.playerId === id)
      .length,
    1,
  );
});

test('water reacts to flight arrival and zero toll trap before trap resolution', () => {
  let start = trap(own(fresh('pokemon:0007')));
  const freeContext = createEconomyContext(kantoJohtoMap, c.profile, [
    { id: 'free', kind: 'toll', playerId: id, tileId: city, multiplierBps: 0 },
  ]);
  start = {
    ...start,
    core: { ...start.core, turnStage: 'awaiting-end' },
    players: start.players.map((p) =>
      p.id === id
        ? { ...p, position: map.tiles.find((t) => t.special === 'fly').id }
        : p,
    ),
    legendary: {
      ...start.legendary,
      pendingFly: { playerId: id, turn: start.turnNumber },
    },
  };
  const flight = dispatchEconomy(
    start,
    c,
    command(start, { type: 'fly', playerId: id, to: city }),
  );
  assert.ok(flight.ok, flight.error);
  assert.ok(flight.state.economy.pendingToll);
  assert.equal(flight.state.skills.players[id].paralyzed, false);
  assert.equal(
    act(flight.state, skill(flight.state).intent).state.skills.traps[city],
    undefined,
  );
  const base = fresh('pokemon:0007');
  let free = initializeEconomy(
    createGame(map, base.players, { seed: 42, skills: true, legendary: {} }),
    freeContext,
    'free:trap',
  );
  free = trap(own(free));
  free = {
    ...approaching(free),
    core: { ...free.core, pendingDice: { values: [3, 4] } },
  };
  const arrived = dispatchEconomy(
    free,
    freeContext,
    command(free, { type: 'resolve-dice', playerId: id, adjustment: 0 }),
  );
  assert.ok(arrived.ok, arrived.error);
  assert.equal(quoteToll(arrived.state, freeContext, id, city).total, 0);
  assert.ok(arrived.state.economy.pendingToll);
  const use = getLegalActions(arrived.state, freeContext, id).actions.find(
    (a) => a.intent.type === 'use-skill',
  );
  const disarmed = dispatchEconomy(
    arrived.state,
    freeContext,
    command(arrived.state, use.intent),
  );
  assert.ok(disarmed.ok, disarmed.error);
  assert.equal(disarmed.state.skills.players[id].paralyzed, false);
  assert.equal(disarmed.state.skills.traps[city], undefined);
});

test('electric installs on own cities only; self landing and passing do not consume; sale/takeover clean traps', () => {
  const s = own(fresh('pokemon:0025'), city, 1, id);
  const installed = act(s, skill(s).intent).state;
  assert.equal(installed.skills.traps[city], id);
  assert.equal(installed.skills.players[id].pp, 2);
  assert.equal(skill(installed), undefined);
  const self = rollLanding(installed).state;
  assert.equal(self.skills.traps[city], id);
  assert.equal(self.skills.players[id].paralyzed, false);
  const sold = act(
    self,
    legal(self).find((a) => a.intent.type === 'sell-property').intent,
  ).state;
  assert.deepEqual(sold.skills.traps, {});
  const duplicate = { ...s, skills: { ...s.skills, traps: { [city]: id } } };
  assert.equal(skill(duplicate), undefined);
  const opponent = own(fresh('pokemon:0025'));
  assert.equal(skill(opponent), undefined);
});

test('a double extra roll preserves PP usage; basic end resets usage and never refills PP', () => {
  const base = fresh('pokemon:0001');
  const n = Math.floor(nextRandom(base.core.rngState).value * 6) + 1;
  const before = approaching(base, city, n * 2);
  const armed = act(before, skill(before).intent).state;
  let s = act(armed, { type: 'roll-dice', playerId: id }).state;
  const pass = legal(s).find((a) => a.intent.type === 'pass-property');
  if (pass) s = act(s, pass.intent).state;
  const extra = act(s, { type: 'end-turn', playerId: id });
  assert.equal(extra.state.activePlayerId, id);
  assert.equal(extra.state.turnNumber, s.turnNumber);
  assert.equal(
    extra.events.some((e) => e.type === 'turn-ended'),
    false,
  );
  assert.equal(extra.state.skills.players[id].usedThisBasicTurn, true);
  assert.equal(skill(extra.state), undefined);
  const ended = completeSkillBasicTurn(extra.state, id, extra.state.turnNumber);
  assert.equal(ended.skills.players[id].pp, 2);
  assert.equal(ended.skills.players[id].usedThisBasicTurn, false);
  assert.equal(completeSkillBasicTurn(ended, id, ended.turnNumber), ended);
});

test('finished skills clear transient flags/traps; no numerical type advantage is applied', () => {
  const s = trap(own(fresh()));
  const ended = clearFinishedSkills({ ...s, phase: 'finished' });
  assert.deepEqual(ended.skills.traps, {});
  assert.equal(hasAdvantage('electric', 'water'), true);
  assert.equal(
    quoteTakeover(s, c, id, city).total,
    quoteTakeover(
      {
        ...s,
        players: s.players.map((p) => ({ ...p, pokemonId: 'pokemon:0025' })),
      },
      c,
      id,
      city,
    ).total,
  );
});
