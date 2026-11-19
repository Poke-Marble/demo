import { mountIntegratedPreview } from './ui/game/integration/main';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('앱 마운트 요소가 없습니다.');
const dispose = mountIntegratedPreview(root);
if (import.meta.hot) import.meta.hot.dispose(dispose);
