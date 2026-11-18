import './ui/styles.css';
import { mountApp } from './ui/app';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('앱 마운트 요소가 없습니다.');
const dispose = mountApp(root);
if (import.meta.hot) import.meta.hot.dispose(dispose);
