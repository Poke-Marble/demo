import {
  arriveWorldEvent,
  clearWorldEvents,
  worldEventRules,
} from './world-events/index.ts';
import type {
  PlayerId,
  TileId,
  Tile,
  MapDefinition,
  GameAction,
} from './contracts';
import type { CoreState, CoreEvent, Transition } from './core/index.ts';
import { nextRandom } from './core/random.ts';

export type Legendary = 'lugia' | 'ho-oh';
export interface LegendaryRules {
  readonly successChance: number;
  readonly guaranteedAttempt: number;
  readonly tollDiscount: number;
  readonly upgradeDiscount: number;
  readonly initialRopes: number;
}
export const defaultLegendaryRules: LegendaryRules = Object.freeze({
  successChance: 0.5,
  guaranteedAttempt: 3,
  tollDiscount: 0.5,
  upgradeDiscount: 0.5,
  initialRopes: 1,
});
export interface TrialStay {
  readonly legendary: Legendary;
  readonly tileId: TileId;
  readonly attempts: number;
  readonly lastAttemptTurn: number;
}
export interface LegendaryPlayer {
  readonly ropes: number;
  readonly trial: TrialStay | null;
  readonly lugia: boolean;
  readonly hoOh: boolean;
}
export interface LegendaryState {
  readonly rules: LegendaryRules;
  readonly players: Readonly<Record<PlayerId, LegendaryPlayer>>;
  readonly pendingFly: {
    readonly playerId: PlayerId;
    readonly turn: number;
  } | null;
}
export type LegendaryAction =
  | {
      readonly type: 'attempt-trial' | 'use-escape-rope';
      readonly playerId: PlayerId;
    }
  | { readonly type: 'fly'; readonly playerId: PlayerId; readonly to: TileId };
export type PresentationRequest =
  | {
      readonly type: 'trial-intro';
      readonly legendary: Legendary;
      readonly playerId: PlayerId;
      readonly tileId: TileId;
    }
  | {
      readonly type: 'world-event';
      readonly legendary: Legendary;
      readonly playerId: PlayerId;
      readonly tileId: TileId;
      readonly expiresAfterRound: number;
    }
  | {
      readonly type: 'fly';
      readonly playerId: PlayerId;
      readonly from: TileId;
      readonly to: TileId;
    };
export type LegendaryEvent =
  | {
      readonly type: 'trial-resolved';
      readonly playerId: PlayerId;
      readonly legendary: Legendary;
      readonly attempt: number;
      readonly success: boolean;
    }
  | { readonly type: 'rope-used'; readonly playerId: PlayerId };
export type LegendaryError =
  | 'legendary-disabled'
  | 'trial-required'
  | 'trial-pending'
  | 'trial-already-attempted'
  | 'no-escape-rope'
  | 'flight-required'
  | 'invalid-destination'
  | 'invalid-legendary-state';

export function createLegendaryState(
  ids: readonly PlayerId[],
  options: Partial<LegendaryRules>,
): LegendaryState {
  const rules = { ...defaultLegendaryRules, ...options };
  for (const n of [
    rules.successChance,
    rules.tollDiscount,
    rules.upgradeDiscount,
  ])
    if (!Number.isFinite(n) || n < 0 || n > 1)
      throw new RangeError(
        'Probability and discounts must be between 0 and 1.',
      );
  if (
    !Number.isSafeInteger(rules.guaranteedAttempt) ||
    rules.guaranteedAttempt < 1 ||
    !Number.isSafeInteger(rules.initialRopes) ||
    rules.initialRopes < 0
  )
    throw new RangeError('Invalid attempt limit or rope count.');
  return {
    rules,
    players: Object.fromEntries(
      ids.map((id) => [
        id,
        { ropes: rules.initialRopes, trial: null, lugia: false, hoOh: false },
      ]),
    ),
    pendingFly: null,
  };
}

function updatePlayer(
  state: CoreState,
  playerId: PlayerId,
  player: LegendaryPlayer,
): CoreState {
  return {
    ...state,
    legendary: {
      ...state.legendary!,
      players: { ...state.legendary!.players, [playerId]: player },
    },
  };
}

/** Called once after committed movement; flight does not roll or cross START. */
export function enterSpecial(
  state: CoreState,
  tile: Tile,
  allowFlight = true,
): { state: CoreState; presentations: readonly PresentationRequest[] } {
  if (!state.legendary || tile.kind !== 'special')
    return { state, presentations: [] };
  const id = state.activePlayerId;
  if (tile.special === 'fly')
    return {
      state: allowFlight
        ? {
            ...state,
            legendary: {
              ...state.legendary,
              pendingFly: { playerId: id, turn: state.turnNumber },
            },
          }
        : state,
      presentations: [],
    };
  if (state.worldEvents) return arriveWorldEvent(state, tile);
  const legendary = tile.special === 'lugia-trial' ? 'lugia' : 'ho-oh';
  return {
    state: updatePlayer(state, id, {
      ...state.legendary.players[id]!,
      trial: { legendary, tileId: tile.id, attempts: 0, lastAttemptTurn: 0 },
    }),
    presentations: [
      { type: 'trial-intro', legendary, playerId: id, tileId: tile.id },
    ],
  };
}

export function legalFlyDestinations(
  state: CoreState,
  map: MapDefinition,
): readonly TileId[] {
  const ext = state.legendary;
  const active = state.players.find((p) => p.id === state.activePlayerId);
  if (
    state.phase !== 'playing' ||
    state.mapId !== map.id ||
    !active ||
    active.bankrupt ||
    !ext ||
    ext.players[active.id]?.trial ||
    ext.pendingFly?.playerId !== active.id ||
    ext.pendingFly.turn !== state.turnNumber ||
    state.core.turnStage !== 'awaiting-end'
  )
    return [];
  return map.tiles
    .filter(
      (tile) =>
        tile.id !== active.position &&
        !(tile.kind === 'special' && tile.special === 'fly'),
    )
    .map((tile) => tile.id);
}

/** Validate serialized extension data before consuming RNG or applying effects. */
function validExtension(state: CoreState, map: MapDefinition): boolean {
  const ext = state.legendary!;
  try {
    const normalized = createLegendaryState([], ext.rules).rules;
    if (
      (Object.keys(defaultLegendaryRules) as (keyof LegendaryRules)[]).some(
        (key) => normalized[key] !== ext.rules[key],
      )
    )
      return false;
  } catch {
    return false;
  }
  if (Object.keys(ext.players).length !== state.players.length) return false;
  for (const p of state.players) {
    const data = ext.players[p.id];
    if (
      !data ||
      !Number.isSafeInteger(data.ropes) ||
      data.ropes < 0 ||
      typeof data.lugia !== 'boolean' ||
      typeof data.hoOh !== 'boolean'
    )
      return false;
    const trial = data.trial;
    if (trial === null) continue;
    if (!trial) return false;
    const tile = map.tiles.find((t) => t.id === trial.tileId);
    if (
      tile?.kind !== 'special' ||
      !['lugia', 'ho-oh'].includes(trial.legendary) ||
      tile.special !== `${trial.legendary}-trial` ||
      p.position !== tile.id ||
      !Number.isSafeInteger(trial.attempts) ||
      trial.attempts < 0 ||
      trial.attempts >= ext.rules.guaranteedAttempt ||
      !Number.isSafeInteger(trial.lastAttemptTurn) ||
      trial.lastAttemptTurn < 0 ||
      trial.lastAttemptTurn > state.turnNumber ||
      (trial.attempts === 0) !== (trial.lastAttemptTurn === 0)
    )
      return false;
    if (
      p.id === state.activePlayerId &&
      trial.lastAttemptTurn === state.turnNumber &&
      state.core.turnStage !== 'awaiting-end'
    )
      return false;
  }
  if (ext.pendingFly !== null) {
    const pending = ext.pendingFly;
    const active = state.players.find((p) => p.id === state.activePlayerId)!;
    const tile = map.tiles.find((t) => t.id === active.position);
    if (
      !pending ||
      pending.playerId !== active.id ||
      pending.turn !== state.turnNumber ||
      state.core.turnStage !== 'awaiting-end' ||
      ext.players[active.id]!.trial ||
      tile?.kind !== 'special' ||
      tile.special !== 'fly'
    )
      return false;
  }
  return true;
}

export function legendaryAction(
  state: CoreState,
  map: MapDefinition,
  action: GameAction | LegendaryAction,
  land: (
    state: CoreState,
    tile: Tile,
  ) => { state: CoreState; events: readonly CoreEvent[] } | null,
): Transition | undefined {
  const reject = (error: LegendaryError): Transition => ({
    ok: false,
    state,
    events: [],
    error,
  });
  const isExtra = ['attempt-trial', 'use-escape-rope', 'fly'].includes(
    action.type,
  );
  const ext = state.legendary;
  if (!ext) return isExtra ? reject('legendary-disabled') : undefined;
  if (!validExtension(state, map)) return reject('invalid-legendary-state');
  const id = state.activePlayerId;
  const player = ext.players[id];
  if (!player) return reject('invalid-legendary-state');
  const trial = player.trial;
  if (action.type === 'attempt-trial' || action.type === 'use-escape-rope') {
    if (state.worldEvents) return reject('legendary-disabled');
    if (!trial) return reject('trial-required');
    if (action.type === 'use-escape-rope') {
      if (player.ropes < 1) return reject('no-escape-rope');
      const next = updatePlayer(state, id, {
        ...player,
        ropes: player.ropes - 1,
        trial: null,
      });
      return {
        ok: true,
        state: { ...next, core: { ...next.core, turnStage: 'awaiting-roll' } },
        events: [{ type: 'rope-used', playerId: id }],
        presentations: [],
      };
    }
    if (trial.lastAttemptTurn === state.turnNumber)
      return reject('trial-already-attempted');
    const attempt = trial.attempts + 1;
    const random = nextRandom(state.core.rngState);
    const success =
      attempt >= ext.rules.guaranteedAttempt ||
      random.value < ext.rules.successChance;
    const next = updatePlayer(state, id, {
      ...player,
      trial: success
        ? null
        : { ...trial, attempts: attempt, lastAttemptTurn: state.turnNumber },
      lugia: player.lugia || (success && trial.legendary === 'lugia'),
      hoOh: player.hoOh || (success && trial.legendary === 'ho-oh'),
    });
    return {
      ok: true,
      state: {
        ...next,
        core: {
          ...next.core,
          rngState: random.state,
          turnStage: 'awaiting-end',
        },
      },
      events: [
        {
          type: 'trial-resolved',
          playerId: id,
          legendary: trial.legendary,
          attempt,
          success,
        },
      ],
      presentations: [],
    };
  }
  if (action.type === 'fly') {
    if (trial) return reject('trial-pending');
    if (!ext.pendingFly) return reject('flight-required');
    if (!legalFlyDestinations(state, map).includes(action.to))
      return reject('invalid-destination');
    const from = state.players.find((p) => p.id === id)!.position;
    const tile = map.tiles.find((t) => t.id === action.to)!;
    if (
      state.worldEvents &&
      tile.kind === 'special' &&
      tile.special !== 'fly' &&
      !Number.isSafeInteger(
        state.players.find((p) => p.id === id)!.balance +
          worldEventRules.arrivalReward,
      )
    )
      return reject('invalid-legendary-state');
    const moved: CoreState = {
      ...state,
      players: state.players.map((p) =>
        p.id === id ? { ...p, position: action.to } : p,
      ),
      legendary: { ...ext, pendingFly: null },
    };
    const entered = enterSpecial(moved, tile, false);
    const landed = land(entered.state, tile);
    if (!landed)
      return { ok: false, state, events: [], error: 'invalid-hook-effect' };
    return {
      ok: true,
      state: clearWorldEvents(landed.state),
      events: [
        { type: 'player-moved', playerId: id, from, to: action.to },
        { type: 'tile-landed', playerId: id, tileId: action.to },
        ...landed.events,
      ],
      presentations: [
        { type: 'fly', playerId: id, from, to: action.to },
        ...entered.presentations,
      ],
    };
  }
  if (
    trial &&
    (action.type !== 'end-turn' || trial.lastAttemptTurn !== state.turnNumber)
  )
    return reject('trial-pending');
  if (ext.pendingFly) return reject('flight-required');
  return undefined;
}

/** Quote only. Commit the returned state together with a successful economic transaction. */
export function quoteBlessing(
  state: CoreState,
  playerId: PlayerId,
  kind: 'toll' | 'upgrade',
  amount: number,
): {
  readonly amount: number;
  readonly consumed: boolean;
  readonly state: CoreState;
} {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !state.players.some((p) => p.id === playerId)
  )
    throw new RangeError('Invalid transaction.');
  const ext = state.legendary;
  const player = ext?.players[playerId];
  const key = kind === 'toll' ? 'lugia' : 'hoOh';
  if (!ext || !player?.[key] || amount === 0)
    return { amount, consumed: false, state };
  const rate =
    kind === 'toll' ? ext.rules.tollDiscount : ext.rules.upgradeDiscount;
  return {
    amount: amount - Math.floor(amount * rate),
    consumed: true,
    state: updatePlayer(state, playerId, { ...player, [key]: false }),
  };
}
