import { mountIntegratedPreview } from '../integration/main';
const root = document.querySelector<HTMLElement>('#game-preview');
if (root) {
  const dispose = mountIntegratedPreview(root);
  if (import.meta.hot) import.meta.hot.dispose(dispose);
}
