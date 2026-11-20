import { createConstructionPresenter } from './presenter';
import { constructionCues, ownerTypes } from './model';
import { constructionFixture } from './fixture';
import { createFeedbackAudio } from '../feedback/audio';
import './preview.css';

const root = document.querySelector<HTMLElement>('#preview')!;
root.innerHTML =
  '<h1>건설 연출</h1><p>독립 시연 · 실제 규칙 처리 없음 · 보드 중앙 대체 위치</p><nav></nav><section class="preview-board"><p>도시 이름과 플레이어 HUD는 보드 바깥에 유지됩니다.</p><div class="preview-grid"></div></section><button id="skip">연출 스킵 / Esc</button><p>소리 설정은 게임의 저장된 음소거·볼륨을 공유합니다.</p>';
const board = root.querySelector<HTMLElement>('.preview-board')!;
const audio = createFeedbackAudio();
const presenter = createConstructionPresenter(board, { audio });
for (const [id, style] of Object.entries(ownerTypes)) {
  for (const [label, level, landmark] of [
    ['확보', 0, false],
    ['일반건설', 2, false],
    ['최종완성', 3, false],
    ['관광명소', 0, true],
  ] as const) {
    const button = document.createElement('button');
    button.textContent = `${style.label} · ${label}`;
    button.onclick = () => {
      presenter.cancel();
      void audio.unlock();
      const { before, update } = constructionFixture(id, level, landmark);
      void presenter.present(constructionCues(before, update));
    };
    root.querySelector('nav')!.append(button);
  }
}
root.querySelector('#skip')!.addEventListener('click', presenter.cancel);
const key = (event: KeyboardEvent) => {
  if (event.key === 'Escape') presenter.cancel();
};
document.addEventListener('keydown', key);
window.addEventListener(
  'pagehide',
  () => {
    presenter.destroy();
    audio.destroy();
    document.removeEventListener('keydown', key);
  },
  { once: true },
);
