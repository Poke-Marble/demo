import type { TileId, PlayerId } from '../../../game/contracts';
import type { PortraitReaction } from '../portraits/emotions';
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
      computer: { connected: false, status: '대기 중' },
    };
  }
  boot();
  function publish(
    effects: readonly SpecialEventRequest[] = [],
    emotionCues: UIUpdate['emotionCues'] = [],
    events: UIUpdate['events'] = [],
  ) {
    lastUpdate = {
      id: `special-demo:update:${session}:${++serial}`,
      view,
      events,
      effects,
      emotionCues,
    };
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
        view = { ...rest, notice: '비행 취소' };
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
        notice: '착지 완료',
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
    emotion(reaction: PortraitReaction, playerId?: PlayerId) {
      publish(
        [],
        view.state.players
          .filter((player) => !playerId || player.id === playerId)
          .map((player) => ({
            id: `demo:emotion:${session}:${++serial}`,
            playerId: player.id,
            reaction,
          })),
      );
    },
    toll() {
      publish(
        [],
        [],
        [
          {
            type: 'toll-paid',
            fromPlayerId: view.state.players[0]!.id,
            toPlayerId: view.state.players[1]!.id,
            amount: 100,
          },
        ],
      );
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
              ...(flightTrial ? { description: '착지 후 칠색조 시험' } : {}),
            })),
          },
        };
        publish();
        return;
      }
      view = {
        ...view,
        notice: {
          success: '시험 성공 확정 · 다음 차례 이동',
          failure: '시험 실패 확정 · 체류 후 재도전',
          rope: '탈출로프 · 보상 없이 종료 · 현재 차례 이동',
        }[scenario],
      };
      publish(
        [
          trial(
            scenario === 'failure' ? 'ho-oh' : 'lugia',
            view.map.tiles[8]!.id,
          ),
        ],
        scenario === 'rope'
          ? []
          : [
              {
                id: `demo:trial-outcome:${session}:${++serial}`,
                playerId: view.state.activePlayerId,
                reaction: scenario === 'success' ? 'joy' : 'distress',
              },
            ],
      );
    },
  };
}
