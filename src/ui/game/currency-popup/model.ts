import type { PlayerId } from '../../../game/contracts';
import type { EconomyState } from '../../../game/economy/types';
import type { GameView, UIUpdate } from '../adapter';
import { money } from '../hud/model';

export interface CashDelta {
  playerId: PlayerId;
  amount: number;
}
export const cashDeltaText = (amount: number) =>
  `${amount > 0 ? '+' : '−'}${money(Math.abs(amount))}`;

/** Consume committed snapshots before any asynchronous presentation/ACK. */
export function createCashDeltaGate(initial: GameView) {
  let previous = initial;
  const ids = new Set<string>();
  return {
    accept(update: UIUpdate): CashDelta[] {
      const next = update.view;
      const oldEconomy = (previous.state as Partial<EconomyState>).economy;
      const economy = (next.state as Partial<EconomyState>).economy;
      if (
        next.state.phase === 'setup' ||
        previous.state.phase === 'setup' ||
        next.state.mapId !== previous.state.mapId ||
        economy?.sessionId !== oldEconomy?.sessionId
      ) {
        this.reset(next);
        return [];
      }
      if (update.id && ids.has(update.id)) return [];
      if (update.id) ids.add(update.id);
      // Equal/older revisions include settlement waits and delayed ACK snapshots.
      if (economy && oldEconomy && economy.revision <= oldEconomy.revision)
        return [];
      const balances = new Map(
        previous.state.players.map((p) => [p.id, p.balance]),
      );
      previous = next;
      return next.state.players.flatMap((p) => {
        const before = balances.get(p.id);
        const amount = before === undefined ? 0 : p.balance - before;
        return Number.isFinite(amount) && amount !== 0
          ? [{ playerId: p.id, amount }]
          : [];
      });
    },
    reset(next: GameView) {
      previous = next;
      ids.clear();
    },
  };
}
