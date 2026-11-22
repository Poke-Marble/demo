import type { PlayerId, PokemonId } from '../../../../game/contracts';
import { findSprite } from '../../../../assets/sprites';
import type { EventPresentation, SpecialEventRequest } from '../contracts';
import type { SfxBus } from '../../feedback/audio';
import hoverUrl from './assets/sprite/0823/Hover-Anim.png?url';
import idleUrl from './assets/sprite/0823/Idle-Anim.png?url';
import './style.css';
import manifest from './assets/manifest.json';

export type FlightRequest = Extract<SpecialEventRequest, { type: 'fly' }>;
export type FlightAnchors = {
  from: { x: number; y: number };
  to: { x: number; y: number };
};
export interface MountedFlightOptions {
  pokemonForPlayer?(id: PlayerId): PokemonId | undefined;
  anchors?(request: FlightRequest): FlightAnchors | undefined;
  audio?: SfxBus;
  durationMs?: number;
}
const hoverDurations = manifest.animations.find(
  (a) => a.name === 'Hover',
)!.durationsTicks;
const idleDurations = manifest.animations.find(
  (a) => a.name === 'Idle',
)!.durationsTicks;
function frameAt(durations: readonly number[], ms: number) {
  let ticks = ((ms * 60) / 1000) % durations.reduce((a, b) => a + b, 0);
  for (let i = 0; i < durations.length; i++) {
    if (ticks < durations[i]!) return i;
    ticks -= durations[i]!;
  }
  return 0;
}
function load(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const abort = () => {
      cleanup();
      reject(new Error('cancelled'));
    };
    const cleanup = () => {
      image.onload = image.onerror = null;
      signal.removeEventListener('abort', abort);
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('image unavailable'));
    };
    signal.addEventListener('abort', abort, { once: true });
    image.src = url;
    if (signal.aborted) abort();
  });
}
/** Only crops at render time. All source pixels and alpha remain intact. */
function visibleBounds(
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(image, x, y, w, h, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  let left = w,
    right = 0,
    top = h,
    bottom = 0;
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++) {
      if (data[(py * w + px) * 4 + 3]! > 0) {
        left = Math.min(left, px);
        right = Math.max(right, px + 1);
        top = Math.min(top, py);
        bottom = Math.max(bottom, py + 1);
      }
    }
  return { left, right, top, bottom };
}
export function presentMountedFlight(
  root: HTMLElement,
  request: FlightRequest,
  description: EventPresentation,
  signal: AbortSignal,
  options: MountedFlightOptions = {},
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const dialog = document.createElement('dialog');
    dialog.className = 'pm-mounted-flight';
    dialog.dataset.eventId = request.id;
    dialog.dataset.playerId = request.playerId;
    dialog.dataset.from = request.from;
    dialog.dataset.to = request.to;
    dialog.setAttribute('aria-label', '아머까오 공중날기');
    const panel = document.createElement('div');
    panel.className = 'pm-mounted-caption';
    const title = document.createElement('h2');
    title.textContent = `${description.destinationName ?? request.to}까지 공중날기`;
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.textContent = '연출 스킵 · Enter / Space / Esc';
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 110;
    canvas.className = 'pm-mounted-sprite';
    canvas.hidden = true;
    canvas.setAttribute('aria-hidden', 'true');
    const fallback = document.createElement('p');
    fallback.className = 'pm-mounted-fallback';
    fallback.textContent = `${description.partnerName} · 아머까오 탑승 준비`;
    panel.append(title, status, skip);
    dialog.append(canvas, fallback, panel);
    root.append(dialog);
    const controller = new AbortController();
    let done = false,
      frame = 0,
      started = 0,
      lastWing = -1,
      phase = -1;
    let timer: ReturnType<typeof setTimeout>;
    const duration = Math.max(600, options.durationMs ?? 3000);
    function finish() {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      controller.abort();
      signal.removeEventListener('abort', finish);
      media.removeEventListener('change', finish);
      options.audio?.stop();
      dialog.close();
      dialog.remove();
      if (previous?.isConnected) previous.focus();
      resolve();
    }
    skip.onclick = finish;
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish();
    };
    dialog.onkeydown = (event) => {
      if (['Enter', ' ', 'Escape'].includes(event.key)) {
        event.preventDefault();
        finish();
      }
    };
    signal.addEventListener('abort', finish, { once: true });
    media.addEventListener('change', finish, { once: true });
    dialog.showModal();
    skip.focus();
    const summary = `${description.playerName} · ${description.partnerName} 탑승 · ${description.destinationName ?? request.to} 도착`;
    if (media.matches) {
      dialog.dataset.phase = 'land';
      status.textContent = summary;
      fallback.textContent = '동작 줄이기 · 비행 경로 생략';
      timer = setTimeout(finish, 160);
      return;
    }
    status.textContent = '탑승 준비';
    timer = setTimeout(() => {
      dialog.dataset.state = 'failed';
      status.textContent = summary;
      fallback.textContent = '이미지 로딩 지연 · 목적지로 이동';
      timer = setTimeout(finish, 500);
    }, 1800);
    const pokemon = options.pokemonForPlayer?.(request.playerId);
    if (pokemon) dialog.dataset.pokemonId = pokemon;
    const rider = pokemon ? findSprite(pokemon, 'Idle') : undefined;
    const data = rider?.animation;
    const context = canvas.getContext('2d');
    if (!data || !rider?.url || !context) {
      dialog.dataset.state = 'failed';
      fallback.textContent = `${description.partnerName} · ${description.destinationName ?? request.to} 이동`;
      clearTimeout(timer);
      timer = setTimeout(finish, 500);
      return;
    }
    Promise.all([
      load(hoverUrl, controller.signal),
      load(idleUrl, controller.signal),
      load(rider.url, controller.signal),
    ])
      .then(([mount, idle, passenger]) => {
        if (done) return;
        if (dialog.dataset.state === 'failed') return;
        clearTimeout(timer);
        timer = setTimeout(finish, duration + 500);
        dialog.dataset.state = 'ready';
        fallback.hidden = true;
        canvas.hidden = false;
        const cache = new Map<string, ReturnType<typeof visibleBounds>>();
        function drawCell(
          image: HTMLImageElement,
          col: number,
          row: number,
          w: number,
          h: number,
          footY: number,
          scale = 1,
        ) {
          const key = `${image.src}:${col}:${row}`;
          let b = cache.get(key);
          if (!b) {
            b = visibleBounds(image, col * w, row * h, w, h);
            cache.set(key, b);
          }
          context!.drawImage(
            image,
            col * w,
            row * h,
            w,
            h,
            Math.round(60 - ((b.left + b.right) * scale) / 2),
            Math.round(footY - b.bottom * scale),
            w * scale,
            h * scale,
          );
          return footY - (b.bottom - b.top) * scale;
        }
        function draw(now: number) {
          if (done) return;
          started ||= now;
          const elapsed = now - started,
            t = Math.min(1, elapsed / duration);
          const nextPhase = t < 0.16 ? 0 : t < 0.34 ? 1 : t < 0.78 ? 2 : 3;
          if (nextPhase !== phase) {
            phase = nextPhase;
            dialog.dataset.phase = ['board', 'takeoff', 'cross', 'land'][
              phase
            ]!;
            status.textContent =
              phase === 3
                ? summary
                : `${description.playerName} · ${['탑승', '이륙', '비행 중'][phase]}`;
            if (phase === 1) options.audio?.playFlight?.('wing');
            if (phase === 2) options.audio?.playFlight?.('wind');
            if (phase === 3) options.audio?.playFlight?.('land');
          }
          const beat = Math.floor(elapsed / 500);
          if (phase > 0 && phase < 3 && beat !== lastWing) {
            lastWing = beat;
            options.audio?.playFlight?.('wing');
          }
          const anchors = options.anchors?.(request) ?? {
            from: { x: innerWidth * 0.25, y: innerHeight * 0.65 },
            to: { x: innerWidth * 0.75, y: innerHeight * 0.65 },
          };
          const progress = Math.max(0, Math.min(1, (t - 0.18) / 0.64));
          const lift =
            Math.sin(Math.PI * Math.max(0, Math.min(1, (t - 0.12) / 0.8))) *
            Math.min(150, innerHeight * 0.23);
          const scale = 1 + Math.sin(Math.PI * t) * 1.5;
          const flightY =
            anchors.from.y + (anchors.to.y - anchors.from.y) * progress - lift;
          canvas.style.left = `${anchors.from.x + (anchors.to.x - anchors.from.x) * progress}px`;
          canvas.style.top = `${innerWidth <= 480 ? Math.max(16 + 90 * scale, flightY) : flightY}px`;
          canvas.style.width = `${120 * scale}px`;
          canvas.style.height = `${110 * scale}px`;
          context!.clearRect(0, 0, 120, 110);
          context!.imageSmoothingEnabled = false;
          const flying = phase === 1 || phase === 2;
          const row = anchors.to.x >= anchors.from.x ? 2 : 6;
          // Opaque bounds align the unchanged sheets; rider feet rest on the bird's back.
          const top = flying
            ? drawCell(
                mount,
                frameAt(hoverDurations, elapsed),
                row,
                40,
                64,
                108,
                2,
              )
            : drawCell(
                idle,
                frameAt(idleDurations, elapsed),
                row,
                32,
                48,
                108,
                2,
              );
          drawCell(
            passenger,
            frameAt(
              data!.durationsMs.map((ms) => ms * 0.06),
              elapsed,
            ),
            row,
            data!.frameWidth,
            data!.frameHeight,
            top + 22,
          );
          if (t >= 1) {
            finish();
            return;
          }
          frame = requestAnimationFrame(draw);
        }
        frame = requestAnimationFrame(draw);
      })
      .catch(() => {
        if (done) return;
        dialog.dataset.state = 'failed';
        canvas.hidden = true;
        fallback.hidden = false;
        fallback.textContent = `${description.partnerName} · 이미지 없이 ${description.destinationName ?? request.to} 이동`;
        status.textContent = summary;
        clearTimeout(timer);
        timer = setTimeout(finish, 500);
      });
  });
}
