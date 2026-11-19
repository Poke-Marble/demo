import type { PokemonId } from '../../../game/contracts';
import { portraitEntry } from './catalog';
import { reactions, type PortraitReaction } from './emotions';
import './portraits.css';

const urls = import.meta.glob<string>('./assets/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
export function portraitSource(pokemonId: PokemonId, emotion: string) {
  const entry = portraitEntry(pokemonId, emotion);
  const url = entry ? urls[`./${entry.path}`] : undefined;
  return entry && url ? { url, emotion: entry.emotion } : undefined;
}

/** Fixed geometry, request generation and detached image loading avoid stale swaps. */
export function createPortrait(options: {
  pokemonId: PokemonId;
  name: string;
  source?: typeof portraitSource;
  image?: () => HTMLImageElement;
}) {
  const element = document.createElement('span');
  element.className = 'pm-portrait';
  element.setAttribute('role', 'img');
  const source = options.source ?? portraitSource;
  let generation = 0;
  let disposed = false;
  let pending: HTMLImageElement | undefined;
  let currentReaction: PortraitReaction | undefined;
  const release = () => {
    if (pending) {
      pending.onload = null;
      pending.onerror = null;
      pending.removeAttribute('src');
      pending = undefined;
    }
  };
  function fallback(label: string) {
    element.replaceChildren();
    element.classList.add('pm-portrait-fallback');
    element.dataset.emotion = 'fallback';
    element.setAttribute(
      'aria-label',
      `${options.name} · ${label} · 초상화 대신 기본 아이콘`,
    );
    element.removeAttribute('aria-busy');
  }
  fallback(reactions.normal.label);
  return {
    pokemonId: options.pokemonId,
    element,
    setReaction(reaction: PortraitReaction) {
      if (disposed || currentReaction === reaction) return;
      currentReaction = reaction;
      release();
      const token = ++generation;
      const desired = reactions[reaction].emotion;
      const load = (emotion: string, retried: boolean) => {
        if (disposed || token !== generation) return;
        const entry = source(options.pokemonId, emotion);
        if (!entry) {
          fallback(reactions[reaction].label);
          return;
        }
        const image = options.image?.() ?? new Image();
        pending = image;
        image.alt = '';
        image.width = 40;
        image.height = 40;
        image.draggable = false;
        element.setAttribute('aria-busy', 'true');
        image.onload = () => {
          if (disposed || token !== generation || pending !== image) return;
          image.onload = null;
          image.onerror = null;
          pending = undefined;
          element.classList.remove('pm-portrait-fallback');
          element.replaceChildren(image);
          element.dataset.emotion = entry.emotion;
          element.setAttribute(
            'aria-label',
            `${options.name} · ${entry.emotion === desired ? reactions[reaction].label : '평온한 표정 · 기본 초상화로 대체'}`,
          );
          element.removeAttribute('aria-busy');
        };
        image.onerror = () => {
          if (disposed || token !== generation || pending !== image) return;
          release();
          if (!retried && entry.emotion !== 'Normal') load('Normal', true);
          else fallback(reactions[reaction].label);
        };
        image.src = entry.url;
      };
      load(desired, false);
    },
    destroy() {
      disposed = true;
      generation++;
      release();
    },
  };
}
