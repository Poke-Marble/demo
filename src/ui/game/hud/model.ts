import type { CityHolding, GameEvent, PlayerId } from '../../../game/contracts';
import type { GameView } from '../adapter';
import { ownerTheme } from '../art/ownership';

/** Display-only metadata. Omitted fields have no inferred substitute. */
export interface PlayerDisplayMeta {
  abilityName?: string;
  blessing?: string;
  trialStay?: string;
  computerStatus?: string;
  totalAssets?: number;
  expectedIncome?: number;
  abilityCooldown?: string;
  unpaidAmount?: number;
}
export type DisplayMeta = Readonly<
  Partial<Record<PlayerId, PlayerDisplayMeta>>
>;
export interface ConfirmedCashEvent {
  /** Stable, session-unique identity, preserved on redelivery. */
  id: string;
  playerId: PlayerId;
  amount: number;
}
export const money = (amount: number) =>
  `${new Intl.NumberFormat('ko-KR').format(amount)} ₽`;

export function playerAssets(view: GameView, playerId: PlayerId) {
  const owned = new Map(
    view.state.holdings
      .filter((holding) => holding.ownerId === playerId)
      .map((holding) => [holding.tileId, holding]),
  );
  const cities: CityHolding[] = [];
  const landmarks: CityHolding[] = [];
  for (const tile of view.map.tiles) {
    const holding = owned.get(tile.id);
    if (!holding) continue;
    if (tile.kind === 'city') cities.push(holding);
    else if (tile.kind === 'landmark') landmarks.push(holding);
  }
  return { cities, landmarks };
}

export function hudPlayers(view: GameView, meta: DisplayMeta = {}) {
  return view.state.players.map((player) => ({
    ...player,
    controller: view.participants.find((p) => p.id === player.id)?.controller,
    active:
      view.state.phase === 'playing' &&
      player.id === view.state.activePlayerId &&
      !player.bankrupt,
    theme: ownerTheme(player),
    assets: playerAssets(view, player.id),
    meta: meta[player.id] ?? {},
  }));
}

/** Only toll-paid contains a confirmed cash amount in the base GameEvent contract. */
export function cashEventsFromGameEvents(
  updateId: string,
  events: readonly GameEvent[],
): ConfirmedCashEvent[] {
  return events.flatMap((event, index) =>
    event.type === 'toll-paid' &&
    Number.isFinite(event.amount) &&
    event.amount > 0
      ? [
          {
            id: `${updateId}:${index}:payer`,
            playerId: event.fromPlayerId,
            amount: -event.amount,
          },
          {
            id: `${updateId}:${index}:receiver`,
            playerId: event.toPlayerId,
            amount: event.amount,
          },
        ]
      : [],
  );
}
