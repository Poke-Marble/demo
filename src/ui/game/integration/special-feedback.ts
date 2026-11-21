import type {
  EconomyState,
  EconomyTransition,
} from '../../../game/economy/types.ts';
import type { LegendaryEvent } from '../../../game/legendary.ts';
import type { DisplayMeta } from '../hud/model.ts';
import type { UIUpdate } from '../adapter.ts';

export const legendaryName = (name: 'lugia' | 'ho-oh') =>
  name === 'lugia' ? '루기아' : '칠색조';
const percent = (rate: number) => `${Math.round(rate * 100)}%`;

/** Projection only: trial counters, inventory and discounts all come from core. */
export function specialHudMeta(state: EconomyState): DisplayMeta {
  const ext = state.legendary;
  if (!ext) return {};
  return Object.fromEntries(
    state.players.map(({ id }) => {
      const p = ext.players[id]!;
      const trial = p.trial;
      const blessings = [
        p.lugia
          ? `루기아 · 통행료 −${percent(ext.rules.tollDiscount)} · 1회`
          : '',
        p.hoOh
          ? `칠색조 · 시설비 −${percent(ext.rules.upgradeDiscount)} · 1회`
          : '',
      ].filter(Boolean);
      return [
        id,
        {
          ropes: `${p.ropes}개`,
          ...(blessings.length ? { blessing: blessings.join(' / ') } : {}),
          ...(trial
            ? {
                trialStay: `${legendaryName(trial.legendary)} · ${trial.attempts === 0 ? '도전 대기' : id !== state.activePlayerId || trial.lastAttemptTurn === state.turnNumber ? '실패 대기' : '재도전'} · ${trial.attempts}/${ext.rules.guaranteedAttempt}회`,
                trialDetails: `${legendaryName(trial.legendary)} 시험 · 시도 ${trial.attempts}회 · 재도전 ${Math.max(0, trial.attempts - 1)}회 · 다음 ${trial.attempts + 1}회차 · ${ext.rules.guaranteedAttempt}회차 성공 보장${trial.attempts > 0 && (id !== state.activePlayerId || trial.lastAttemptTurn === state.turnNumber) ? ' · 실패 후 다음 내 차례 대기' : ''}`,
              }
            : {}),
        },
      ];
    }),
  );
}

/** Receipts/events describe charges; flag transitions confirm actual consumption. */
export function specialFeedback(
  before: EconomyState,
  result: Extract<EconomyTransition, { ok: true }>,
): Pick<UIUpdate, 'specialEvents' | 'results'> {
  if (result.replayed) return { specialEvents: [], results: [] };
  const after = result.state;
  const specialEvents = result.events.filter(
    (e): e is LegendaryEvent =>
      e.type === 'trial-resolved' || e.type === 'rope-used',
  );
  const texts: string[] = [];
  const playerName = (id: string) =>
    after.players.find((p) => p.id === id)!.name;
  for (const event of specialEvents) {
    const player = after.legendary!.players[event.playerId]!;
    const prefix = `${playerName(event.playerId)} · `;
    if (event.type === 'rope-used') {
      texts.push(
        `${prefix}탈출로프 1개 사용 · 남은 로프 ${player.ropes}개 · 시험 해제, 주사위 굴리기 가능`,
      );
    } else {
      const name = legendaryName(event.legendary);
      texts.push(
        `${prefix}${name} 시험 ${event.attempt}회차 ${event.success ? `성공${event.attempt >= after.legendary!.rules.guaranteedAttempt ? ' (보장)' : ''} · ${name} 가호 보유` : `실패 · 다음 내 차례에 ${event.attempt + 1}회차 재도전 · ${after.legendary!.rules.guaranteedAttempt}회차 성공 보장`}`,
      );
    }
  }
  for (const p of after.players) {
    const old = before.legendary?.players[p.id];
    const next = after.legendary?.players[p.id];
    if (!old || !next) continue;
    if (old.hoOh && !next.hoOh) {
      const quote = result.receipt.quote;
      if (quote?.consumesBlessing)
        texts.push(
          `${p.name} · 칠색조 가호 1회 소비 · 시설 건설 ${quote.gross} → ${quote.total} ₽ 결제 · 가호 잔여 없음`,
        );
    }
    if (old.lugia && !next.lugia) {
      const toll = result.events.find(
        (e) => e.type === 'toll-settled' && e.debtorId === p.id,
      );
      if (toll?.type === 'toll-settled')
        texts.push(
          `${p.name} · 루기아 가호 1회 소비 · 할인 후 통행료 ${toll.amount} ₽ · 실제 지불 ${toll.recovered} ₽${toll.forgiven ? ` · 미회수 ${toll.forgiven} ₽` : ''} · 가호 잔여 없음`,
        );
    }
  }
  if (result.receipt.intentType === 'fly') {
    const landing = result.events.find((e) => e.type === 'tile-landed');
    if (landing?.type === 'tile-landed') {
      const toll = result.events.find((e) => e.type === 'toll-settled');
      const debt = result.events.find((e) => e.type === 'debt-opened');
      texts.push(
        `${playerName(landing.playerId)} · 비행 도착 · ${toll?.type === 'toll-settled' ? `통행료 ${toll.recovered} ₽ 정산` : debt?.type === 'debt-opened' ? `미납 ${debt.debt.amount} ₽ · 자산 정산 필요` : after.legendary?.players[landing.playerId]?.trial ? '전설시험 진입' : after.economy.landing && !after.economy.landing.propertyDecisionUsed ? '도착지 구매·건설 선택' : '도착 처리 완료'}`,
      );
    }
  }
  return {
    specialEvents,
    results: texts.map((text, index) => ({
      id: `${result.receipt.sessionId}:${result.receipt.commandId}:result:${index}`,
      text,
    })),
  };
}
