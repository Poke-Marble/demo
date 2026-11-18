import {
  findSprite,
  type AnimationName,
  type Direction,
  type SpriteAnimation,
} from '../assets/sprites';
import type { PokemonData } from '../data/pokemon';

/** 시트의 가로 프레임 / 세로 8방향을 원본 XML의 개별 프레임 시간으로 재생한다. */
export function createSprite(
  pokemon: PokemonData,
  onStatus: (message: string) => void,
) {
  const stage = document.createElement('div');
  stage.className = 'sprite-stage';
  const viewport = document.createElement('div');
  viewport.className = 'sprite-viewport';
  viewport.setAttribute('role', 'img');
  viewport.setAttribute('aria-label', `${pokemon.nameKo} 스프라이트 로딩 중`);
  const image = document.createElement('img');
  image.alt = '';
  image.draggable = false;
  const fallback = document.createElement('span');
  fallback.className = 'sprite-fallback';
  fallback.textContent = '?';
  fallback.hidden = true;
  viewport.append(image, fallback);
  stage.append(viewport);
  let animation: SpriteAnimation | undefined;
  let animationName: AnimationName = 'Idle';
  let direction: Direction = 'S';
  let paused = false;
  let failed = false;
  let ready = false;
  let disposed = false;
  let epoch = performance.now();
  let animationFrame = 0;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scale = 3;

  function fail() {
    if (disposed) return;
    clearTimeout(timeout);
    ready = false;
    image.hidden = true;
    fallback.hidden = false;
    viewport.setAttribute(
      'aria-label',
      `${pokemon.nameKo} 이미지 없음. 대체 표시`,
    );
    onStatus('이미지 없음 · 대체 표시');
  }

  function render(now: number) {
    if (disposed) return;
    if (ready && animation) {
      const total = animation.durationsMs.reduce(
        (sum, duration) => sum + duration,
        0,
      );
      let elapsed = paused || motion.matches ? 0 : (now - epoch) % total;
      let frame = 0;
      while (
        frame < animation.durationsMs.length - 1 &&
        elapsed >= animation.durationsMs[frame]!
      ) {
        elapsed -= animation.durationsMs[frame]!;
        frame++;
      }
      const row = Math.max(0, animation.directionRows.indexOf(direction));
      image.style.transform = `translate(${-frame * animation.frameWidth * scale}px, ${-row * animation.frameHeight * scale}px)`;
    }
    animationFrame = requestAnimationFrame(render);
  }

  function load() {
    clearTimeout(timeout);
    ready = false;
    image.hidden = true;
    fallback.hidden = true;
    const result = findSprite(pokemon.id, animationName);
    animation = result.animation;
    viewport.setAttribute('aria-label', `${pokemon.nameKo} 스프라이트 로딩 중`);
    onStatus('로딩 중');
    if (!animation || !result.url) {
      fail();
      return;
    }
    viewport.style.width = `${animation.frameWidth * scale}px`;
    viewport.style.height = `${animation.frameHeight * scale}px`;
    image.style.width = `${animation.sheetWidth * scale}px`;
    image.style.height = `${animation.sheetHeight * scale}px`;
    image.onload = () => {
      if (disposed) return;
      clearTimeout(timeout);
      ready = true;
      image.hidden = false;
      fallback.hidden = true;
      epoch = performance.now();
      viewport.setAttribute(
        'aria-label',
        `${pokemon.nameKo} ${animationName} 애니메이션`,
      );
      onStatus(`로컬 시트 · ${animationName}`);
    };
    image.onerror = fail;
    timeout = setTimeout(fail, 8000);
    // 손상된 이미지로 실제 error 경로를 재현한다. 외부 요청은 발생하지 않는다.
    image.src = failed ? 'data:image/png;base64,broken' : result.url;
  }
  load();
  animationFrame = requestAnimationFrame(render);
  return {
    element: stage,
    setAnimation(name: AnimationName) {
      animationName = name;
      load();
    },
    setDirection(value: Direction) {
      direction = value;
    },
    setPaused(value: boolean) {
      paused = value;
      epoch = performance.now();
    },
    setFailure(value: boolean) {
      failed = value;
      load();
    },
    dispose() {
      disposed = true;
      clearTimeout(timeout);
      cancelAnimationFrame(animationFrame);
      image.onload = null;
      image.onerror = null;
    },
  };
}
