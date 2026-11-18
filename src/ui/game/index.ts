import { findSprite } from '../../assets/sprites';
import type {
  GameEvent,
  Player,
  PokemonId,
  TileId,
} from '../../game/contracts';
import type { GameUIAdapter, LobbyPlayer, UIChoice, UIUpdate } from './adapter';
import { boardCells, validateLobby } from './presentation';
import './game.css';
export type {
  GameUIAdapter,
  GameView,
  UIUpdate,
  GamePrompt,
  UIChoice,
} from './adapter';

const partners: { id: PokemonId; name: string }[] = [
  { id: 'pokemon:0001', name: '이상해씨' },
  { id: 'pokemon:0004', name: '파이리' },
  { id: 'pokemon:0007', name: '꼬부기' },
  { id: 'pokemon:0025', name: '피카츄' },
];
const money = (value: number) =>
  new Intl.NumberFormat('ko-KR').format(value) + ' ₽';
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  text = '',
) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
function button(text: string, run: () => void, className = '') {
  const node = el('button', className, text);
  node.type = 'button';
  node.onclick = run;
  return node;
}

/** Mounts only inside root. Call destroy before replacing the host screen. */
export function mountGameUI(root: HTMLElement, adapter: GameUIAdapter) {
  const host = el('section', 'pm-game');
  root.append(host);
  let view = adapter.getView();
  let disposed = false,
    busy = false,
    animating = false;
  let generation = 0;
  let dialog: HTMLDialogElement | null = null;
  let log: string[] = [],
    dice = '—',
    errorMessage = '';
  let lobby: LobbyPlayer[] = partners
    .slice(0, 2)
    .map((p, i) => ({ name: `트레이너 ${i + 1}`, pokemonId: p.id }));
  let queue = Promise.resolve();
  let frameId = 0;
  let spriteFrames: {
    node: HTMLElement;
    width: number;
    durations: readonly number[];
  }[] = [];
  const offsets = new Map<string, TileId>();
  const waiters = new Map<ReturnType<typeof setTimeout>, () => void>();
  const sleep = (ms: number) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        waiters.delete(timer);
        resolve();
      }, ms);
      waiters.set(timer, resolve);
    });
  const sprite = (id: PokemonId, walk = false) => {
    const node = el('span', 'pm-sprite');
    node.setAttribute('aria-hidden', 'true');
    const { animation: a, url } = findSprite(id, walk ? 'Walk' : 'Idle');
    if (a && url) {
      node.style.backgroundImage = `url("${url}")`;
      node.style.width = `${a.frameWidth}px`;
      node.style.height = `${a.frameHeight}px`;
      spriteFrames.push({
        node,
        width: a.frameWidth,
        durations: a.durationsMs,
      });
    } else node.textContent = '●';
    return node;
  };
  const tell = (message: string) => {
    const status = host.querySelector('.pm-status');
    if (status) status.textContent = message;
  };
  async function invoke(fn: () => void | Promise<void>) {
    if (busy || animating || disposed) return;
    busy = true;
    render();
    errorMessage = '';
    try {
      await fn();
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : '요청을 처리하지 못했습니다. 다시 시도하세요.';
    } finally {
      busy = false;
      if (!disposed) render();
    }
  }
  function choiceButton(choice: UIChoice, promptId?: string) {
    const b = button(
      choice.label,
      () => {
        void invoke(() =>
          promptId
            ? adapter.choose(promptId, choice.id)
            : choice.action
              ? adapter.dispatch(choice.action)
              : undefined,
        );
      },
      'pm-action',
    );
    b.disabled =
      !!choice.disabled || busy || animating || (!promptId && !choice.action);
    if (choice.description) b.title = choice.description;
    return b;
  }
  function closeDialog() {
    if (dialog) {
      dialog.close();
      dialog.remove();
      dialog = null;
    }
  }
  function modal(
    title: string,
    description: string,
    choices: HTMLElement[],
    dismissible: boolean,
  ) {
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const d = el('dialog', 'pm-dialog');
    dialog = d;
    const h = el('h2', '', title);
    h.id = `pm-dialog-${crypto.randomUUID()}`;
    d.setAttribute('aria-labelledby', h.id);
    d.append(h, el('p', '', description), ...choices);
    d.addEventListener('cancel', (event) => {
      if (!dismissible) event.preventDefault();
    });
    d.addEventListener('close', () => {
      if (dialog === d) dialog = null;
      d.remove();
      previous?.focus();
    });
    if (dismissible) d.append(button('닫기', () => d.close(), 'pm-secondary'));
    host.append(d);
    d.showModal();
  }
  function renderLobby(content: HTMLElement) {
    content.append(
      el('p', 'pm-eyebrow', 'KANTO & JOHTO · LOCAL BATTLE'),
      el('h1', 'pm-title', 'POKÉ MARBLE'),
      el('p', 'pm-muted', '트레이너 등록 ▸ 함께 모험할 파트너를 골라 주세요!'),
    );
    const count = el('select');
    count.dataset.focus = 'lobby-count';
    count.setAttribute('aria-label', '플레이 인원');
    for (const n of [2, 3, 4]) {
      const o = el('option', '', `${n}명`);
      o.value = String(n);
      o.selected = lobby.length === n;
      count.append(o);
    }
    count.onchange = () => {
      lobby = Array.from(
        { length: Number(count.value) },
        (_, i) =>
          lobby[i] ?? { name: `트레이너 ${i + 1}`, pokemonId: partners[i]!.id },
      );
      render();
    };
    content.append(count);
    const cards = el('div', 'pm-lobby-cards');
    lobby.forEach((p, i) => {
      const card = el('fieldset', 'pm-lobby-card');
      card.append(el('legend', '', `PLAYER 0${i + 1}`));
      const name = el('input');
      name.dataset.focus = `lobby-name-${i}`;
      name.value = p.name;
      name.maxLength = 20;
      name.setAttribute('aria-label', `트레이너 ${i + 1} 이름`);
      name.oninput = () => {
        p.name = name.value;
      };
      card.append(name);
      const portrait = el('div', 'pm-partner-portrait');
      portrait.append(
        sprite(p.pokemonId),
        el(
          'strong',
          '',
          partners.find((partner) => partner.id === p.pokemonId)?.name ??
            '파트너',
        ),
      );
      card.append(portrait);
      partners.forEach((partner) => {
        const b = button(
          partner.name,
          () => {
            p.pokemonId = partner.id;
            render();
          },
          'pm-partner',
        );
        b.prepend(sprite(partner.id));
        b.dataset.focus = `partner-${i}-${partner.id}`;
        b.setAttribute('aria-pressed', String(p.pokemonId === partner.id));
        card.append(b);
      });
      cards.append(card);
    });
    content.append(cards);
    const start = button(
      '▶ 모험을 시작한다!',
      () => {
        const error = validateLobby(lobby);
        if (error) {
          tell(error);
          return;
        }
        void invoke(() =>
          adapter.start(lobby.map((p) => ({ ...p, name: p.name.trim() }))),
        );
      },
      'pm-primary',
    );
    start.disabled = busy;
    start.dataset.focus = 'lobby-start';
    content.append(start);
    content.append(
      el(
        'p',
        'pm-key-hint',
        '방향 선택: Tab  /  결정: Enter  /  돌아가기: Esc',
      ),
    );
  }
  function token(p: Player, i: number) {
    const t = el('span', `pm-token pm-player-${i}`);
    t.title = p.name;
    t.setAttribute('aria-label', p.name);
    t.append(sprite(p.pokemonId, offsets.has(p.id)));
    return t;
  }
  function render() {
    if (disposed) return;
    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.focus
        : undefined;
    closeDialog();
    spriteFrames = [];
    host.replaceChildren();
    const header = el('header', 'pm-header');
    header.append(
      el('strong', 'pm-brand', '◓ POKÉ MARBLE'),
      el(
        'span',
        'pm-badge',
        adapter.demo ? 'DEMO · 모의 규칙' : 'LOCAL · 2–4 PLAYERS',
      ),
    );
    host.append(header);
    const status = el('p', 'pm-status');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = errorMessage || view.notice || '';
    host.append(status);
    if (view.state.phase === 'setup') {
      const lobbyNode = el('main', 'pm-lobby');
      host.append(lobbyNode);
      renderLobby(lobbyNode);
      if (focused)
        Array.from(host.querySelectorAll<HTMLElement>('[data-focus]'))
          .find((n) => n.dataset.focus === focused)
          ?.focus();
      return;
    }
    const layout = el('main', 'pm-layout');
    const boardArea = el('section', 'pm-board-area');
    const { side, cells } = boardCells(view.map.tiles.length);
    boardArea.append(el('p', 'pm-map-label', `▶ ${view.mapName}`));
    const board = el('div', 'pm-board');
    board.setAttribute('aria-label', '게임 보드');
    board.style.gridTemplateColumns = `repeat(${side}, 1fr)`;
    board.style.gridTemplateRows = `repeat(${side}, 1fr)`;
    const center = el('div', 'pm-board-center');
    center.style.gridArea = `2 / 2 / ${side} / ${side}`;
    center.append(
      el('span', 'pm-eyebrow', `TURN ${view.state.turnNumber}`),
      el('strong', 'pm-map-logo', 'POKÉ\nMARBLE'),
      el('span', 'pm-dice', dice),
      el('small', '', animating ? '이동하고 있다…' : '관동 · 성도 지방'),
    );
    if (side > 2) board.append(center);
    view.map.tiles.forEach((tile, index) => {
      const cell = cells[index]!;
      const b = button(
        '',
        () => {
          const holding = view.state.holdings.find((h) => h.tileId === tile.id);
          modal(
            tile.nameKo,
            holding
              ? `${view.state.players.find((p) => p.id === holding.ownerId)?.name ?? '소유자'} · 시설 ${holding.facilityLevel}단계`
              : '소유 정보 없음',
            [],
            true,
          );
        },
        `pm-tile pm-${tile.kind}`,
      );
      b.dataset.focus = tile.id;
      b.style.gridRow = String(cell.row);
      b.style.gridColumn = String(cell.column);
      b.append(el('span', 'pm-tile-name', tile.nameKo));
      const art = el('span', `pm-tile-art pm-art-${index % 3}`);
      art.setAttribute('aria-hidden', 'true');
      b.append(art);
      const holding = view.state.holdings.find((h) => h.tileId === tile.id);
      if (holding)
        b.append(
          el(
            'small',
            '',
            `${view.state.players.find((p) => p.id === holding.ownerId)?.name ?? ''} · Lv.${holding.facilityLevel}`,
          ),
        );
      const tokens = el('span', 'pm-tokens');
      view.state.players.forEach((p, i) => {
        if (!p.bankrupt && (offsets.get(p.id) ?? p.position) === tile.id)
          tokens.append(token(p, i));
      });
      b.append(tokens);
      board.append(b);
    });
    boardArea.append(board);
    layout.append(boardArea);
    const rail = el('aside', 'pm-rail');
    const active = view.state.players.find(
      (p) => p.id === view.state.activePlayerId,
    );
    rail.append(
      el('p', 'pm-eyebrow', `TURN ${view.state.turnNumber}`),
      el('h2', '', `${active?.name ?? '트레이너'}의 차례`),
    );
    const diceResult = el(
      'p',
      animating ? 'pm-dice-result is-moving' : 'pm-dice-result',
      `주사위  ${dice}${animating ? ' · 이동 중…' : ''}`,
    );
    diceResult.setAttribute('role', 'status');
    rail.append(diceResult);
    view.state.players.forEach((p, i) => {
      const card = el(
        'div',
        `pm-player-card pm-player-${i} ${p.id === active?.id ? 'is-active' : ''}`,
      );
      card.append(
        sprite(p.pokemonId),
        el('strong', '', p.name),
        el('span', '', p.bankrupt ? '파산' : money(p.balance)),
      );
      rail.append(card);
    });
    const controls = el('div', 'pm-controls');
    view.actions.forEach((a) => {
      const b = choiceButton(a);
      b.dataset.focus = a.id;
      controls.append(b);
    });
    rail.append(controls);
    rail.append(
      button(
        '자산 현황',
        () =>
          modal(
            '자산 현황',
            view.state.holdings.length
              ? '보유한 도시와 시설을 확인합니다.'
              : '아직 보유한 도시가 없습니다.',
            view.state.holdings.map((h) =>
              el(
                'p',
                '',
                `${view.map.tiles.find((t) => t.id === h.tileId)?.nameKo ?? h.tileId} · ${view.state.players.find((p) => p.id === h.ownerId)?.name ?? ''} · Lv.${h.facilityLevel}`,
              ),
            ),
            true,
          ),
        'pm-secondary',
      ),
    );
    const records = el('details', 'pm-records');
    records.open = true;
    records.append(el('summary', '', '여행 기록'));
    const list = el('ol');
    log.slice(-30).forEach((entry) => list.append(el('li', '', entry)));
    records.append(list);
    rail.append(records);
    layout.append(rail);
    host.append(layout);
    const dialogue = el('footer', 'pm-dialogue');
    dialogue.append(
      el('strong', '', `${active?.name ?? '트레이너'} ▸`),
      el(
        'span',
        '',
        animating
          ? '다음 마을로 이동하고 있다…'
          : view.prompt
            ? view.prompt.title
            : '무엇을 할까? 주사위를 굴리거나 자산을 확인하자!',
      ),
      el('small', '', '▼'),
    );
    host.append(dialogue);
    if (focused)
      Array.from(host.querySelectorAll<HTMLElement>('[data-focus]'))
        .find((n) => n.dataset.focus === focused)
        ?.focus();
    if (!animating && view.state.phase === 'finished') {
      const winner = view.state.players.find(
        (p) => p.id === view.state.victory?.winnerId,
      );
      modal(
        '여행 완료!',
        `${winner?.name ?? '트레이너'} 승리 · ${view.state.victory ? victoryLabels[view.state.victory.reason] : '결과 확인'}`,
        [
          button(
            '새 여행 시작',
            () => {
              void invoke(() => adapter.restart());
            },
            'pm-primary',
          ),
        ],
        false,
      );
    } else if (!animating && view.prompt) {
      const p = view.prompt;
      modal(
        p.title,
        p.description,
        p.choices.map((c) => choiceButton(c, p.id)),
        !!p.dismissible,
      );
    }
  }
  function eventText(event: GameEvent) {
    const name =
      'playerId' in event
        ? (view.state.players.find((p) => p.id === event.playerId)?.name ??
          '트레이너')
        : '';
    switch (event.type) {
      case 'dice-rolled':
        dice = event.values.join(' · ');
        return `${name}: 주사위 ${dice}`;
      case 'player-moved':
        return `${name}: ${view.map.tiles.find((t) => t.id === event.to)?.nameKo ?? event.to} 도착`;
      case 'city-acquired':
        return `${name}: 도시 구매`;
      case 'facility-upgraded':
        return `시설 ${event.level}단계 강화`;
      case 'toll-paid':
        return `통행료 ${money(event.amount)} 지불`;
      case 'player-bankrupt':
        return `${name}: 파산`;
      case 'turn-ended':
        return `${name}: 턴 종료`;
      case 'game-won':
        return `${name}: 승리`;
    }
  }
  async function update(update: UIUpdate) {
    if (disposed) return;
    view = update.view;
    if (view.state.phase === 'setup') {
      generation++;
      log = [];
      dice = '—';
    }
    log = [...log, ...update.events.map(eventText)].slice(-30);
    const current = generation;
    if (
      update.movement &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      animating = true;
      for (const tile of update.movement.path) {
        if (disposed || current !== generation) break;
        offsets.set(update.movement.playerId, tile);
        render();
        await sleep(180);
      }
      offsets.clear();
      animating = false;
    }
    render();
  }
  const unsubscribe = adapter.subscribe((u) => {
    queue = queue
      .then(() => update(u))
      .catch(() => {
        animating = false;
        tell('화면을 갱신하지 못했습니다.');
      });
  });
  function animateSprites(now: number) {
    if (disposed) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    for (const { node, width, durations } of spriteFrames) {
      const total = durations.reduce((a, b) => a + b, 0);
      let elapsed = reduced || !total ? 0 : now % total;
      let frame = 0;
      while (frame < durations.length - 1 && elapsed >= durations[frame]!) {
        elapsed -= durations[frame]!;
        frame++;
      }
      node.style.backgroundPositionX = `${-frame * width}px`;
    }
    frameId = requestAnimationFrame(animateSprites);
  }
  render();
  frameId = requestAnimationFrame(animateSprites);
  return {
    destroy() {
      disposed = true;
      cancelAnimationFrame(frameId);
      spriteFrames = [];
      generation++;
      unsubscribe();
      closeDialog();
      for (const [timer, done] of waiters) {
        clearTimeout(timer);
        done();
      }
      waiters.clear();
      host.remove();
    },
  };
}
const victoryLabels = {
  'last-player-standing': '마지막 생존',
  'three-city-groups': '도시 그룹 3개',
  'one-side-cities': '한 면 도시 독점',
  'four-landmarks': '명소 4개',
};
