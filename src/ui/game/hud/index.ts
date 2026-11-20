import type { PlayerId } from '../../../game/contracts';
import type { GameView } from '../adapter';
import { ownerMark } from '../art/ownership';
import { createPortrait } from '../portraits/portrait';
import {
  createEmotionController,
  type EmotionCue,
  type PortraitReaction,
} from '../portraits/emotions';
import {
  hudPlayers,
  money,
  playerAssets,
  type ConfirmedCashEvent,
  type DisplayMeta,
} from './model';
import './hud.css';

export { cashEventsFromGameEvents } from './model';
export type {
  ConfirmedCashEvent,
  DisplayMeta,
  PlayerDisplayMeta,
} from './model';
export interface AssetDetailsRequest {
  playerId: PlayerId;
  view: GameView;
  assets: ReturnType<typeof playerAssets>;
  trigger: HTMLButtonElement;
}
export interface HudUpdate {
  /** Full replacement for optional metadata, not a patch. */
  meta?: DisplayMeta;
  cashEvents?: readonly ConfirmedCashEvent[];
  emotionCues?: readonly EmotionCue[];
}
export interface HudOptions {
  meta?: DisplayMeta;
  /** Borrowed controller: HUD never resets or destroys it. */
  emotions?: { get(playerId: PlayerId): PortraitReaction };
  onAssetDetails?: (request: AssetDetailsRequest) => void;
}
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = '',
) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
type Row = ReturnType<typeof createRow>;
function createRow() {
  const element = el('li', 'pm-hud-player');
  const turn = el('span', 'pm-hud-turn');
  const identity = el('div', 'pm-hud-identity');
  const avatar = el('span', 'pm-hud-portrait');
  const names = el('div', 'pm-hud-names');
  const control = el('span', 'pm-hud-controller');
  const name = el('h3', 'pm-hud-name');
  const type = el('span', 'pm-hud-type');
  names.append(control, name, type);
  identity.append(avatar, names);
  const cash = el('dl', 'pm-hud-cash');
  const balance = el('dd', 'pm-balance');
  balance.dataset.testid = 'pm-balance';
  const delta = el('span', 'pm-hud-delta');
  delta.setAttribute('aria-hidden', 'true');
  cash.append(el('dt', '', '보유 현금'), balance);
  const chips = el('div', 'pm-hud-chips');
  const supplied = el('dl', 'pm-hud-supplied');
  const details = el('button', 'pm-hud-assets');
  details.type = 'button';
  element.append(turn, identity, cash, delta, chips, supplied, details);
  return {
    element,
    turn,
    avatar,
    control,
    name,
    type,
    balance,
    delta,
    chips,
    supplied,
    details,
    portrait: undefined as ReturnType<typeof createPortrait> | undefined,
    deltaTimer: undefined as ReturnType<typeof setTimeout> | undefined,
  };
}

/** Appends only its own subtree. update preserves rows, focus and portrait loaders. */
export function mountPlayerHud(
  root: HTMLElement,
  initialView: GameView,
  options: HudOptions = {},
) {
  const element = el('section', 'pm-player-hud');
  element.setAttribute('aria-label', '플레이어 정보');
  const heading = el('h2', 'pm-hud-heading', '트레이너');
  const round = el('span', 'pm-hud-round');
  const header = el('header', 'pm-hud-header');
  header.append(heading, round);
  const list = el('ol', 'pm-hud-list');
  const live = el('p', 'pm-hud-sr');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('aria-atomic', 'true');
  element.append(header, list, live);
  root.append(element);
  const rows = new Map<PlayerId, Row>();
  const seenCash = new Set<string>();
  let disposed = false;
  let view = initialView;
  let meta = options.meta ?? {};
  let active = '';
  let announceTimer: ReturnType<typeof setTimeout> | undefined;
  let messages: string[] = [];
  let dialog: HTMLDialogElement | undefined;
  const localEmotions = options.emotions
    ? undefined
    : createEmotionController((id) => refreshEmotions(id));
  const emotions = options.emotions ?? localEmotions!;
  function refreshEmotions(playerId?: PlayerId) {
    if (disposed) return;
    for (const [id, row] of rows)
      if (!playerId || id === playerId)
        row.portrait?.setReaction(emotions.get(id));
  }
  function announce(message: string) {
    messages.push(message);
    if (announceTimer) clearTimeout(announceTimer);
    announceTimer = setTimeout(() => {
      live.textContent = messages.join(' · ');
      messages = [];
    }, 180);
  }
  function closeDetails() {
    if (!dialog) return;
    dialog.close();
    dialog.remove();
    dialog = undefined;
  }
  function showDetails(playerId: PlayerId, trigger: HTMLButtonElement) {
    const request = {
      playerId,
      view,
      assets: playerAssets(view, playerId),
      trigger,
    };
    if (options.onAssetDetails) return options.onAssetDetails(request);
    closeDetails();
    const node = el('dialog', 'pm-hud-dialog');
    dialog = node;
    const title = el(
      'h2',
      '',
      `${view.state.players.find((p) => p.id === playerId)?.name ?? ''}의 소유 자산`,
    );
    title.id = `pm-hud-details-${crypto.randomUUID()}`;
    node.setAttribute('aria-labelledby', title.id);
    node.append(title);
    for (const [label, holdings] of [
      ['도시', request.assets.cities],
      ['특별 명소', request.assets.landmarks],
    ] as const) {
      node.append(el('h3', '', `${label} ${holdings.length}`));
      const items = el('ul', '');
      for (const holding of holdings)
        items.append(
          el(
            'li',
            '',
            view.map.tiles.find((t) => t.id === holding.tileId)?.nameKo ??
              holding.tileId,
          ),
        );
      node.append(holdings.length ? items : el('p', '', '없음'));
    }
    const close = el('button', '', '닫기');
    close.type = 'button';
    close.onclick = () => node.close();
    node.append(close);
    node.addEventListener('close', () => {
      node.remove();
      if (dialog === node) dialog = undefined;
      if (trigger.isConnected) trigger.focus();
    });
    element.append(node);
    node.showModal();
  }
  function update(next: GameView, input: HudUpdate = {}) {
    if (disposed) return;
    // An open default detail view must never show stale ownership.
    closeDetails();
    view = next;
    if (input.meta !== undefined) meta = input.meta;
    round.textContent = `TURN ${view.state.turnNumber}`;
    const players = hudPlayers(view, meta);
    const ids = new Set(players.map((p) => p.id));
    for (const [id, row] of rows) {
      if (ids.has(id)) continue;
      row.portrait?.destroy();
      clearTimeout(row.deltaTimer);
      row.element.remove();
      rows.delete(id);
    }
    for (const [index, player] of players.entries()) {
      let row = rows.get(player.id);
      if (!row) {
        row = createRow();
        rows.set(player.id, row);
        row.details.onclick = () => showDetails(player.id, row!.details);
      }
      // Do not move already ordered nodes: this also preserves keyboard focus.
      if (list.children[index] !== row.element)
        list.insertBefore(row.element, list.children[index] ?? null);
      row.element.dataset.playerId = player.id;
      row.element.dataset.type = player.theme.key;
      row.element.dataset.bankrupt = String(player.bankrupt);
      row.element.classList.toggle('is-active', player.active);
      if (player.active) row.element.setAttribute('aria-current', 'step');
      else row.element.removeAttribute('aria-current');
      row.element.style.setProperty('--hud-type', player.theme.color);
      row.element.style.setProperty('--hud-type-light', player.theme.light);
      row.element.style.setProperty('--hud-type-dark', player.theme.dark);
      row.turn.textContent = player.bankrupt
        ? '파산 · 탈락'
        : player.active
          ? '▶ 현재 차례'
          : '대기';
      row.control.textContent =
        player.controller === 'human'
          ? '사람 · 직접 플레이'
          : player.controller === 'computer'
            ? '컴퓨터'
            : '참가자';
      row.name.textContent = player.name;
      row.type.replaceChildren();
      const mark = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'svg',
      );
      mark.setAttribute('viewBox', '0 0 18 18');
      mark.setAttribute('aria-hidden', 'true');
      // ownerMark returns only static, code-owned SVG geometry and palette.
      mark.innerHTML = ownerMark(player, 0, 0, 18);
      row.type.append(mark, document.createTextNode(player.theme.label));
      if (row.portrait?.pokemonId !== player.pokemonId) {
        row.portrait?.destroy();
        row.portrait = createPortrait({
          pokemonId: player.pokemonId,
          name: player.theme.label + ' 타입 파트너',
        });
        row.avatar.replaceChildren(row.portrait.element);
      }
      row.balance.textContent = money(player.balance);
      row.balance.setAttribute(
        'aria-label',
        `보유 현금 ${money(player.balance)}`,
      );
      row.chips.replaceChildren();
      for (const [label, value] of [
        ['특성', player.meta.abilityName],
        ['가호', player.meta.blessing],
        ['시험', player.meta.trialStay],
        [
          '컴퓨터',
          player.controller === 'computer'
            ? player.meta.computerStatus
            : undefined,
        ],
        ['쿨다운', player.meta.abilityCooldown],
      ]) {
        if (value)
          row.chips.append(el('span', 'pm-hud-chip', `${label} · ${value}`));
      }
      row.chips.hidden = !row.chips.childElementCount;
      row.supplied.replaceChildren();
      for (const [label, value] of [
        ['총자산', player.meta.totalAssets],
        ['예상 수입', player.meta.expectedIncome],
        ['미납', player.meta.unpaidAmount],
      ] as const) {
        if (value !== undefined && Number.isFinite(value))
          row.supplied.append(el('dt', '', label), el('dd', '', money(value)));
      }
      row.supplied.hidden = !row.supplied.childElementCount;
      row.details.textContent = `도시 ${player.assets.cities.length} · 특별 명소 ${player.assets.landmarks.length}  ›`;
      row.details.setAttribute(
        'aria-label',
        `${player.name} 자산 상세, 도시 ${player.assets.cities.length}, 특별 명소 ${player.assets.landmarks.length}`,
      );
    }
    localEmotions?.syncState(view.state);
    for (const cue of input.emotionCues ?? []) localEmotions?.apply(cue);
    refreshEmotions();
    const nextActive = players.find((p) => p.active);
    const turnKey = nextActive
      ? `${view.state.turnNumber}:${nextActive.id}`
      : view.state.phase;
    if (active && active !== turnKey)
      announce(
        nextActive ? `${nextActive.name} 현재 차례` : '진행 중인 차례 없음',
      );
    active = turnKey;
    const sums = new Map<PlayerId, number>();
    for (const event of input.cashEvents ?? []) {
      if (
        !rows.has(event.playerId) ||
        !event.id ||
        seenCash.has(event.id) ||
        !Number.isFinite(event.amount) ||
        !event.amount
      )
        continue;
      seenCash.add(event.id);
      sums.set(event.playerId, (sums.get(event.playerId) ?? 0) + event.amount);
    }
    for (const [id, amount] of sums) {
      if (!amount) continue;
      const row = rows.get(id)!;
      clearTimeout(row.deltaTimer);
      row.delta.textContent = `${amount > 0 ? '+' : '−'}${money(Math.abs(amount))}`;
      row.delta.dataset.direction = amount > 0 ? 'gain' : 'loss';
      row.deltaTimer = setTimeout(() => {
        row.delta.textContent = '';
      }, 1800);
      announce(
        `${players.find((p) => p.id === id)!.name} 현금 ${money(Math.abs(amount))} ${amount > 0 ? '증가' : '감소'}`,
      );
    }
  }
  update(initialView);
  return {
    element,
    update,
    /** Call from a borrowed emotion controller's changed callback. */
    refreshEmotions,
    destroy() {
      if (disposed) return;
      disposed = true;
      closeDetails();
      clearTimeout(announceTimer);
      localEmotions?.destroy();
      for (const row of rows.values()) {
        row.portrait?.destroy();
        clearTimeout(row.deltaTimer);
        row.details.onclick = null;
      }
      rows.clear();
      seenCash.clear();
      element.remove();
    },
  };
}
