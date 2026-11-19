import { createGameplayFeedback } from './controller';
import './preview.css';
const root = document.querySelector<HTMLElement>('#app')!;
const title = document.createElement('h1');
title.textContent = '주사위와 총총 걸음';
const description = document.createElement('p');
description.textContent =
  '확정값 2 · 5 → 640ms 연출 → 7칸 이동. 소리는 첫 클릭/키 입력으로 활성화됩니다.';
const toolbar = document.createElement('nav');
const stage = document.createElement('div');
stage.className = 'feedback-stage';
const pawn = document.createElement('span');
pawn.textContent = '●';
pawn.className = 'feedback-pawn';
stage.append(pawn);
const output = document.createElement('output');
output.textContent = '준비';
root.append(title, description, toolbar, stage, output);
const feedback = createGameplayFeedback(root);
root.append(feedback.controls);
let generation = 0;
let playing = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let wake: (() => void) | undefined;
const wait = () =>
  new Promise<void>((resolve) => {
    wake = resolve;
    timer = setTimeout(() => {
      timer = undefined;
      wake = undefined;
      resolve();
    }, 230);
  });
function skip() {
  generation++;
  feedback.skip();
  clearTimeout(timer);
  wake?.();
  wake = undefined;
  playing = false;
  output.textContent = '스킵 · 확정값 2 · 5';
}
function button(text: string, run: () => void) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = text;
  b.onclick = run;
  toolbar.append(b);
  return b;
}
button('굴리고 7칸 이동', () => {
  if (playing) return;
  playing = true;
  const current = ++generation;
  feedback.begin();
  output.textContent = '굴리는 중…';
  pawn.style.left = '2%';
  void (async () => {
    await feedback.roll([2, 5]);
    if (generation !== current) return;
    output.textContent = '확정값 2 · 5';
    for (let i = 1; i <= 7; i++) {
      if (generation !== current || feedback.suppressed) break;
      pawn.style.left = `${2 + i * 12}%`;
      feedback.step();
      await wait();
    }
    if (generation !== current) return;
    pawn.style.left = '86%';
    playing = false;
  })();
});
button('주사위 소리 직접 듣기', () => feedback.audio.play('dice'));
button('걸음 소리 직접 듣기', () => feedback.audio.play('step'));
button('스킵', skip);
button('초기화', () => {
  skip();
  feedback.reset();
  pawn.style.left = '2%';
  output.textContent = '준비';
});
window.addEventListener(
  'pagehide',
  () => {
    skip();
    feedback.destroy();
  },
  { once: true },
);
