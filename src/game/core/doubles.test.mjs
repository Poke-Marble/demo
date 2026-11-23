/* global setImmediate, AbortController */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, dispatch } from './index.ts';
import { nextRandom } from './random.ts';
import { kantoJohtoMap } from '../../data/maps/kanto-johto.ts';
import {
  createEconomyContext,
  initializeEconomy,
  dispatchEconomy,
  getLegalActions,
} from '../economy/index.ts';
import { createIntegratedPreview } from '../../ui/game/integration/adapter.ts';
import { createInitialRoster } from '../../ui/game/setup.ts';

const roster = ['0001', '0004'].map((n, i) => ({
  id: `player:${i}`,
  name: `P${i}`,
  pokemonId: `pokemon:${n}`,
}));
const board = {
  id: 'map:double-boundaries',
  completeness: 'sample',
  cityGroups: [],
  tiles: Array.from({ length: 8 }, (_, i) => ({
    id: `tile:${i}`,
    nameKo: `${i}`,
    kind: i ? 'landmark' : 'start',
  })),
};
const fresh = () => createGame(board, roster, { skills: true });
const core = (s, type, hooks = {}) => {
  const r = dispatch(
    s,
    board,
    { type, playerId: s.activePlayerId, adjustment: 0 },
    hooks,
  );
  assert.equal(r.ok, true, r.error);
  return r;
};
const dice = (s, values, hooks) =>
  core(
    {
      ...s,
      core: { ...s.core, pendingDice: { values } },
    },
    'resolve-dice',
    hooks,
  );
const skill = (s, id, patch) => ({
  ...s,
  skills: {
    ...s.skills,
    players: {
      ...s.skills.players,
      [id]: { ...s.skills.players[id], ...patch },
    },
  },
});

test('third double moves and settles before one basic turn ends; extra rolls preserve skill and round', () => {
  let s = skill(fresh(), 'player:0', { usedThisBasicTurn: true, pp: 2 });
  const landings = [];
  for (let n = 1; n <= 3; n++) {
    const before = s;
    const r = dice(s, [2, 2], {
      onLand: (snapshot, tile) => {
        landings.push(tile.id);
        return {
          players: snapshot.players.map((p, i) =>
            i ? p : { ...p, balance: p.balance - 11 },
          ),
        };
      },
    });
    s = r.state;
    assert.equal(s.core.doubleChain.consecutive, n);
    assert.equal(s.core.doubleChain.extraRollPending, n < 3);
    assert.equal(s.players[0].position, n % 2 ? 'tile:4' : 'tile:0');
    assert.equal(
      s.players[0].balance,
      before.players[0].balance - 11 + (n === 2 ? 200 : 0),
    );
    assert.equal(r.events.filter((e) => e.type === 'tile-landed').length, 1);
    assert.equal(s.turnNumber, 1);
    const ended = core(s, 'end-turn');
    s = ended.state;
    if (n < 3) {
      assert.equal(s.activePlayerId, 'player:0');
      assert.equal(s.turnNumber, 1);
      assert.deepEqual(s.match, before.match);
      assert.equal(s.skills.players['player:0'].usedThisBasicTurn, true);
      assert.equal(
        ended.events.some((e) => e.type === 'turn-ended'),
        false,
      );
    } else {
      assert.equal(s.activePlayerId, 'player:1');
      assert.equal(s.turnNumber, 2);
      assert.equal(s.match.completedBasicTurnsByPlayerId['player:0'], 1);
      assert.equal(s.skills.players['player:0'].usedThisBasicTurn, false);
      assert.equal(s.skills.players['player:0'].pp, 2);
      assert.equal(
        ended.events.filter((e) => e.type === 'turn-ended').length,
        1,
      );
      assert.deepEqual(s.core.doubleChain, {
        consecutive: 0,
        extraRollPending: false,
      });
    }
  }
  assert.deepEqual(landings, ['tile:4', 'tile:0', 'tile:4']);
});

test('normal dice after a double end the chain; landing victory and bankruptcy suppress extra rolls', () => {
  let s = core(dice(fresh(), [1, 1]).state, 'end-turn').state;
  s = dice(s, [1, 2]).state;
  assert.deepEqual(s.core.doubleChain, {
    consecutive: 0,
    extraRollPending: false,
  });
  assert.equal(core(s, 'end-turn').state.activePlayerId, 'player:1');
  const bankrupt = dice(fresh(), [1, 1], {
    onLand: (s) => ({
      players: s.players.map((p, i) => (i ? p : { ...p, bankrupt: true })),
    }),
  }).state;
  assert.equal(core(bankrupt, 'end-turn').state.activePlayerId, 'player:1');
  const won = dice(fresh(), [1, 1], {
    onLand: () => ({
      victory: { winnerId: 'player:0', reason: 'last-player-standing' },
    }),
  }).state;
  assert.equal(won.phase, 'finished');
  assert.equal(
    dispatch(won, board, { type: 'end-turn', playerId: 'player:0' }).error,
    'game-not-playing',
  );
});

test('grass forced double clones exactly one RNG draw and consumes the flag once', () => {
  const s = skill(fresh(), 'player:0', { forceDoubleNextRoll: true });
  const draw = nextRandom(s.core.rngState);
  const r = core(s, 'roll-dice');
  const face = Math.floor(draw.value * 6) + 1;
  assert.deepEqual(r.events[0].values, [face, face]);
  assert.equal(r.state.core.rngState, draw.state);
  assert.equal(r.state.skills.players['player:0'].forceDoubleNextRoll, false);
  assert.equal(s.skills.players['player:0'].forceDoubleNextRoll, true);
  const again = core(core(r.state, 'end-turn').state, 'roll-dice');
  assert.equal(
    again.state.core.rngState,
    nextRandom(nextRandom(draw.state).state).state,
  );
});

test('paralysis waits through extra rolls, skips exactly the next basic turn and counts the round', () => {
  let s = skill(skill(fresh(), 'player:0', { paralyzed: true }), 'player:1', {
    paralyzed: true,
  });
  s = core(dice(s, [1, 1]).state, 'end-turn').state;
  assert.equal(s.turnNumber, 1);
  assert.equal(s.skills.players['player:0'].paralyzed, true);
  const rng = s.core.rngState;
  const ended = core(dice(s, [1, 2]).state, 'end-turn');
  s = ended.state;
  assert.equal(s.turnNumber, 4);
  assert.equal(s.activePlayerId, 'player:1');
  assert.equal(s.match.completedRounds, 1);
  assert.deepEqual(s.match.completedBasicTurnsByPlayerId, {
    'player:0': 2,
    'player:1': 1,
  });
  assert.equal(s.core.rngState, rng);
  assert.equal(s.skills.players['player:0'].paralyzed, false);
  assert.equal(s.skills.players['player:1'].paralyzed, false);
  assert.deepEqual(
    ended.events.filter((e) => e.type === 'turn-ended').map((e) => e.playerId),
    ['player:0', 'player:1', 'player:0'],
  );
  s = core(dice(s, [1, 2]).state, 'end-turn').state;
  assert.equal(s.turnNumber, 5);
  assert.equal(s.activePlayerId, 'player:0');
});

const context = createEconomyContext(kantoJohtoMap);
const econ = (s, intent) =>
  dispatchEconomy(s, context, {
    sessionId: s.economy.sessionId,
    commandId: `double:${s.economy.revision}`,
    expectedRevision: s.economy.revision,
    playerId: s.activePlayerId,
    intent,
  });
const accepted = (s, intent) => {
  const r = econ(s, intent);
  assert.equal(r.ok, true, r.error);
  return r;
};
const econFresh = () =>
  initializeEconomy(
    createGame(context.map, roster, { skills: true }),
    context,
    'double-settlement',
  );
const approach = (s, tileId) => {
  const i = context.map.tiles.findIndex((t) => t.id === tileId);
  return {
    ...s,
    economy: {
      ...s.economy,
      developmentByTileId: Object.fromEntries(
        s.holdings.map((h) => [
          h.tileId,
          { stage: 0, facilities: [], centerReadyVisitOrdinal: null },
        ]),
      ),
    },
    core: { ...s.core, pendingDice: { values: [1, 1] } },
    players: s.players.map((p, n) =>
      n
        ? p
        : {
            ...p,
            position:
              context.map.tiles[
                (i - 2 + context.map.tiles.length) % context.map.tiles.length
              ].id,
          },
    ),
  };
};

test('double landing cannot continue before toll/debt settlement and property decision', () => {
  const cities = context.map.tiles.filter((t) => t.kind === 'city').slice(0, 2);
  let s = econFresh();
  s = approach(
    {
      ...s,
      core: { ...s.core, rules: { ...s.core.rules, startReward: 0 } },
      players: s.players.map((p, i) => (i ? p : { ...p, balance: 0 })),
      holdings: cities.map((t, i) => ({
        tileId: t.id,
        ownerId: roster[1 - i].id,
        facilityLevel: 0,
      })),
    },
    cities[0].id,
  );
  s = accepted(s, {
    type: 'resolve-dice',
    playerId: 'player:0',
    adjustment: 0,
  }).state;
  assert.equal(s.core.doubleChain.extraRollPending, true);
  assert.equal(econ(s, { type: 'end-turn', playerId: 'player:0' }).ok, false);
  const pay = getLegalActions(s, context, s.activePlayerId).actions.find(
    (a) => a.intent.type === 'pay-toll',
  );
  assert.ok(pay);
  s = accepted(s, pay.intent).state;
  assert.ok(s.economy.pendingDebt);
  assert.equal(
    econ(s, { type: 'end-turn', playerId: 'player:0' }).error,
    'debt-pending',
  );
  const sale = getLegalActions(s, context, s.activePlayerId).actions.find(
    (a) => a.intent.type === 'sell-property',
  );
  assert.ok(sale);
  const paid = accepted(s, sale.intent);
  s = paid.state;
  assert.equal(s.economy.pendingDebt, null);
  assert.equal(paid.events.filter((e) => e.type === 'toll-settled').length, 1);
  const pass = getLegalActions(s, context, s.activePlayerId).actions.find(
    (a) => a.intent.type === 'pass-property',
  );
  if (pass) s = accepted(s, pass.intent).state;
  s = accepted(s, { type: 'end-turn', playerId: 'player:0' }).state;
  assert.equal(s.activePlayerId, 'player:0');
  assert.equal(s.turnNumber, 1);
  assert.equal(s.core.turnStage, 'awaiting-roll');
});

test('exact START double waits for construction or skip before extra roll', () => {
  for (const choice of ['start-build', 'skip-start-build']) {
    const city = context.map.tiles.find((t) => t.kind === 'city');
    let s = econFresh();
    s = approach(
      {
        ...s,
        holdings: [{ tileId: city.id, ownerId: 'player:0', facilityLevel: 0 }],
        economy: {
          ...s.economy,
          completedLapsByPlayerId: {
            ...s.economy.completedLapsByPlayerId,
            'player:0': 3,
          },
        },
      },
      context.map.tiles.find((t) => t.kind === 'start').id,
    );
    s = accepted(s, {
      type: 'resolve-dice',
      playerId: 'player:0',
      adjustment: 0,
    }).state;
    assert.ok(s.economy.pendingStartBuild);
    assert.equal(econ(s, { type: 'end-turn', playerId: 'player:0' }).ok, false);
    const a = getLegalActions(s, context, 'player:0').actions.find(
      (a) => a.intent.type === choice,
    );
    assert.ok(a);
    s = accepted(s, a.intent).state;
    assert.equal(s.economy.pendingStartBuild, null);
    if (choice === 'start-build') assert.equal(s.holdings[0].facilityLevel, 1);
    s = accepted(s, { type: 'end-turn', playerId: 'player:0' }).state;
    assert.equal(s.activePlayerId, 'player:0');
    assert.equal(s.turnNumber, 1);
    assert.equal(s.core.turnStage, 'awaiting-roll');
  }
});

const tick = () => new Promise((resolve) => setImmediate(resolve));
const start = (p) =>
  p.adapter.start({
    mapId: kantoJohtoMap.id,
    participants: createInitialRoster('pokemon:0004'),
  });
function choose(p, type) {
  const candidate = p.snapshot().candidates.find((c) => c.action.type === type);
  assert.ok(candidate, type);
  const view = p.adapter.getView();
  p.adapter.choose(
    view.prompt?.id ??
      view.actions.find((a) => a.id === candidate.id).selectionId,
    candidate.id,
  );
}

test('automatic double continuation waits for all ACKs and ignores repeated/stale ACKs after restart', async () => {
  const p = createIntegratedPreview({ seed: 5, computerDelayMs: 0 });
  let a, b;
  const offA = p.adapter.subscribe((u) => {
    a = u;
  });
  const offB = p.adapter.subscribe((u) => {
    b = u;
  });
  const ack = async () => {
    a.presentationComplete();
    b.presentationComplete();
    await tick();
  };
  start(p);
  await ack();
  choose(p, 'roll-dice');
  await ack();
  assert.deepEqual(p.getState().core.doubleChain, {
    consecutive: 1,
    extraRollPending: true,
  });
  choose(p, 'pass-property');
  const settled = p.getState(),
    oldA = a,
    oldB = b;
  assert.equal(settled.core.turnStage, 'awaiting-end');
  oldA.presentationComplete();
  await tick();
  assert.equal(p.getState(), settled);
  oldB.presentationComplete();
  await tick();
  assert.equal(p.getState().economy.revision, settled.economy.revision + 1);
  assert.equal(p.getState().core.turnStage, 'awaiting-roll');
  assert.equal(p.getState().turnNumber, 1);
  const continued = p.getState();
  oldA.presentationComplete();
  oldB.presentationComplete();
  await tick();
  assert.equal(p.getState(), continued);
  const stale = a;
  p.adapter.restart();
  start(p);
  const restarted = p.getState();
  stale.presentationComplete();
  await tick();
  assert.equal(p.getState(), restarted);
  assert.equal(restarted.economy.revision, 0);
  offA();
  offB();
  await tick();
});

test('AI concurrent run and restart while waiting on ACK cannot duplicate a double roll', async () => {
  const p = createIntegratedPreview({ seed: 5, computerDelayMs: 0 });
  let latest;
  const off = p.adapter.subscribe((u) => {
    latest = u;
  });
  const participants = createInitialRoster('pokemon:0004').map((p) => ({
    ...p,
    controller: p.id === 'player:2' ? 'human' : 'computer',
  }));
  p.adapter.start({ mapId: kantoJohtoMap.id, participants });
  latest.presentationComplete();
  await tick();
  const actor = p.getState().activePlayerId;
  const run = p.adapter.runComputerTurn(actor, new AbortController().signal);
  for (let n = 0; n < 100 && p.getState().economy.revision === 0; n++)
    await new Promise((resolve) => setImmediate(resolve));
  // Wait for the executor's explicit zero-ms think timer, not a game seed loop.
  if (p.getState().economy.revision === 0)
    await new Promise((resolve) => globalThis.setTimeout(resolve, 20));
  assert.equal(p.getState().economy.revision, 1);
  const held = p.getState();
  await p.adapter.runComputerTurn(actor, new AbortController().signal);
  assert.equal(p.getState(), held);
  const stale = latest;
  p.adapter.restart();
  await run;
  const reset = p.getState();
  stale.presentationComplete();
  stale.presentationComplete();
  await tick();
  assert.equal(p.getState(), reset);
  assert.equal(reset.economy.revision, 0);
  off();
});
