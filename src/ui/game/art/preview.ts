import '../isometric.css';
import './preview.css';
import { createProjectedBoard } from '../board';
import { createRegionalFacility } from './regional';
import { scenes } from './places';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto';
import { sampleState } from '../../../data/sample-map';
import { createInitialRoster } from '../setup';
import type { GameView } from '../adapter';
const root = document.querySelector<HTMLElement>('#art-preview')!;
root.innerHTML =
  '<h1>관동 · 성도 시설 도감</h1><p>아트 독립 프리뷰 · 실제 맵은 읽기 전용. 아래 모서리 갤러리는 연결 예시이며 규칙을 변경하지 않습니다.</p><p>픽셀 시설: Foxowl / TheDeadHeroAlistair / Game Freak / Vurtax / Acanthite Team / Palladium Forums · 지면: Kenney (CC0)</p><output aria-live="polite">도시를 클릭하거나 Tab → Enter로 선택하세요.</output>';
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
      position: map.tiles[[0, 8, 16, 24][i]!]!.id,
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
    p.textContent = ['🌿', '🔥', '💧', '⚡'][
      participants.findIndex((x) => x.pokemonId === id)
    ]!;
    return p;
  },
  openTile(id) {
    root.querySelector('output')!.textContent =
      `${map.tiles.find((t) => t.id === id)!.nameKo} · ${id}`;
  },
});
root.append(board);
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
