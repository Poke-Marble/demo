import { settleAbilities } from './settlement.ts';
import { specialHudMeta, specialFeedback } from './special-feedback.ts';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto.ts';
import { createGame } from '../../../game/core/index.ts';
import {
  createEconomyContext,
  initializeEconomy,
  dispatchEconomy,
  getLegalActions,
  quoteConstruction,
  quoteToll,
  tollBase,
  type EconomyState,
  type EconomyIntent,
  type EconomyCommand,
  type LegalActionSet,
} from '../../../game/economy/index.ts';
import { finalizeMatch } from '../../../game/match/index.ts';
import {
  emptyLedger,
  type AbilityLedger,
  type AbilityActivation,
  type SettledTransaction,
} from '../../../game/abilities/activation.ts';
import { createExecutor } from '../../../game/ai/executor.ts';
import type { Snapshot, ActionKind } from '../../../game/ai/contracts.ts';
import type { GameEvent } from '../../../game/contracts';
import type { GameSetup, GameUIAdapter, GameView, UIUpdate } from '../adapter';
import { createInitialRoster } from '../setup.ts';
import { presentationMap } from './map.ts';

export interface IntegratedState extends EconomyState {
  readonly abilityLedger: AbilityLedger;
  readonly abilityOutbox: readonly AbilityActivation[];
  readonly abilityReceipts: readonly SettledTransaction[];
}
type Legal = LegalActionSet['actions'][number];
const kinds: Partial<Record<EconomyIntent['type'], ActionKind>> = {
  'roll-dice': 'roll',
  'end-turn': 'end-turn',
  'construct-property': 'build',
  'buy-landmark': 'buy',
  'takeover-property': 'takeover',
  'sell-property': 'sell',
  'declare-bankruptcy': 'bankrupt',
  'pass-property': 'pass',
  'attempt-trial': 'trial',
  'use-escape-rope': 'rope',
  fly: 'fly',
};
const labels: Partial<Record<EconomyIntent['type'], string>> = {
  'roll-dice': '주사위 굴리기',
  'end-turn': '턴 마치기',
  'buy-landmark': '명소 구매',
  'takeover-property': '인수',
  'sell-property': '매각',
  'declare-bankruptcy': '파산 선언',
  'pass-property': '건너뛰기',
  'attempt-trial': '시험에 도전',
  'use-escape-rope': '탈출로프 사용',
  fly: '공중날기',
};
const reasonLabels: Readonly<Record<string, string>> = {
  'stage-locked': '개인 바퀴 해금 필요',
  'final-revisit-required': '센터 완성 후 재방문 필요',
  'already-built': '이미 완성한 단계',
  'insufficient-funds': '잔액 부족',
  'not-owner': '다른 플레이어 소유',
};
/** One authority for human and computer commands. No fixture state mutation. */
export function createIntegratedPreview(
  options: { computerDelayMs?: number; seed?: number } = {},
) {
  const context = createEconomyContext(kantoJohtoMap);
  const map = context.map;
  let participants = createInitialRoster('pokemon:0001');
  let rulesPreset: 'standard' | 'quick' = 'standard';
  let session = 0,
    serial = 0;
  const fresh = (): IntegratedState => ({
    ...initializeEconomy(
      createGame(map, participants, {
        seed: options.seed ?? 42,
        legendary: {},
        rulesPreset,
      }),
      context,
      `game:${session}`,
    ),
    abilityLedger: emptyLedger(),
    abilityOutbox: [],
    abilityReceipts: [],
  });
  let state: IntegratedState = { ...fresh(), phase: 'setup' };
  let notice = '';
  const listeners = new Set<(update: UIUpdate) => void>();
  const acknowledgements = new Map<() => void, (update: UIUpdate) => void>();
  let presentation: Promise<void> = Promise.resolve();
  let presentationBusy = false;
  const human = () =>
    participants.find((p) => p.id === state.activePlayerId)?.controller ===
    'human';
  const legal = () => getLegalActions(state, context, state.activePlayerId);
  const identity = () => `${state.economy.sessionId}:${state.economy.revision}`;
  const label = (a: Legal) => {
    const intent = a.intent;
    const title =
      intent.type === 'construct-property'
        ? ['캠프 구매', '숍 건설', '센터 건설', '대표 시설 완성'][
            intent.targetStage
          ]!
        : (labels[intent.type] ?? intent.type);
    const tile =
      'tileId' in intent
        ? map.tiles.find((t) => t.id === intent.tileId)?.nameKo
        : '';
    return `${title}${intent.type === 'sell-property' ? ` · ${tile}` : ''}${a.quote ? ` · ${intent.type === 'sell-property' ? '+' : ''}${a.quote.total} ₽` : ''}`;
  };
  const getView = (): GameView => {
    const set = legal();
    const choices = set.actions
      .filter((a) => a.intent.type !== 'fly')
      .map((a) => ({ id: a.actionKey, label: label(a) }));
    const choosing =
      set.phase === 'choosing-property' ||
      set.phase === 'liquidating' ||
      !!state.legendary?.players[state.activePlayerId]?.trial;
    let description =
      set.phase === 'liquidating'
        ? `미납 ${state.economy.pendingDebt!.amount} ₽ · 매각 후 자동 정산`
        : '확정 견적 · 선택하면 이번 방문 결정을 마칩니다.';
    if (set.phase === 'choosing-property' && state.economy.landing) {
      const tileId = state.economy.landing.tileId;
      if (context.properties[tileId]?.kind === 'city') {
        const reasons = ([0, 1, 2, 3] as const)
          .map((stage) =>
            quoteConstruction(
              state,
              context,
              state.activePlayerId,
              tileId,
              stage,
            ),
          )
          .filter((q) => !q.eligible)
          .flatMap((q) => q.reasons);
        description += ` 잠금: ${[...new Set(reasons)].map((r) => reasonLabels[r] ?? r).join(', ') || '없음'}`;
      }
    }
    const hudMeta = specialHudMeta(state);
    const trial = state.legendary?.players[state.activePlayerId]?.trial;
    if (trial)
      description = `${hudMeta[state.activePlayerId]?.trialDetails} · 탈출로프 ${state.legendary!.players[state.activePlayerId]!.ropes}개`;
    const flights = set.actions.filter((a) => a.intent.type === 'fly');
    return {
      state,
      map: presentationMap,
      mapName: '관동·성도 여행',
      participants,
      hudMeta,
      computer: { connected: true, status: '표준 AI · 실제 경제 견적 판단 중' },
      actions: choosing
        ? []
        : choices.map((c) => ({
            ...c,
            selectionId: identity(),
            ...(set.actions.find((a) => a.actionKey === c.id)!.intent.type ===
            'roll-dice'
              ? {
                  action: {
                    type: 'roll-dice' as const,
                    playerId: state.activePlayerId,
                  },
                }
              : {}),
          })),
      ...(choosing && human()
        ? {
            prompt: {
              id: identity(),
              kind:
                set.phase === 'liquidating'
                  ? ('liquidate' as const)
                  : ('purchase' as const),
              title:
                set.phase === 'liquidating'
                  ? '채무 정산'
                  : trial
                    ? '전설시험'
                    : '이번 방문 선택',
              description,
              choices,
            },
          }
        : {}),
      ...(flights.length && human()
        ? {
            flightSelection: {
              id: identity(),
              playerId: state.activePlayerId,
              cancellable: false,
              destinations: flights.map((a) => {
                const tileId = (
                  a.intent as Extract<EconomyIntent, { type: 'fly' }>
                ).to;
                const tile = map.tiles.find((t) => t.id === tileId)!;
                const content = kantoJohtoMap.tiles.find(
                  (t) => t.id === tileId,
                )!;
                const holding = state.holdings.find((h) => h.tileId === tileId);
                const owner = state.players.find(
                  (p) => p.id === holding?.ownerId,
                );
                const ownerVisual = owner
                  ? (
                      {
                        'pokemon:0001': {
                          ownerType: '풀',
                          ownerColor: 'grass',
                        },
                        'pokemon:0004': {
                          ownerType: '불꽃',
                          ownerColor: 'fire',
                        },
                        'pokemon:0007': {
                          ownerType: '물',
                          ownerColor: 'water',
                        },
                        'pokemon:0025': {
                          ownerType: '전기',
                          ownerColor: 'electric',
                        },
                      } as Record<
                        string,
                        { ownerType: string; ownerColor: string }
                      >
                    )[owner.pokemonId]
                  : undefined;
                return {
                  tileId,
                  label: tile.nameKo,
                  metadata: {
                    kind:
                      tile.kind === 'special'
                        ? tile.special === 'fly'
                          ? ('fly' as const)
                          : ('trial' as const)
                        : tile.kind,
                    ...(tile.kind === 'city' || tile.kind === 'landmark'
                      ? {
                          ownership: !holding
                            ? ('unowned' as const)
                            : holding.ownerId === state.activePlayerId
                              ? ('self' as const)
                              : ('opponent' as const),
                          ...(owner
                            ? { ownerName: owner.name, ...ownerVisual }
                            : {}),
                          ...(tile.kind === 'city'
                            ? holding
                              ? {
                                  facilityStage: holding.facilityLevel,
                                  facilityName:
                                    holding.facilityLevel === 3
                                      ? (content.finalFacility?.nameKo ??
                                        '최종시설')
                                      : (['캠프', '숍', '포켓몬센터'][
                                          holding.facilityLevel
                                        ] ?? '시설명 정보 없음'),
                                }
                              : { facilityName: '미개발 · 시설 없음' }
                            : {
                                facilityName: '관광명소 · 도시 시설 단계 없음',
                              }),
                          toll: quoteToll(
                            state,
                            context,
                            state.activePlayerId,
                            tileId,
                          ).total,
                        }
                      : {}),
                  },
                };
              }),
            },
          }
        : {}),
      ...(notice ? { notice } : {}),
    };
  };
  function cancelPresentation() {
    for (const done of [...acknowledgements.keys()]) done();
  }
  function publish(extra: Partial<UIUpdate> = {}) {
    presentationBusy = listeners.size > 0;
    const waits: Promise<void>[] = [];
    for (const listener of listeners) {
      let done!: () => void;
      const wait = new Promise<void>((resolve) => {
        done = () => {
          acknowledgements.delete(done);
          resolve();
        };
      });
      acknowledgements.set(done, listener);
      waits.push(wait);
      try {
        listener({
          id: `integrated:${session}:${++serial}`,
          view: getView(),
          events: [],
          ...extra,
          presentationComplete: done,
        });
      } catch {
        done();
      }
    }
    presentationBusy = waits.length > 0;
    const current = Promise.all(waits).then(() => {
      if (presentation === current) presentationBusy = false;
    });
    presentation = current;
  }
  function commit(command: EconomyCommand) {
    if (presentationBusy) return false;
    const before = state;
    const result = dispatchEconomy(before, context, command);
    if (!result.ok || result.replayed) return result.ok;
    let { next } = settleAbilities(before, context, result);
    const activations = next.abilityOutbox.slice(before.abilityOutbox.length);
    const events = result.events.filter(
      (e): e is GameEvent =>
        ![
          'trial-resolved',
          'rope-used',
          'start-rewarded',
          'tile-landed',
          'turn-started',
          'economy-committed',
          'debt-opened',
          'toll-settled',
          'property-sold',
        ].includes(e.type),
    );
    if (!next.economy.pendingDebt) {
      const final = finalizeMatch(next, context, { actorId: command.playerId });
      next = final.state;
      events.push(...final.events);
    }
    state = next; // Single atomic publication: base money + ability ledger/money + victory.
    const dice = result.events.find((e) => e.type === 'dice-rolled');
    const start = map.tiles.findIndex(
      (t) =>
        t.id ===
        before.players.find((p) => p.id === command.playerId)!.position,
    );
    const movement =
      dice?.type === 'dice-rolled'
        ? {
            playerId: command.playerId,
            path: Array.from(
              { length: dice.values.reduce((a, b) => a + b, 0) },
              (_, i) => map.tiles[(start + i + 1) % map.tiles.length]!.id,
            ),
          }
        : undefined;
    const toll = result.events.find((e) => e.type === 'toll-settled');
    notice =
      toll?.type === 'toll-settled'
        ? `통행료 ${toll.recovered} ₽ 정산${toll.forgiven ? ` · 미회수 ${toll.forgiven} ₽` : ''}`
        : '';
    publish({
      events,
      ...specialFeedback(before, result),
      ...(movement ? { movement } : {}),
      abilityActivations: activations,
      effects: result.presentations.map((e, i) => ({
        ...e,
        id: `${command.sessionId}:${command.commandId}:${i}`,
      })),
    });
    return true;
  }
  // One projected opponent visit, explicitly a heuristic horizon; rates come from authority.
  function investmentIncome(a: Legal): number {
    if (
      !['construct-property', 'buy-landmark', 'takeover-property'].includes(
        a.intent.type,
      ) ||
      !('tileId' in a.intent)
    )
      return 0;
    const tileId = a.intent.tileId;
    const stage =
      a.intent.type === 'construct-property'
        ? a.intent.targetStage
        : (state.holdings.find((h) => h.tileId === tileId)?.facilityLevel ?? 0);
    const projected = {
      ...state,
      holdings: [
        ...state.holdings.filter((h) => h.tileId !== tileId),
        { tileId, ownerId: state.activePlayerId, facilityLevel: stage },
      ],
    };
    const visitor = state.players.find(
      (p) => p.id !== state.activePlayerId && !p.bankrupt,
    );
    return visitor ? tollBase(projected, context, visitor.id, tileId) : 0;
  }
  const snapshot = (): Snapshot<EconomyIntent> => ({
    session: state.economy.sessionId,
    turn: String(state.turnNumber),
    revision: String(state.economy.revision),
    phase: state.phase === 'playing' ? 'playing' : 'finished',
    activePlayerId: state.activePlayerId,
    players: state.players.map((p) => ({
      id: p.id,
      bankrupt: p.bankrupt,
      controller: participants.find((n) => n.id === p.id)!.controller,
    })),
    cash: state.players.find((p) => p.id === state.activePlayerId)!.balance,
    debt: state.economy.pendingDebt?.amount ?? 0,
    expectedToll: {
      value: Math.max(
        0,
        ...state.holdings
          .filter((h) => h.ownerId !== state.activePlayerId)
          .map(
            (h) =>
              quoteToll(state, context, state.activePlayerId, h.tileId).total,
          ),
      ),
      source: 'authority',
    },
    properties: Object.keys(context.properties).map((id) => ({
      id,
      ownerId: state.holdings.find((h) => h.tileId === id)?.ownerId ?? null,
    })),
    collections: [
      ...map.cityGroups.map((g) => ({
        id: g.id,
        kind: 'group' as const,
        propertyIds: g.cityIds,
      })),
      ...(['south', 'west', 'north', 'east'] as const).map((side) => ({
        id: side,
        kind: 'line' as const,
        propertyIds: map.tiles
          .filter((t) => t.kind === 'city' && t.side === side)
          .map((t) => t.id),
      })),
      {
        id: 'landmarks',
        kind: 'four-landmarks',
        propertyIds: map.tiles
          .filter((t) => t.kind === 'landmark')
          .map((t) => t.id),
      },
    ],
    candidates: legal().actions.map((a) => ({
      id: a.actionKey,
      kind:
        a.intent.type === 'construct-property' && a.quote?.fromStage === null
          ? 'buy'
          : kinds[a.intent.type]!,
      action: a.intent,
      ...('tileId' in a.intent ? { targetId: a.intent.tileId } : {}),
      quote: {
        debit: a.quote && a.intent.type !== 'sell-property' ? a.quote.total : 0,
        credit: a.intent.type === 'sell-property' ? a.quote!.total : 0,
      },
      outlook: {
        income: { value: investmentIncome(a), source: 'heuristic' },
        trialSuccessProbability: state.legendary?.rules.successChance ?? 0,
      },
    })),
  });
  const aiCommands = new Map<string, EconomyCommand>();
  const executor = createExecutor<EconomyIntent>(
    {
      read: snapshot,
      async dispatch(command, signal) {
        if (signal.aborted || command.session !== state.economy.sessionId)
          return { accepted: false };
        const known = aiCommands.get(command.commandId);
        if (known) {
          const replay = dispatchEconomy(state, context, known);
          return { accepted: replay.ok && replay.replayed };
        }
        if (
          human() ||
          command.turn !== String(state.turnNumber) ||
          command.revision !== String(state.economy.revision)
        )
          return { accepted: false };
        const candidate = legal().actions.find(
          (a) =>
            a.actionKey === command.candidateId &&
            JSON.stringify(a.intent) === JSON.stringify(command.action),
        );
        if (!candidate) return { accepted: false };
        const envelope: EconomyCommand = {
          sessionId: command.session,
          commandId: `ai:${session}:${aiCommands.size}`,
          expectedRevision: state.economy.revision,
          playerId: state.activePlayerId,
          intent: candidate.intent,
        };
        const accepted = commit(envelope);
        if (accepted) aiCommands.set(command.commandId, envelope);
        return { accepted };
      },
      async awaitPresentation(_, signal) {
        if (signal.aborted) return;
        await new Promise<void>((resolve) => {
          const done = () => {
            signal.removeEventListener('abort', done);
            resolve();
          };
          signal.addEventListener('abort', done, { once: true });
          void presentation.then(done);
        });
      },
      delay: (signal) =>
        new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          const done = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
          };
          const timer = setTimeout(done, options.computerDelayMs ?? 350);
          signal.addEventListener('abort', done, { once: true });
        }),
    },
    { seed: options.seed ?? 42, maxActions: 64, callbackTimeoutMs: 60000 },
  );
  function humanCommit(a: Legal | undefined) {
    if (!human() || executor.busy || !a) return;
    commit({
      sessionId: state.economy.sessionId,
      commandId: `human:${session}:${state.economy.revision}`,
      expectedRevision: state.economy.revision,
      playerId: state.activePlayerId,
      intent: a.intent,
    });
  }
  const adapter: GameUIAdapter = {
    getView,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        for (const [done, owner] of acknowledgements)
          if (owner === listener) done();
      };
    },
    start(setup: GameSetup) {
      const preset = setup.rulesPreset ?? 'standard';
      if (preset !== 'standard' && preset !== 'quick')
        throw new Error('Unknown match preset');
      const allowed = new Set(
        createInitialRoster('pokemon:0001').map((p) => p.pokemonId),
      );
      if (
        setup.mapId !== map.id ||
        setup.participants.length !== 4 ||
        new Set(setup.participants.map((p) => p.id)).size !== 4 ||
        new Set(setup.participants.map((p) => p.pokemonId)).size !== 4 ||
        setup.participants.some((p) => !allowed.has(p.pokemonId)) ||
        setup.participants.filter((p) => p.controller === 'human').length !==
          1 ||
        setup.participants.filter((p) => p.controller === 'computer').length !==
          3
      )
        throw new Error('플레이어 배정을 확인하세요.');
      executor.cancel();
      cancelPresentation();
      session++;
      participants = setup.participants.map((p) => ({ ...p }));
      rulesPreset = preset;
      state = fresh();
      notice = '';
      publish();
    },
    dispatch(action) {
      humanCommit(
        legal().actions.find(
          (a) => JSON.stringify(a.intent) === JSON.stringify(action),
        ),
      );
    },
    choose(id, choice) {
      if (id === identity())
        humanCommit(legal().actions.find((a) => a.actionKey === choice));
    },
    selectFlightDestination(id, to) {
      if (id === identity())
        humanCommit(
          legal().actions.find(
            (a) => a.intent.type === 'fly' && a.intent.to === to,
          ),
        );
    },
    async runComputerTurn(playerId, signal) {
      if (
        playerId !== state.activePlayerId ||
        human() ||
        state.phase !== 'playing'
      )
        return;
      const result = await executor.run(signal);
      if (
        [
          'failed',
          'rejected',
          'no-progress',
          'max-actions',
          'timeout',
          'no-candidate',
        ].includes(result.reason)
      )
        throw new Error(`AI 진행 중단: ${result.reason}`);
    },
    restart() {
      executor.cancel();
      cancelPresentation();
      session++;
      state = { ...fresh(), phase: 'setup' };
      notice = '';
      publish();
    },
  };
  return { adapter, snapshot, getState: () => state };
}
