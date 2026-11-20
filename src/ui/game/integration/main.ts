import { mountGameUI } from '../index';
import { createIntegratedPreview } from './adapter';
import './preview.css';

export function mountIntegratedPreview(root: HTMLElement) {
  // QA changes timing only, never money, ownership, dice or legal choices.
  const query = new URLSearchParams(location.search);
  const seed = Number(query.get('seed') ?? 42);
  const runtime = createIntegratedPreview({
    computerDelayMs: query.has('fast') ? 0 : 350,
    seed: Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : 42,
  });
  const releaseDiagnostics = query.has('qa')
    ? runtime.adapter.subscribe((update) => {
        root.dataset.qaSnapshot = JSON.stringify(runtime.snapshot());
        update.presentationComplete?.();
      })
    : () => {};
  const game = mountGameUI(root, runtime.adapter);
  const dispose = () => {
    game.destroy();
    releaseDiagnostics();
  };
  window.addEventListener('pagehide', dispose, { once: true });
  return () => {
    window.removeEventListener('pagehide', dispose);
    dispose();
  };
}
