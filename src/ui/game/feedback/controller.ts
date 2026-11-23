import { createFeedbackAudio, type SfxBus } from './audio';
import './feedback.css';

/** A persistent sibling of the replaceChildren game host. No game state ownership. */
export function createGameplayFeedback(
  root: HTMLElement,
  audio: SfxBus = createFeedbackAudio(),
  boardTarget: () => HTMLElement | null = () => root,
) {
  const overlay = document.createElement('div');
  overlay.className = 'pm-feedback-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-label', '주사위 굴리는 중');
  const canvas = document.createElement('canvas');
  canvas.width = 560;
  canvas.height = 240;
  canvas.setAttribute('aria-hidden', 'true');
  overlay.append(canvas);
  root.append(overlay);
  const controls = document.createElement('div');
  controls.className = 'pm-sfx-controls';
  const mute = document.createElement('button');
  mute.type = 'button';
  const label = document.createElement('label');
  label.textContent = '효과음';
  const volume = document.createElement('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '100';
  volume.step = '5';
  volume.setAttribute('aria-label', '효과음 볼륨');
  label.append(volume);
  controls.append(mute, label);
  mute.onclick = () => audio.setMuted(!audio.getSettings().muted);
  volume.oninput = () => audio.setVolume(Number(volume.value) / 100);
  const unsubscribe = audio.subscribe((settings) => {
    mute.textContent = settings.muted ? '소리 켜기' : '음소거';
    mute.setAttribute('aria-pressed', String(settings.muted));
    volume.value = String(settings.volume * 100);
  });
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let finish: (() => void) | undefined;
  let disposed = false;
  let skipped = false;
  function cancel() {
    cancelAnimationFrame(frame);
    frame = 0;
    overlay.hidden = true;
    overlay.dataset.double = '';
    audio.stop();
    const done = finish;
    finish = undefined;
    done?.();
  }
  function skip() {
    skipped = true;
    cancel();
  }
  function visibility() {
    if (document.hidden) skip();
  }
  function motion() {
    if (reduced.matches) skip();
  }
  // Capture before game click callbacks synchronously dispatch an update.
  const unlock = (event: Event) => {
    if (event.isTrusted && !disposed) void audio.unlock();
  };
  root.addEventListener('pointerdown', unlock, true);
  root.addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', visibility);
  reduced.addEventListener('change', motion);
  const pipPositions: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [
      [-1, -1],
      [1, 1],
    ],
    3: [
      [-1, -1],
      [0, 0],
      [1, 1],
    ],
    4: [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ],
    5: [
      [-1, -1],
      [1, -1],
      [0, 0],
      [-1, 1],
      [1, 1],
    ],
    6: [
      [-1, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [1, 1],
    ],
  };
  function draw(values: readonly number[], progress: number) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 560, 240);
    values.forEach((value, i) => {
      const decay = 1 - Math.min(1, progress / 0.82);
      const phase = progress * Math.PI * 9 + i * 1.8;
      ctx.save();
      ctx.translate(
        205 + i * 150 + Math.sin(phase) * 24 * decay,
        132 - Math.abs(Math.sin(phase)) * 48 * decay,
      );
      ctx.rotate(Math.sin(phase * 0.75) * decay * 0.8);
      ctx.shadowColor = '#213b4060';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 9;
      ctx.fillStyle = i ? '#e9f5f0' : '#fff9e8';
      ctx.strokeStyle = '#48796e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-48, -48, 96, 96, 17);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = '#294d49';
      // Intermediate faces are time-derived decorative values, never game RNG.
      const face =
        progress < 0.82 ? ((Math.floor(progress * 27) + i * 3) % 6) + 1 : value;
      for (const [x, y] of pipPositions[face] ?? []) {
        ctx.beginPath();
        ctx.arc(x * 25, y * 25, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
    if (values.length === 2 && values[0] === values[1] && progress >= 0.82) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, (progress - 0.82) / 0.08);
      ctx.font = '900 40px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 7;
      ctx.strokeStyle = '#fff9e8';
      ctx.fillStyle = '#245e52';
      ctx.strokeText('Double!', 280, 213);
      ctx.fillText('Double!', 280, 213);
      ctx.restore();
    }
  }
  return {
    audio,
    controls,
    begin() {
      skipped = false;
    },
    get suppressed() {
      return disposed || skipped || document.hidden || reduced.matches;
    },
    async roll(values: readonly number[]) {
      cancel();
      if (disposed || skipped || document.hidden || reduced.matches) return;
      const target = boardTarget();
      if (!target?.isConnected) return;
      target.append(overlay);
      overlay.hidden = false;
      overlay.dataset.values = '';
      overlay.dataset.double = String(
        values.length === 2 && values[0] === values[1],
      );
      overlay.setAttribute(
        'aria-label',
        values.length === 2 && values[0] === values[1]
          ? 'Double!'
          : '주사위 결과 확인 중',
      );
      audio.play('dice');
      const start = performance.now();
      await new Promise<void>((resolve) => {
        finish = resolve;
        const tick = (now: number) => {
          const target = boardTarget();
          if (!target?.isConnected) {
            cancel();
            return;
          }
          if (overlay.parentElement !== target) target.append(overlay);
          const elapsed = now - start;
          const p = Math.min(1, elapsed / 640);
          draw(values, p);
          const duration =
            values.length === 2 && values[0] === values[1] ? 960 : 640;
          if (elapsed >= duration) {
            overlay.dataset.values = values.join(',');
            overlay.hidden = true;
            finish = undefined;
            frame = 0;
            resolve();
          } else frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      });
    },
    step() {
      if (!disposed && !skipped && !document.hidden && !reduced.matches)
        audio.play('step');
    },
    skip,
    reset() {
      skip();
    },
    destroy() {
      disposed = true;
      cancel();
      unsubscribe();
      audio.destroy();
      root.removeEventListener('pointerdown', unlock, true);
      root.removeEventListener('keydown', unlock, true);
      document.removeEventListener('visibilitychange', visibility);
      reduced.removeEventListener('change', motion);
      controls.remove();
      overlay.remove();
    },
  };
}
