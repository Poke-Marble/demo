import center from '../assets/regional/center.png';
import gym from '../assets/regional/gym.png';
import port from '../assets/regional/port.png';
import tree from '../assets/regional/tree.png';
import town from '../assets/regional/townhouse.png';
import { regionalScene, type ArtTile } from './places';

export { tree as regionalTree };
const NS = 'http://www.w3.org/2000/svg';
const image = (url: string, x: number, y: number, w: number, h: number) =>
  `<image href="${url}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMax meet"/>`;
const rock = (x: number, y: number) =>
  `<path d="M${x} ${y}h8v-8h16v8h8v16h-32z" fill="#7d8894"/><path d="M${x + 8} ${y}h16v8h-16z" fill="#b9c3c0"/>`;
const tower = (floors: number) =>
  Array.from({ length: floors }, (_, i) => {
    const y = 79 - i * 18,
      w = 46 - i * 6;
    return `<path d="M${50 - w / 2} ${y}h${w}v17h-${w}z" fill="#c99568"/><path d="M${50 - w / 2 + 6} ${y}h4v17h-4zm${w - 16} 0h4v17h-4z" fill="#70525b"/><path d="M${44 - w / 2} ${y}h${w + 12}v-4h-6v-4h-${w}v4h-6z" fill="#506e83"/><path d="M${50 - w / 2} ${y - 7}h${w}v3h-${w}z" fill="#91b0ac"/>`;
  }).join('');
export function createRegionalFacility(tile: ArtTile, level: number) {
  const scene = regionalScene(tile);
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 120');
  svg.setAttribute('preserveAspectRatio', 'xMidYMax meet');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'pm-regional-sprite');
  svg.dataset.scene = scene;
  let art: string;
  switch (scene) {
    case 'center':
      art = image(center, 0, 35, 100, 70);
      break;
    case 'gym':
      art = image(gym, 4, 9, 92, 98);
      break;
    case 'port':
      art = `<path d="M2 94h96v18H2z" fill="#69b5cb"/><path d="M8 94h84v4H8zm0 9h84v3H8z" fill="#c2e7dc"/>${image(port, 2, 24, 96, 78)}<path d="M12 104h8v12h-8zm66 0h8v12h-8z" fill="#947455"/>`;
      break;
    case 'forest':
      art = image(tree, 0, 12, 57, 94) + image(tree, 43, 26, 53, 80);
      break;
    case 'whirl':
      art = `<path d="M0 78h100v30H0z" fill="#438eaf"/><path d="M8 84h76v5H8zm12 12h72v4H20z" fill="#91d5d5"/>${rock(12, 75)}${rock(62, 65)}<path d="M40 87h20v5H40v12h28v-5H49v-4h11v-4H40z" fill="#e0f1db"/>`;
      break;
    case 'bell':
      art =
        tower(4) +
        `<path d="M48 9h4v-7h-4z" fill="#efcb68"/><path d="M43 14h14v7H43z" fill="#e4b957"/>`;
      break;
    case 'shrine':
      art =
        tower(2) +
        `<path d="M14 81h5v28h-5zm67 0h5v28h-5zM9 77h82v6H9z" fill="#a7615f"/>`;
      break;
    case 'fly':
      art = `<path d="M6 97h88v12H6z" fill="#c2cbb2"/><path d="M47 47h6v50h-6z" fill="#6c7d83"/><path d="M53 49h30v7H53zm0 11h22v7H53z" fill="#dd986b"/><path d="M16 91h18v4H16zm50 0h18v4H66z" fill="#f3edce"/><path d="M21 35h18v5H21zm18 5h22v5H39zm22-5h18v5H61z" fill="#f3edce"/>`;
      break;
    case 'start':
      art = `<path d="M8 96h84v12H8z" fill="#d8cba1"/><path d="M20 56h7v40h-7zm53 0h7v40h-7zM14 50h72v9H14z" fill="#ae605c"/><path d="M21 47h58v4H21z" fill="#f2c573"/><path d="M43 63h14v14H43z" fill="#f8f0d5"/><path d="M43 63h14v6H43z" fill="#ce7164"/>`;
      break;
    case 'mountain':
      art =
        rock(9, 78) +
        rock(34, 53) +
        rock(60, 77) +
        `<path d="M43 81h17v23H43z" fill="#465467"/>`;
      break;
    case 'power':
      art =
        image(town, 5, 17, 90, 90) +
        `<path d="M68 8h12v46H68z" fill="#8e9ca6"/><path d="M38 65h15l-8 12h10L37 96l6-16H33z" fill="#eed376"/>`;
      break;
    default:
      art = image(town, 8, 16, 84, 90);
  }
  svg.innerHTML = `<ellipse cx="50" cy="108" rx="39" ry="6" fill="#24445233"/>${art}${level > 0 ? `<path d="M84 84h12v24H84z" fill="#384f68"/>${Array.from({ length: Math.min(3, level) }, (_, i) => `<path d="M87 ${102 - i * 7}h6v4h-6z" fill="#f1cf76"/>`).join('')}` : ''}`;
  return svg;
}
