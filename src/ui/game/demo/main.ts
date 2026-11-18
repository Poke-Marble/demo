import { mountGameUI } from '../index';
import { createDemoAdapter } from './adapter';
const root = document.querySelector<HTMLElement>('#game-preview');
const params = new URLSearchParams(location.search);
if (root)
  mountGameUI(
    root,
    createDemoAdapter({
      boardSize: params.get('board') === '4' ? 4 : 32,
      showcase: params.get('showcase') === '1',
      movementSteps: 3,
    }),
  );
