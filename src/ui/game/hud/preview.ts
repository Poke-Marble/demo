import { kantoJohtoMap } from '../../../data/maps/kanto-johto';
import { createGame } from '../../../game/core/index';
import type { GameView } from '../adapter';
import { createInitialRoster } from '../setup';
import { createEmotionController } from '../portraits/emotions';
import { portraitCredits } from '../portraits/catalog';
import {
  mountPlayerHud,
  cashEventsFromGameEvents,
  type DisplayMeta,
} from './index';
import './preview.css';

const root = document.querySelector<HTMLElement>('#hud-preview')!;
root.innerHTML = `
  <main class="hud-preview">
    <header class="hud-preview-title"><div><p>Poké Marble / PLAYER HUD</p><h1>모험은 함께, 차례는 또렷하게.</h1></div><span class="hud-preview-tag">독립 UI 프리뷰</span></header>
    <div class="pm-hud-layout">
      <section class="pm-hud-board-slot" aria-label="보드 자리">
        <div class="hud-preview-board">
          <div class="hud-preview-board-top"><span>관동 · 성도</span><span>BOARD SLOT</span></div>
          <div class="hud-preview-track" aria-hidden="true"><span>태초마을</span><span>상록시티</span><span>회색시티</span><span>블루시티</span><span>노랑시티</span><span>갈색시티</span><span>담청시티</span><span>인주시티</span></div>
          <div class="hud-preview-board-center"><span class="hud-preview-compass" aria-hidden="true">✦</span><h2>다음 목적지는 어디일까?</h2><p>보드 렌더러가 들어올 자리</p><small>Phaser 캔버스와 HUD는 독립된 레이아웃 영역을 사용합니다.</small></div>
          <div class="hud-preview-board-bottom"><span>01 — 04 TRAINERS</span><span>HTML / CSS HUD →</span></div>
        </div>
      </section>
      <aside class="pm-hud-slot" id="hud-slot" aria-label="플레이어 HUD 자리"></aside>
      <div class="hud-preview-support">
        <section class="hud-preview-controls" aria-label="HUD 시연"><h2>상태를 바꿔 확인하기</h2><p>실제 맵·스타팅·코어 초기값 사용. 소유권·메타·금액 변동·파산은 아래 버튼으로 재현하는 표시용 스냅샷입니다.</p><div id="hud-actions"></div><p id="hud-preview-note">사람 1명과 컴퓨터 3명 · 네 타입의 문양을 확인하세요.</p></section>
        <footer class="hud-preview-credit"><details><summary>PMD 초상화 · 파일별 크레딧</summary><p>Pokémon 원 권리: Nintendo / Creatures Inc. / GAME FREAK inc. 개별 출처·제작자·조건은 기존 초상화 manifest를 사용합니다.</p><ul id="hud-portrait-credits"></ul></details></footer>
      </div>
    </div>
  </main>`;
const slot = root.querySelector<HTMLElement>('#hud-slot')!;
const actions = root.querySelector<HTMLElement>('#hud-actions')!;
const note = root.querySelector<HTMLElement>('#hud-preview-note')!;
const credits = root.querySelector<HTMLElement>('#hud-portrait-credits')!;
for (const credit of portraitCredits) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.href = credit.sourceUrl;
  link.textContent = credit.label;
  item.append(link, document.createTextNode(` · ${credit.attribution}`));
  credits.append(item);
}
const participants = createInitialRoster('pokemon:0025');
const map = kantoJohtoMap;
const core = createGame(map, participants, { seed: 42 });
const cities = map.tiles.filter((t) => t.kind === 'city');
const landmarks = map.tiles.filter((t) => t.kind === 'landmark');
function freshView(): GameView {
  return {
    state: {
      ...core,
      holdings: [
        ...cities.slice(0, 3).map((t) => ({
          tileId: t.id,
          ownerId: participants[0]!.id,
          facilityLevel: 1,
        })),
        ...cities.slice(3, 5).map((t) => ({
          tileId: t.id,
          ownerId: participants[1]!.id,
          facilityLevel: 0,
        })),
        ...landmarks.slice(0, 1).map((t) => ({
          tileId: t.id,
          ownerId: participants[2]!.id,
          facilityLevel: 0,
        })),
      ],
    },
    participants,
    map,
    mapName: '관동 · 성도',
    computer: { connected: true, status: '대기' },
    actions: [],
  };
}
const meta: DisplayMeta = {
  [participants[0]!.id]: { abilityName: '정전기' },
  [participants[1]!.id]: { blessing: '칠색조' },
  [participants[2]!.id]: { trialStay: '루기아 · 도전 대기' },
  [participants[3]!.id]: { computerStatus: '판단 중' },
};
let view = freshView();
let hud: ReturnType<typeof mountPlayerHud>;
const emotions = createEmotionController((id) => hud?.refreshEmotions(id));
function mount() {
  hud = mountPlayerHud(slot, view, { meta, emotions });
}
mount();
let serial = 0;
function button(label: string, run: () => void) {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.onclick = run;
  actions.append(node);
}
button('차례 전환', () => {
  const available = view.state.players.filter((p) => !p.bankrupt);
  const index = available.findIndex((p) => p.id === view.state.activePlayerId);
  const next = available[(index + 1) % available.length]!;
  view = {
    ...view,
    state: {
      ...view.state,
      activePlayerId: next.id,
      turnNumber: view.state.turnNumber + 1,
    },
  };
  hud.update(view);
  note.textContent = `${next.name}의 차례입니다.`;
});
button('통행료 확정 −120 / +120', () => {
  const [payer, receiver] = view.state.players;
  if (
    !payer ||
    !receiver ||
    payer.bankrupt ||
    receiver.bankrupt ||
    payer.balance < 120
  ) {
    note.textContent = '초기화 후 다시 시연하세요.';
    return;
  }
  view = {
    ...view,
    state: {
      ...view.state,
      players: view.state.players.map((p) => ({
        ...p,
        balance:
          p.balance +
          (p.id === payer.id ? -120 : p.id === receiver.id ? 120 : 0),
      })),
    },
  };
  const events = [
    {
      type: 'toll-paid' as const,
      fromPlayerId: payer.id,
      toPlayerId: receiver.id,
      amount: 120,
    },
  ];
  hud.update(view, {
    cashEvents: cashEventsFromGameEvents(`preview:${++serial}`, events),
  });
  emotions.apply({
    id: `pain:${serial}`,
    playerId: payer.id,
    reaction: 'distress',
  });
  emotions.apply({
    id: `joy:${serial}`,
    playerId: receiver.id,
    reaction: 'joy',
  });
  note.textContent = '확정 통행료 이벤트 스냅샷 · 현금과 표정에 반영했습니다.';
});
button('표정 변화', () => {
  const id = view.state.activePlayerId;
  emotions.apply({
    id: `emotion:${++serial}`,
    playerId: id,
    reaction: 'surprise',
  });
  note.textContent =
    '기존 emotion controller 사용 · 잠시 후 평온한 표정으로 돌아옵니다.';
});
button('파산 상태', () => {
  const target = view.state.players.at(-1)!;
  view = {
    ...view,
    state: {
      ...view.state,
      players: view.state.players.map((p) =>
        p.id === target.id ? { ...p, bankrupt: true, balance: 0 } : p,
      ),
      holdings: view.state.holdings.filter((h) => h.ownerId !== target.id),
    },
  };
  emotions.syncState(view.state);
  hud.update(view);
  note.textContent =
    '파산 스냅샷 · 잔액 차이만으로 증감 이벤트를 만들지 않습니다.';
});
button('긴 이름 / 큰 금액', () => {
  view = {
    ...view,
    state: {
      ...view.state,
      players: view.state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              name: 'P1 아주아주긴이름의포켓몬트레이너',
              balance: 1234567890,
            }
          : p,
      ),
    },
  };
  hud.update(view);
  note.textContent = '레이아웃 스트레스 스냅샷 · 큰 현금도 이름과 분리됩니다.';
});
button('좌석 순서 변경', () => {
  view = {
    ...view,
    state: {
      ...view.state,
      players: [...view.state.players.slice(1), view.state.players[0]!],
    },
  };
  hud.update(view);
  note.textContent = '타입 색과 문양은 좌석 순서가 바뀌어도 유지됩니다.';
});
button('동일 상태 갱신', () => {
  hud.update(view);
  note.textContent = '초상화와 포커스를 유지하며 갱신했습니다.';
});
button('초기화', () => {
  hud.destroy();
  emotions.reset();
  view = freshView();
  mount();
  note.textContent = '초기 상태로 돌아왔습니다.';
});
window.addEventListener(
  'pagehide',
  () => {
    hud.destroy();
    emotions.destroy();
  },
  { once: true },
);
