import { createPhaserBoard } from './index';
import { createProjectedBoard } from '../board';
import { presentationMap } from '../integration/map';
import { sampleState } from '../../../data/sample-map';
import { createInitialRoster } from '../setup';
import type { GameView } from '../adapter';
import type { TileId } from '../../../game/contracts';
import {
  constructionStages,
  type ConstructionStage,
} from '../art/construction';
import { findSprite } from '../../../assets/sprites';
import '../isometric.css';
import './preview.css';

const root = document.querySelector<HTMLElement>('#phaser-preview')!;
const title = document.createElement('h1');
title.textContent = '관동 · 성도 / Phaser 보드';
const description = document.createElement('p');
description.textContent =
  '같은 32칸 맵 · 규칙 없는 시각 검증 · HTML 메뉴/HUD 연결용 독립 렌더러';
const controls = document.createElement('section');
controls.className = 'preview-controls';
const status = document.createElement('output');
status.setAttribute('aria-live', 'polite');
status.textContent = '스타팅 네 마리 · 출발칸';
const host = document.createElement('div');
root.append(title, description, controls, status, host);
const participants = createInitialRoster('pokemon:0001');
let view: GameView = {
  map: presentationMap,
  mapName: '관동 · 성도',
  participants,
  computer: { connected: false, status: '렌더러 프리뷰' },
  actions: [],
  state: {
    ...sampleState,
    mapId: presentationMap.id,
    phase: 'playing',
    players: participants.map((p) => ({
      ...p,
      position: presentationMap.tiles[0]!.id,
      balance: 1000,
      bankrupt: false,
    })),
    holdings: [],
  },
};
let step = 0;
let counter = 0;
const legacy = new URLSearchParams(location.search).has('before');
const renderer = createPhaserBoard({
  view,
  onSelect(id) {
    status.textContent = `선택: ${view.map.tiles.find((t) => t.id === id)!.nameKo} · ${id}`;
  },
  ...(new URLSearchParams(location.search).has('canvas')
    ? { renderer: 'canvas' as const }
    : {}),
});
if (!legacy) renderer.mount(host);
function oldBoard() {
  host.className = 'legacy-preview';
  host.replaceChildren(
    createProjectedBoard({
      view,
      dice: '⚄',
      animating: false,
      positions: new Map(),
      from: new Map(),
      openTile(id) {
        status.textContent = id;
      },
      sprite(id) {
        const node = document.createElement('span');
        const { animation: a, url } = findSprite(id, 'Idle');
        if (a && url) {
          node.style.backgroundImage = `url("${url}")`;
          node.style.width = `${a.frameWidth}px`;
          node.style.height = `${a.frameHeight}px`;
          node.style.imageRendering = 'pixelated';
        }
        return node;
      },
    }),
  );
}
async function sync() {
  if (legacy) oldBoard();
  else await renderer.update(view);
}
function button(label: string, run: () => void | Promise<void>) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.onclick = () => {
    void Promise.resolve(run()).catch((error) => {
      status.textContent = String(error);
    });
  };
  controls.append(b);
  return b;
}
for (const stage of constructionStages)
  button(stage, async () => {
    const level: Record<ConstructionStage, number> = {
      unowned: 0,
      camp: 0,
      shop: 1,
      center: 2,
      final: 3,
    };
    view = {
      ...view,
      state: {
        ...view.state,
        holdings:
          stage === 'unowned'
            ? []
            : view.map.tiles
                .filter((t) => t.kind === 'city')
                .map((t, i) => ({
                  tileId: t.id,
                  ownerId: participants[i % 4]!.id,
                  facilityLevel: level[stage],
                })),
      },
    };
    await sync();
    status.textContent = `건설 단계: ${stage}`;
  });
button('소유 교체', async () => {
  counter++;
  view = {
    ...view,
    state: {
      ...view.state,
      holdings: view.state.holdings.map((h, i) => ({
        ...h,
        ownerId: participants[(i + counter) % 4]!.id,
      })),
    },
  };
  await sync();
  status.textContent = '소유 타입·문양 교체 완료';
});
button('8칸 이동', async () => {
  const path = view.map.tiles.slice(step + 1, step + 9).map((t) => t.id);
  if (path.length < 8)
    path.push(...view.map.tiles.slice(0, 8 - path.length).map((t) => t.id));
  step = (step + 8) % 32;
  view = {
    ...view,
    state: {
      ...view.state,
      players: view.state.players.map((p, i) =>
        i === 0 ? { ...p, position: path.at(-1)! } : p,
      ),
    },
  };
  if (legacy) oldBoard();
  else {
    const result = await renderer.present({
      id: `preview:${++counter}`,
      view,
      events: [],
      movement: { playerId: participants[0]!.id, path },
    });
    status.textContent = `칸별 이동: ${result.status}`;
  }
});
button('네 마리 겹침', async () => {
  view = {
    ...view,
    state: {
      ...view.state,
      players: view.state.players.map((p) => ({
        ...p,
        position: view.map.tiles[9]!.id,
      })),
    },
  };
  step = 9;
  await sync();
  status.textContent = '동일칸 네 마리 · 좌석별 발 위치';
});
button('비행', async () => {
  const from = view.state.players[0]!.position;
  const to = view.map.tiles[24]!.id;
  view = {
    ...view,
    state: {
      ...view.state,
      players: view.state.players.map((p, i) =>
        i === 0 ? { ...p, position: to } : p,
      ),
    },
  };
  await renderer.present({
    id: `preview:${++counter}`,
    view,
    events: [],
    movement: { playerId: participants[0]!.id, path: [] },
    effects: [
      {
        id: `fly:${counter}`,
        type: 'fly',
        playerId: participants[0]!.id,
        from,
        to,
      },
    ],
  });
  status.textContent = '비행 표현 완료';
});
button('확정 건설 연출', async () => {
  const tileId = view.map.tiles.find((t) => t.kind === 'city')!.id;
  await renderer.present({
    id: `preview:${++counter}`,
    view,
    events: [{ type: 'facility-upgraded', tileId, level: 3 }],
  });
});
button('스킵', async () => {
  await renderer.skip();
  status.textContent = '스킵 · 최종 스냅샷 정렬';
});
let inputLock = false;
button('입력 잠금', () => {
  inputLock = !inputLock;
  renderer.setInputLocked(inputLock);
  status.textContent = `입력 잠금: ${inputLock}`;
});
button('390 / 전체', () => {
  root.classList.toggle('narrow');
  renderer.resize();
});
button('파괴', async () => {
  await renderer.destroy();
  status.textContent = 'Game · canvas · listener 정리 완료';
});
const picker = document.createElement('select');
picker.setAttribute('aria-label', '선택할 칸');
for (const t of view.map.tiles) {
  const o = document.createElement('option');
  o.value = t.id;
  o.textContent = t.nameKo;
  picker.append(o);
}
controls.append(picker);
button('선택 칸으로 이동', async () => {
  const to = picker.value as TileId;
  view = {
    ...view,
    state: {
      ...view.state,
      players: view.state.players.map((p, i) =>
        i === 0 ? { ...p, position: to } : p,
      ),
    },
  };
  await renderer.present({
    view,
    events: [],
    movement: { playerId: participants[0]!.id, path: [to] },
  });
});
await sync();
