import type { CoreState } from '../core/index.ts';
import type { Tile, PlayerId, TileId } from '../contracts.ts';
import type { Legendary, PresentationRequest } from '../legendary.ts';

export const worldEventRules = Object.freeze({
  arrivalReward: 50,
  visitorsRequired: 3,
  durationRounds: 2,
  discounts: { lugia: 0.25, 'ho-oh': 0.25 },
});
export interface WorldEventsState {
  readonly visitors: Readonly<Record<TileId, readonly PlayerId[]>>;
  readonly arrivals: readonly string[];
  readonly active: Partial<
    Record<Legendary, { readonly expiresAfterRound: number }>
  >;
}
export function createWorldEvents(): WorldEventsState {
  return { visitors: {}, arrivals: [], active: {} };
}
export function validWorldEvents(
  state: CoreState,
  tiles: readonly Tile[],
): boolean {
  const ext = state.worldEvents;
  if (!ext) return true;
  return (
    !!ext.visitors &&
    !!ext.active &&
    Array.isArray(ext.arrivals) &&
    ext.arrivals.every((id) => typeof id === 'string') &&
    new Set(ext.arrivals).size === ext.arrivals.length &&
    Object.entries(ext.visitors).every(
      ([tileId, ids]) =>
        tiles.some(
          (t) => t.id === tileId && t.kind === 'special' && t.special !== 'fly',
        ) &&
        Array.isArray(ids) &&
        ids.length < worldEventRules.visitorsRequired &&
        new Set(ids).size === ids.length &&
        ids.every((id) => state.players.some((p) => p.id === id)),
    ) &&
    Object.entries(ext.active).every(
      ([key, event]) =>
        (key === 'lugia' || key === 'ho-oh') &&
        !!event &&
        Number.isSafeInteger(event.expiresAfterRound) &&
        event.expiresAfterRound >= 1,
    )
  );
}
export function currentRound(state: CoreState): number {
  return (state.match?.completedRounds ?? 0) + 1;
}
export function clearWorldEvents<S extends CoreState>(state: S): S {
  if (!state.worldEvents) return state;
  if (state.phase === 'finished')
    return { ...state, worldEvents: createWorldEvents() };
  return {
    ...state,
    worldEvents: {
      ...state.worldEvents,
      active: Object.fromEntries(
        Object.entries(state.worldEvents.active).filter(
          ([, event]) => event.expiresAfterRound >= currentRound(state),
        ),
      ),
    },
  };
}
/** Only the committed destination calls this; turn + tile identifies redelivery. */
export function arriveWorldEvent(
  state: CoreState,
  tile: Tile,
): {
  state: CoreState;
  presentations: readonly PresentationRequest[];
} {
  const ext = state.worldEvents;
  if (!ext || tile.kind !== 'special' || tile.special === 'fly')
    return { state, presentations: [] };
  const id = state.activePlayerId;
  const arrival = `${state.turnNumber}:${id}:${tile.id}`;
  if (ext.arrivals.includes(arrival)) return { state, presentations: [] };
  const player = state.players.find((p) => p.id === id)!;
  if (!Number.isSafeInteger(player.balance + worldEventRules.arrivalReward))
    throw new RangeError('Invalid arrival balance');
  const legendary = tile.special === 'lugia-trial' ? 'lugia' : 'ho-oh';
  const visitors = [...new Set([...(ext.visitors[tile.id] ?? []), id])];
  const activated = visitors.length >= worldEventRules.visitorsRequired;
  const expiresAfterRound =
    currentRound(state) + worldEventRules.durationRounds - 1;
  return {
    state: {
      ...state,
      players: state.players.map((p) =>
        p.id === id
          ? { ...p, balance: p.balance + worldEventRules.arrivalReward }
          : p,
      ),
      worldEvents: {
        arrivals: [...ext.arrivals, arrival],
        visitors: { ...ext.visitors, [tile.id]: activated ? [] : visitors },
        active: activated
          ? { ...ext.active, [legendary]: { expiresAfterRound } }
          : ext.active,
      },
    },
    presentations: activated
      ? [
          {
            type: 'world-event',
            legendary,
            playerId: id,
            tileId: tile.id,
            expiresAfterRound,
          },
        ]
      : [],
  };
}
/** Applies to city tolls/facilities only; the caller excludes land and takeover. */
export function quoteWorldEvent(
  state: CoreState,
  kind: 'toll' | 'upgrade',
  amount: number,
): number {
  const key = kind === 'toll' ? 'lugia' : 'ho-oh';
  const event = state.worldEvents?.active[key];
  return state.phase === 'playing' &&
    event &&
    event.expiresAfterRound >= currentRound(state)
    ? amount - Math.floor(amount * worldEventRules.discounts[key])
    : amount;
}
