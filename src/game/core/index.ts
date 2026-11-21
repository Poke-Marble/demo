import type {
  GameAction,
  GameEvent,
  GameState,
  MapDefinition,
  Player,
  PlayerId,
  PokemonId,
  Tile,
} from '../contracts';
import {
  createLegendaryState,
  enterSpecial,
  legendaryAction,
} from '../legendary.ts';
import type {
  LegendaryState,
  LegendaryRules,
  LegendaryAction,
  LegendaryError,
  LegendaryEvent,
  PresentationRequest,
} from '../legendary.ts';
import { nextRandom } from './random.ts';
import { createMatch, validMatch, completeBasicTurn } from '../match/rounds.ts';

export interface CoreRules {
  readonly initialBalance: number;
  readonly startReward: number;
}

export const defaultRules: CoreRules = Object.freeze({
  initialBalance: 1500,
  startReward: 200,
});

export interface CoreState extends GameState {
  readonly legendary?: LegendaryState;
  readonly core: {
    readonly rngState: number;
    readonly turnStage: 'awaiting-roll' | 'awaiting-end';
    readonly rules: CoreRules;
  };
}

export interface PlayerSetup {
  readonly id: PlayerId;
  readonly name: string;
  readonly pokemonId: PokemonId;
}

export type CoreEvent =
  | GameEvent
  | LegendaryEvent
  | {
      readonly type: 'start-rewarded';
      readonly playerId: PlayerId;
      readonly passes: number;
      readonly amount: number;
    }
  | {
      readonly type: 'tile-landed';
      readonly playerId: PlayerId;
      readonly tileId: Tile['id'];
    }
  | {
      readonly type: 'turn-started';
      readonly playerId: PlayerId;
      readonly turnNumber: number;
    };

/** Economy/victory may supply effects without changing the core turn metadata. */
export interface HookEffect {
  readonly players?: readonly Player[];
  readonly holdings?: GameState['holdings'];
  readonly victory?: NonNullable<GameState['victory']>;
  readonly events?: readonly GameEvent[];
}

export interface CoreHooks {
  readonly onLand?: (state: CoreState, tile: Tile) => HookEffect;
  readonly onEndTurn?: (state: CoreState) => HookEffect;
}

export type CoreError =
  | LegendaryError
  | 'game-not-playing'
  | 'invalid-state'
  | 'wrong-player'
  | 'already-rolled'
  | 'roll-required'
  | 'unsupported-action'
  | 'invalid-hook-effect';

export type Transition =
  | {
      readonly ok: true;
      readonly presentations?: readonly PresentationRequest[];
      readonly state: CoreState;
      readonly events: readonly CoreEvent[];
    }
  | {
      readonly ok: false;
      readonly state: CoreState;
      readonly events: readonly [];
      readonly error: CoreError;
    };

function validMap(map: MapDefinition): boolean {
  return (
    map.tiles.length >= 2 &&
    new Set(map.tiles.map((tile) => tile.id)).size === map.tiles.length &&
    map.tiles.filter((tile) => tile.kind === 'start').length === 1
  );
}

function validPlayers(players: readonly Player[], map: MapDefinition): boolean {
  return (
    players.length >= 2 &&
    players.length <= 4 &&
    new Set(players.map((player) => player.id)).size === players.length &&
    players.every(
      (player) =>
        Number.isSafeInteger(player.balance) &&
        map.tiles.some((tile) => tile.id === player.position),
    )
  );
}

export function createGame(
  map: MapDefinition,
  players: readonly PlayerSetup[],
  options: {
    readonly seed?: number;
    readonly rules?: Partial<CoreRules>;
    readonly legendary?: Partial<LegendaryRules>;
    readonly rulesPreset?: 'standard' | 'quick';
  } = {},
): CoreState {
  if (!validMap(map))
    throw new RangeError('Map requires unique tiles and exactly one start.');
  const rules = { ...defaultRules, ...options.rules };
  const seed = options.seed ?? 1;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Seed must be an unsigned 32-bit integer.');
  }
  if (
    !Number.isSafeInteger(rules.initialBalance) ||
    rules.initialBalance < 0 ||
    !Number.isSafeInteger(rules.startReward) ||
    rules.startReward < 0
  ) {
    throw new RangeError(
      'Balances and rewards must be nonnegative safe integers.',
    );
  }
  const start = map.tiles.find((tile) => tile.kind === 'start')!;
  const roster = players.map((player): Player => ({
    ...player,
    position: start.id,
    balance: rules.initialBalance,
    bankrupt: false,
  }));
  if (
    !validPlayers(roster, map) ||
    roster.some((player) => !player.name.trim())
  ) {
    throw new RangeError('Supply 2–4 uniquely identified, named players.');
  }
  return {
    schemaVersion: 1,
    mapId: map.id,
    phase: 'playing',
    players: roster,
    activePlayerId: roster[0]!.id,
    turnNumber: 1,
    match: createMatch(
      options.rulesPreset,
      roster.map((p) => p.id),
    ),
    holdings: [],
    victory: null,
    ...(options.legendary
      ? {
          legendary: createLegendaryState(
            roster.map((p) => p.id),
            options.legendary,
          ),
        }
      : {}),
    core: { rngState: seed, turnStage: 'awaiting-roll', rules },
  };
}

function applyEffect(
  state: CoreState,
  effect: HookEffect,
  map: MapDefinition,
): CoreState | null {
  const players = effect.players ?? state.players;
  if (
    !validPlayers(players, map) ||
    players.some(
      (player, index) =>
        player.id !== state.players[index]?.id ||
        player.position !== state.players[index]?.position,
    ) ||
    (effect.victory &&
      !players.some((player) => player.id === effect.victory!.winnerId))
  )
    return null;
  return {
    ...state,
    players: players.map((player) => ({ ...player })),
    holdings: (effect.holdings ?? state.holdings).map((holding) => ({
      ...holding,
    })),
    victory: effect.victory ? { ...effect.victory } : state.victory,
    phase: effect.victory ? 'finished' : state.phase,
  };
}

/** Rejects invalid actions atomically: the original state and RNG are returned unchanged. */
export function dispatch(
  state: CoreState,
  map: MapDefinition,
  action: GameAction | LegendaryAction,
  hooks: CoreHooks = {},
): Transition {
  const reject = (error: CoreError): Transition => ({
    ok: false,
    state,
    events: [],
    error,
  });
  if (state.phase !== 'playing') return reject('game-not-playing');
  if (
    validMatch(state) &&
    state.match &&
    state.match.completedRounds >= state.match.roundLimit
  )
    return reject('game-not-playing');
  const activeIndex = state.players.findIndex(
    (player) => player.id === state.activePlayerId,
  );
  const active = state.players[activeIndex];
  if (
    !validMap(map) ||
    map.id !== state.mapId ||
    !validPlayers(state.players, map) ||
    !validMatch(state) ||
    !active ||
    (active.bankrupt && state.core.turnStage === 'awaiting-roll') ||
    state.victory !== null ||
    !Number.isSafeInteger(state.turnNumber) ||
    state.turnNumber < 1 ||
    !Number.isInteger(state.core.rngState) ||
    state.core.rngState < 0 ||
    state.core.rngState > 0xffffffff ||
    !['awaiting-roll', 'awaiting-end'].includes(state.core.turnStage) ||
    !Number.isSafeInteger(state.core.rules.startReward) ||
    state.core.rules.startReward < 0
  ) {
    return reject('invalid-state');
  }
  if (action.playerId !== active.id) return reject('wrong-player');
  const land = (snapshot: CoreState, tile: Tile) => {
    if (!hooks.onLand || tile.kind === 'special')
      return { state: snapshot, events: [] };
    const effect = hooks.onLand(snapshot, tile);
    const applied = applyEffect(snapshot, effect, map);
    return applied ? { state: applied, events: effect.events ?? [] } : null;
  };
  const specialAction = legendaryAction(state, map, action, land);
  if (specialAction) return specialAction;
  const events: CoreEvent[] = [];
  let presentations: readonly PresentationRequest[] = [];
  let next: CoreState;
  if (action.type === 'roll-dice') {
    if (state.core.turnStage !== 'awaiting-roll')
      return reject('already-rolled');
    const first = nextRandom(state.core.rngState);
    const second = nextRandom(first.state);
    const values = [
      Math.floor(first.value * 6) + 1,
      Math.floor(second.value * 6) + 1,
    ] as const;
    const fromIndex = map.tiles.findIndex(
      (tile) => tile.id === active.position,
    );
    const distance = values[0] + values[1];
    const startIndex = map.tiles.findIndex((tile) => tile.kind === 'start');
    const offsetFromStart =
      (fromIndex - startIndex + map.tiles.length) % map.tiles.length;
    const passes = Math.floor((distance + offsetFromStart) / map.tiles.length);
    const tile = map.tiles[(fromIndex + distance) % map.tiles.length]!;
    const amount = passes * state.core.rules.startReward;
    if (!Number.isSafeInteger(active.balance + amount))
      return reject('invalid-state');
    next = {
      ...state,
      players: state.players.map((player) =>
        player.id === active.id
          ? { ...player, position: tile.id, balance: player.balance + amount }
          : player,
      ),
      core: {
        ...state.core,
        rngState: second.state,
        turnStage: 'awaiting-end',
      },
    };
    events.push(
      { type: 'dice-rolled', playerId: active.id, values },
      {
        type: 'player-moved',
        playerId: active.id,
        from: active.position,
        to: tile.id,
      },
    );
    if (passes > 0)
      events.push({
        type: 'start-rewarded',
        playerId: active.id,
        passes,
        amount,
      });
    events.push({ type: 'tile-landed', playerId: active.id, tileId: tile.id });
    const entered = enterSpecial(next, tile);
    next = entered.state;
    presentations = entered.presentations;
    const landed = land(next, tile);
    if (!landed) return reject('invalid-hook-effect');
    next = landed.state;
    events.push(...landed.events);
  } else if (action.type === 'end-turn') {
    if (state.core.turnStage !== 'awaiting-end') return reject('roll-required');
    next = state;
    if (hooks.onEndTurn) {
      const effect = hooks.onEndTurn(next);
      const applied = applyEffect(next, effect, map);
      if (!applied) return reject('invalid-hook-effect');
      next = applied;
      events.push(...(effect.events ?? []));
    }
    events.push({ type: 'turn-ended', playerId: active.id });
    if (next.phase !== 'finished') {
      let nextPlayer: Player | undefined;
      for (let offset = 1; offset <= next.players.length; offset++) {
        const candidate =
          next.players[(activeIndex + offset) % next.players.length]!;
        if (!candidate.bankrupt) {
          nextPlayer = candidate;
          break;
        }
      }
      if (!nextPlayer) {
        next = { ...next, phase: 'finished' };
      } else {
        if (!Number.isSafeInteger(next.turnNumber + 1))
          return reject('invalid-state');
        next = {
          ...next,
          activePlayerId: nextPlayer.id,
          turnNumber: next.turnNumber + 1,
          ...(next.match
            ? { match: completeBasicTurn(next, nextPlayer.id)! }
            : {}),
          core: { ...next.core, turnStage: 'awaiting-roll' },
        };
        events.push({
          type: 'turn-started',
          playerId: nextPlayer.id,
          turnNumber: next.turnNumber,
        });
      }
    }
  } else return reject('unsupported-action');
  return {
    ok: true,
    state: next,
    events,
    ...(state.legendary ? { presentations } : {}),
  };
}
