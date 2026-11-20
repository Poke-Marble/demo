import type { SfxBus } from '../feedback/audio';
import type { ConstructionCue, ConstructionType } from './model';
import './effects.css';

/** CSS pixel coordinates relative to the board host, supplied by its camera owner. */
export type ScreenAnchor = { x: number; y: number };
export const MAX_PARTICLES = 48;
export function createConstructionPresenter(
  host: HTMLElement,
  options: {
    audio?: SfxBus;
    anchor?: (tileId: ConstructionCue['tileId']) => ScreenAnchor | undefined;
  } = {},
) {
  const overlay = document.createElement('div');
  overlay.className = 'pm-construction-effects';
  overlay.hidden = true;
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const caption = document.createElement('div');
  caption.className = 'pm-construction-caption';
  caption.setAttribute('role', 'status');
  overlay.append(canvas, caption);
  host.append(overlay);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let frame = 0;
  let disposed = false;
  let generation = 0;
  let finish: (() => void) | undefined;
  let width = 1,
    height = 1;
  function resize() {
    const rect = host.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    canvas.width = Math.ceil(width * dpr);
    canvas.height = Math.ceil(height * dpr);
    canvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  window.addEventListener('resize', resize);
  function cancel() {
    generation++;
    cancelAnimationFrame(frame);
    frame = 0;
    overlay.hidden = true;
    options.audio?.stop();
    const resolve = finish;
    finish = undefined;
    resolve?.();
  }
  const motion = () => {
    if (reduced.matches) cancel();
  };
  const visibility = () => {
    if (document.hidden) cancel();
  };
  reduced.addEventListener('change', motion);
  document.addEventListener('visibilitychange', visibility);
  function glyph(
    ctx: CanvasRenderingContext2D,
    type: ConstructionType,
    size: number,
  ) {
    ctx.beginPath();
    if (type === 'grass') {
      ctx.moveTo(-size, size);
      ctx.quadraticCurveTo(-size, -size, size, -size);
      ctx.quadraticCurveTo(size, size, -size, size);
      ctx.moveTo(-size, size);
      ctx.lineTo(size * 0.65, -size * 0.65);
    } else if (type === 'fire') {
      ctx.moveTo(0, -size);
      ctx.bezierCurveTo(
        size * 0.2,
        0,
        size,
        -0.2 * size,
        size * 0.7,
        size * 0.6,
      );
      ctx.quadraticCurveTo(0, size * 1.4, -size * 0.6, size * 0.5);
      ctx.quadraticCurveTo(-size, 0, 0, -size);
    } else if (type === 'water') {
      for (let row = -1; row <= 1; row++) {
        ctx.moveTo(-size, row * size * 0.6);
        ctx.bezierCurveTo(
          -size * 0.4,
          row * size * 0.6 - size * 0.7,
          size * 0.4,
          row * size * 0.6 + size * 0.7,
          size,
          row * size * 0.6,
        );
      }
    } else {
      ctx.moveTo(size * 0.4, -size);
      ctx.lineTo(-size * 0.6, size * 0.1);
      ctx.lineTo(0, size * 0.1);
      ctx.lineTo(-size * 0.3, size);
      ctx.lineTo(size * 0.7, -size * 0.15);
      ctx.lineTo(size * 0.1, -size * 0.15);
      ctx.closePath();
    }
    ctx.stroke();
  }
  function play(cue: ConstructionCue) {
    if (disposed || document.hidden) return Promise.resolve();
    const token = generation;
    return new Promise<void>((resolve) => {
      finish = resolve;
      resize();
      overlay.style.setProperty('--construction-color', cue.color);
      caption.replaceChildren();
      const title = document.createElement('strong');
      title.textContent =
        cue.kind === 'final'
          ? '랜드마크 완성!'
          : `${cue.ownerName} · ${cue.kind === 'build' ? '건설 완료' : cue.kind === 'takeover' ? '인수 완료' : '사유지 확보'}`;
      const detail = document.createElement('div');
      detail.textContent = `${cue.placeName}${cue.facilityName ? ` · ${cue.facilityName}` : ''}`;
      caption.append(title, detail);
      if (cue.defense) {
        const small = document.createElement('small');
        small.textContent = cue.defense;
        caption.append(small);
      }
      overlay.hidden = false;
      const final = cue.kind === 'final';
      const duration = reduced.matches ? 180 : final ? 1800 : 700;
      if (!reduced.matches) options.audio?.playConstruction?.(cue.type, final);
      const start = performance.now();
      const draw = (now: number) => {
        if (disposed || token !== generation) return;
        const p = Math.min(1, Math.max(0, (now - start) / duration));
        const ctx = canvas.getContext('2d');
        if (!ctx || p >= 1) {
          overlay.hidden = true;
          frame = 0;
          finish = undefined;
          resolve();
          return;
        }
        ctx.clearRect(0, 0, width, height);
        const supplied = options.anchor?.(cue.tileId);
        const anchor =
          supplied &&
          Number.isFinite(supplied.x) &&
          Number.isFinite(supplied.y) &&
          supplied.x >= 30 &&
          supplied.x <= width - 30 &&
          supplied.y >= 30 &&
          supplied.y <= height - 30
            ? supplied
            : { x: width / 2, y: height * 0.43 };
        ctx.save();
        ctx.translate(anchor.x, anchor.y);
        ctx.strokeStyle = cue.color;
        ctx.fillStyle = cue.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = reduced.matches
          ? 0.65
          : Math.min(1, p * 6, (1 - p) * 5) * 0.85;
        const radius = Math.min(width * 0.18, final ? 72 : 40);
        if (final) {
          const beam = ctx.createLinearGradient(0, -height * 0.38, 0, 36);
          beam.addColorStop(0, 'transparent');
          beam.addColorStop(1, cue.color + '55');
          ctx.fillStyle = beam;
          ctx.fillRect(
            -radius * 0.75,
            -height * 0.38,
            radius * 1.5,
            height * 0.38 + 36,
          );
          // A procedural building rises inside the seal; board buildings remain owned by Phaser.
          ctx.save();
          ctx.translate(0, reduced.matches ? 0 : (1 - Math.min(1, p * 3)) * 34);
          ctx.fillStyle = '#17354c';
          ctx.fillRect(-24, -35, 48, 48);
          ctx.strokeRect(-24, -35, 48, 48);
          ctx.beginPath();
          ctx.moveTo(-29, -35);
          ctx.lineTo(0, -55);
          ctx.lineTo(29, -35);
          ctx.closePath();
          ctx.stroke();
          for (let i = 0; i < 3; i++) ctx.strokeRect(-15 + i * 11, -23, 6, 10);
          ctx.restore();
        }
        ctx.beginPath();
        ctx.ellipse(
          0,
          28,
          radius * (reduced.matches ? 1 : 0.8 + p * 0.3),
          radius * 0.32,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.save();
        ctx.translate(0, final ? -90 : -12);
        glyph(ctx, cue.type, final ? 20 : 16);
        ctx.restore();
        if (!reduced.matches)
          for (let i = 0; i < (final ? MAX_PARTICLES : 22); i++) {
            const angle = i * 2.39996;
            const distance = radius * (0.3 + p * 1.4) * (0.5 + (i % 7) / 10);
            ctx.save();
            ctx.translate(
              Math.cos(angle) * distance,
              Math.sin(angle) * distance * 0.65 - p * (final ? 65 : 25),
            );
            ctx.scale(0.14, 0.14);
            glyph(ctx, cue.type, 12);
            ctx.restore();
          }
        ctx.restore();
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    });
  }
  return {
    async present(cues: readonly ConstructionCue[]) {
      const token = generation;
      for (const cue of cues) {
        if (disposed || token !== generation) break;
        await play(cue);
      }
    },
    cancel,
    destroy() {
      if (disposed) return;
      disposed = true;
      cancel();
      observer.disconnect();
      window.removeEventListener('resize', resize);
      reduced.removeEventListener('change', motion);
      document.removeEventListener('visibilitychange', visibility);
      overlay.remove();
    },
  };
}
