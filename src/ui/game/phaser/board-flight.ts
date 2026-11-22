import type { TileId } from '../../../game/contracts';
import type { FlightSelection } from '../events/contracts';
import { decorateDestination } from '../events/flight-picker/card';
import './board-flight.css';

/** Candidate and quote display only. A single explicit submit crosses the authority boundary. */
export function createBoardFlight(root: HTMLElement, changed: () => void) {
  const panel = document.createElement('section');
  panel.className = 'pm-board-flight';
  panel.hidden = true;
  panel.setAttribute('aria-label', '공중날기 목적지 선택');
  const title = document.createElement('strong');
  const help = document.createElement('p');
  help.textContent = '보드를 끌어 이동 · 도시를 눌러 후보 선택 · 확정하면 출발';
  const card = document.createElement('button');
  card.type = 'button';
  card.tabIndex = -1;
  card.hidden = true;
  card.setAttribute('aria-live', 'polite');
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = '키보드로 목적지 선택';
  const list = document.createElement('div');
  list.className = 'pm-board-flight-list';
  details.append(summary, list);
  const actions = document.createElement('div');
  actions.className = 'pm-board-flight-actions';
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.textContent = '목적지 확정';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.textContent = '비행 취소 · Esc';
  actions.append(confirm, cancel);
  panel.append(title, help, card, status, details, actions);
  root.append(panel);
  let selection: FlightSelection | undefined;
  let version = '';
  let epoch = 0;
  let candidate: TileId | undefined;
  let hover: TileId | undefined;
  let submitting = false;
  let locked = false;
  let choose:
    ((id: string, tile: TileId | null) => void | Promise<void>) | undefined;
  function refresh() {
    root.dataset.flightSelection = String(!!selection);
    root.dataset.flightCandidate = candidate ?? '';
    panel.hidden = !selection;
    confirm.disabled = !candidate || submitting || locked;
    cancel.textContent = selection?.cancellable
      ? '비행 취소 · Esc'
      : '후보 취소 · Esc';
    cancel.disabled = submitting || locked;
    const destination = selection?.destinations.find(
      (d) => d.tileId === (hover ?? candidate),
    );
    card.hidden = !destination;
    if (destination) decorateDestination(card, destination);
    list.querySelectorAll('button').forEach((b) => {
      b.disabled = submitting || locked;
      b.setAttribute('aria-pressed', String(b.dataset.tileId === candidate));
    });
    changed();
  }
  function pick(id: TileId) {
    if (
      locked ||
      submitting ||
      !selection?.destinations.some((d) => d.tileId === id)
    )
      return false;
    candidate = id;
    hover = undefined;
    status.textContent = `${selection.destinations.find((d) => d.tileId === id)!.label} 선택됨 · 확정하면 이동합니다.`;
    refresh();
    return true;
  }
  async function submit(tile: TileId | null) {
    if (
      locked ||
      !selection ||
      !choose ||
      submitting ||
      (tile === null && !selection.cancellable)
    )
      return;
    if (tile !== null && !selection.destinations.some((d) => d.tileId === tile))
      return;
    const token = epoch;
    submitting = true;
    refresh();
    try {
      await choose(selection.id, tile);
      if (epoch === token) api.set(undefined);
    } catch (error) {
      if (epoch !== token) return;
      submitting = false;
      status.textContent =
        error instanceof Error ? error.message : '선택을 처리하지 못했습니다.';
      refresh();
    }
  }
  confirm.onclick = () => {
    if (candidate) void submit(candidate);
  };
  function clearCandidate() {
    candidate = undefined;
    hover = undefined;
    status.textContent = '후보 선택을 해제했습니다. 목적지를 선택하세요.';
    refresh();
  }
  cancel.onclick = () => {
    if (selection?.cancellable) void submit(null);
    else clearCandidate();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !selection) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (selection.cancellable) void submit(null);
    else clearCandidate();
  };
  document.addEventListener('keydown', escape, true);
  const api = {
    get selection() {
      return selection;
    },
    get candidate() {
      return candidate;
    },
    get hover() {
      return hover;
    },
    pick,
    lock(value: boolean) {
      if (locked !== value) {
        locked = value;
        refresh();
      }
    },
    inspect(id?: TileId) {
      const next = selection?.destinations.some((d) => d.tileId === id)
        ? id
        : undefined;
      if (hover === next) return;
      hover = next;
      refresh();
    },
    invalidate(next?: FlightSelection) {
      if (version && version !== JSON.stringify(next)) api.set(undefined);
    },
    set(next?: FlightSelection, handler?: typeof choose) {
      const key = next && handler ? JSON.stringify(next) : '';
      if (key === version) return;
      epoch++;
      version = key;
      selection = key ? next : undefined;
      choose = handler;
      candidate = undefined;
      hover = undefined;
      submitting = false;
      details.open = false;
      list.replaceChildren();
      title.textContent = next?.title ?? '어디로 날아갈까요?';
      status.textContent = '밝게 표시된 도시 중 목적지를 선택하세요.';
      for (const destination of selection?.destinations ?? []) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = destination.label;
        button.dataset.tileId = destination.tileId;
        button.onclick = () => {
          if (version === key) pick(destination.tileId);
        };
        button.onkeydown = (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!event.repeat) button.click();
          }
          const buttons = [...list.querySelectorAll('button')];
          const index = buttons.indexOf(button);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : event.key === 'ArrowDown' || event.key === 'ArrowRight'
                  ? (index + 1) % buttons.length
                  : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
                    ? (index + buttons.length - 1) % buttons.length
                    : undefined;
          if (next !== undefined) {
            event.preventDefault();
            buttons[next]?.focus();
            buttons[next]?.scrollIntoView({ block: 'nearest' });
          }
        };
        list.append(button);
      }
      refresh();
    },
    destroy() {
      api.set(undefined);
      document.removeEventListener('keydown', escape, true);
      panel.remove();
    },
  };
  return api;
}
