import {
  abilities,
  type AbilityActivation,
} from '../../../game/abilities/activation';
import { createAbilityAudio } from './audio';
import './presenter.css';

/** Transparent Canvas FX + accessible DOM HUD, independent of board/economy adapters. */
export function createAbilityPresenter(
  host: HTMLElement,
  options: {
    portraitUrl?: (pokemonId: string) => string | undefined;
    onEnd?: (
      activation: AbilityActivation,
      reason: 'finished' | 'cancelled',
    ) => void;
  } = {},
) {
  const element = document.createElement('div');
  element.className = 'ability-presenter';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const hud = document.createElement('div');
  hud.className = 'ability-hud';
  hud.setAttribute('role', 'status');
  hud.setAttribute('aria-live', 'polite');
  const portrait = document.createElement('img');
  portrait.alt = '';
  portrait.width = 64;
  portrait.height = 64;
  portrait.onerror = () => {
    portrait.hidden = true;
  };
  const title = document.createElement('strong');
  const description = document.createElement('span');
  hud.append(portrait, title, description);
  element.append(canvas, hud);
  host.append(element);
  const ctx = canvas.getContext('2d');
  const audio = createAbilityAudio();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const queue: AbilityActivation[] = [];
  const seen = new Set<string>();
  let current: AbilityActivation | undefined;
  let frame = 0;
  let width = 1;
  let height = 1;
  let start = 0;
  let disposed = false;
  const resize = () => {
    const rect = element.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(element);
  window.addEventListener('resize', resize);
  resize();
  const clear = () => ctx?.clearRect(0, 0, width, height);
  function draw(progress: number, activation: AbilityActivation) {
    if (!ctx) return;
    clear();
    const color = abilities[activation.abilityId].color;
    const x = width / 2;
    const y = height / 2;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = Math.sin(Math.PI * progress) * 0.75;
    if (motion.matches) {
      ctx.beginPath();
      ctx.arc(x, y, Math.min(width, height) * 0.22, 0, Math.PI * 2);
      ctx.stroke();
    } else if (activation.type === 'water') {
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.ellipse(
          x,
          y + i * 9,
          35 + progress * (110 + i * 25),
          15 + progress * (32 + i * 12),
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    } else if (activation.type === 'electric') {
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.beginPath();
        ctx.moveTo(45, 0);
        ctx.lineTo(80, -10);
        ctx.lineTo(72, 8);
        ctx.lineTo(125 + progress * 60, 0);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      for (let i = 0; i < 22; i++) {
        const angle = i * 2.399;
        const radius = 30 + progress * (70 + i * 4);
        const px = x + Math.cos(angle + progress) * radius;
        const py =
          y +
          Math.sin(angle) * radius * 0.55 -
          (activation.type === 'fire' ? progress * 100 : 0);
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(angle + progress * 2);
        ctx.beginPath();
        if (activation.type === 'grass') {
          ctx.ellipse(0, 0, 10, 4, 0, 0, Math.PI * 2);
        } else {
          ctx.moveTo(0, -15);
          ctx.quadraticCurveTo(16, 8, 0, 12);
          ctx.quadraticCurveTo(-12, 5, 0, -15);
        }
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }
  function next() {
    if (disposed || current) return;
    current = queue.shift();
    if (!current) {
      hud.hidden = true;
      clear();
      return;
    }
    const activation = current;
    const definition = abilities[activation.abilityId];
    element.style.setProperty('--ability-color', definition.color);
    title.textContent = `${definition.name} · ${activation.type}`;
    description.textContent = activation.description;
    const url = options.portraitUrl?.(activation.pokemonId);
    portrait.hidden = !url;
    if (url) portrait.src = url;
    else portrait.removeAttribute('src');
    hud.hidden = false;
    start = 0;
    frame = requestAnimationFrame(tick);
  }
  function tick(timestamp: number) {
    if (!current || disposed) return;
    if (!start) {
      start = timestamp;
      resize();
      audio.play(current.type, 1.1);
    }
    // Audio and animation start together in this first frame; never await audio here.
    const progress = Math.min(1, (timestamp - start) / 1100);
    draw(progress, current);
    if (progress < 1) frame = requestAnimationFrame(tick);
    else {
      const finished = current;
      current = undefined;
      audio.stop();
      options.onEnd?.(finished, 'finished');
      next();
    }
  }
  function cancel() {
    cancelAnimationFrame(frame);
    audio.stop();
    const cancelled = [...(current ? [current] : []), ...queue];
    current = undefined;
    queue.length = 0;
    hud.hidden = true;
    clear();
    for (const item of cancelled) options.onEnd?.(item, 'cancelled');
  }
  hud.hidden = true;
  return {
    element,
    audio,
    /** FIFO, maximum 16 outstanding items, ID deduplication for mount lifetime. */
    enqueue(activation: AbilityActivation) {
      if (
        disposed ||
        seen.has(activation.id) ||
        queue.length + (current ? 1 : 0) >= 16
      )
        return false;
      seen.add(activation.id);
      queue.push(activation);
      next();
      return true;
    },
    cancel,
    /** Explicit presentation replay, never a second financial commit. */
    restart(activation: AbilityActivation) {
      if (disposed) return;
      cancel();
      seen.delete(activation.id);
      seen.add(activation.id);
      queue.push(activation);
      next();
    },
    destroy() {
      disposed = true;
      cancel();
      observer.disconnect();
      window.removeEventListener('resize', resize);
      portrait.onerror = null;
      audio.destroy();
      seen.clear();
      element.remove();
    },
  };
}
