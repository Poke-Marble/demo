import type { TileId } from '../../../game/contracts';
import type {
  EventPresentation,
  FlightSelection,
  SpecialEventRequest,
} from './contracts';
import { createLegendarySprite } from './legendary-sprite';
import { worldEventRules } from '../../../game/world-events/index.ts';
import { createEffectQueue } from './queue';
import './special-events.css';
import { decorateDestination } from './flight-picker/card';
import './flight-picker/picker.css';

function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
) {
  const element = document.createElement(tag);
  element.className = className;
  element.textContent = text;
  return element;
}
function action(label: string, run: () => void) {
  const button = node('button', '', label);
  button.type = 'button';
  button.onclick = run;
  return button;
}

export function createSpecialEventPresenter(options: {
  root: HTMLElement;
  describe: (request: SpecialEventRequest) => EventPresentation;
  partnerVisual?: (request: SpecialEventRequest) => HTMLElement | undefined;
  lock: (locked: boolean) => void;
  /** Adjustable presentation assumption, not a game-rule duration. */
  durationMs?: number;
}) {
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let picker: HTMLDialogElement | undefined;
  let pickerId: string | undefined;
  let pickerVersion: string | undefined;
  let pickerCleanup: (() => void) | undefined;
  const closePicker = () => {
    picker?.close();
    picker?.remove();
    pickerCleanup?.();
    pickerCleanup = undefined;
    picker = undefined;
    pickerId = undefined;
    pickerVersion = undefined;
  };
  const queue = createEffectQueue(
    (request, signal) =>
      new Promise<void>((resolve) => {
        if (signal.aborted) {
          resolve();
          return;
        }
        closePicker();
        const previous =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        const description = options.describe(request);
        const dialog = node(
          'dialog',
          `pm-event pm-event-${request.type}${request.type !== 'fly' ? ' pm-event-' + request.legendary : ''}`,
        );
        dialog.setAttribute(
          'aria-label',
          request.type === 'fly'
            ? '공중날기 연출'
            : request.type === 'world-event'
              ? '전체 맵 전설 이벤트'
              : '전설 시험 등장 연출',
        );
        dialog.dataset.eventId = request.id;
        const stage = node('div', 'pm-event-stage');
        const eyebrow = node(
          'p',
          'pm-event-eyebrow',
          request.type === 'fly'
            ? 'SKY PASSAGE / 공중날기'
            : request.legendary === 'lugia'
              ? '루기아의 시험'
              : '칠색조의 시험',
        );
        const graphic = node('div', 'pm-event-graphic');
        const sprite = createLegendarySprite(
          request.type !== 'fly' ? request.legendary : 'ho-oh',
          media.matches,
          request.type === 'fly',
        );
        graphic.setAttribute('aria-hidden', 'true');
        graphic.append(sprite.element);
        const title = node(
          'h2',
          'pm-event-title',
          request.type === 'fly'
            ? (description.destinationName ?? request.to)
            : request.legendary === 'lugia'
              ? '루기아'
              : '칠색조',
        );
        const versus = node('div', 'pm-event-versus');
        if (request.type === 'trial-intro') {
          const partner = node('span', 'pm-event-partner');
          const visual = options.partnerVisual?.(request);
          if (visual) partner.append(visual);
          partner.append(node('span', '', description.partnerName));
          const opponent = node('div', 'pm-event-opponent');
          opponent.append(graphic, title);
          versus.append(partner, node('strong', '', 'VS'), opponent);
        }
        if (request.type === 'world-event')
          eyebrow.textContent = '전체 맵 이벤트';
        const reducedSummary =
          request.type === 'fly'
            ? `${description.playerName} · ${description.destinationName ?? request.to} 도착`
            : request.type === 'world-event'
              ? `${title.textContent} · 모든 도시 ${request.legendary === 'lugia' ? '통행료' : '시설 건설비'} ${worldEventRules.discounts[request.legendary] * 100}% 감소 · ${request.expiresAfterRound}라운드 종료까지`
              : `${description.partnerName} VS ${title.textContent}`;
        const status = node('p', 'pm-event-caption');
        status.setAttribute('role', 'status');
        const skip = action('연출 스킵 · Enter / Space / Esc', finish);
        if (request.type === 'trial-intro')
          stage.append(eyebrow, versus, status);
        else stage.append(eyebrow, graphic, title, status);
        dialog.append(stage, skip);
        const timers: ReturnType<typeof setTimeout>[] = [];
        let done = false;
        function finish() {
          if (done) return;
          done = true;
          sprite.dispose();
          timers.forEach(clearTimeout);
          signal.removeEventListener('abort', finish);
          media.removeEventListener('change', finish);
          dialog.close();
          dialog.remove();
          if (previous?.isConnected) previous.focus();
          resolve();
        }
        const phases =
          request.type === 'fly'
            ? ['출발 준비', '이륙', '비행 중', '도착']
            : [
                '시험 준비',
                request.legendary === 'lugia'
                  ? '루기아가 나타났다'
                  : '칠색조가 나타났다',
                '전설과 마주하다',
                '보드로 복귀',
              ];
        function phase(index: number) {
          dialog.dataset.phase = String(index);
          sprite.phase(index);
          status.textContent =
            request.type === 'world-event'
              ? reducedSummary
              : request.type === 'fly' && index === 3
                ? reducedSummary
                : `${description.playerName} · ${phases[index]}`;
        }
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
        stage.onclick = finish;
        options.root.append(dialog);
        dialog.showModal();
        skip.focus();
        signal.addEventListener('abort', finish, { once: true });
        media.addEventListener('change', finish, { once: true });
        const duration = media.matches ? 120 : (options.durationMs ?? 2600);
        dialog.classList.toggle('pm-event-reduced', media.matches);
        dialog.style.setProperty('--event-duration', `${duration}ms`);
        phase(media.matches ? 3 : 0);
        if (media.matches) status.textContent = reducedSummary;
        if (!media.matches)
          [0.13, 0.3, 0.76].forEach((fraction, index) => {
            timers.push(
              setTimeout(() => phase(index + 1), duration * fraction),
            );
          });
        timers.push(setTimeout(finish, duration));
      }),
    options.lock,
  );

  return {
    ...queue,
    select(
      selection: FlightSelection | undefined,
      choose?: (id: string, tile: TileId | null) => void | Promise<void>,
    ) {
      if (!selection || !choose) {
        closePicker();
        return;
      }
      const version = JSON.stringify(selection);
      if (pickerId === selection.id && pickerVersion === version) return;
      closePicker();
      const previous =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const dialog = node('dialog', 'pm-event-picker');
      picker = dialog;
      pickerId = selection.id;
      pickerVersion = version;
      dialog.classList.toggle('pm-flight-picker', true);
      dialog.dataset.layout = selection.layout ?? 'vertical';
      const heading = node('h2', '', selection.title ?? '어디로 날아갈까요?');
      heading.id = `flight-${crypto.randomUUID()}`;
      dialog.setAttribute('aria-labelledby', heading.id);
      const list = node('div', 'pm-event-destinations');
      list.setAttribute('aria-label', '비행 목적지 목록');
      const status = node('p', '', '목적지를 선택한 뒤 확정하세요.');
      status.setAttribute('role', 'status');
      let selected: TileId | undefined;
      let submitting = false;
      let live = true;
      const confirm = action('목적지 확정', () => {
        if (selected !== undefined) void submit(selected);
      });
      confirm.disabled = true;
      async function submit(tile: TileId | null) {
        if (submitting || !live || pickerId !== selection!.id) return;
        if (
          tile !== null &&
          !selection!.destinations.some((d) => d.tileId === tile)
        )
          return;
        submitting = true;
        dialog.querySelectorAll('button').forEach((button) => {
          button.disabled = true;
        });
        try {
          await choose!(selection!.id, tile);
          if (live && picker === dialog) closePicker();
        } catch (error) {
          if (!live) return;
          submitting = false;
          status.textContent =
            error instanceof Error
              ? error.message
              : '선택을 처리하지 못했습니다.';
          dialog.querySelectorAll('button').forEach((button) => {
            button.disabled = false;
          });
          confirm.disabled = !selected;
        }
      }
      selection.destinations.forEach((destination) => {
        const button = action(destination.label, () => {
          if (submitting || !live) return;
          selected = destination.tileId;
          list
            .querySelectorAll('button')
            .forEach((b) =>
              b.setAttribute('aria-pressed', String(b === button)),
            );
          confirm.disabled = false;
          status.textContent = `${destination.label} 선택됨 · 확정하면 이동합니다.`;
        });
        button.setAttribute('aria-pressed', 'false');
        decorateDestination(button, destination);
        button.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            button.click();
            return;
          }
          const directions: Record<string, number> = {
            ArrowDown: 1,
            ArrowRight: 1,
            ArrowUp: -1,
            ArrowLeft: -1,
          };
          const step = directions[event.key];
          if (step === undefined && event.key !== 'Home' && event.key !== 'End')
            return;
          event.preventDefault();
          const cards = [...list.querySelectorAll<HTMLButtonElement>('button')];
          const index =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? cards.length - 1
                : (cards.indexOf(button) + step! + cards.length) % cards.length;
          const next = cards[index];
          next?.focus();
          next?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        };
        if (destination.description)
          button.append(node('small', '', destination.description));
        list.append(button);
      });
      dialog.append(
        heading,
        node('p', '', '목록 스크롤 · 방향키로 탐색 · 선택 후 별도 확정'),
        list,
        status,
        confirm,
      );
      if (!selection.destinations.length)
        status.textContent = '선택 가능한 목적지가 없습니다.';
      if (selection.cancellable)
        dialog.append(
          action('비행 취소 · Esc', () => {
            void submit(null);
          }),
        );
      dialog.oncancel = (event) => {
        event.preventDefault();
        if (selection.cancellable) void submit(null);
      };
      pickerCleanup = () => {
        live = false;
        if (previous?.isConnected) previous.focus();
      };
      options.root.append(dialog);
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    },
    reset() {
      closePicker();
      queue.reset();
    },
    destroy() {
      closePicker();
      queue.destroy();
    },
  };
}
