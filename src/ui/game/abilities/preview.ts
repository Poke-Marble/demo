import {
  abilities,
  quoteAbility,
  commitAbility,
  emptyLedger,
  type AbilityId,
  type AbilityActivation,
  type AbilityRequest,
} from '../../../game/abilities/activation';
import { kantoJohtoMap } from '../../../data/maps/kanto-johto';
import { portraitSource } from '../portraits/portrait';
import type { PokemonId } from '../../../game/contracts';
import { createAbilityPresenter } from './presenter';
import './preview.css';

const root = document.querySelector<HTMLDivElement>('#app')!;
root.innerHTML = `
  <main class="ability-lab">
    <header><span class="eyebrow">Poké Marble / ABILITY LAB</span><h1>작은 특성, 새로운 한 수.</h1><p>스타팅 4종 · 원작 특성에서 영감을 받은 보드게임 각색 초안</p></header>
    <section class="lab-layout">
      <div class="lab-stage"><div class="lab-board" aria-label="관동·성도 기준 보드 배경"><div class="board-center"><span>STARTER ABILITIES</span><h2>당신의 파트너가<br />빛나는 순간</h2><p>확정거래 → 견적 → 커밋 → 연출</p><small>32칸 실제맵 이름 참조 · 이동/경제는 시연하지 않음</small></div></div></div>
      <aside><h2>특성을 발동해 보세요</h2><p class="lab-caption">모든 금액은 테스트 영수증 기반입니다. 실제 게임 잔액에는 반영되지 않습니다.</p><div class="ability-buttons"></div>
      <div class="audio-controls"><label><input id="mute" type="checkbox" /> 음소거</label><label>음량 <input id="volume" type="range" min="0" max="0.35" step="0.01" value="0.18" /></label><small id="audio-status">버튼 클릭 후 합성 사운드 활성화</small></div>
      <div class="lab-actions"><button id="burst">4종 동시 입력</button><button id="duplicate">동일 거래 10회</button><button id="cancel">큐 취소</button><button id="restart">마지막 연출 재시작</button><button id="remount">언마운트 / 재생성</button></div>
      <p id="lab-status" role="status">준비됨 · 기본 안전음량 18%</p><ol id="lab-log" aria-label="발동 기록"></ol></aside>
    </section><footer>자체 생성 Canvas2D / Web Audio 효과 · 수치와 경제효과는 미확정 · 초상화는 기존 PMDCollab 자산(별도 이용조건)</footer>
  </main>`;
const stage = root.querySelector<HTMLElement>('.lab-stage')!;
const board = root.querySelector<HTMLElement>('.lab-board')!;
kantoJohtoMap.tiles.forEach((tile, i) => {
  const cell = document.createElement('div');
  cell.className = `board-cell cell-${tile.kind}`;
  const side = Math.floor(i / 8);
  const offset = i % 8;
  const [column, row] =
    side === 0
      ? [offset + 1, 1]
      : side === 1
        ? [9, offset + 1]
        : side === 2
          ? [9 - offset, 9]
          : [1, 9 - offset];
  cell.style.gridColumn = String(column);
  cell.style.gridRow = String(row);
  cell.textContent = tile.nameKo;
  board.append(cell);
});
const status = root.querySelector<HTMLElement>('#lab-status')!;
const log = root.querySelector<HTMLOListElement>('#lab-log')!;
function record(message: string) {
  status.textContent = message;
  const li = document.createElement('li');
  li.textContent = message;
  log.prepend(li);
  while (log.children.length > 8) log.lastElementChild?.remove();
}
const makePresenter = () =>
  createAbilityPresenter(stage, {
    portraitUrl: (id) => portraitSource(id as PokemonId, 'Happy')?.url,
    onEnd: (a, reason) =>
      record(
        `${abilities[a.abilityId].name} · ${reason === 'finished' ? '연출 완료' : '연출 취소'} (경제 커밋은 유지)`,
      ),
  });
let presenter = makePresenter();
let ledger = emptyLedger();
let serial = 0;
let last: AbilityActivation | undefined;
function request(id: AbilityId): AbilityRequest {
  const incoming = id === 'blaze' || id === 'static';
  return {
    abilityId: id,
    playerId: 'player:demo',
    pokemonId: abilities[id].pokemonId,
    balanceBefore: 400,
    transaction: {
      id: `preview:${++serial}`,
      turn: serial,
      status: 'settled',
      origin: 'base',
      kind: id === 'overgrow' ? 'construction' : 'toll',
      payerId: incoming ? 'player:other' : 'player:demo',
      payeeId: incoming ? 'player:demo' : 'player:other',
      paid: 200,
      netCost: 200,
    },
  };
}
function activate(input: AbilityRequest) {
  const quote = quoteAbility(ledger, input);
  const result = quote && commitAbility(ledger, input, quote);
  if (!result) {
    record('발동 거절 · 중복 거래 또는 조건 미충족');
    return;
  }
  ledger = result.ledger;
  last = result.activation;
  const queued = presenter.enqueue(last);
  record(
    `${abilities[last.abilityId].name} +${last.amount} · 테스트 커밋 #${ledger.revision}${queued ? ' · 대기열 등록' : ' · 큐 가득 참'}`,
  );
}
async function unlock() {
  const success = await presenter.audio.unlock();
  root.querySelector('#audio-status')!.textContent = success
    ? '합성 사운드 준비됨'
    : '소리 재생 불가 · 시각 연출 계속';
}
for (const id of Object.keys(abilities) as AbilityId[]) {
  const def = abilities[id];
  const button = document.createElement('button');
  button.className = 'ability-button';
  button.style.setProperty('--card-color', def.color);
  const image = document.createElement('img');
  image.src = portraitSource(def.pokemonId, 'Normal')?.url ?? '';
  image.alt = '';
  image.width = 40;
  image.height = 40;
  const label = document.createElement('span');
  label.textContent = `${def.name} · ${def.effect}`;
  button.append(image, label);
  button.addEventListener('click', () => {
    void unlock();
    activate(request(id));
  });
  root.querySelector('.ability-buttons')!.append(button);
}
const listen = (id: string, fn: () => void) =>
  root.querySelector(id)!.addEventListener('click', fn);
listen('#burst', () => {
  void unlock();
  for (const id of Object.keys(abilities) as AbilityId[]) activate(request(id));
});
listen('#duplicate', () => {
  void unlock();
  const input = request('static');
  for (let i = 0; i < 10; i++) activate(input);
});
listen('#cancel', () => presenter.cancel());
listen('#restart', () => {
  void unlock();
  if (last) presenter.restart(last);
});
listen('#remount', () => {
  presenter.destroy();
  presenter = makePresenter();
  syncAudio();
  record('이전 rAF·오디오 정리 후 재생성');
});
function syncAudio() {
  presenter.audio.setMuted(
    root.querySelector<HTMLInputElement>('#mute')!.checked,
  );
  presenter.audio.setVolume(
    root.querySelector<HTMLInputElement>('#volume')!.valueAsNumber,
  );
}
root.querySelector('#mute')!.addEventListener('change', syncAudio);
root.querySelector('#volume')!.addEventListener('input', syncAudio);
window.addEventListener('pagehide', () => presenter.destroy(), { once: true });
if (import.meta.hot) import.meta.hot.dispose(() => presenter.destroy());
