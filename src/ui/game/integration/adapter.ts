import { normalizeRulesPreset } from '../../../game/rulesets.ts';
import {
  clearFinishedSkills,
  skillForPokemon,
  skillUnavailableReason,
} from '../../../game/skills/index.ts';
import { settleAbilities } from './settlement.ts';
import { specialHudMeta, specialFeedback } from './special-feedback.ts';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto.ts';
import { createGame } from '../../../game/core/index.ts';
import {
  createEconomyContext,
  economyProfileForPreset,
  initializeEconomy,
  dispatchEconomy,
  getLegalActions,
  quoteConstruction,
  quoteToll,
  type EconomyState,
  type EconomyIntent,
  type EconomyCommand,
  type LegalActionSet,
} from '../../../game/economy/index.ts';
import {
  finalizeMatch,
  matchProgress,
  hasPendingSettlement,
} from '../../../game/match/index.ts';
import {
  emptyLedger,
  type AbilityLedger,
  type AbilityActivation,
  type SettledTransaction,
} from '../../../game/abilities/activation.ts';
import { createExecutor } from '../../../game/ai/executor.ts';
import { publicSnapshot } from '../../../game/ai/outlooks.ts';
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
const labels: Partial<Record<EconomyIntent['type'], string>> = {
  'roll-dice': '주사위 굴리기',
  'end-turn': '턴 마치기',
  'pay-toll': '통행료 정산',
  'buy-landmark': '명소 구매',
  'takeover-property': '인수',
  'sell-property': '매각',
  'declare-bankruptcy': '파산 선언',
  'pass-property': '건너뛰기',
  'attempt-trial': '시험에 도전',
  'use-escape-rope': '탈출로프 사용',
  fly: '공중날기',
};
/** One authority for human and computer commands. No fixture state mutation. */
export function createIntegratedPreview(
  options: { computerDelayMs?: number; seed?: number } = {},
) {
  let rulesPreset = normalizeRulesPreset();
  let context = createEconomyContext(
    kantoJohtoMap,
    economyProfileForPreset(rulesPreset),
  );
  const map = context.map;
  let participants = createInitialRoster('pokemon:0001');
  let session = 0,
    serial = 0;
  const fresh = (): IntegratedState => ({
    ...initializeEconomy(
      createGame(map, participants, {
        seed: options.seed ?? 42,
        legendary: {},
        rulesPreset,
        skills: true,
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
    if (intent.type === 'resolve-dice')
      return intent.adjustment === 0
        ? '원래 합계로 이동 · PP 무료'
        : `${skillForPokemon(state.players.find((p) => p.id === state.activePlayerId)!.pokemonId)?.name} · 합계 ${intent.adjustment > 0 ? '+1' : '-1'} · 1PP`;
    if (intent.type === 'use-skill')
      return `${intent.mode === 'breakthrough' ? '기술돌파' : skillForPokemon(state.players.find((p) => p.id === state.activePlayerId)!.pokemonId)?.name} · 1PP · ${a.quote?.total} ₽`;
    return `${title}${intent.type === 'sell-property' ? ` · ${tile}` : ''}${a.quote ? ` · ${intent.type === 'sell-property' ? '+' : ''}${a.quote.total} ₽` : ''}`;
  };
  const getView = (): GameView => {
    const set = legal();
    const choices = set.actions
      .filter((a) => a.intent.type !== 'fly')
      .map((a) => ({
        id: a.actionKey,
        label: label(a),
        ...(a.intent.type === 'sell-property'
          ? { group: 'asset-sale' as const }
          : {}),
      }));
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
        const laps =
          state.economy.completedLapsByPlayerId[state.activePlayerId]!;
        const locked = ([0, 1, 2, 3] as const).flatMap((stage) => {
          const quote = quoteConstruction(
            state,
            context,
            state.activePlayerId,
            tileId,
            stage,
          );
          const conditions = quote.reasons.filter((reason) =>
            ['stage-locked', 'final-revisit-required'].includes(reason),
          );
          if (
            !conditions.length ||
            quote.reasons.includes('not-owner') ||
            quote.reasons.includes('already-built')
          )
            return [];
          const name =
            stage === 3
              ? (kantoJohtoMap.tiles.find((tile) => tile.id === tileId)
                  ?.finalFacility?.nameKo ?? '최종시설')
              : ['캠프', '숍', '센터'][stage];
          return [
            `${name}: ${conditions
              .map((reason) =>
                reason === 'stage-locked'
                  ? `개인 ${context.profile.unlockLaps[stage]}주회 완료 필요 (현재 ${laps}주회)`
                  : '센터 건설 후 이 도시에 다시 도착해야 함',
              )
              .join(' · ')}`,
          ];
        });
        if (locked.length) description += ` 잠긴 건설 — ${locked.join(' / ')}`;
      }
    }
    const hudMeta = specialHudMeta(state);
    const trial = state.legendary?.players[state.activePlayerId]?.trial;
    if (trial)
      description = `${hudMeta[state.activePlayerId]?.trialDetails} · 탈출로프 ${state.legendary!.players[state.activePlayerId]!.ropes}개`;
    const definition = skillForPokemon(
      state.players.find((p) => p.id === state.activePlayerId)!.pokemonId,
    );
    const skillState = state.skills?.players[state.activePlayerId];
    const skillChoice = set.actions.find(
      (a) =>
        a.intent.type === 'use-skill' ||
        (a.intent.type === 'resolve-dice' && a.intent.adjustment !== 0),
    );
    const unavailableReason =
      skillUnavailableReason(state, state.activePlayerId) ??
      (state.economy.pendingDebt
        ? '부채 정산 중 사용 불가'
        : skillChoice
          ? undefined
          : '눈 공개·통행료·인수 선택 시 사용');
    const flights = set.actions.filter((a) => a.intent.type === 'fly');
    return {
      state,
      matchProgress: matchProgress(state, context)!,
      ...(definition && skillState
        ? {
            activeSkill: {
              definition,
              statusLabel: state.core.pendingDice
                ? `공개된 눈 ${state.core.pendingDice.values.join(' + ')} = ${state.core.pendingDice.values[0] + state.core.pendingDice.values[1]}`
                : skillState.prepared
                  ? '정산 중'
                  : skillState.usedThisBasicTurn
                    ? '이번 기본차례 사용 완료'
                    : skillState.pp
                      ? '사용 대기'
                      : 'PP 소진',
              cooldownLabel: `PP ${skillState.pp}/3 · 자동 충전 없음`,
              ...(unavailableReason ? { unavailableReason } : {}),
              ...(skillChoice && human()
                ? {
                    choice: {
                      id: skillChoice.actionKey,
                      selectionId: identity(),
                      label: label(skillChoice),
                    },
                  }
                : {}),
            },
          }
        : {}),
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
          'skill-activated',
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
    if (!hasPendingSettlement(next)) {
      const final = finalizeMatch(next, context, { actorId: command.playerId });
      next = clearFinishedSkills(final.state);
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
              {
                length: dice.distance ?? dice.values.reduce((a, b) => a + b, 0),
              },
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
      skillActivations: result.events.flatMap((e) =>
        e.type === 'skill-activated' ? [e.activation] : [],
      ),
      effects: result.presentations.map((e, i) => ({
        ...e,
        id: `${command.sessionId}:${command.commandId}:${i}`,
      })),
    });
    return true;
  }
  let projectedState: IntegratedState | undefined;
  let projected: ReturnType<typeof publicSnapshot> | undefined;
  const snapshot = () => {
    if (projectedState !== state) {
      projected = publicSnapshot(state, context, participants);
      projectedState = state;
    }
    return projected!;
  };
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
      const nextPreset = normalizeRulesPreset(setup.rulesPreset);
      const nextContext = createEconomyContext(
        kantoJohtoMap,
        economyProfileForPreset(nextPreset),
      );
      executor.cancel();
      cancelPresentation();
      session++;
      rulesPreset = nextPreset;
      context = nextContext;
      participants = setup.participants.map((p) => ({ ...p }));
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
