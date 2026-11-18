import { findSprite } from "../../assets/sprites";
import type {
  GameEvent,
  Player,
  PokemonId,
  TileId,
} from "../../game/contracts";
import type { GameUIAdapter, LobbyPlayer, UIChoice, UIUpdate } from "./adapter";
import { boardCells, validateLobby } from "./presentation";
import "./game.css";
export type {
  GameUIAdapter,
  GameView,
  UIUpdate,
  GamePrompt,
  UIChoice,
} from "./adapter";

const partners: { id: PokemonId; name: string }[] = [
  { id: "pokemon:0001", name: "이상해씨" },
  { id: "pokemon:0004", name: "파이리" },
  { id: "pokemon:0007", name: "꼬부기" },
  { id: "pokemon:0025", name: "피카츄" },
];
const money = (value: number) =>
  new Intl.NumberFormat("ko-KR").format(value) + " ₽";
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = "",
  text = "",
) {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
function button(text: string, run: () => void, className = "") {
  const node = el("button", className, text);
  node.type = "button";
  node.onclick = run;
  return node;
}

/** Mounts only inside root. Call destroy before replacing the host screen. */
export function mountGameUI(root: HTMLElement, adapter: GameUIAdapter) {
  const host = el("section", "pm-game");
  root.append(host);
  let view = adapter.getView();
  let disposed = false,
    busy = false,
    animating = false;
  let generation = 0;
  let dialog: HTMLDialogElement | null = null;
  let log: string[] = [],
    dice = "—",
    errorMessage = "";
  let lobby: LobbyPlayer[] = partners
    .slice(0, 2)
    .map((p, i) => ({ name: `트레이너 ${i + 1}`, pokemonId: p.id }));
  let queue = Promise.resolve();
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
    const node = el("span", "pm-sprite");
    node.setAttribute("aria-hidden", "true");
    const { animation: a, url } = findSprite(id, walk ? "Walk" : "Idle");
    if (a && url) {
      node.style.backgroundImage = `url("${url}")`;
      node.style.width = `${a.frameWidth}px`;
      node.style.height = `${a.frameHeight}px`;
    } else node.textContent = "●";
    return node;
  };
  const tell = (message: string) => {
    const status = host.querySelector(".pm-status");
    if (status) status.textContent = message;
  };
  async function invoke(fn: () => void | Promise<void>) {
    if (busy || animating || disposed) return;
    busy = true;
    render();
    errorMessage = "";
    try {
      await fn();
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "요청을 처리하지 못했습니다. 다시 시도하세요.";
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
      "pm-action",
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
    const d = el("dialog", "pm-dialog");
    dialog = d;
    const h = el("h2", "", title);
    h.id = `pm-dialog-${crypto.randomUUID()}`;
    d.setAttribute("aria-labelledby", h.id);
    d.append(h, el("p", "", description), ...choices);
    d.addEventListener("cancel", (event) => {
      if (!dismissible) event.preventDefault();
    });
    d.addEventListener("close", () => {
      if (dialog === d) dialog = null;
      d.remove();
      previous?.focus();
    });
    if (dismissible) d.append(button("닫기", () => d.close(), "pm-secondary"));
    host.append(d);
    d.showModal();
  }
  function renderLobby(content: HTMLElement) {
    content.append(
      el("p", "pm-eyebrow", "LOCAL MULTIPLAYER"),
      el("h1", "", "함께 떠나는 포켓몬 여행"),
      el(
        "p",
        "pm-muted",
        "한 화면에서 번갈아 플레이하세요. 트레이너 2~4명과 파트너를 선택합니다.",
      ),
    );
    const count = el("select");
    count.setAttribute("aria-label", "플레이 인원");
    for (const n of [2, 3, 4]) {
      const o = el("option", "", `${n}명`);
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
    const cards = el("div", "pm-lobby-cards");
    lobby.forEach((p, i) => {
      const card = el("fieldset", "pm-lobby-card");
      card.append(el("legend", "", `PLAYER 0${i + 1}`));
      const name = el("input");
      name.value = p.name;
      name.maxLength = 20;
      name.setAttribute("aria-label", `트레이너 ${i + 1} 이름`);
      name.oninput = () => {
        p.name = name.value;
      };
      card.append(name);
      partners.forEach((partner) => {
        const b = button(
          partner.name,
          () => {
            p.pokemonId = partner.id;
            render();
          },
          "pm-partner",
        );
        b.prepend(sprite(partner.id));
        b.setAttribute("aria-pressed", String(p.pokemonId === partner.id));
        card.append(b);
      });
      cards.append(card);
    });
    content.append(cards);
    const start = button(
      "여행 시작하기 →",
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
      "pm-primary",
    );
    start.disabled = busy;
    content.append(start);
  }
  function token(p: Player, i: number) {
    const t = el("span", `pm-token pm-player-${i}`);
    t.title = p.name;
    t.setAttribute("aria-label", p.name);
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
    host.replaceChildren();
    const header = el("header", "pm-header");
    header.append(
      el("strong", "pm-brand", "◓ POKÉ MARBLE"),
      el(
        "span",
        "pm-badge",
        adapter.demo ? "DEMO · 모의 규칙" : "LOCAL · 2–4 PLAYERS",
      ),
    );
    host.append(header);
    const status = el("p", "pm-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.textContent = errorMessage || view.notice || "";
    host.append(status);
    if (view.state.phase === "setup") {
      const lobbyNode = el("main", "pm-lobby");
      host.append(lobbyNode);
      renderLobby(lobbyNode);
      return;
    }
    const layout = el("main", "pm-layout");
    const boardArea = el("section", "pm-board-area");
    const { side, cells } = boardCells(view.map.tiles.length);
    boardArea.append(
      el("p", "pm-eyebrow", "KANTO × JOHTO"),
      el("h1", "", view.mapName),
    );
    const board = el("div", "pm-board");
    board.setAttribute("aria-label", "게임 보드");
    board.style.gridTemplateColumns = `repeat(${side}, 1fr)`;
    board.style.gridTemplateRows = `repeat(${side}, 1fr)`;
    const center = el("div", "pm-board-center");
    center.style.gridArea = `2 / 2 / ${side} / ${side}`;
    center.append(
      el("span", "pm-eyebrow", `TURN ${view.state.turnNumber}`),
      el("strong", "", "작은 모험, 큰 한 바퀴"),
      el("span", "pm-dice", dice),
      el("small", "", animating ? "여행 중…" : "다음 목적지는 어디일까요?"),
    );
    if (side > 2) board.append(center);
    view.map.tiles.forEach((tile, index) => {
      const cell = cells[index]!;
      const b = button(
        "",
        () => {
          const holding = view.state.holdings.find((h) => h.tileId === tile.id);
          modal(
            tile.nameKo,
            holding
              ? `${view.state.players.find((p) => p.id === holding.ownerId)?.name ?? "소유자"} · 시설 ${holding.facilityLevel}단계`
              : "소유 정보 없음",
            [],
            true,
          );
        },
        `pm-tile pm-${tile.kind}`,
      );
      b.dataset.focus = tile.id;
      b.style.gridRow = String(cell.row);
      b.style.gridColumn = String(cell.column);
      b.append(el("span", "pm-tile-name", tile.nameKo));
      const holding = view.state.holdings.find((h) => h.tileId === tile.id);
      if (holding)
        b.append(
          el(
            "small",
            "",
            `${view.state.players.find((p) => p.id === holding.ownerId)?.name ?? ""} · Lv.${holding.facilityLevel}`,
          ),
        );
      const tokens = el("span", "pm-tokens");
      view.state.players.forEach((p, i) => {
        if (!p.bankrupt && (offsets.get(p.id) ?? p.position) === tile.id)
          tokens.append(token(p, i));
      });
      b.append(tokens);
      board.append(b);
    });
    boardArea.append(board);
    layout.append(boardArea);
    const rail = el("aside", "pm-rail");
    const active = view.state.players.find(
      (p) => p.id === view.state.activePlayerId,
    );
    rail.append(
      el("p", "pm-eyebrow", `TURN ${view.state.turnNumber}`),
      el("h2", "", `${active?.name ?? "트레이너"}의 차례`),
    );
    const diceResult = el(
      "p",
      animating ? "pm-dice-result is-moving" : "pm-dice-result",
      `주사위  ${dice}${animating ? " · 이동 중…" : ""}`,
    );
    diceResult.setAttribute("role", "status");
    rail.append(diceResult);
    view.state.players.forEach((p, i) => {
      const card = el(
        "div",
        `pm-player-card pm-player-${i} ${p.id === active?.id ? "is-active" : ""}`,
      );
      card.append(
        sprite(p.pokemonId),
        el("strong", "", p.name),
        el("span", "", p.bankrupt ? "파산" : money(p.balance)),
      );
      rail.append(card);
    });
    const controls = el("div", "pm-controls");
    view.actions.forEach((a) => {
      const b = choiceButton(a);
      b.dataset.focus = a.id;
      controls.append(b);
    });
    rail.append(controls);
    rail.append(
      button(
        "자산 현황",
        () =>
          modal(
            "자산 현황",
            "가격·정리 가능 여부는 규칙 어댑터가 결정합니다.",
            view.state.holdings.map((h) =>
              el(
                "p",
                "",
                `${view.map.tiles.find((t) => t.id === h.tileId)?.nameKo ?? h.tileId} · ${view.state.players.find((p) => p.id === h.ownerId)?.name ?? ""} · Lv.${h.facilityLevel}`,
              ),
            ),
            true,
          ),
        "pm-secondary",
      ),
    );
    const records = el("details", "pm-records");
    records.open = true;
    records.append(el("summary", "", "여행 기록"));
    const list = el("ol");
    log.slice(-30).forEach((entry) => list.append(el("li", "", entry)));
    records.append(list);
    rail.append(records);
    layout.append(rail);
    host.append(layout);
    if (focused)
      Array.from(host.querySelectorAll<HTMLElement>("[data-focus]"))
        .find((n) => n.dataset.focus === focused)
        ?.focus();
    if (!animating && view.state.phase === "finished") {
      const winner = view.state.players.find(
        (p) => p.id === view.state.victory?.winnerId,
      );
      modal(
        "여행 완료!",
        `${winner?.name ?? "트레이너"} 승리 · ${view.state.victory ? victoryLabels[view.state.victory.reason] : "결과 확인"}`,
        [
          button(
            "새 여행 시작",
            () => {
              void invoke(() => adapter.restart());
            },
            "pm-primary",
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
      "playerId" in event
        ? (view.state.players.find((p) => p.id === event.playerId)?.name ??
          "트레이너")
        : "";
    switch (event.type) {
      case "dice-rolled":
        dice = event.values.join(" · ");
        return `${name}: 주사위 ${dice}`;
      case "player-moved":
        return `${name}: ${view.map.tiles.find((t) => t.id === event.to)?.nameKo ?? event.to} 도착`;
      case "city-acquired":
        return `${name}: 도시 구매`;
      case "facility-upgraded":
        return `시설 ${event.level}단계 강화`;
      case "toll-paid":
        return `통행료 ${money(event.amount)} 지불`;
      case "player-bankrupt":
        return `${name}: 파산`;
      case "turn-ended":
        return `${name}: 턴 종료`;
      case "game-won":
        return `${name}: 승리`;
    }
  }
  async function update(update: UIUpdate) {
    if (disposed) return;
    view = update.view;
    if (view.state.phase === "setup") {
      generation++;
      log = [];
      dice = "—";
    }
    log.push(...update.events.map(eventText));
    const current = generation;
    if (
      update.movement &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
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
        tell("화면을 갱신하지 못했습니다.");
      });
  });
  render();
  return {
    destroy() {
      disposed = true;
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
  "last-player-standing": "마지막 생존",
  "three-city-groups": "도시 그룹 3개",
  "one-side-cities": "한 면 도시 독점",
  "four-landmarks": "명소 4개",
};
