import { regionalScene, type ArtTile, type RegionalScene } from './places';
import { box, polygon } from './model-geometry';
import { createConstructionArt } from './buildings';
const NS = 'http://www.w3.org/2000/svg';
const foliage = ['#93ba81', '#689269', '#456f60'] as const;
const stone = ['#bdc5bc', '#8d9f9d', '#697f89'] as const;
const roof = ['#8caeab', '#63858c', '#496c7f'] as const;
export function createSceneryArt(scene: RegionalScene) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 120');
  svg.setAttribute('class', 'pm-construction-model pm-scenery-model');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.scene = scene;
  let art = polygon(
    [
      [-20, -17, 0],
      [21, -17, 0],
      [21, 18, 0],
      [-20, 18, 0],
    ],
    '#304b55',
    0.18,
  );
  switch (scene) {
    case 'forest':
      art +=
        box(-3, -3, 6, 6, 23, ['#b9a47f', '#998364', '#7d755d']) +
        box(-15, -13, 30, 26, 12, foliage, 17) +
        box(-11, -9, 22, 18, 12, foliage, 29) +
        box(-6, -5, 12, 10, 8, foliage, 41);
      break;
    case 'whirl':
      art += box(-21, -18, 42, 36, 1, ['#80bdc9', '#548ba4', '#3a6f90']);
      art += box(-18, -13, 12, 13, 13, stone) + box(8, -7, 11, 12, 18, stone);
      for (let i = 0; i < 3; i++)
        art += polygon(
          [
            [-9 + i * 3, -1 + i * 3, 2],
            [5 + i * 2, -1 + i * 3, 2],
            [5 + i * 2, 2 + i * 3, 2],
            [-9 + i * 3, 2 + i * 3, 2],
          ],
          '#d2e7df',
        );
      break;
    case 'bell':
      for (let i = 0; i < 4; i++) {
        const size = 28 - i * 4,
          z = i * 13;
        art +=
          box(
            -size / 2,
            -size / 2,
            size,
            size,
            12,
            ['#e3c18b', '#be966b', '#957e70'],
            z,
          ) +
          box(
            -size / 2 - 3,
            -size / 2 - 3,
            size + 6,
            size + 6,
            3,
            roof,
            z + 12,
          );
      }
      art += box(-2, -2, 4, 4, 6, ['#f3d88e', '#d8b765', '#aa935d'], 57);
      break;
    case 'ice':
      art += box(-21, -18, 42, 36, 1, ['#80bdc9', '#548ba4', '#3a6f90']);
      art += box(-19, -13, 16, 17, 21, ['#e2efeb', '#a2c7d4', '#729cad']);
      art += box(5, -4, 14, 16, 26, ['#e2efeb', '#a2c7d4', '#729cad']);
      break;
    case 'lake':
      art += box(-21, -18, 42, 36, 2, foliage);
      art += box(-17, -14, 34, 28, 1, ['#80bdc9', '#548ba4', '#3a6f90'], 2);
      art +=
        '<path d="M30 84l14 4m5-9l17 5m-22 7l13 4" stroke="#d2e7df" fill="none" stroke-width="2"/>';
      art += box(-21, -18, 5, 8, 13, foliage) + box(15, 9, 6, 9, 10, foliage);
      break;
    case 'den':
      art += box(-20, -16, 40, 32, 7, stone);
      art += box(-16, -12, 32, 24, 18, stone, 7);
      art +=
        '<path d="M38 94V80q12-22 24 0v14z" fill="#233e4b" stroke="#697f89" stroke-width="3"/><path d="M43 94l7-7 7 7" fill="none" stroke="#80bdc9" stroke-width="3"/>';
      break;
    case 'fly':
      art += box(-20, -17, 40, 34, 2, ['#d6d9bf', '#a9bda9', '#8eaaa4']);
      // A pair of raised wings and a tail reads as flight, without a flagpole.
      art +=
        '<g data-marker="flight" fill="#f2ecd0" stroke="#496c7f" stroke-width="1.5" stroke-linejoin="round"><path d="M50 69L18 49l8 23 20 9-5 15 9-7 9 7-5-15 20-9 8-23z"/><path d="M50 69v20" fill="none"/></g>';
      break;
    case 'start':
      art += box(-19, -13, 38, 26, 2, stone);
      art +=
        '<g data-marker="start-flag"><path d="M34 91V42" stroke="#697f89" stroke-width="3"/><path d="M35 43h39l-7 10 7 10H35z" fill="#e9c787" stroke="#496c7f" stroke-width="1.5"/><text x="39" y="56" fill="#233e4b" font-family="sans-serif" font-size="8" font-weight="700">START</text></g>';
      break;
    case 'power':
      art +=
        box(-15, -12, 29, 24, 20, stone) +
        box(-16, -13, 31, 26, 4, roof, 20) +
        box(6, -9, 5, 5, 16, stone, 24);
      break;
    default:
      art += box(-14, -11, 15, 15, 16, stone) + box(4, 1, 12, 12, 10, stone);
  }
  svg.innerHTML = art;
  return svg;
}
/** Compatibility wrapper; city ownership must be supplied through createConstructionArt. */
export function createRegionalFacility(tile: ArtTile, _level = 0) {
  void _level;
  return tile.kind === 'city'
    ? createConstructionArt(tile, { stage: 'unowned' })
    : createSceneryArt(regionalScene(tile));
}
