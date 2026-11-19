import { createSpecialEventPresenter } from './presenter';
import { findSprite } from '../../../assets/sprites';
import type { SpecialEventRequest } from './contracts';

const root = document.querySelector<HTMLElement>('#legendary-preview')!;
const status = document.querySelector<HTMLElement>('#preview-status')!;
let serial = 0;
const presenter = createSpecialEventPresenter({
  root,
  durationMs: 10000,
  describe: () => ({
    playerName: '나',
    partnerName: '피카츄',
    destinationName: '방울탑',
  }),
  partnerVisual() {
    const { animation, url } = findSprite('pokemon:0025', 'Idle');
    const viewport = document.createElement('span');
    viewport.className = 'pm-preview-partner';
    if (animation && url) {
      viewport.style.width = `${animation.frameWidth * 3}px`;
      viewport.style.height = `${animation.frameHeight * 3}px`;
      viewport.style.backgroundImage = `url("${url}")`;
      viewport.style.backgroundSize = `${animation.sheetWidth * 3}px ${animation.sheetHeight * 3}px`;
    }
    return viewport;
  },
  lock: (locked) => {
    status.textContent = locked ? '연출 재생 중' : '대기';
  },
});
function play(legendary: 'lugia' | 'ho-oh') {
  presenter.reset();
  void presenter.enqueue([
    {
      id: `preview:${++serial}`,
      type: 'trial-intro',
      legendary,
      playerId: 'player:1',
      tileId: 'tile:16',
    },
  ]);
}
document
  .querySelectorAll<HTMLButtonElement>('[data-legendary]')
  .forEach((button) => {
    button.onclick = () => play(button.dataset.legendary as 'lugia' | 'ho-oh');
  });
document.querySelector<HTMLButtonElement>('#restart')!.onclick = () =>
  play('lugia');
document.querySelector<HTMLButtonElement>('#unmount')!.onclick = () =>
  presenter.destroy();
document.querySelector<HTMLButtonElement>('#flight')!.onclick = () => {
  presenter.reset();
  const request: SpecialEventRequest = {
    id: `flight:${++serial}`,
    type: 'fly',
    playerId: 'player:1',
    from: 'tile:0',
    to: 'tile:16',
  };
  void presenter.enqueue([request]);
};
// Narrow QA hook; presentation-only and confined to this independent entry.
Object.assign(window, { legendaryPreview: { presenter, play } });
