import { findSprite } from '../../assets/sprites';
import type { GameEvent, PokemonId, TileId } from '../../game/contracts';
import type { GameUIAdapter, UIChoice, UIUpdate } from './adapter';
import { createProjectedBoard } from './board';
import {
  startingPartners as partners,
  createInitialRoster,
  isHumanTurn,
} from './setup';
import { createWorldScenery } from './scenery';
import './game.css';
import './isometric.css';
export type {
  GameUIAdapter,
  GameView,
  UIUpdate,
  GamePrompt,
  UIChoice,
  GameSetup,
  SetupParticipant,
} from './adapter';
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
  host.tabIndex = -1;
  host.addEventListener('keydown', (event) => {
    if (
      event.key === 'Escape' &&
      view.state.phase === 'setup' &&
      setupScreen !== 'title'
    ) {
      event.preventDefault();
      setupScreen = setupScreen === 'map' ? 'starter' : 'title';
      render();
      host.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    }
  });
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
  let setupScreen: 'title' | 'starter' | 'map' = 'title';
  let selectedPartner: PokemonId = partners[0]!.id;
  let computerRunKey = '';
  let computerAbort: AbortController | null = null;
  let computerRunning = false;
  let computerError = false;
  let recordsOpen = false;
  const humanTurn = () => isHumanTurn(view.state, view.participants);
  let queue = Promise.resolve();
  let frameId = 0;
  let spriteFrames: {
    node: HTMLElement;
    width: number;
    durations: readonly number[];
  }[] = [];
  const offsets = new Map<string, TileId>();
  const movementFrom = new Map<string, TileId>();
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
      `pm-action${choice.action?.type === 'roll-dice' ? ' pm-action-roll' : ''}`,
    );
    b.disabled =
      !!choice.disabled ||
      busy ||
      animating ||
      !humanTurn() ||
      (!promptId &&
        (!choice.action ||
          choice.action.playerId !== view.state.activePlayerId));
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
  function renderSetup(content: HTMLElement) {
    content.classList.add('pm-setup-' + setupScreen);
    const intro = el('div', 'pm-lobby-intro');
    intro.append(
      el('p', 'pm-eyebrow', 'KANTO & JOHTO'),
      el('h1', 'pm-title', 'Poké Marble'),
    );
    content.append(intro);
    const navigate = (screen: typeof setupScreen) => {
      setupScreen = screen;
      errorMessage = '';
      render();
      host
        .querySelector<HTMLButtonElement>(
          '[aria-pressed="true"]:not(:disabled), .pm-primary',
        )
        ?.focus();
    };
    if (setupScreen === 'title') {
      const titleScene = el('div', 'pm-title-scene');
      titleScene.append(createWorldScenery());
      partners.forEach((partner, i) => {
        const mascot = el('span', 'pm-title-mascot pm-mascot-' + i);
        mascot.append(sprite(partner.id));
        titleScene.append(mascot);
      });
      content.append(
        titleScene,
        el(
          'p',
          'pm-muted',
          '하나의 보드, 네 마리의 포켓몬. 새로운 모험을 시작하세요.',
        ),
        button('NEW GAME', () => navigate('starter'), 'pm-primary'),
      );
      content.append(
        el('p', 'pm-key-hint', '나 + COMPUTER 3명  ·  결정 Enter  ·  선택 Tab'),
      );
      return;
    }
    const steps = el(
      'p',
      'pm-setup-steps',
      setupScreen === 'starter'
        ? '01 파트너 선택   /   02 맵 선택'
        : '01 파트너 선택 ✓   /   02 맵 선택',
    );
    content.append(steps);
    if (setupScreen === 'starter') {
      content.append(
        el('h2', '', '어떤 포켓몬과 함께할까요?'),
        el(
          'p',
          'pm-muted',
          '내 파트너 한 마리를 고르면, 나머지 세 마리는 컴퓨터와 함께합니다.',
        ),
      );
      const choices = el('div', 'pm-starter-choices');
      partners.forEach((partner) => {
        const b = button(
          '',
          () => {
            selectedPartner = partner.id;
            render();
          },
          'pm-starter pm-type-' + partner.color,
        );
        b.dataset.focus = 'starter-' + partner.id;
        b.setAttribute('aria-label', partner.name + ' 선택');
        b.setAttribute('aria-pressed', String(selectedPartner === partner.id));
        const portrait = el('span', 'pm-partner-portrait');
        portrait.append(sprite(partner.id));
        b.append(
          el('span', 'pm-starter-type', partner.type),
          portrait,
          el('strong', '', partner.name),
          el(
            'small',
            '',
            selectedPartner === partner.id ? '내 파트너 ✓' : '파트너로 선택',
          ),
        );
        choices.append(b);
      });
      content.append(choices);
      const assignment = el('div', 'pm-assignment');
      createInitialRoster(selectedPartner).forEach((p) => {
        const member = el('span', 'pm-assigned-member');
        member.append(sprite(p.pokemonId), el('small', '', p.name));
        assignment.append(member);
      });
      content.append(
        assignment,
        button('다음 · 맵 선택', () => navigate('map'), 'pm-primary'),
        button('타이틀로', () => navigate('title'), 'pm-back'),
      );
    } else {
      content.append(el('h2', '', '모험할 지방을 선택하세요'));
      const maps = el('div', 'pm-map-choices');
      for (const [i, name] of ['관동 · 성도', '호연', '신오'].entries()) {
        const b = button('', () => {}, 'pm-map-choice pm-map-theme-' + i);
        b.disabled = i !== 0;
        b.setAttribute('aria-pressed', String(i === 0));
        b.append(
          el(
            'span',
            'pm-map-vignette',
            [
              '산과 숲을 잇는 두 지방',
              '바다 너머 새로운 여정',
              '눈 덮인 전설의 땅',
            ][i],
          ),
          el('strong', '', name),
          el('small', '', i === 0 ? '선택됨 ✓' : '준비중'),
        );
        maps.append(b);
      }
      content.append(
        maps,
        el(
          'p',
          'pm-muted',
          '나의 파트너: ' +
            partners.find((p) => p.id === selectedPartner)?.name +
            '  ·  COMPUTER 3명 자동 참가',
        ),
      );
      const start = button(
        '게임 시작',
        () => {
          void invoke(() =>
            adapter.start({
              mapId: view.map.id,
              participants: createInitialRoster(selectedPartner),
            }),
          );
        },
        'pm-primary',
      );
      start.disabled = busy;
      start.dataset.focus = 'setup-start';
      content.append(
        start,
        button('파트너 다시 선택', () => navigate('starter'), 'pm-back'),
      );
    }
    content.append(
      el('p', 'pm-key-hint', '선택 Tab  ·  결정 Enter  ·  이전 화면 Esc'),
    );
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
        adapter.demo ? 'DEMO · AI 시연' : '1 PLAYER + 3 COMPUTER',
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
      renderSetup(lobbyNode);
      if (focused)
        Array.from(host.querySelectorAll<HTMLElement>('[data-focus]'))
          .find((n) => n.dataset.focus === focused)
          ?.focus();
      return;
    }
    const layout = el('main', 'pm-layout');
    const boardArea = el('section', 'pm-board-area');
    const mapLabel = el('p', 'pm-map-label', view.mapName);
    boardArea.append(mapLabel);
    const board = createProjectedBoard({
      view,
      dice,
      animating,
      positions: offsets,
      from: movementFrom,
      sprite,
      openTile(tileId) {
        const tile = view.map.tiles.find((t) => t.id === tileId)!;
        const holding = view.state.holdings.find((h) => h.tileId === tileId);
        const owner = view.state.players.find((p) => p.id === holding?.ownerId);
        modal(
          tile.nameKo,
          holding
            ? (owner?.name ?? '') + ' / Lv.' + holding.facilityLevel
            : tile.nameKo,
          [],
          true,
        );
      },
    });
    boardArea.append(board);
    layout.append(boardArea);
    const rail = el('aside', 'pm-rail');
    const active = view.state.players.find(
      (p) => p.id === view.state.activePlayerId,
    );
    rail.append(
      el('p', 'pm-eyebrow', `TURN ${view.state.turnNumber}`),
      el(
        'h2',
        '',
        view.state.phase === 'finished'
          ? '게임 결과'
          : `${view.participants.find((p) => p.id === active?.id)?.name ?? active?.name ?? '트레이너'}의 차례`,
      ),
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
        el('span', 'pm-trainer-number', `P${i + 1}`),
        el(
          'strong',
          '',
          view.participants.find((participant) => participant.id === p.id)
            ?.name ?? p.name,
        ),
        el('span', '', p.bankrupt ? '파산' : money(p.balance)),
      );
      const avatar = el('span', 'pm-hud-avatar');
      avatar.append(sprite(p.pokemonId));
      card.prepend(avatar);
      if (p.id === active?.id)
        card.append(
          el(
            'small',
            'pm-active-label',
            view.state.phase === 'finished'
              ? 'RESULT'
              : humanTurn()
                ? 'YOUR TURN'
                : 'COMPUTER TURN',
          ),
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
    if (!humanTurn() && view.state.phase === 'playing') {
      const connected = view.computer.connected && !!adapter.runComputerTurn;
      const progress = diceResult;
      progress.classList.add('pm-computer-progress');
      progress.replaceChildren();
      progress.append(
        el(
          'span',
          'pm-thinking',
          connected && !computerError ? '● ● ●' : '○ ○ ○',
        ),
        el(
          'span',
          '',
          computerError
            ? '컴퓨터 실행 오류 · 다시 시도해 주세요'
            : connected
              ? view.computer.status
              : '컴퓨터 AI 연결 대기 중',
        ),
      );
      if (computerError)
        progress.append(
          button(
            '다시 시도',
            () => {
              computerRunKey = '';
              computerError = false;
              render();
            },
            'pm-secondary',
          ),
        );
    }
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
    records.open = recordsOpen;
    records.ontoggle = () => {
      if (records.isConnected) recordsOpen = records.open;
    };
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
        view.state.phase === 'finished' && !animating
          ? '모험을 마쳤다! 결과를 확인하고 새로운 여행을 시작하자.'
          : !humanTurn() && view.state.phase === 'playing'
            ? `${active?.name ?? 'COMPUTER'} 진행 중 · ${view.computer.status}`
            : animating
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
    } else if (!animating && view.prompt && humanTurn()) {
      const p = view.prompt;
      modal(
        p.title,
        p.description,
        p.choices.map((c) => choiceButton(c, p.id)),
        !!p.dismissible,
      );
    }
    scheduleComputerTurn();
  }
  function scheduleComputerTurn() {
    if (
      disposed ||
      busy ||
      animating ||
      computerRunning ||
      humanTurn() ||
      view.state.phase !== 'playing' ||
      !view.computer.connected ||
      !adapter.runComputerTurn
    )
      return;
    const key = `${view.state.turnNumber}:${view.state.activePlayerId}`;
    if (computerRunKey === key) return;
    computerRunKey = key;
    computerRunning = true;
    computerError = false;
    const abort = new AbortController();
    computerAbort = abort;
    const playerId = view.state.activePlayerId;
    queueMicrotask(() => {
      if (abort.signal.aborted || disposed) return;
      render();
      void Promise.resolve()
        .then(() => adapter.runComputerTurn!(playerId, abort.signal))
        .catch((error: unknown) => {
          if (!abort.signal.aborted) {
            computerError = true;
            errorMessage =
              error instanceof Error
                ? error.message
                : '컴퓨터 실행에 실패했습니다.';
          }
        })
        .finally(() => {
          if (computerAbort === abort) {
            computerRunning = false;
            computerAbort = null;
            if (!disposed) render();
          }
        });
    });
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
    if (view.state.phase === 'finished') computerAbort?.abort();
    if (view.state.phase === 'setup') {
      computerAbort?.abort();
      computerAbort = null;
      computerRunning = false;
      computerRunKey = '';
      computerError = false;
      setupScreen = 'title';
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
      const previous = update.events.find(
        (event) =>
          event.type === 'player-moved' &&
          event.playerId === update.movement?.playerId,
      );
      let previousTile =
        previous?.type === 'player-moved'
          ? previous.from
          : update.movement.path[0];
      for (const tile of update.movement.path) {
        if (disposed || current !== generation) break;
        if (previousTile)
          movementFrom.set(update.movement.playerId, previousTile);
        offsets.set(update.movement.playerId, tile);
        render();
        await sleep(230);
        previousTile = tile;
      }
      offsets.clear();
      movementFrom.clear();
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
      computerAbort?.abort();
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
