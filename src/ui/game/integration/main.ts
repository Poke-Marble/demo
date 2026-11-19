import { mountGameUI } from '../index';
import { createIntegratedPreview } from './adapter';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto';
import './preview.css';

export function mountIntegratedPreview(root: HTMLElement) {
  const preview = createIntegratedPreview();
  const game = mountGameUI(root, preview.adapter);
  const tools = document.createElement('details');
  tools.className = 'pm-integrated-tools';
  tools.innerHTML =
    '<summary>시연 도구</summary><p>통합 데모 · 건설은 표시 시연, 컴퓨터는 기본 자동 진행입니다. 경제·승리 판정은 아직 미연결입니다.</p>';
  const add = (label: string, run: () => void) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.onclick = run;
    tools.append(button);
  };
  for (const [level, label] of [
    [null, '미소유'],
    [0, '캠프'],
    [1, '숍'],
    [2, '센터'],
    [3, '대표 시설'],
  ] as const)
    add(label, () => preview.showBuildings(level));
  for (const tile of kantoJohtoMap.tiles.filter((t) => t.kind === 'special'))
    add(tile.nameKo, () => preview.arrive(tile.id));
  add('태초마을 건설 시연', () => preview.arrive('tile:kj:pallet'));
  root.append(tools);
  const dispose = () => {
    game.destroy();
    tools.remove();
  };
  window.addEventListener('pagehide', dispose, { once: true });
  return () => {
    window.removeEventListener('pagehide', dispose);
    dispose();
  };
}
