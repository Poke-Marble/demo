import type { TileId } from '../../../game/contracts';
import type {
  EventPresentation,
  FlightSelection,
  SpecialEventRequest,
} from './contracts';
import { createLegendarySprite } from './legendary-sprite';
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
          `pm-event pm-event-${request.type}${request.type === 'trial-intro' ? ' pm-event-' + request.legendary : ''}`,
        );
        dialog.setAttribute(
          'aria-label',
          request.type === 'fly' ? '공중날기 연출' : '전설 시험 등장 연출',
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
        const legendarySprite =
          request.type === 'trial-intro'
            ? createLegendarySprite(request.legendary, media.matches)
            : undefined;
        graphic.setAttribute('aria-hidden', 'true');
        if (!legendarySprite)
          graphic.append(
            node('span', 'pm-event-wing left'),
            node('span', 'pm-event-body'),
            node('span', 'pm-event-wing right'),
          );
        if (legendarySprite) graphic.append(legendarySprite.element);
        const shadow = node('div', 'pm-event-shadow');
        shadow.setAttribute('aria-hidden', 'true');
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
        const feathers = node('div', 'pm-event-feathers');
        feathers.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < 3; i++) feathers.append(node('span'));
        const reducedSummary =
          request.type === 'fly'
            ? `${description.playerName} · ${description.destinationName ?? request.to} 도착`
            : `${description.partnerName} VS ${title.textContent}`;
        const status = node('p', 'pm-event-caption');
        status.setAttribute('role', 'status');
        const skip = action('연출 스킵 · Enter / Space / Esc', finish);
        if (legendarySprite) stage.append(eyebrow, feathers, versus, status);
        else
          stage.append(
            eyebrow,
            feathers,
            graphic,
            shadow,
            title,
            versus,
            status,
          );
        dialog.append(stage, skip);
        const timers: ReturnType<typeof setTimeout>[] = [];
        let done = false;
        function finish() {
          if (done) return;
          done = true;
          legendarySprite?.dispose();
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
            ? ['암전', '이륙', '화면 횡단', '착지']
            : [
                '암전',
                request.legendary === 'lugia'
                  ? '파도가 일렁인다'
                  : '깃털과 빛이 내려온다',
                '전설과 마주하다',
                '보드로 복귀',
              ];
        function phase(index: number) {
          dialog.dataset.phase = String(index);
          legendarySprite?.phase(index);
          status.textContent = `${description.playerName} · ${phases[index]}`;
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
