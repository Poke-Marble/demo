import { mountGameUI } from '../index';
import {
  createSpecialDemoAdapter,
  type SpecialScenario,
} from './special-adapter';

const demo = createSpecialDemoAdapter();
const root = document.querySelector<HTMLElement>('#special-preview')!;
const mounted = mountGameUI(root, demo.adapter);
const toolbar = document.querySelector<HTMLElement>('.demo-tools');
if (toolbar) {
  toolbar.classList.add('pm-preview-tools');
  const scenes = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '데모 장면 선택';
  scenes.append(summary, ...toolbar.querySelectorAll('button'));
  toolbar.replaceChildren(scenes);
}
document
  .querySelectorAll<HTMLButtonElement>('[data-scenario]')
  .forEach((button) => {
    button.onclick = () =>
      demo.scenario(button.dataset.scenario as SpecialScenario);
  });
document.querySelector<HTMLButtonElement>('#restart')!.onclick = () => {
  void demo.adapter.restart();
};
document.querySelector<HTMLButtonElement>('#redeliver')!.onclick = () =>
  demo.replay();
document.querySelector<HTMLButtonElement>('#restart-during')!.onclick = () => {
  demo.scenario('fly-trial');
  setTimeout(() => {
    void demo.adapter.restart();
  }, 1000);
};
window.addEventListener('pagehide', () => mounted.destroy(), { once: true });
