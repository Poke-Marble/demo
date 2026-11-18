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
import roundTree from './assets/tiny-town/tile_0005.png';
import pineTree from './assets/tiny-town/tile_0028.png';

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
  level: number,
  index: number,
) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 120');
  // The footprint stays fixed while facility levels increase the vertical size.
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const roof = ['#bd7d6a', '#7d9bb7', '#a08bb0'][index % 3];
  svg.innerHTML =
    kind === 'landmark'
      ? `<ellipse cx="50" cy="108" rx="36" ry="8" fill="#294b5b33"/><path d="m24 94 26 16 27-16-27-15Z" fill="#b6adb4"/><path d="M35 45 51 54V105L35 94Z" fill="#e8ddbc"/><path d="m51 54 17-10v50l-17 11Z" fill="#b5c1bf"/><path d="m25 43 25-16 28 16-27 17Z" fill="#8c78a3"/><path d="M43 18 51 23V44L43 39Z" fill="#ece4c7"/><path d="m51 23 8-5v21l-8 5Z" fill="#c1c8c3"/><path d="M33 18 50 4l19 14-18 11Z" fill="#b19bcb"/><path d="M44 76 51 80V103L44 99Z" fill="#738c9c"/><path d="m69 40 6 3-24 17v-5Z" fill="#6d6286"/>`
      : `<ellipse cx="50" cy="108" rx="39" ry="8" fill="#294b5b30"/><path d="M16 60 51 79V110L16 91Z" fill="${level ? '#f0dbad' : '#f1e7c9'}"/><path d="m51 79 34-20v32l-34 19Z" fill="#adbdba"/><path d="M9 61 44 31l47 28-39 24Z" fill="${roof}"/><path d="m44 31 8 46 39-18Z" fill="#ffffff20"/><path d="m9 61 43 22 39-24-1 6-38 23L9 66Z" fill="#665f6c"/><path d="M26 79 35 84V101L26 96Z" fill="#6c94a0"/><path d="m62 83 12-7v12l-12 7Z" fill="#dbeae2"/><path d="m63 84 10-6v8l-10 6Z" fill="#779caa"/>${level ? '<path d="M50 38V14h3v25" stroke="#737d78" stroke-width="3"/><path d="M53 15 70 20 53 29Z" fill="#e0b45e"/>' : ''}`;
  return svg;
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
  ].map(([r, c], index) => {
    const node = document.createElement('img');
    node.src = index % 2 ? pineTree : roundTree;
    node.alt = '';
    node.className = 'pm-iso-tree';
    atPoint(node, projectWorld(r! * side - 0.5, c! * side - 0.5, side));
    return node;
  });
}
