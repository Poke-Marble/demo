import type {
  GameAction,
  GameState,
  PlayerId,
  TileId,
} from "../../../game/contracts";
import { sampleMap, sampleState } from "../../../data/sample-map";
import type {
  GameUIAdapter,
  GameView,
  LobbyPlayer,
  UIUpdate,
} from "../adapter";

/** Scripted UI fixture, deliberately not a playable rule engine. */
export function createDemoAdapter(): GameUIAdapter {
  let state: GameState = sampleState;
  let prompt: GameView["prompt"];
  let step = 0;
  const listeners = new Set<(u: UIUpdate) => void>();
  const getView = (): GameView => ({
    state,
    map: sampleMap,
    mapName: "관동 · 성도 / UI 샘플 보드",
    ...(prompt ? { prompt } : {}),
    notice:
      "DEMO · 4칸 샘플 / 주사위 1 고정 / 구매·강화·정리·결과 화면 순차 시연. 실제 규칙이 아닙니다.",
    actions:
      state.phase === "playing" && !prompt
        ? [
            {
              id: "roll",
              label: "주사위 굴리기",
              action: { type: "roll-dice", playerId: state.activePlayerId },
            },
            {
              id: "end",
              label: "턴 마치기",
              action: { type: "end-turn", playerId: state.activePlayerId },
            },
          ]
        : [],
  });
  const emit = (
    events: UIUpdate["events"] = [],
    movement?: UIUpdate["movement"],
  ) => {
    for (const listener of listeners)
      listener({ view: getView(), events, ...(movement ? { movement } : {}) });
  };
  const offer = (kind: "purchase" | "upgrade" | "liquidate") => {
    prompt = {
      id: `demo-${step}`,
      kind,
      title: {
        purchase: "도시를 구매할까요?",
        upgrade: "시설을 강화할까요?",
        liquidate: "자산을 정리하세요",
      }[kind],
      description:
        "UI 시연용 선택입니다. 표시 금액과 처리 결과는 데모 어댑터가 제공합니다.",
      choices: [
        {
          id: "confirm",
          label: {
            purchase: "구매 · 200 ₽",
            upgrade: "강화 · 100 ₽",
            liquidate: "도시 매각 · 150 ₽",
          }[kind],
        },
        { id: "skip", label: "건너뛰기" },
      ],
    };
  };
  const dispatch = (action: GameAction) => {
    if (
      state.phase !== "playing" ||
      prompt ||
      action.playerId !== state.activePlayerId
    )
      return;
    if (action.type === "end-turn") {
      const index = state.players.findIndex((p) => p.id === action.playerId);
      state = {
        ...state,
        activePlayerId: state.players[(index + 1) % state.players.length]!.id,
        turnNumber: state.turnNumber + 1,
      };
      emit([{ type: "turn-ended", playerId: action.playerId }]);
      return;
    }
    if (action.type !== "roll-dice") return;
    const player = state.players.find((p) => p.id === action.playerId)!;
    const destination =
      sampleMap.tiles[
        (sampleMap.tiles.findIndex((t) => t.id === player.position) + 1) %
          sampleMap.tiles.length
      ]!.id;
    state = {
      ...state,
      players: state.players.map((p) =>
        p.id === player.id ? { ...p, position: destination } : p,
      ),
    };
    step++;
    if (step <= 3)
      offer((["purchase", "upgrade", "liquidate"] as const)[step - 1]!);
    else
      state = {
        ...state,
        phase: "finished",
        victory: { winnerId: player.id, reason: "last-player-standing" },
      };
    emit(
      [
        { type: "dice-rolled", playerId: player.id, values: [1] },
        {
          type: "player-moved",
          playerId: player.id,
          from: player.position,
          to: destination,
        },
      ],
      { playerId: player.id, path: [player.position, destination] },
    );
  };
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
    start(players: readonly LobbyPlayer[]) {
      state = {
        ...sampleState,
        phase: "playing",
        turnNumber: 1,
        players: players.map((p, i) => ({
          ...p,
          id: `player:${i + 1}` as PlayerId,
          position: sampleMap.tiles[0].id,
          balance: 1000,
          bankrupt: false,
        })),
      };
      step = 0;
      emit();
    },
    choose(id, choice) {
      if (id !== prompt?.id) return;
      const kind = prompt.kind;
      prompt = undefined;
      const tileId: TileId = sampleMap.tiles[1].id;
      if (choice === "confirm") {
        state = {
          ...state,
          holdings:
            kind === "liquidate"
              ? []
              : [
                  {
                    tileId,
                    ownerId: state.activePlayerId,
                    facilityLevel: kind === "upgrade" ? 1 : 0,
                  },
                ],
          players: state.players.map((p) =>
            p.id === state.activePlayerId
              ? {
                  ...p,
                  balance:
                    p.balance +
                    (kind === "purchase"
                      ? -200
                      : kind === "upgrade"
                        ? -100
                        : 150),
                }
              : p,
          ),
        };
      }
      emit();
    },
    restart() {
      state = sampleState;
      prompt = undefined;
      step = 0;
      emit();
    },
  };
}
