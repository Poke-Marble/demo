import { kantoJohtoMap } from '../../../data/maps/kanto-johto.ts';
import {
  createGame,
  dispatch,
  type CoreState,
  type Transition,
} from '../../../game/core/index.ts';
import {
  enterSpecial,
  legalFlyDestinations,
  type LegendaryAction,
} from '../../../game/legendary.ts';
import type { GameAction, GameEvent, TileId } from '../../../game/contracts';
import type { GameSetup, GameUIAdapter, GameView, UIUpdate } from '../adapter';
import { createInitialRoster } from '../setup.ts';
import { presentationMap } from './map.ts';

/** Real movement/trials; construction remains an explicitly labelled visual fixture. */
export function createIntegratedPreview(
  options: { computerDelayMs?: number; seed?: number } = {},
) {
  const map = kantoJohtoMap;
  let participants = createInitialRoster('pokemon:0001');
  const fresh = () =>
    createGame(map, participants, { seed: options.seed ?? 42, legendary: {} });
  let state: CoreState = { ...fresh(), phase: 'setup' };
  let session = 0;
  let serial = 0;
  let constructionOffered = '';
  let notice = '';
  const listeners = new Set<(update: UIUpdate) => void>();
  const human = () =>
    participants.find((p) => p.id === state.activePlayerId)?.controller ===
    'human';
  const active = () =>
    state.players.find((p) => p.id === state.activePlayerId)!;
  const promptId = () => `${session}:${state.turnNumber}:${active().position}`;
  const currentTile = () => map.tiles.find((t) => t.id === active().position)!;
  const getView = (): GameView => {
    const ext = state.legendary!;
    const trial = ext.players[state.activePlayerId]!.trial;
    const pendingFlight = ext.pendingFly?.playerId === state.activePlayerId;
    let prompt: GameView['prompt'];
    const playing = state.phase === 'playing';
    const actions: GameView['actions'] =
      playing && !trial && !pendingFlight
        ? [
            {
              id: 'roll',
              label: '주사위 굴리기',
              disabled: state.core.turnStage !== 'awaiting-roll',
              action: { type: 'roll-dice', playerId: state.activePlayerId },
            },
            {
              id: 'end',
              label: '턴 마치기',
              disabled: state.core.turnStage !== 'awaiting-end',
              action: { type: 'end-turn', playerId: state.activePlayerId },
            },
          ]
        : [];
    if (playing && trial && human()) {
      const attempted = trial.lastAttemptTurn === state.turnNumber;
      prompt = {
        id: promptId(),
        kind: 'upgrade',
        title: trial.legendary === 'lugia' ? '루기아의 시험' : '칠색조의 시험',
        description: attempted
          ? '이번 도전은 실패했습니다.'
          : `도전 ${trial.attempts + 1}회차`,
        choices: [
          {
            id: attempted ? 'end' : 'attempt',
            label: attempted ? '다음 차례에 재도전' : '시험에 도전',
          },
          ...(ext.players[state.activePlayerId]!.ropes > 0
            ? [{ id: 'rope', label: '동굴탈출로프 사용' }]
            : []),
        ],
      };
    } else if (
      playing &&
      human() &&
      !pendingFlight &&
      state.core.turnStage === 'awaiting-end' &&
      currentTile().kind === 'city' &&
      constructionOffered !== promptId()
    ) {
      const holding = state.holdings.find(
        (h) => h.tileId === active().position,
      );
      if (
        !holding ||
        (holding.ownerId === active().id && holding.facilityLevel < 3)
      ) {
        const labels = [
          '캠프 세우기',
          '숍 건설',
          '센터 건설',
          '대표 시설 완성',
        ];
        const next = holding ? holding.facilityLevel + 1 : 0;
        prompt = {
          id: promptId(),
          kind: holding ? 'upgrade' : 'purchase',
          title: currentTile().nameKo,
          description: '건물 표시 시연 · 비용·해금·통행료는 아직 미연결입니다.',
          choices: [
            { id: 'construct', label: labels[next]! },
            { id: 'skip', label: '건너뛰기' },
          ],
        };
      }
    }
    return {
      state,
      map: presentationMap,
      mapName: '여행 지도',
      participants,
      computer: { connected: true, status: '기본 자동 진행' },
      actions,
      ...(notice ? { notice } : {}),
      ...(prompt ? { prompt } : {}),
      ...(playing && pendingFlight && human()
        ? {
            flightSelection: {
              id: `flight:${session}:${state.turnNumber}`,
              playerId: state.activePlayerId,
              cancellable: false,
              destinations: legalFlyDestinations(state, map).map((tileId) => ({
                tileId,
                label: map.tiles.find((t) => t.id === tileId)!.nameKo,
              })),
            },
          }
        : {}),
    };
  };
  function publish(extra: Partial<Omit<UIUpdate, 'view' | 'id'>> = {}) {
    const update: UIUpdate = {
      id: `integrated:${session}:${++serial}`,
      view: getView(),
      events: [],
      ...extra,
    };
    listeners.forEach((listener) => listener(update));
  }
  function apply(action: GameAction | LegendaryAction) {
    const before = state;
    const result: Transition = dispatch(state, map, action);
    if (!result.ok) return false;
    state = result.state;
    const events = result.events.filter(
      (e): e is GameEvent =>
        ![
          'trial-resolved',
          'rope-used',
          'start-rewarded',
          'tile-landed',
          'turn-started',
        ].includes(e.type),
    );
    const resolved = result.events.find((e) => e.type === 'trial-resolved');
    const emotionCues: NonNullable<UIUpdate['emotionCues']> =
      resolved?.type === 'trial-resolved'
        ? [
            {
              id: `trial:${session}:${serial + 1}`,
              playerId: resolved.playerId,
              reaction: resolved.success ? 'joy' : 'distress',
            },
          ]
        : [];
    if (resolved?.type === 'trial-resolved')
      notice = resolved.success
        ? '시험 통과! 가호를 얻었습니다.'
        : '시험 실패. 다음 차례에 다시 도전할 수 있습니다.';
    if (action.type === 'use-escape-rope')
      notice = '탈출했습니다. 주사위를 굴려 이동하세요.';
    const dice = result.events.find((e) => e.type === 'dice-rolled');
    let movement: UIUpdate['movement'];
    if (dice?.type === 'dice-rolled') {
      const start = map.tiles.findIndex(
        (t) =>
          t.id ===
          before.players.find((p) => p.id === action.playerId)!.position,
      );
      movement = {
        playerId: action.playerId,
        path: Array.from(
          { length: dice.values.reduce((a, b) => a + b, 0) },
          (_, i) => map.tiles[(start + i + 1) % map.tiles.length]!.id,
        ),
      };
    }
    publish({
      events,
      emotionCues,
      ...(movement ? { movement } : {}),
      effects: (result.presentations ?? []).map((effect, i) => ({
        ...effect,
        id: `effect:${session}:${serial + 1}:${i}`,
      })),
    });
    return true;
  }
  const adapter: GameUIAdapter = {
    demo: true,
    demoLabel: '통합 DEMO',
    getView,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
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
      participants = setup.participants.map((p) => ({ ...p }));
      session++;
      constructionOffered = '';
      notice = '';
      state = fresh();
      publish();
    },
    dispatch(action) {
      if (human() && !getView().prompt) apply(action);
    },
    choose(id, choice) {
      const prompt = getView().prompt;
      if (
        !human() ||
        !prompt ||
        id !== prompt.id ||
        !prompt.choices.some((c) => c.id === choice)
      )
        return;
      const playerId = state.activePlayerId;
      if (choice === 'attempt') apply({ type: 'attempt-trial', playerId });
      else if (choice === 'rope') apply({ type: 'use-escape-rope', playerId });
      else if (choice === 'end') apply({ type: 'end-turn', playerId });
      else {
        constructionOffered = id;
        const tileId = active().position;
        if (choice === 'construct') {
          const existing = state.holdings.find((h) => h.tileId === tileId);
          const level = existing ? existing.facilityLevel + 1 : 0;
          state = {
            ...state,
            holdings: [
              ...state.holdings.filter((h) => h.tileId !== tileId),
              { tileId, ownerId: playerId, facilityLevel: level },
            ],
          };
          publish({
            events: existing
              ? [{ type: 'facility-upgraded', tileId, level }]
              : [{ type: 'city-acquired', playerId, tileId }],
          });
        } else publish();
      }
    },
    selectFlightDestination(id, tileId) {
      if (!human() || !tileId || id !== getView().flightSelection?.id) return;
      apply({ type: 'fly', playerId: state.activePlayerId, to: tileId });
    },
    async runComputerTurn(playerId, signal) {
      const generation = session;
      const valid = () =>
        !signal.aborted &&
        generation === session &&
        state.phase === 'playing' &&
        state.activePlayerId === playerId &&
        !human();
      const pause = () =>
        new Promise<void>((resolve) => {
          if (signal.aborted) return resolve();
          const done = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
          };
          const timer = setTimeout(done, options.computerDelayMs ?? 3100);
          signal.addEventListener('abort', done, { once: true });
        });
      await pause();
      if (!valid()) return;
      if (state.legendary!.players[playerId]!.trial)
        apply({ type: 'attempt-trial', playerId });
      else apply({ type: 'roll-dice', playerId });
      await pause();
      if (!valid()) return;
      if (state.legendary!.pendingFly) {
        const to = legalFlyDestinations(state, map)[0];
        if (to) apply({ type: 'fly', playerId, to });
        await pause();
      }
      if (!valid()) return;
      const trial = state.legendary!.players[playerId]!.trial;
      if (trial && trial.lastAttemptTurn !== state.turnNumber) {
        apply({ type: 'attempt-trial', playerId });
        await pause();
      }
      if (valid()) apply({ type: 'end-turn', playerId });
    },
    restart() {
      session++;
      state = { ...fresh(), phase: 'setup' };
      notice = '';
      constructionOffered = '';
      publish();
    },
  };
  // Explicit preview controls; never reachable through normal gameplay actions.
  function arrive(tileId: TileId) {
    if (state.phase !== 'playing') return;
    const tile = map.tiles.find((t) => t.id === tileId);
    if (!tile) return;
    const person = participants.find((p) => p.controller === 'human')!;
    const base = fresh();
    state = {
      ...base,
      holdings: state.holdings,
      activePlayerId: person.id,
      core: { ...base.core, turnStage: 'awaiting-end' },
      players: base.players.map((p) =>
        p.id === person.id ? { ...p, position: tileId } : p,
      ),
    };
    const entered = enterSpecial(state, tile);
    state = entered.state;
    constructionOffered = '';
    notice = '';
    publish({
      effects: entered.presentations.map((effect, i) => ({
        ...effect,
        id: `preview:${session}:${serial + 1}:${i}`,
      })),
    });
  }
  function showBuildings(level: number | null) {
    if (
      state.phase !== 'playing' ||
      (level !== null && (!Number.isInteger(level) || level < 0 || level > 3))
    )
      return;
    state = {
      ...state,
      holdings:
        level === null
          ? []
          : map.tiles
              .filter((t) => t.kind === 'city')
              .map((tile, i) => ({
                tileId: tile.id,
                ownerId: participants[i % 4]!.id,
                facilityLevel: level,
              })),
    };
    constructionOffered = promptId();
    publish();
  }
  return { adapter, arrive, showBuildings };
}
