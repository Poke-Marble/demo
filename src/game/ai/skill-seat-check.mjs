/** Small engine/AI smoke sample, not a balance estimate or a match rules implementation. */
import assert from 'node:assert/strict';
import console from 'node:console';
import { createGame } from '../core/index.ts';
import {
  createEconomyContext,
  initializeEconomy,
  getLegalActions,
  dispatchEconomy,
} from '../economy/index.ts';
import { finalizeVictory } from '../victory/index.ts';
import { kantoJohtoMap } from '../../data/maps/kanto-johto.ts';
import { publicSnapshot } from './outlooks.ts';
import { plan } from './planner.ts';

const context = createEconomyContext(kantoJohtoMap);
const partners = [
  'pokemon:0001',
  'pokemon:0004',
  'pokemon:0007',
  'pokemon:0025',
];
const seed = 42;
const turnHorizon = 240;
const games = [];
for (let rotation = 0; rotation < 4; rotation++) {
  const roster = partners.map((_, i) => ({
    id: `player:${i + 1}`,
    name: `AI ${i + 1}`,
    pokemonId: partners[(i + rotation) % 4],
    controller: 'computer',
  }));
  let state = initializeEconomy(
    createGame(context.map, roster, { seed, skills: true, legendary: {} }),
    context,
    `seats:${rotation}`,
  );
  const seats = roster.map((p) => ({
    ...p,
    ppUsed: 0,
    quotedNetSavings: 0,
    movementUses: 0,
  }));
  let commands = 0;
  while (state.phase === 'playing' && state.turnNumber <= turnHorizon) {
    assert.ok(commands < turnHorizon * 16, 'bounded legal progress');
    const id = state.activePlayerId;
    const decision = plan(
      publicSnapshot(state, context, roster),
      seed,
    )?.candidate;
    assert.ok(decision, 'planner selects a candidate');
    const original = getLegalActions(state, context, id).actions.find(
      (a) => a.actionKey === decision.id,
    );
    assert.deepEqual(
      decision.action,
      original?.intent,
      'only actual authority candidates execute',
    );
    const before = state.skills.players[id].pp;
    const result = dispatchEconomy(state, context, {
      sessionId: state.economy.sessionId,
      expectedRevision: state.economy.revision,
      playerId: id,
      commandId: `sample:${commands++}`,
      intent: original.intent,
    });
    assert.ok(result.ok, result.error);
    state = result.state;
    const seat = seats.find((p) => p.id === id);
    seat.ppUsed += before - state.skills.players[id].pp;
    for (const event of result.events)
      if (event.type === 'skill-activated') {
        seat.quotedNetSavings += event.activation.skillSavings;
        seat.movementUses += Number(original.intent.type === 'resolve-dice');
      }
    assert.ok(seat.ppUsed <= 3, 'PP never replenishes');
    if (!state.economy.pendingDebt && !state.economy.pendingToll) {
      const final = finalizeVictory(state, context.map, { actorId: id });
      assert.ok(final.ok);
      state = final.state;
    }
  }
  const winner =
    seats.find((p) => p.id === state.victory?.winnerId)?.pokemonId ?? null;
  const game = {
    rotation,
    commands,
    turns: state.turnNumber,
    winner,
    censored: state.phase !== 'finished',
    seats,
  };
  games.push(game);
  console.log(JSON.stringify(game));
}
const summary = partners.map((pokemonId) => ({
  pokemonId,
  wins: games.filter((g) => g.winner === pokemonId).length,
  ppUsed: games
    .flatMap((g) => g.seats)
    .filter((p) => p.pokemonId === pokemonId)
    .reduce((n, p) => n + p.ppUsed, 0),
  quotedNetSavings: games
    .flatMap((g) => g.seats)
    .filter((p) => p.pokemonId === pokemonId)
    .reduce((n, p) => n + p.quotedNetSavings, 0),
}));
console.log(
  JSON.stringify({
    seed,
    turnHorizon,
    games: games.length,
    censored: games.filter((g) => g.censored).length,
    summary,
    limitations:
      'Four cyclic seat rotations, one seed. Horizon is a sample stop, not a match result. Savings are authority-quoted marginal obligations after blessing, not recovered cash or movement value. No balance conclusion.',
  }),
);
