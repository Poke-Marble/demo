import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../core/index.ts';
import {
  createEconomyContext,
  initializeEconomy,
  dispatchEconomy,
  getLegalActions,
  quoteToll,
} from '../economy/index.ts';
import { kantoJohtoMap } from '../../data/maps/kanto-johto.ts';
import { publicSnapshot } from './outlooks.ts';
import { plan } from './planner.ts';

const context = createEconomyContext(kantoJohtoMap);
const id = 'player:1',
  rival = 'player:2';
const city = 'tile:kj:blackthorn';
const roster = (pokemon = 'pokemon:0004') => [
  { id, name: 'A', pokemonId: pokemon, controller: 'computer' },
  { id: rival, name: 'B', pokemonId: 'pokemon:0007', controller: 'computer' },
];
const fresh = (pokemon) =>
  initializeEconomy(
    createGame(context.map, roster(pokemon), {
      seed: 42,
      legendary: {},
      skills: true,
    }),
    context,
    'ai:skills',
  );
const snapshot = (s) => publicSnapshot(s, context, roster());
function own(s, tileId, ownerId, stage = 0) {
  return {
    ...s,
    holdings: [...s.holdings, { tileId, ownerId, facilityLevel: stage }],
    economy: {
      ...s.economy,
      developmentByTileId: {
        ...s.economy.developmentByTileId,
        [tileId]: {
          stage,
          facilities: ['shop', 'center', 'final'].slice(0, stage),
          centerReadyVisitOrdinal: stage >= 2 ? 0 : null,
        },
      },
    },
  };
}
function landing(s, toll = false) {
  return {
    ...s,
    core: { ...s.core, turnStage: 'awaiting-end' },
    players: s.players.map((p) =>
      p.id === id ? { ...p, position: city, balance: 10000 } : p,
    ),
    economy: {
      ...s.economy,
      visitOrdinalByPlayerId: { ...s.economy.visitOrdinalByPlayerId, [id]: 1 },
      landing: {
        id: 'landing:test',
        playerId: id,
        tileId: city,
        visitOrdinal: 1,
        propertyDecisionUsed: false,
        skillEligible: true,
      },
      ...(toll
        ? { pendingToll: { tileId: city, landingId: 'landing:test' } }
        : {}),
    },
  };
}
function choose(s) {
  const snap = snapshot(s);
  const decision = plan(snap, 42).candidate;
  const legal = getLegalActions(s, context, id).actions.find(
    (a) => a.actionKey === decision.id,
  );
  assert.ok(legal, 'original authority legal candidate');
  assert.deepEqual(decision.action, legal.intent);
  return decision;
}
function execute(s, candidate, commandId = 'decision') {
  const command = {
    sessionId: s.economy.sessionId,
    expectedRevision: s.economy.revision,
    playerId: id,
    commandId,
    intent: candidate.action,
  };
  const result = dispatchEconomy(s, context, command);
  assert.ok(result.ok, result.error);
  return { result, command };
}

test('AI uses exact capped signature/shared toll candidates for every starter; actual PP and replay remain authoritative', () => {
  for (const pokemon of [
    'pokemon:0001',
    'pokemon:0004',
    'pokemon:0007',
    'pokemon:0025',
  ]) {
    const s = landing(own(fresh(pokemon), city, rival, 3), true);
    const decision = choose(s);
    assert.equal(decision.action.type, 'use-skill');
    assert.equal(
      decision.action.mode,
      pokemon === 'pokemon:0004' ? 'signature' : 'breakthrough',
    );
    const baseline = quoteToll(s, context, id, city).total;
    const { result, command } = execute(s, decision);
    assert.equal(result.state.skills.players[id].pp, 2);
    assert.equal(result.state.skills.players[id].usedThisBasicTurn, true);
    const event = result.events.find((e) => e.type === 'skill-activated');
    assert.equal(
      event.activation.skillSavings,
      baseline - result.receipt.quote.total,
    );
    assert.ok(event.activation.skillSavings > 20);
    const replay = dispatchEconomy(result.state, context, command);
    assert.ok(replay.ok && replay.replayed);
    assert.equal(replay.state, result.state);
    const stale = dispatchEconomy(result.state, context, {
      ...command,
      commandId: 'stale',
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.error, 'stale-revision');
  }
});

test('AI preserves finite PP for small savings and respects exhausted or already-used authority candidates', () => {
  let s = landing(own(fresh('pokemon:0001'), city, rival), true);
  s = {
    ...s,
    skills: {
      ...s.skills,
      players: {
        ...s.skills.players,
        [id]: { ...s.skills.players[id], pp: 1 },
      },
    },
  };
  assert.equal(choose(s).action.type, 'pay-toll');
  const paid = execute(s, choose(s)).result.state;
  assert.equal(paid.skills.players[id].pp, 1);
  for (const patch of [{ pp: 0 }, { usedThisBasicTurn: true }]) {
    const blocked = {
      ...s,
      skills: {
        ...s.skills,
        players: {
          ...s.skills.players,
          [id]: { ...s.skills.players[id], ...patch },
        },
      },
    };
    assert.ok(
      snapshot(blocked).candidates.every((c) => c.action.type !== 'use-skill'),
    );
  }
});

test('AI executes discounted legal city takeover and preserves final facility immunity', () => {
  const s = landing(own(fresh('pokemon:0025'), city, rival, 2));
  const decision = choose(s);
  assert.equal(decision.action.type, 'use-skill');
  assert.equal(decision.kind, 'takeover');
  const { result } = execute(s, decision);
  assert.ok(
    result.state.holdings.some((h) => h.tileId === city && h.ownerId === id),
  );
  assert.equal(result.state.skills.players[id].pp, 2);
  const immune = landing(own(fresh('pokemon:0025'), city, rival, 3));
  assert.ok(
    snapshot(immune).candidates.every(
      (c) => c.action.type !== 'use-skill' && c.kind !== 'takeover',
    ),
  );
});

for (const [pokemon, adjustment] of [
  ['pokemon:0001', -1],
  ['pokemon:0007', 1],
]) {
  test(`AI ${pokemon} evaluates revealed ${adjustment} immediate victory without reading RNG`, () => {
    const side = context.map.tiles
      .filter((t) => t.kind === 'city' && t.side === 'south')
      .map((t) => t.id);
    const target = side[0];
    let s = fresh(pokemon);
    for (const tileId of side.slice(1)) s = own(s, tileId, id);
    const index = context.map.tiles.findIndex((t) => t.id === target);
    const stateFor = (distance) => ({
      ...s,
      players: s.players.map((p) =>
        p.id === id
          ? {
              ...p,
              balance: 10000,
              position:
                context.map.tiles[
                  (index - distance + context.map.tiles.length) %
                    context.map.tiles.length
                ].id,
            }
          : p,
      ),
      core: {
        turnStage: 'awaiting-roll',
        rules: s.core.rules,
        pendingDice: { values: [3, 4] },
        get rngState() {
          throw new Error('hidden RNG');
        },
      },
    });
    const publicState = stateFor(7 + adjustment);
    const choice = choose(publicState);
    assert.equal(choice.action.adjustment, adjustment);
    assert.equal(choice.outlook.immediateWin, true);
    assert.deepEqual(snapshot(publicState).diceResult, [3, 4]);
    const authoritative = {
      ...publicState,
      core: {
        turnStage: 'awaiting-roll',
        rules: s.core.rules,
        pendingDice: { values: [3, 4] },
        rngState: 42,
      },
    };
    const resolved = execute(authoritative, choice).result.state;
    assert.equal(resolved.players.find((p) => p.id === id).position, target);
    assert.equal(resolved.skills.players[id].pp, 2);
    assert.equal(choose(resolved).outlook.immediateWin, true);
    const keepState = stateFor(7);
    assert.equal(choose(keepState).action.adjustment, 0);
    const kept = execute(
      { ...keepState, core: { ...authoritative.core } },
      choose(keepState),
    ).result.state;
    assert.equal(kept.skills.players[id].pp, 3);
  });
}
