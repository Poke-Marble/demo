import type {
  GameAction,
  GameState,
  PlayerId,
  TileId,
} from '../../../game/contracts';
import { sampleMap, sampleState } from '../../../data/sample-map';
import type {
  GameSetup,
  GameUIAdapter,
  GameView,
  SetupParticipant,
  UIUpdate,
} from '../adapter';
import { createInitialRoster } from '../setup';
import { projectionMap } from './projection-map';

/** Scripted UI fixture. Computer decisions and economics are NOT real AI/rules. */
export function createDemoAdapter(
  options: {
    computerDelayMs?: number;
    boardSize?: 4 | 32;
    showcase?: boolean;
    movementSteps?: number;
  } = {},
): GameUIAdapter {
  const map = options.boardSize === 32 ? projectionMap : sampleMap;
  let state: GameState = sampleState;
  let participants: readonly SetupParticipant[] =
    createInitialRoster('pokemon:0001');
  let prompt: GameView['prompt'];
  let step = 0,
    rolled = false;
  let computerStatus = '차례 진행 중…';
  const listeners = new Set<(u: UIUpdate) => void>();
  const getView = (): GameView => ({
    state,
    map,
    mapName: '관동 · 성도',
    participants,
    computer: { connected: true, status: computerStatus },
    ...(prompt ? { prompt } : {}),
    actions:
      state.phase === 'playing' && !prompt
        ? [
            {
              id: 'roll',
              label: '주사위 굴리기',
              disabled: rolled,
              action: { type: 'roll-dice', playerId: state.activePlayerId },
            },
            {
              id: 'end',
              label: '턴 마치기',
              disabled: !rolled,
              action: { type: 'end-turn', playerId: state.activePlayerId },
            },
          ]
        : [],
  });
  const emit = (
    events: UIUpdate['events'] = [],
    movement?: UIUpdate['movement'],
  ) => {
    for (const listener of listeners)
      listener({ view: getView(), events, ...(movement ? { movement } : {}) });
  };
  function movePlayer(playerId: PlayerId) {
    const player = state.players.find((p) => p.id === playerId)!;
    const startIndex = map.tiles.findIndex((t) => t.id === player.position);
    const steps = Math.max(1, Math.min(8, options.movementSteps ?? 1));
    const path = Array.from(
      { length: steps },
      (_, i) => map.tiles[(startIndex + i + 1) % map.tiles.length]!.id,
    );
    const destination = path.at(-1)!;
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === playerId ? { ...p, position: destination } : p,
      ),
    };
    return {
      events: [
        { type: 'dice-rolled', playerId, values: [steps] },
        {
          type: 'player-moved',
          playerId,
          from: player.position,
          to: destination,
        },
      ] as UIUpdate['events'],
      movement: { playerId, path: [player.position, ...path] },
    };
  }
  function endTurn(playerId: PlayerId) {
    const index = state.players.findIndex((p) => p.id === playerId);
    state = {
      ...state,
      activePlayerId: state.players[(index + 1) % state.players.length]!.id,
      turnNumber: state.turnNumber + 1,
    };
    rolled = false;
    computerStatus = '준비 중…';
    emit([{ type: 'turn-ended', playerId }]);
  }
  function offer(kind: 'purchase' | 'upgrade' | 'liquidate') {
    prompt = {
      id: `demo-${step}`,
      kind,
      title: {
        purchase: '도시를 구매할까요?',
        upgrade: '시설을 강화할까요?',
        liquidate: '자산을 정리하세요',
      }[kind],
      description:
        '시연용 선택입니다. 실제 게임에서는 규칙 엔진이 선택지와 금액을 제공합니다.',
      choices: [
        {
          id: 'confirm',
          label: {
            purchase: '구매 · 200 ₽',
            upgrade: '강화 · 100 ₽',
            liquidate: '도시 매각 · 150 ₽',
          }[kind],
        },
        { id: 'skip', label: '건너뛰기' },
      ],
    };
  }
  function dispatch(action: GameAction) {
    if (
      state.phase !== 'playing' ||
      prompt ||
      action.playerId !== state.activePlayerId ||
      participants.find((p) => p.id === action.playerId)?.controller !== 'human'
    )
      return;
    if (action.type === 'end-turn' && rolled) {
      endTurn(action.playerId);
      return;
    }
    if (action.type !== 'roll-dice' || rolled) return;
    rolled = true;
    step++;
    const result = movePlayer(action.playerId);
    if (step <= 3)
      offer((['purchase', 'upgrade', 'liquidate'] as const)[step - 1]!);
    else {
      state = {
        ...state,
        phase: 'finished',
        victory: { winnerId: action.playerId, reason: 'last-player-standing' },
      };
    }
    emit(result.events, result.movement);
  }
  function delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, ms);
      signal.addEventListener('abort', done, { once: true });
    });
  }
  return {
    demo: true,
    getView,
    dispatch,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start(setup: GameSetup) {
      if (
        setup.mapId !== map.id ||
        setup.participants.length !== 4 ||
        setup.participants.filter((p) => p.controller === 'human').length !==
          1 ||
        new Set(setup.participants.map((p) => p.pokemonId)).size !== 4
      )
        throw new Error('데모 초기 배정을 확인하세요.');
      participants = setup.participants.map((p) => ({ ...p }));
      state = {
        ...sampleState,
        phase: 'playing',
        turnNumber: 1,
        mapId: map.id,
        holdings: options.showcase
          ? [2, 6, 12, 21, 27].map((i, n) => ({
              tileId: map.tiles[i % map.tiles.length]!.id,
              ownerId: participants[n % 4]!.id,
              facilityLevel: (n % 3) + 1,
            }))
          : [],
        activePlayerId: participants.find((p) => p.controller === 'human')!.id,
        players: participants.map(({ id, name, pokemonId }, index) => ({
          id,
          name,
          pokemonId,
          position:
            map.tiles[
              options.showcase ? [0, 7, 16, 24][index]! % map.tiles.length : 0
            ]!.id,
          balance: 1000,
          bankrupt: false,
        })),
      };
      step = 0;
      rolled = false;
      prompt = undefined;
      emit();
    },
    choose(id, choice) {
      if (
        id !== prompt?.id ||
        !prompt.choices.some((c) => c.id === choice) ||
        participants.find((p) => p.id === state.activePlayerId)?.controller !==
          'human'
      )
        return;
      const kind = prompt.kind;
      prompt = undefined;
      const tileId: TileId = map.tiles[1]!.id;
      if (choice === 'confirm')
        state = {
          ...state,
          holdings:
            kind === 'liquidate'
              ? []
              : [
                  {
                    tileId,
                    ownerId: state.activePlayerId,
                    facilityLevel: kind === 'upgrade' ? 1 : 0,
                  },
                ],
          players: state.players.map((p) =>
            p.id === state.activePlayerId
              ? {
                  ...p,
                  balance:
                    p.balance +
                    (kind === 'purchase'
                      ? -200
                      : kind === 'upgrade'
                        ? -100
                        : 150),
                }
              : p,
          ),
        };
      emit();
    },
    async runComputerTurn(playerId, signal) {
      const valid = () =>
        !signal.aborted &&
        state.phase === 'playing' &&
        state.activePlayerId === playerId &&
        participants.find((p) => p.id === playerId)?.controller === 'computer';
      if (!valid()) return;
      computerStatus = '주사위 준비 중…';
      emit();
      await delay(options.computerDelayMs ?? 600, signal);
      if (!valid()) return;
      computerStatus = '이동 중…';
      const result = movePlayer(playerId);
      emit(result.events, result.movement);
      await delay(options.computerDelayMs ?? 650, signal);
      if (!valid()) return;
      endTurn(playerId);
    },
    restart() {
      state = sampleState;
      prompt = undefined;
      step = 0;
      rolled = false;
      emit();
    },
  };
}
