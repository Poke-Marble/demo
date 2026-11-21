import {
  createEconomyContext,
  initializeEconomy,
  dispatchEconomy,
  type EconomyState,
} from '../../../game/economy';
import { createGame } from '../../../game/core';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto';
import type { GameView, UIUpdate } from '../adapter';
import { createInitialRoster } from '../setup';
export { constructionCues, createConstructionGate } from './model';

/** Isolated presentation fixtures. Never installed in the live game adapter. */
export function constructionFixture(
  pokemonId = 'pokemon:0001',
  level = 3,
  landmark = false,
) {
  const context = createEconomyContext(kantoJohtoMap);
  const participants = createInitialRoster('pokemon:0001');
  const state = initializeEconomy(
    createGame(context.map, participants),
    context,
    'construction-preview',
  );
  const tile = context.map.tiles.find((t) =>
    landmark ? t.kind === 'landmark' : t.id === 'tile:kj:olivine',
  )!;
  const before: GameView = {
    state,
    map: context.map,
    mapName: '건설 연출 프리뷰',
    participants,
    computer: { connected: false, status: '' },
    actions: [],
  };
  const next = {
    ...state,
    phase: 'playing' as const,
    players: state.players.map((p, i) =>
      i === 0 ? { ...p, pokemonId: pokemonId as typeof p.pokemonId } : p,
    ),
    holdings: [
      {
        tileId: tile.id,
        ownerId: participants[0]!.id,
        facilityLevel: landmark ? 0 : level,
      },
    ],
    economy: {
      ...state.economy,
      revision: 1,
      developmentByTileId: landmark
        ? {}
        : {
            [tile.id]: {
              stage: level as 0 | 1 | 2 | 3,
              facilities: ['shop', 'center', 'final'].slice(0, level),
              centerReadyVisitOrdinal: null,
            },
          },
    },
  };
  const update: UIUpdate = {
    id: 'fixture:1',
    view: { ...before, state: next },
    events: [
      { type: 'city-acquired', tileId: tile.id, playerId: participants[0]!.id },
      ...(!landmark && level > 0
        ? [{ type: 'facility-upgraded' as const, tileId: tile.id, level }]
        : []),
    ],
  };
  return { before, update };
}

/** A legal revisit fixture; the unchanged economy producer emits the final event. */
export function committedFinalFixture() {
  const fixture = constructionFixture('pokemon:0001', 2);
  const base = fixture.update.view.state as EconomyState;
  const tileId = base.holdings[0]!.tileId;
  const playerId = base.holdings[0]!.ownerId;
  const state: EconomyState = {
    ...base,
    core: { ...base.core, turnStage: 'awaiting-end' },
    players: base.players.map((p) =>
      p.id === playerId ? { ...p, position: tileId } : p,
    ),
    economy: {
      ...base.economy,
      completedLapsByPlayerId: {
        ...base.economy.completedLapsByPlayerId,
        [playerId]: 2,
      },
      visitOrdinalByPlayerId: {
        ...base.economy.visitOrdinalByPlayerId,
        [playerId]: 2,
      },
      landing: {
        id: 'visit:2',
        playerId,
        tileId,
        visitOrdinal: 2,
        propertyDecisionUsed: false,
      },
      developmentByTileId: {
        [tileId]: {
          stage: 2,
          facilities: ['shop', 'center'],
          centerReadyVisitOrdinal: 1,
        },
      },
    },
  };
  const context = createEconomyContext(kantoJohtoMap);
  const command = {
    sessionId: state.economy.sessionId,
    commandId: 'preview-final',
    expectedRevision: state.economy.revision,
    playerId,
    intent: {
      type: 'construct-property' as const,
      tileId,
      targetStage: 3 as const,
      landingId: 'visit:2',
    },
  };
  const result = dispatchEconomy(state, context, command);
  if (!result.ok)
    throw new Error(`Final fixture rejected: ${JSON.stringify(result.error)}`);
  const before: GameView = { ...fixture.before, state };
  const update: UIUpdate = {
    id: 'committed-final:1',
    view: { ...before, state: result.state },
    events: result.events.filter(
      (e) => e.type === 'facility-upgraded' || e.type === 'city-acquired',
    ),
  };
  return {
    before,
    update,
    replay: dispatchEconomy(result.state, context, command),
  };
}
