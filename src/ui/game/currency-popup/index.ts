import type { GameView, UIUpdate } from '../adapter';
import type { PlayerId } from '../../../game/contracts';
import { cashDeltaText, createCashDeltaGate, type CashDelta } from './model';
import './style.css';

const lifetime = 1050;
const cap = 8;

/** Nonblocking board-only feedback; never dispatches or acknowledges updates. */
export function createCurrencyPopups(options: {
  initial: GameView;
  surface(): HTMLElement | null;
  anchor(playerId: PlayerId): { x: number; y: number } | undefined;
}) {
  const gate = createCashDeltaGate(options.initial);
  const layer = document.createElement('div');
  layer.className = 'pm-currency-popups';
  layer.setAttribute('aria-hidden', 'true');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let active: { node: HTMLElement; cue: CashDelta; start: number }[] = [];
  let frame = 0;
  let destroyed = false;
  function clear() {
    cancelAnimationFrame(frame);
    frame = 0;
    active = [];
    layer.replaceChildren();
    layer.remove();
  }
  function tick(now: number) {
    frame = 0;
    const surface = options.surface();
    if (destroyed || document.hidden || !surface?.isConnected) {
      clear();
      return;
    }
    if (layer.parentElement !== surface) surface.append(layer);
    const bounds = surface.getBoundingClientRect();
    const lanes = new Map<PlayerId, number>();
    active = active.filter(({ node, cue, start }) => {
      const age = now - start;
      const anchor = options.anchor(cue.playerId);
      if (age >= lifetime || !anchor) {
        node.remove();
        return false;
      }
      const lane = lanes.get(cue.playerId) ?? 0;
      lanes.set(cue.playerId, lane + 1);
      const rise = media.matches ? 0 : Math.min(age / lifetime, 1) * 25;
      node.style.left = `${anchor.x - bounds.left}px`;
      node.style.top = `${anchor.y - bounds.top - lane * 24 - rise}px`;
      node.style.opacity = String(Math.min(1, (lifetime - age) / 230));
      return true;
    });
    if (active.length) frame = requestAnimationFrame(tick);
    else clear();
  }
  const onVisibility = () => {
    if (document.hidden) clear();
  };
  document.addEventListener('visibilitychange', onVisibility);
  return {
    accept(update: UIUpdate) {
      return gate.accept(update);
    },
    show(cues: readonly CashDelta[]) {
      if (destroyed || document.hidden || !options.surface()) return;
      for (const cue of cues) {
        const node = document.createElement('span');
        node.className = `pm-currency-popup ${cue.amount > 0 ? 'is-income' : 'is-expense'}`;
        node.textContent = cashDeltaText(cue.amount);
        layer.append(node);
        active.push({ node, cue, start: performance.now() });
      }
      while (active.length > cap) active.shift()!.node.remove();
      if (active.length && !frame) tick(performance.now());
    },
    reset(view: GameView) {
      clear();
      gate.reset(view);
    },
    destroy() {
      destroyed = true;
      clear();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
