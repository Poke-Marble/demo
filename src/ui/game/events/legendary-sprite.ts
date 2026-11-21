import manifest from './assets/manifest.json';

const urls = import.meta.glob<string>('./assets/sprite/*/*-Anim.png', {
  eager: true,
  query: '?url',
  import: 'default',
});
type Animation = 'Idle' | 'Attack' | 'Hover';

/** Original pixels only. XML cells, S/SE/E/NE/N/NW/W/SW rows, 60Hz ticks.
 * Flight reuses Hover facing E; it does not represent a gameplay blessing.
 */
export function createLegendarySprite(
  legendary: 'lugia' | 'ho-oh',
  reduced: boolean,
  flight = false,
) {
  const entry = manifest.entries.find(
    (e) => e.species === (legendary === 'lugia' ? '0249' : '0250'),
  )!;
  const element = document.createElement('div');
  element.className = 'pm-legendary-sprite';
  element.dataset.state = 'loading';
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 128;
  canvas.hidden = true;
  canvas.setAttribute('aria-hidden', 'true');
  const fallback = document.createElement('small');
  fallback.textContent = '이미지 로딩 중';
  element.append(canvas, fallback);
  const context = canvas.getContext('2d');
  const images = new Map<Animation, HTMLImageElement>();
  let disposed = false;
  let name: Animation = flight ? 'Hover' : reduced ? 'Idle' : 'Hover';
  let epoch = performance.now();
  let frame = 0;
  function draw(now: number) {
    if (disposed) return;
    const image = images.get(name);
    const data = entry.animations.find((a) => a.name === name)!;
    if (image && context) {
      const total = data.durations.reduce((a, b) => a + b, 0);
      let elapsed = reduced ? 0 : (((now - epoch) * 60) / 1000) % total;
      let index = 0;
      while (
        index < data.durations.length - 1 &&
        elapsed >= data.durations[index]!
      ) {
        elapsed -= data.durations[index++]!;
      }
      context.clearRect(0, 0, 120, 128);
      context.imageSmoothingEnabled = false;
      context.drawImage(
        image,
        index * data.frameWidth,
        (flight ? 2 : 6) * data.frameHeight,
        data.frameWidth,
        data.frameHeight,
        (120 - data.frameWidth) / 2,
        (128 - data.frameHeight) / 2,
        data.frameWidth,
        data.frameHeight,
      );
      canvas.hidden = false;
      fallback.hidden = true;
      element.dataset.state = 'ready';
      element.dataset.animation = name;
    } else {
      canvas.hidden = true;
      fallback.hidden = false;
    }
    if (!reduced) frame = requestAnimationFrame(draw);
  }
  function fail() {
    if (disposed) return;
    element.dataset.state = 'failed';
    fallback.textContent = '이미지 없음 · 이름으로 표시';
  }
  const pending: HTMLImageElement[] = [];
  for (const animation of entry.animations) {
    const image = new Image();
    pending.push(image);
    image.onload = () => {
      void image
        .decode()
        .then(() => {
          if (disposed) return;
          images.set(animation.name as Animation, image);
          if (animation.name === name) {
            clearTimeout(timeout);
            if (reduced) draw(performance.now());
          }
        })
        .catch(fail);
    };
    image.onerror = fail;
    image.src =
      urls[`./assets/sprite/${entry.species}/${animation.name}-Anim.png`]!;
  }
  const timeout = setTimeout(fail, 1800);
  if (!context) fail();
  if (!reduced) frame = requestAnimationFrame(draw);
  return {
    element,
    phase(index: number) {
      if (disposed || reduced || flight) return;
      name = index === 2 ? 'Attack' : index === 3 ? 'Idle' : 'Hover';
      epoch = performance.now();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      for (const image of pending) image.onload = image.onerror = null;
      images.clear();
    },
  };
}
