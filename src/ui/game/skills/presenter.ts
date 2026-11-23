import type { SkillActivation } from '../../../game/skills';
import { findSprite } from '../../../assets/sprites';
import { createAbilityAudio } from '../abilities/audio';
import './presenter.css';

export function createSkillPresenter(
  host: HTMLElement,
  onEnd: (item: SkillActivation, reason: 'finished' | 'cancelled') => void,
) {
  const element = document.createElement('div');
  element.className = 'pm-skill-presentation';
  element.hidden = true;
  const portrait = document.createElement('span');
  portrait.className = 'pm-skill-presentation-sprite';
  const title = document.createElement('strong');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  element.append(canvas, portrait, title, status);
  host.append(element);
  const audio = createAbilityAudio();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new Set<string>();
  const queue: SkillActivation[] = [];
  let current: SkillActivation | undefined;
  let frame = 0;
  let start = 0;
  let disposed = false;
  function finish(reason: 'finished' | 'cancelled') {
    cancelAnimationFrame(frame);
    frame = 0;
    audio.stop();
    const items = [...(current ? [current] : []), ...queue];
    current = undefined;
    queue.length = 0;
    element.hidden = true;
    for (const item of items) onEnd(item, reason);
  }
  function next() {
    if (disposed || current) return;
    current = queue.shift();
    if (!current) {
      element.hidden = true;
      return;
    }
    const item = current;
    element.dataset.type = item.type;
    title.textContent = `${item.name} · 고유기술`;
    status.textContent = item.description;
    const sprite = findSprite(item.pokemonId, 'Idle');
    portrait.replaceChildren();
    portrait.style.backgroundImage = '';
    if (sprite.animation && sprite.url) {
      portrait.style.width = `${sprite.animation.frameWidth}px`;
      portrait.style.height = `${sprite.animation.frameHeight}px`;
      portrait.style.backgroundImage = `url("${sprite.url}")`;
    }
    element.style.setProperty(
      '--skill-color',
      {
        grass: '#73dc94',
        water: '#78cfff',
        fire: '#ff9868',
        electric: '#ffe277',
      }[item.type],
    );
    element.hidden = false;
    start = 0;
    frame = requestAnimationFrame(tick);
  }
  function tick(now: number) {
    if (!current || disposed) return;
    if (!start) {
      start = now;
      audio.play(current.type, 0.55);
    }
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const box = element.getBoundingClientRect();
      canvas.width = Math.max(1, box.width);
      canvas.height = Math.max(1, box.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle =
        getComputedStyle(element).getPropertyValue('--skill-color');
      ctx.lineWidth = 4;
      ctx.globalAlpha = reduced.matches
        ? 0.9
        : 1 - Math.min(1, (now - start) / 650);
      ctx.beginPath();
      ctx.arc(
        canvas.width / 2,
        canvas.height / 2,
        28 + (reduced.matches ? 0 : (now - start) / 18),
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (now - start < 650 && !reduced.matches)
      frame = requestAnimationFrame(tick);
    else {
      const ended = current;
      current = undefined;
      audio.stop();
      onEnd(ended, 'finished');
      next();
    }
  }
  return {
    audio,
    enqueue(item: SkillActivation) {
      if (
        disposed ||
        seen.has(item.id) ||
        queue.length + (current ? 1 : 0) >= 16
      )
        return false;
      seen.add(item.id);
      queue.push(item);
      next();
      return true;
    },
    cancel() {
      finish('cancelled');
    },
    skip() {
      finish('finished');
      next();
    },
    destroy() {
      if (disposed) return;
      disposed = true;
      finish('cancelled');
      audio.destroy();
      seen.clear();
      element.remove();
    },
  };
}
