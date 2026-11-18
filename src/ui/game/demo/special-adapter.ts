import type { TileId } from '../../../game/contracts';
import type { GameUIAdapter, GameView, UIUpdate } from '../adapter';
import type { SpecialEventRequest } from '../events/contracts';
import { createDemoAdapter } from './adapter';
import { createInitialRoster } from '../setup';

export type SpecialScenario =
  'success' | 'failure' | 'rope' | 'fly' | 'fly-trial';

/** Isolated scripted fixture. No trial probability, economy, or AI is resolved here. */
export function createSpecialDemoAdapter() {
  const base = createDemoAdapter({ boardSize: 32, showcase: true });
  let view: GameView;
  let serial = 0;
  let session = 0;
  let flightTrial = false;
  let lastUpdate: UIUpdate | undefined;
  const listeners = new Set<(update: UIUpdate) => void>();
  function boot() {
    base.start({
      mapId: base.getView().map.id,
      participants: createInitialRoster('pokemon:0025'),
    });
    view = {
      ...base.getView(),
      actions: [],
      computer: { connected: false, status: '특수 연출 격리 데모' },
      notice: 'DEMO · 사람 1 + COMPUTER 3 · 고정 결과/경제·AI 미연결',
    };
  }
  boot();
  function publish(effects: readonly SpecialEventRequest[] = []) {
    lastUpdate = { view, events: [], effects };
    listeners.forEach((listener) => listener(lastUpdate!));
  }
  const trial = (
    legendary: 'lugia' | 'ho-oh',
    tileId: TileId,
  ): SpecialEventRequest => ({
    id: `special-demo:${session}:${++serial}`,
    type: 'trial-intro',
    legendary,
    playerId: view.state.activePlayerId,
    tileId,
  });
  const adapter: GameUIAdapter = {
    demo: true,
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dispatch() {},
    start() {},
    choose() {},
    restart() {
      session++;
      const setup = {
        ...view,
        state: { ...view.state, phase: 'setup' as const },
      };
      listeners.forEach((listener) => listener({ view: setup, events: [] }));
      boot();
      publish();
    },
    selectFlightDestination(id, tileId) {
      const selection = view.flightSelection;
      if (!selection || selection.id !== id) return;
      if (tileId === null) {
        if (!selection.cancellable) return;
        const { flightSelection: _selection, ...rest } = view;
        void _selection;
        view = { ...rest, notice: 'DEMO · 목적지 선택 취소 · 이동 없음' };
        publish();
        return;
      }
      if (
        !selection.destinations.some(
          (destination) => destination.tileId === tileId,
        )
      )
        return;
      const from = view.state.players[0]!.position;
      const { flightSelection: _selection, ...rest } = view;
      void _selection;
      view = {
        ...rest,
        state: {
          ...view.state,
          players: view.state.players.map((p, i) =>
            i === 0 ? { ...p, position: tileId } : p,
          ),
        },
        notice: 'DEMO · 착지 확정 / 출발 보상 계산 없음',
      };
      const fly: SpecialEventRequest = {
        id: `special-demo:${session}:${++serial}`,
        type: 'fly',
        playerId: selection.playerId,
        from,
        to: tileId,
      };
      publish(flightTrial ? [fly, trial('ho-oh', tileId)] : [fly]);
    },
  };
  return {
    adapter,
    replay() {
      if (lastUpdate) listeners.forEach((listener) => listener(lastUpdate!));
    },
    scenario(scenario: SpecialScenario) {
      if (view.flightSelection) return;
      if (scenario === 'fly' || scenario === 'fly-trial') {
        flightTrial = scenario === 'fly-trial';
        view = {
          ...view,
          flightSelection: {
            id: `flight-demo:${session}:${++serial}`,
            playerId: view.state.activePlayerId,
            cancellable: true,
            destinations: [
              view.map.tiles[8]!,
              view.map.tiles[16]!,
              view.map.tiles[24]!,
            ].map((tile) => ({
              tileId: tile.id,
              label: tile.nameKo,
              description: flightTrial
                ? 'DEMO · 착지 후 칠색조 시험 요청'
                : 'DEMO · 규칙 제공 목적지 예시',
            })),
          },
        };
        publish();
        return;
      }
      view = {
        ...view,
        notice: {
          success:
            'DEMO · 시험 성공 확정 · 다음 차례 정상 이동 / 가호 수치 미연결',
          failure: 'DEMO · 시험 실패 확정 · 현재 칸 체류 / 자기 차례 재도전',
          rope: 'DEMO · 탈출로프 확정 · 보상 없이 종료 / 현재 차례 정상 이동',
        }[scenario],
      };
      publish([
        trial(
          scenario === 'failure' ? 'ho-oh' : 'lugia',
          view.map.tiles[8]!.id,
        ),
      ]);
    },
  };
}
