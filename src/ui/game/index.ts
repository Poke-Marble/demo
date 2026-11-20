import { createAbilityPresenter } from './abilities/presenter';
import { createGameplayFeedback } from './feedback/controller';
import { createUpdateGate, walkingPath } from './feedback/policy';
import type { SfxBus } from './feedback/audio';
import { findSprite } from '../../assets/sprites';
import type { GameEvent, PokemonId, TileId } from '../../game/contracts';
import type { GameUIAdapter, UIChoice, UIUpdate } from './adapter';
import { createProjectedBoard } from './board';
import { ownerTheme } from './art/ownership';
import {
  constructionFromHolding,
  type ConstructionVisual,
} from './art/construction';
import {
  startingPartners as partners,
  createInitialRoster,
  isHumanTurn,
} from './setup';
import { createWorldScenery } from './scenery';
import { createSpecialEventPresenter } from './events/presenter';
import { gameCredits } from './events/credits';
import './events/shell.css';
import { createPortrait } from './portraits/portrait';
import {
  createEmotionController,
  eventEmotionCues,
} from './portraits/emotions';
export type { EmotionCue, PortraitReaction } from './portraits/emotions';
export type { SpecialEventRequest, FlightSelection } from './events/contracts';
import './game.css';
import './isometric.css';
import './theme/theme.css';
import { diceLabel } from './theme/dice';
export type {
  GameUIAdapter,
  GameView,
  UIUpdate,
  GamePrompt,
  UIChoice,
  GameSetup,
  SetupParticipant,
  UICredit,
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
export function mountGameUI(
  root: HTMLElement,
  adapter: GameUIAdapter,
  options: { sfx?: SfxBus } = {},
) {
  let previousConstruction = new Map<TileId, ConstructionVisual>();
  const host = el('section', 'pm-game pm-shell');
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
  const feedback = createGameplayFeedback(root, options.sfx);
  const abilityWaiters = new Map<string, () => void>();
  const ability = createAbilityPresenter(root, {
    onEnd: (activation) => {
      abilityWaiters.get(activation.id)?.();
      abilityWaiters.delete(activation.id);
    },
  });
  const releaseAudio = feedback.audio.subscribe((settings) => {
    ability.audio.setMuted(settings.muted);
    ability.audio.setVolume(settings.volume * 0.35);
  });
  const unlockAbility = () => {
    void ability.audio.unlock();
  };
  const cancelAbility = () => ability.cancel();
  // This transient sibling stays usable while game input is inert.
  const skipFeedback = button(
    '?? ?? ? Esc',
    () => {
      feedback.skip();
      ability.cancel();
      effects.skip();
      for (const [timer, done] of waiters) {
        clearTimeout(timer);
        done();
      }
      waiters.clear();
    },
    'pm-feedback-skip',
  );
  skipFeedback.hidden = true;
  root.append(skipFeedback);
  const skipOnEscape = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && !skipFeedback.hidden) {
      event.preventDefault();
      skipFeedback.click();
    }
  };
  document.addEventListener('keydown', skipOnEscape);
  const visibilityAbility = () => {
    if (document.hidden) cancelAbility();
  };
  root.addEventListener('pointerdown', unlockAbility, true);
  root.addEventListener('keydown', unlockAbility, true);
  document.addEventListener('visibilitychange', visibilityAbility);
  const feedbackGate = createUpdateGate();
  let feedbackLocked = false;
  let pendingFeedback = 0;
  let view = adapter.getView();
  let disposed = false,
    busy = false,
    animating = false;
  let generation = 0;
  let dialog: HTMLDialogElement | null = null;
  let log: string[] = [],
    dice = diceLabel(null),
    errorMessage = '';
  let setupScreen: 'title' | 'starter' | 'map' = 'title';
  let selectedPartner: PokemonId = partners[0]!.id;
  let computerRunKey = '';
  let computerAbort: AbortController | null = null;
  let computerRunning = false;
  let computerError = false;
  let recordsOpen = false;
  let effectsLocked = false;
  let effectFocus: HTMLElement | null = null;
  const portraits = new Map<string, ReturnType<typeof createPortrait>>();
  const emotions = createEmotionController((playerId) => {
    portraits.get(playerId)?.setReaction(emotions.get(playerId));
  });
  let seenEventObjects = new WeakSet<GameEvent>();
  let anonymousUpdate = 0;
  function lockEffects(locked: boolean) {
    if (locked && !effectsLocked) {
      effectFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    effectsLocked = locked;
    host.inert = locked || feedbackLocked;
    if (!locked)
      requestAnimationFrame(() => {
        if (disposed || effectsLocked || feedbackLocked) return;
        if (effectFocus?.isConnected) effectFocus.focus();
        else
          host
            .querySelector<HTMLButtonElement>('button:not(:disabled)')
            ?.focus();
        effectFocus = null;
      });
  }
  const effects = createSpecialEventPresenter({
    root,
    lock: lockEffects,
    partnerVisual(request) {
      const player = view.state.players.find((p) => p.id === request.playerId);
      return player ? sprite(player.pokemonId) : undefined;
    },
    describe(request) {
      const player = view.state.players.find((p) => p.id === request.playerId);
      return {
        playerName: player?.name ?? '트레이너',
        partnerName:
          partners.find((p) => p.id === player?.pokemonId)?.name ?? '내 포켓몬',
        ...(request.type === 'fly'
          ? {
              destinationName:
                view.map.tiles.find((t) => t.id === request.to)?.nameKo ??
                request.to,
            }
          : {}),
      };
    },
  });
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
    if (busy || animating || effectsLocked || feedbackLocked || disposed)
      return;
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
          promptId || choice.selectionId
            ? adapter.choose((promptId ?? choice.selectionId)!, choice.id)
            : choice.action
              ? adapter.dispatch(choice.action)
              : undefined,
        );
      },
      `pm-action${choice.action?.type === 'roll-dice' ? ' pm-action-roll' : ''}`,
    );
    b.dataset.choiceId = choice.id;
    b.disabled =
      !!choice.disabled ||
      busy ||
      animating ||
      effectsLocked ||
      feedbackLocked ||
      !humanTurn() ||
      (!promptId &&
        !choice.selectionId &&
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
    if (setupScreen === 'title')
      intro.append(el('h1', 'pm-title', 'Poke Marble'));
    if (setupScreen === 'title') content.append(intro);
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
        button('NEW GAME', () => navigate('starter'), 'pm-primary'),
      );
      return;
    }
    const steps = el(
      'p',
      'pm-setup-steps',
      setupScreen === 'starter' ? '1 / 2' : '2 / 2',
    );
    content.append(steps);
    if (setupScreen === 'starter') {
      content.append(el('h2', '', '파트너 선택'));
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
          el('small', '', selectedPartner === partner.id ? '선택됨 ✓' : '선택'),
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
      content.append(el('h2', '', '맵 선택'));
      const maps = el('div', 'pm-map-choices');
      for (const [i, name] of ['관동 · 성도', '호연', '신오'].entries()) {
        const b = button('', () => {}, 'pm-map-choice pm-map-theme-' + i);
        b.disabled = i !== 0;
        b.setAttribute('aria-pressed', String(i === 0));
        b.append(
          el('span', 'pm-map-vignette'),
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
          partners.find((p) => p.id === selectedPartner)?.name +
            ' · COMPUTER 3',
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
    skipFeedback.hidden =
      !feedbackLocked || effectsLocked || feedback.suppressed;
    const focused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement.dataset.focus
        : undefined;
    closeDialog();
    for (const [playerId, portrait] of portraits) {
      if (
        view.state.phase === 'setup' ||
        !view.state.players.some(
          (p) => p.id === playerId && p.pokemonId === portrait.pokemonId,
        )
      ) {
        portrait.destroy();
        portraits.delete(playerId);
      }
    }
    spriteFrames = [];
    host.replaceChildren();
    const header = el(
      'header',
      `pm-header${view.state.phase === 'setup' ? ' pm-header-setup' : ''}`,
    );
    if (view.state.phase !== 'setup')
      header.append(el('strong', 'pm-brand', 'Poke Marble'));
    const tools = el('div', 'pm-header-tools');
    if (adapter.demo)
      tools.append(
        el('span', 'pm-badge', adapter.demoLabel ?? 'DEMO · 규칙·AI 미연결'),
      );
    tools.append(
      button(
        '크레딧',
        () => {
          const content = el('div', 'pm-credits-content');
          for (const credit of gameCredits(view.credits)) {
            const entry = el('section', 'pm-credit-entry');
            entry.append(
              el('strong', '', credit.label),
              el('p', '', credit.attribution),
            );
            if (credit.sourceUrl) {
              const link = el('a', '', '원본 출처');
              link.href = credit.sourceUrl;
              link.target = '_blank';
              link.rel = 'noreferrer';
              entry.append(link);
            }
            content.append(entry);
          }
          modal('크레딧', '', [content], true);
        },
        'pm-credits-button',
      ),
    );
    header.append(tools);
    host.append(header);
    for (const credit of view.credits ?? []) {
      if (credit.requiredInline)
        host.append(el('p', 'pm-required-credit', credit.attribution));
    }
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
    boardArea.setAttribute('aria-label', view.mapName);
    const board = createProjectedBoard({
      view,
      dice,
      animating,
      previousConstruction,
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
    previousConstruction = new Map(
      view.state.holdings.map((holding) => [
        holding.tileId,
        constructionFromHolding(holding),
      ]),
    );
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
      dice,
    );
    diceResult.setAttribute('role', 'status');
    rail.append(diceResult);
    view.state.players.forEach((p, i) => {
      const card = el(
        'div',
        `pm-player-card pm-player-${i} ${p.id === active?.id ? 'is-active' : ''}`,
      );
      const theme = ownerTheme({
        id: p.id,
        name: p.name,
        pokemonId: p.pokemonId,
      });
      card.style.setProperty('--player', theme.color);
      card.style.setProperty('--player-soft', theme.light);
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
      const portrait =
        portraits.get(p.id) ??
        createPortrait({
          pokemonId: p.pokemonId,
          name:
            partners.find((partner) => partner.id === p.pokemonId)?.name ??
            p.name,
        });
      portraits.set(p.id, portrait);
      portrait.setReaction(emotions.get(p.id));
      avatar.append(portrait.element);
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
      progress.replaceChildren(el('span', 'pm-computer-dice', dice));
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
              : '컴퓨터 연결 대기',
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
          ? '여행 완료'
          : !humanTurn() && view.state.phase === 'playing'
            ? '진행 중…'
            : animating
              ? '이동 중…'
              : view.prompt
                ? view.prompt.title
                : '내 차례',
      ),
      el('small', '', '▼'),
    );
    host.append(dialogue);
    if (focused)
      Array.from(host.querySelectorAll<HTMLElement>('[data-focus]'))
        .find((n) => n.dataset.focus === focused)
        ?.focus();
    if (
      !animating &&
      !effectsLocked &&
      !feedbackLocked &&
      view.state.phase === 'finished'
    ) {
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
    } else if (
      !animating &&
      !effectsLocked &&
      !feedbackLocked &&
      view.prompt &&
      humanTurn() &&
      !view.flightSelection
    ) {
      const p = view.prompt;
      modal(
        p.title,
        p.description,
        p.choices.map((c) => choiceButton(c, p.id)),
        !!p.dismissible,
      );
    }
    if (!animating && !effectsLocked && !feedbackLocked)
      effects.select(
        view.flightSelection,
        adapter.selectFlightDestination?.bind(adapter),
      );
    scheduleComputerTurn();
  }
  function scheduleComputerTurn() {
    if (
      disposed ||
      busy ||
      animating ||
      effectsLocked ||
      feedbackLocked ||
      !!view.flightSelection ||
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
        return `${name}: 주사위 ${event.values.join(' · ')}`;
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
    const beforeView = view;
    view = update.view;
    const cues = [];
    if (view.state.phase !== 'setup') {
      emotions.syncState(view.state);
      // Without update IDs, only identical event object redelivery is deduped.
      const events = update.id
        ? update.events
        : update.events.filter((event) => {
            if (seenEventObjects.has(event)) return false;
            seenEventObjects.add(event);
            return true;
          });
      cues.push(
        ...eventEmotionCues(
          events,
          view.state,
          update.id ?? `local:${++anonymousUpdate}`,
        ),
        ...(update.emotionCues ?? []),
      );
      for (const effect of update.effects ?? [])
        emotions.apply({
          id: `effect:${effect.id}`,
          playerId: effect.playerId,
          reaction: 'acting',
        });
      for (const cue of cues)
        if (cue.reaction === 'acting') emotions.apply(cue);
    }
    if (view.state.phase === 'finished') computerAbort?.abort();
    if (view.state.phase === 'setup') {
      effects.reset();
      computerAbort?.abort();
      computerAbort = null;
      computerRunning = false;
      computerRunKey = '';
      computerError = false;
      setupScreen = 'title';
      log = [];
      dice = diceLabel(null);
    }
    const current = generation;
    feedback.begin();
    const movement = update.movement;
    const previous =
      movement &&
      update.events.find(
        (event) =>
          event.type === 'player-moved' && event.playerId === movement.playerId,
      );
    let previousTile =
      previous?.type === 'player-moved'
        ? previous.from
        : beforeView.state.players.find((p) => p.id === movement?.playerId)
            ?.position;
    const roll = update.events.find((event) => event.type === 'dice-rolled');
    if (movement && previousTile) offsets.set(movement.playerId, previousTile);
    if (roll?.type === 'dice-rolled') {
      animating = true;
      dice = diceLabel(null, 'rolling');
      closeDialog();
      render();
      await feedback.roll(roll.values);
      if (current !== generation || disposed) return;
      dice = diceLabel(roll.values, movement ? 'moving' : 'complete');
    }
    // Confirmed numbers enter text and records only after the dice have settled.
    log = [...log, ...update.events.map(eventText)].slice(-30);
    if (movement && !feedback.suppressed) {
      animating = true;
      const flying = update.effects?.some((effect) => effect.type === 'fly');
      const steps = flying
        ? []
        : walkingPath(movement.path, previousTile, view.map.tiles);
      for (const tile of steps) {
        if (disposed || current !== generation || feedback.suppressed) break;
        if (previousTile) movementFrom.set(movement.playerId, previousTile);
        offsets.set(movement.playerId, tile);
        render();
        feedback.step();
        await sleep(230);
        previousTile = tile;
      }
    }
    if (current !== generation || disposed) return;
    offsets.clear();
    movementFrom.clear();
    animating = false;
    if (roll?.type === 'dice-rolled') dice = diceLabel(roll.values);
    if (update.effects?.length) {
      closeDialog();
      animating = true;
      render();
      await effects.enqueue(update.effects);
      if (current !== generation || disposed) return;
      if (effectsLocked) lockEffects(false);
      animating = false;
    }
    for (const activation of update.abilityActivations ?? []) {
      if (feedback.suppressed) continue;
      animating = true;
      render();
      await new Promise<void>((resolve) => {
        abilityWaiters.set(activation.id, resolve);
        if (!ability.enqueue(activation)) {
          abilityWaiters.delete(activation.id);
          resolve();
        }
      });
      if (current !== generation || disposed) return;
      animating = false;
    }
    for (const cue of cues) if (cue.reaction !== 'acting') emotions.apply(cue);
    if (roll || movement) pendingFeedback = Math.max(0, pendingFeedback - 1);
    feedbackLocked = pendingFeedback > 0;
    host.inert = effectsLocked || feedbackLocked;
    render();
  }
  const unsubscribe = adapter.subscribe((received) => {
    if (disposed) {
      received.presentationComplete?.();
      return;
    }
    const u = feedbackGate.accept(received);
    if (!u) {
      received.presentationComplete?.();
      return;
    }
    if (u.events.some((event) => event.type === 'dice-rolled') || u.movement) {
      // Synchronous input lock, including computer updates before queue delivery.
      feedbackLocked = true;
      pendingFeedback++;
      host.inert = true;
      animating = true;
    }
    if (u.view.state.phase === 'setup') {
      ability.cancel();
      feedbackGate.reset();
      feedbackGate.accept(u);
      feedback.reset();
      feedbackLocked = false;
      pendingFeedback = 0;
      host.inert = false;
      for (const portrait of portraits.values()) portrait.destroy();
      portraits.clear();
      emotions.reset();
      seenEventObjects = new WeakSet<GameEvent>();
      generation++;
      effects.reset();
      for (const [timer, done] of waiters) {
        clearTimeout(timer);
        done();
      }
      waiters.clear();
      offsets.clear();
      movementFrom.clear();
      animating = false;
    } else if (u.effects?.length) {
      // Lock synchronously, before promise delivery or a second input event.
      lockEffects(true);
    }
    const receivedGeneration = generation;
    queue = queue
      .then(() => {
        if (receivedGeneration === generation) return update(u);
      })
      .catch(() => {
        feedback.reset();
        feedbackLocked = false;
        pendingFeedback = 0;
        offsets.clear();
        movementFrom.clear();
        lockEffects(false);
        animating = false;
        ability.cancel();
        tell('화면을 갱신하지 못했습니다.');
      })
      .finally(() => u.presentationComplete?.());
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
  emotions.syncState(view.state);
  render();
  frameId = requestAnimationFrame(animateSprites);
  return {
    destroy() {
      if (disposed) return;
      disposed = true;
      ability.destroy();
      releaseAudio();
      root.removeEventListener('pointerdown', unlockAbility, true);
      root.removeEventListener('keydown', unlockAbility, true);
      document.removeEventListener('visibilitychange', visibilityAbility);
      emotions.destroy();
      for (const portrait of portraits.values()) portrait.destroy();
      portraits.clear();
      feedback.destroy();
      document.removeEventListener('keydown', skipOnEscape);
      skipFeedback.remove();
      feedbackGate.reset();
      effects.destroy();
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
