import '../isometric.css';
import './preview.css';
import { createProjectedBoard } from '../board';
import { createConstructionArt } from './buildings';
import {
  constructionStages,
  ownerColors,
  type ConstructionStage,
  type ConstructionVisual,
} from './construction';
import type { TileId } from '../../../game/contracts';
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
      kind: 'landmark' as const,

      nameKo: 'LUGIA / ART PREVIEW',
    },
  ],
  [
    16,
    {
      id: 'tile:art:ho-oh-trial' as const,
      kind: 'landmark' as const,

      nameKo: 'HO-OH / ART PREVIEW',
    },
  ],
  [
    24,
    {
      id: 'tile:art:fly' as const,
      kind: 'landmark' as const,
      nameKo: 'FLY / ART PREVIEW',
    },
  ],
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
const stageNames: Record<ConstructionStage, string> = {
  unowned: '무소유',
  camp: '캠프 · 지역 확보',
  shop: '숍',
  center: '센터',
  final: '도시 대표시설',
};
const requested = new URLSearchParams(location.search).get('stage');
let stage: ConstructionStage = constructionStages.includes(
  requested as ConstructionStage,
)
  ? (requested as ConstructionStage)
  : 'unowned';
const makeState = () =>
  new Map(
    map.tiles
      .filter((t) => t.kind === 'city')
      .map((t, i) => [t.id, { stage, ownerColor: ownerColors[i % 4]! }]),
  );
let construction: ReadonlyMap<TileId, ConstructionVisual> = makeState();
const controls = document.createElement('section');
controls.className = 'art-controls';
controls.setAttribute('aria-label', '시각 건설 상태 전환');
const description = document.createElement('p');
description.textContent =
  '건설 상태 미리보기 · 경제 계산 없음 · 작은 화면에서는 보드를 가로로 스크롤';
controls.append(description);
const stageStatus = document.createElement('output');
stageStatus.className = 'stage-status';
stageStatus.setAttribute('aria-live', 'polite');
const buttons = new Map<ConstructionStage, HTMLButtonElement>();
for (const value of constructionStages) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = stageNames[value];
  button.dataset.stage = value;
  button.onclick = () => {
    const previous = construction;
    stage = value;
    construction = makeState();
    renderBoard(previous);
  };
  buttons.set(value, button);
  controls.append(button);
}
const skip = document.createElement('button');
skip.type = 'button';
skip.textContent = '등장 연출 끝내기';
skip.onclick = () =>
  viewport.getAnimations({ subtree: true }).forEach((a) => a.finish());
controls.append(skip, stageStatus);
root.append(controls);
function renderBoard(
  previousConstruction?: ReadonlyMap<TileId, ConstructionVisual>,
) {
  const board = createProjectedBoard({
    view,
    construction,
    ...(previousConstruction ? { previousConstruction } : {}),
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
  viewport.replaceChildren(board);
  for (const [value, button] of buttons)
    button.setAttribute('aria-pressed', String(value === stage));
  stageStatus.textContent = stageNames[stage];
}
const viewport = document.createElement('div');
viewport.className = 'pm-board-area';
viewport.setAttribute(
  'aria-label',
  '보드 영역 · 작은 화면에서는 가로로 스크롤',
);
root.append(viewport);
function renderGallery() {
  const gallery = document.createElement('section');
  gallery.className = 'art-gallery';
  gallery.setAttribute('aria-label', '단계 및 대표시설 모형');
  const samples: readonly [string, string, ConstructionStage][] = [
    ...constructionStages.map(
      (value) =>
        ['pallet', stageNames[value], value] as [
          string,
          string,
          ConstructionStage,
        ],
    ),
    ['new-bark', '연두 · 공박사 연구소', 'final'],
    ['celadon', '무지개 · 백화점', 'final'],
    ['saffron', '노랑 · 실프주식회사', 'final'],
    ['goldenrod', '금빛 · 라디오타워', 'final'],
    ['olivine', '담청 · 등대', 'final'],
    ['pewter', '회색 · 박물관', 'final'],
    ['ecruteak', '인주 · 문화회관 (가정)', 'final'],
    ['cerulean', '블루 · 체육관', 'final'],
  ];
  for (const [slug, name, value] of samples) {
    const card = document.createElement('figure');
    card.append(
      createConstructionArt(
        { id: `tile:kj:${slug}`, kind: 'city' },
        { stage: value },
      ),
    );
    const caption = document.createElement('figcaption');
    caption.textContent = name;
    card.append(caption);
    gallery.append(card);
  }
  root.append(gallery);
}
renderBoard();
renderGallery();
