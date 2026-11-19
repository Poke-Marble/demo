import { mountGameUI } from '../index';
import type { PlayerId } from '../../../game/contracts';
import type { PortraitReaction } from '../portraits/emotions';
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
  const emotionTools = document.createElement('div');
  emotionTools.className = 'pm-emotion-demo';
  const label = document.createElement('label');
  label.textContent = '표정 대상 ';
  const target = document.createElement('select');
  for (const [id, name] of [
    ['', '전체 4명'],
    ...demo.adapter.getView().participants.map((p) => [p.id, p.name]),
  ]) {
    const option = document.createElement('option');
    option.value = id!;
    option.textContent = name!;
    target.append(option);
  }
  label.append(target);
  emotionTools.append(label);
  const choices: [PortraitReaction, string][] = [
    ['normal', '기본'],
    ['joy', '기쁨'],
    ['distress', '곤란'],
    ['pain', '아픔'],
    ['acting', '결의'],
    ['bankrupt', '슬픔 유지'],
    ['victory', '환호 유지'],
    ['angry', '화남'],
    ['surprise', '놀람'],
  ];
  for (const [reaction, text] of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.onclick = () =>
      demo.emotion(
        reaction,
        target.value ? (target.value as PlayerId) : undefined,
      );
    emotionTools.append(button);
  }
  const toll = document.createElement('button');
  toll.type = 'button';
  toll.textContent = '통행료 지불/수입 시연';
  toll.onclick = () => demo.toll();
  emotionTools.append(toll);
  const note = document.createElement('small');
  note.textContent = '고정 표정 데모 · 유지 표정 해제는 재시작';
  emotionTools.append(note);
  scenes.append(emotionTools);
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
