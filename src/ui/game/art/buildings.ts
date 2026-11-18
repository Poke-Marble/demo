import { box, polygon, modelPoint } from './model-geometry';
import {
  builtComponents,
  finalFacility,
  ownerColors,
  type BuildingTile,
  type ConstructionVisual,
  type FinalFacility,
} from './construction';
const NS = 'http://www.w3.org/2000/svg';
const wall = ['#ede4c9', '#d1c6a8', '#9faeaa'] as const;
const teal = ['#80b5b1', '#557e89', '#3c6275'] as const;
const blue = ['#92b9d2', '#6a90b1', '#4a6c92'] as const;
const red = ['#d8957c', '#af716b', '#815c68'] as const;
function windows(
  u: number,
  v: number,
  w: number,
  d: number,
  z: number,
  rows: number,
) {
  let result = '';
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < 3; c++) {
      const x = u + 3 + (c * (w - 5)) / 3,
        y = v + 2 + (c * (d - 4)) / 3,
        height = z - 5 - r * 8;
      result += polygon(
        [
          [x, v + d, height],
          [x + 3, v + d, height],
          [x + 3, v + d, height - 4],
          [x, v + d, height - 4],
        ],
        '#82b1bf',
      );
      result += polygon(
        [
          [u + w, y, height],
          [u + w, y + 3, height],
          [u + w, y + 3, height - 4],
          [u + w, y, height - 4],
        ],
        '#547b96',
      );
    }
  return result;
}
function building(
  u: number,
  v: number,
  w: number,
  d: number,
  h: number,
  roof: readonly [string, string, string] = teal,
) {
  return (
    box(u, v, w, d, h, wall) +
    windows(u, v, w, d, h, Math.max(1, Math.floor(h / 12))) +
    box(u - 1, v - 1, w + 2, d + 2, 3, roof, h) +
    polygon(
      [
        [u + w * 0.4, v + d, 0],
        [u + w * 0.65, v + d, 0],
        [u + w * 0.65, v + d, 9],
        [u + w * 0.4, v + d, 9],
      ],
      '#3b5c70',
    )
  );
}
function emblem(u: number, v: number, z: number, color: string) {
  const p = modelPoint(u, v, z);
  return `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${color}" stroke="#f8edd0" stroke-width="1.5"/>`;
}
function flag(color: string) {
  const p = modelPoint(-17, 14, 0);
  return (
    box(-19, 12, 4, 4, 1, teal) +
    `<path d="M${p.x} ${p.y}v-31" stroke="#e9e2bd" stroke-width="2"/><path d="M${p.x + 1} ${p.y - 31}l14 4-14 6z" fill="${color}" stroke="#354e59" stroke-width=".7"/>`
  );
}
function signature(kind: FinalFacility) {
  switch (kind) {
    case 'lab':
      return (
        building(-16, -13, 28, 24, 19, blue) +
        box(-10, -7, 10, 8, 6, teal, 22) +
        box(3, -8, 4, 4, 9, wall, 22)
      );
    case 'department-store':
      return (
        building(-16, -13, 28, 24, 36, teal) +
        box(-14, -11, 24, 20, 3, red, 18) +
        box(-12, -9, 14, 10, 5, wall, 39)
      );
    case 'silph':
      return (
        building(-14, -12, 24, 24, 48, blue) +
        box(-9, -7, 14, 14, 5, teal, 51) +
        emblem(-2, 12, 40, '#efd88c')
      );
    case 'radio-tower': {
      const p = modelPoint(-1, -1, 63);
      return (
        building(-13, -12, 24, 24, 32, teal) +
        box(-8, -7, 14, 14, 12, blue, 35) +
        `<path d="M${p.x} ${p.y + 16}v-20m-8 6h16m-12 6h8" fill="none" stroke="#d9dfca" stroke-width="2"/>`
      );
    }
    case 'lighthouse':
      return (
        box(-9, -8, 17, 17, 44, wall) +
        box(-10, -9, 19, 19, 4, red, 22) +
        box(-12, -11, 23, 23, 4, teal, 44) +
        box(-8, -7, 15, 15, 9, blue, 48) +
        emblem(7, 8, 53, '#ffdf8b') +
        box(-10, -9, 19, 19, 3, teal, 57)
      );
    case 'museum':
      return (
        building(-17, -13, 29, 25, 22, teal) +
        [0, 1, 2, 3].map((i) => box(-15 + i * 7, 10, 3, 3, 18, wall)).join('') +
        box(-12, -7, 18, 12, 4, wall, 25)
      );
    case 'harbor':
      return (
        building(-17, -13, 28, 24, 18, blue) +
        box(-21, 10, 35, 6, 2, ['#c7b184', '#aa9169', '#8a7e65']) +
        box(-6, -5, 8, 8, 11, wall, 21)
      );
    case 'cultural-hall':
      return (
        building(-17, -13, 29, 25, 22, red) +
        box(-20, -16, 35, 31, 3, teal, 25) +
        box(-13, -9, 21, 17, 4, teal, 28)
      );
    case 'ranger-station':
      return (
        building(-16, -12, 27, 23, 19, teal) +
        box(-18, -14, 31, 27, 3, teal, 22) +
        box(-8, -5, 9, 9, 7, wall, 25)
      );
    case 'league':
      return (
        building(-17, -13, 30, 26, 31, blue) +
        box(-10, -6, 16, 12, 9, wall, 34) +
        emblem(-2, 13, 26, '#efd88c')
      );
    case 'lodge':
      return (
        building(-16, -12, 27, 24, 23, red) + box(-11, -7, 17, 14, 6, red, 26)
      );
    default:
      return (
        building(-17, -13, 30, 26, 22, blue) +
        box(-7, -3, 10, 10, 4, teal, 25) +
        emblem(-2, 13, 18, '#f0d780')
      );
  }
}
export function createConstructionArt(
  tile: BuildingTile,
  state: ConstructionVisual,
) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 120');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'pm-construction-model');
  svg.dataset.stage = state.stage;
  const built = builtComponents(state),
    kind = finalFacility(tile);
  svg.dataset.model = built.signature ? kind : state.stage;
  svg.dataset.components = Object.entries(built)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .join(' ');
  if (state.stage === 'unowned') return svg;
  const color = ownerColors.includes(state.ownerColor!)
    ? state.ownerColor!
    : ownerColors[0];
  let art = polygon(
    [
      [-20, -17, 0],
      [21, -17, 0],
      [21, 18, 0],
      [-20, 18, 0],
    ],
    '#304b55',
    0.22,
  );
  if (built.shop)
    art += box(-21, -18, 42, 36, 2, ['#e0d7b7', '#bcb79e', '#a4ab9b'], -2);
  if (built.signature) art += signature(kind);
  else if (built.center)
    art += building(-16, -13, 28, 25, 23, red) + emblem(-2, 12, 18, '#f3ecd2');
  else if (built.shop)
    art +=
      building(-15, -12, 26, 24, 16, blue) + box(-16, 10, 28, 3, 3, blue, 12);
  if (built.center) art += building(9, -13, 9, 12, 10, blue);
  if (built.signature)
    art += building(9, 1, 9, 12, 12, red) + emblem(14, 13, 8, '#f6ebcd');
  art += flag(color);
  svg.innerHTML = art;
  return svg;
}
export function animateConstruction(node: Element) {
  if (
    matchMedia('(prefers-reduced-motion: reduce)').matches ||
    !('animate' in node)
  )
    return;
  node.animate(
    [
      { opacity: 0, transform: 'translateY(-7px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 320, easing: 'ease-out' },
  );
}
export function shouldAnimateConstruction(
  previous: ConstructionVisual | undefined,
  current: ConstructionVisual,
) {
  const ranks = ['unowned', 'camp', 'shop', 'center', 'final'];
  return (
    previous !== undefined &&
    ranks.indexOf(current.stage) > ranks.indexOf(previous.stage)
  );
}
