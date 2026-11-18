import '../isometric.css';
import './preview.css';
import { createProjectedBoard } from '../board';
import { createRegionalFacility } from './regional';
import { scenes } from './places';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto';
import { sampleState } from '../../../data/sample-map';
import { createInitialRoster } from '../setup';
import type { GameView } from '../adapter';
import { findSprite } from '../../../assets/sprites';
const root = document.querySelector<HTMLElement>('#art-preview')!;
root.innerHTML =
  '<output aria-live="polite">도시를 클릭하거나 Tab → Enter로 선택하세요.</output>';
const participants = createInitialRoster('pokemon:0001');
const cornerPreview = new URLSearchParams(location.search).has('corners');
const corners = new Map([
  [
    8,
    {
      id: 'tile:art:lugia-trial' as const,

      nameKo: 'LUGIA / ART PREVIEW',
    },
  ],
  [
    16,
    {
      id: 'tile:art:ho-oh-trial' as const,

      nameKo: 'HO-OH / ART PREVIEW',
    },
  ],
  [24, { id: 'tile:art:fly' as const, nameKo: 'FLY / ART PREVIEW' }],
]);
const map = cornerPreview
  ? {
      ...kantoJohtoMap,
      tiles: kantoJohtoMap.tiles.map((tile, i) => ({
        ...tile,
        ...corners.get(i),
      })),
    }
  : kantoJohtoMap;
const nav = document.createElement('p');
nav.innerHTML =
  '<a href="?">Actual map</a> / <a href="?corners=1">0/8/16/24 corner art preview</a>';
root.append(nav);
const view: GameView = {
  map,
  mapName: '관동 · 성도',
  participants,
  computer: { connected: false, status: '정적 아트 프리뷰' },
  actions: [],
  state: {
    ...sampleState,
    mapId: kantoJohtoMap.id,
    phase: 'playing',
    turnNumber: 1,
    players: participants.map((p, i) => ({
      ...p,
      position:
        map.tiles[
          new URLSearchParams(location.search).has('overlap')
            ? 9
            : [0, 8, 16, 24][i]!
        ]!.id,
      balance: 1000,
      bankrupt: false,
    })),
    holdings: [],
  },
};
const board = createProjectedBoard({
  view,
  dice: '⚄',
  animating: false,
  positions: new Map(),
  from: new Map(),
  sprite(id) {
    const p = document.createElement('span');
    const { animation, url } = findSprite(id, 'Idle');
    if (animation && url) {
      p.style.backgroundImage = `url("${url}")`;
      p.style.width = `${animation.frameWidth}px`;
      p.style.height = `${animation.frameHeight}px`;
      p.style.imageRendering = 'pixelated';
    } else p.textContent = '●';
    return p;
  },
  openTile(id) {
    root.querySelector('output')!.textContent =
      `${map.tiles.find((t) => t.id === id)!.nameKo} · ${id}`;
  },
});
const viewport = document.createElement('div');
viewport.className = 'pm-board-area';
viewport.setAttribute(
  'aria-label',
  '보드 영역 · 작은 화면에서는 가로로 스크롤',
);
viewport.append(board);
root.append(viewport);
if (viewport.clientWidth < board.clientWidth)
  viewport.scrollLeft = (board.clientWidth - viewport.clientWidth) / 2;
const gallery = document.createElement('section');
gallery.className = 'art-gallery';
gallery.setAttribute('aria-label', '장소별 시설 및 모서리 연결 예시');
for (const scene of scenes) {
  const card = document.createElement('figure');
  card.append(
    createRegionalFacility(
      { id: 'tile:preview:scene', kind: 'city', visualScene: scene },
      0,
    ),
  );
  const caption = document.createElement('figcaption');
  caption.textContent = scene;
  card.append(caption);
  gallery.append(card);
}
root.append(gallery);
