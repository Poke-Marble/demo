import type { GameView } from '../adapter';
import type { VictoryReason } from '../../../game/contracts';

export const victoryLabels: Record<VictoryReason, string> = {
  'last-player-standing': '마지막 생존',
  'three-city-groups': '도시 그룹 3개',
  'one-side-cities': '한 면 도시 독점',
  'four-landmarks': '명소 4개',
  'round-limit-assets': '라운드 제한 · 최종 자산',
};

/** Reuse authoritative valuations and tie order; only promote the actual winner. */
export function resultRows(view: GameView) {
  const ranking =
    view.state.match?.finalRanking ?? view.matchProgress?.assetRanking;
  const rows = ranking
    ? ranking.map((rank) => ({
        player: view.state.players.find((p) => p.id === rank.playerId)!,
        total: rank.total as number | null,
        bankrupt: rank.bankrupt,
      }))
    : view.state.players
        .map((player, seat) => ({
          player,
          seat,
          total: null,
          bankrupt: player.bankrupt,
        }))
        .sort(
          (a, b) => Number(a.bankrupt) - Number(b.bankrupt) || a.seat - b.seat,
        );
  const winner = rows.findIndex(
    (row) => row.player.id === view.state.victory?.winnerId,
  );
  if (winner > 0) rows.unshift(...rows.splice(winner, 1));
  return rows;
}
