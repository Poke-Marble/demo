import { createConstructionArt } from './art/buildings';
import type { ConstructionVisual } from './art/construction';
import { billboard } from './art/billboard';
import { createRegionalFacility } from './art/regional';
import type { ArtTile } from './art/places';
import type { Tile } from '../../game/contracts';
import {
  depthOrder,
  projectWorld,
  sceneSize,
  tileGeometry,
  tileSilhouette,
  type Point,
} from './projection';
import grass from './assets/tiny-town/tile_0001.png';
import flowers from './assets/tiny-town/tile_0002.png';

const NS = 'http://www.w3.org/2000/svg';
export function atPoint(
  node: HTMLElement,
  point: Point,
  depth = depthOrder(point),
) {
  node.style.left = `${(point.x / sceneSize.width) * 100}%`;
  node.style.top = `${(point.y / sceneSize.height) * 100}%`;
  node.style.zIndex = String(depth);
}
export function createTileFaces(
  kind: Tile['kind'],
  g: ReturnType<typeof tileGeometry>,
) {
  const svg = document.createElementNS(NS, 'svg');
  const { width: w, height: h, thickness: t } = g;
  svg.setAttribute('viewBox', `0 0 ${w} ${h + t}`);
  svg.setAttribute('aria-hidden', 'true');
  const top =
    kind === 'start' ? '#eed391' : kind === 'landmark' ? '#cbbce5' : '#e4e7ca';
  svg.innerHTML = `<path d="M0 ${h / 2} ${w / 2} ${h} ${w / 2} ${h + t} 0 ${h / 2 + t}Z" fill="#859786"/><path d="M${w / 2} ${h} ${w} ${h / 2} ${w} ${h / 2 + t} ${w / 2} ${h + t}Z" fill="#667f78"/><path class="pm-face-top" d="M${w / 2} 0 ${w} ${h / 2} ${w / 2} ${h} 0 ${h / 2}Z" fill="${top}" stroke="#faf4d9" stroke-width="2"/>`;
  return svg;
}
export function placeTile(
  button: HTMLButtonElement,
  g: ReturnType<typeof tileGeometry>,
) {
  button.style.left = `${(g.left / sceneSize.width) * 100}%`;
  button.style.top = `${(g.top / sceneSize.height) * 100}%`;
  button.style.width = `${(g.width / sceneSize.width) * 100}%`;
  button.style.height = `${((g.height + g.thickness) / sceneSize.height) * 100}%`;
  button.style.clipPath = `polygon(${tileSilhouette(g)
    .map(
      ([x, y]) =>
        `${(x / g.width) * 100}% ${(y / (g.height + g.thickness)) * 100}%`,
    )
    .join(',')})`;
  button.style.zIndex = String(Math.round(g.y));
}
export function createFacility(
  kind: Tile['kind'],
  _level: number,
  index: number,
  tile?: ArtTile,
  construction: ConstructionVisual = { stage: 'unowned' },
) {
  const visualTile = tile ?? { id: `tile:unknown:${index}`, kind };
  return kind === 'city'
    ? createConstructionArt(visualTile, construction)
    : createRegionalFacility(visualTile);
}
export function createIsoGround() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 1000 720');
  svg.setAttribute('class', 'pm-iso-ground');
  svg.setAttribute('aria-hidden', 'true');
  const id = `terrain-${crypto.randomUUID()}`;
  // Only ground is projected. Trees, buildings, pawns and labels are independent upright siblings.
  svg.innerHTML = `<defs><pattern id="${id}" width="16" height="16" patternUnits="userSpaceOnUse"><image href="${grass}" width="16" height="16"/></pattern></defs><ellipse cx="500" cy="607" rx="325" ry="31" fill="#071f3133"/><path d="M100 350 500 580V608L100 378Z" fill="#647e69"/><path d="m500 580 400-230v28L500 608Z" fill="#49666a"/><path d="M500 120 900 350 500 580 100 350Z" fill="#b1cd97" stroke="#dce4b0" stroke-width="7"/><g transform="matrix(.625 .359375 -.625 .359375 500 120)"><rect x="16" y="16" width="608" height="608" fill="url(#${id})"/><path d="M170 230q160-95 260 35t-40 190q-140 60-200-15t-20-210" fill="#b7d59b"/><path d="M252 140q-64 151 65 207t55 161" fill="none" stroke="#d6e8b4" stroke-width="55"/><path d="M252 140q-64 151 65 207t55 161" fill="none" stroke="#7db8c7" stroke-width="36"/><path d="m235 237 32 4m34 97 22 11m52 101-9 20" stroke="#bbe1df" stroke-width="4"/><image href="${flowers}" x="175" y="360" width="32" height="32"/><image href="${flowers}" x="405" y="190" width="32" height="32"/></g>`;
  return svg;
}
export function createIsoTrees(side: number) {
  return [
    [0.28, 0.32],
    [0.36, 0.29],
    [0.45, 0.23],
    [0.68, 0.28],
    [0.73, 0.36],
    [0.25, 0.64],
    [0.3, 0.72],
    [0.65, 0.71],
  ].map(([r, c]) => {
    const node = document.createElement('span');
    node.setAttribute('aria-hidden', 'true');
    node.append(
      createRegionalFacility(
        { id: 'tile:art:forest', kind: 'start', visualScene: 'forest' },
        0,
      ),
    );
    node.style.width = `${(billboard.width / sceneSize.width) * 100}%`;
    node.style.height = `${(billboard.height / sceneSize.height) * 100}%`;
    node.className = 'pm-iso-tree';
    atPoint(node, projectWorld(r! * side - 0.5, c! * side - 0.5, side));
    return node;
  });
}
