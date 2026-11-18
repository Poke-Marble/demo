import {
  directions,
  type AnimationName,
  type Direction,
} from '../assets/sprites';
import { pokemonCatalog } from '../data/pokemon';
import { sampleMap } from '../data/sample-map';
import { createSprite } from './sprite';

export function mountApp(root: HTMLElement) {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar"><a class="wordmark" href="#">POKÉ / BOARD <span>개발 베이스</span></a><span class="version">FEAT / INIT <i></i> LOCAL</span></header>
      <main>
        <section class="intro" aria-labelledby="title">
          <div class="eyebrow">관동 · 성도 / FOUNDATION 01</div>
          <h1 id="title">함께 떠날<br>첫 파트너를 골라요<span>.</span></h1>
          <p>한 화면에서, 한 명씩 돌아가며.<br>2~4인의 여행을 준비하는 첫 번째 개발 베이스입니다.</p>
          <div class="scope"><span>관동·성도 맵 1개 예정</span><span>한 기기 · 번갈아 플레이</span></div>
        </section>
        <section class="selection" aria-labelledby="selection-title">
          <div class="section-heading"><div><span class="eyebrow">01 / PARTNERS</span><h2 id="selection-title">처음 만나는 네 파트너</h2></div><label class="player-count">참가 인원 <select id="player-count"><option value="2">2명</option><option value="3">3명</option><option value="4">4명</option></select></label></div>
          <div id="player-slots" class="player-slots" aria-label="선택할 플레이어"></div>
          <p id="selection-help" class="selection-help" aria-live="polite"></p>
          <div class="pokemon-grid" id="pokemon-grid"></div>
          <div class="roster-summary" id="roster-summary" aria-live="polite"></div>
          <p class="fineprint">준비 화면의 선택만 동작합니다. 게임 시작·턴 진행·AI는 구현하지 않았습니다.</p>
        </section>
        <section class="lab" aria-labelledby="lab-title">
          <div><span class="eyebrow">02 / ASSET CHECK</span><h2 id="lab-title">스프라이트 실험실</h2><p>로컬 PNG + 원본 프레임 타이밍.<br>네트워크 없이도 파트너가 움직입니다.</p></div>
          <div class="controls"><label>애니메이션<select id="animation"><option value="Idle">Idle · 대기</option><option value="Walk">Walk · 걷기</option></select></label><label>바라보는 방향<select id="direction">${directions.map((direction) => `<option value="${direction}">${direction}</option>`).join('')}</select></label><label class="check"><input id="paused" type="checkbox"> 정지 화면</label><label class="check"><input id="failure" type="checkbox"> 로딩 실패 재현</label></div>
        </section>
        <section class="foundation" aria-labelledby="foundation-title">
          <div class="section-heading"><div><span class="eyebrow">03 / CONTRACT PREVIEW</span><h2 id="foundation-title">작게 시작하는 지도</h2></div><span class="tag">구조 샘플 · 플레이 불가</span></div>
          <div class="tile-strip">${sampleMap.tiles.map((tile, index) => `<div class="tile"><span>0${index + 1} / ${tile.kind.toUpperCase()}</span><strong>${tile.nameKo}</strong><code>${tile.id}</code></div>`).join('')}</div>
          <p class="fineprint">전체 맵·도시 가격·통행료·시설 강화·파산·승리 판정은 후속 작업입니다.</p>
        </section>
        <details class="credits"><summary>출처와 권리 안내 <span>SPRITECOLLAB / POKEAPI</span></summary><div><p>비공식·비상업 팬 프로젝트입니다. Pokémon의 원 권리는 Nintendo / Creatures Inc. / GAME FREAK inc. 등에 있으며, PMD 원작 스프라이트 제작자는 Chunsoft입니다. 팬 제작자의 창작 기여 권리는 원작 권리와 구분됩니다.</p><p>이번 4종의 원본 크레딧: <strong>CHUNSOFT</strong>. 개별 라이선스 기록: <strong>Unspecified</strong>. SpriteCollab의 일반 제출물 CC BY-NC 4.0 정책을 이 원작 이미지의 이용 허락으로 단정하지 않습니다. 원 권리자의 별도 허락은 확인되지 않았습니다.</p><p><a href="https://sprites.pmdcollab.org/" target="_blank" rel="noreferrer">PMD SpriteCollab</a> · <a href="https://pokeapi.co/docs/v2/" target="_blank" rel="noreferrer">PokéAPI 데이터 문서</a> · <a href="https://github.com/PMDCollab/SpriteCollab/tree/1a294bec85e309d023c0b074617462c6c6b44a31" target="_blank" rel="noreferrer">고정 버전 원본·크레딧</a></p><p>코드 라이선스는 미정입니다. 개별 출처·조건·해시는 저장소 메타데이터에 기록했습니다. 권리자의 삭제 요청 시 해당 자료를 제거합니다. 요청 수신 창구는 아직 미정입니다.</p></div></details>
      </main>
      <footer><span>작은 기반 위에, 다음 여행을.</span><span>UNOFFICIAL · NON-COMMERCIAL · LOCAL FIRST</span></footer>
    </div>`;

  function query<T extends HTMLElement>(selector: string) {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`UI 요소 없음: ${selector}`);
    return element;
  }
  const slots = query('#player-slots');
  const grid = query('#pokemon-grid');
  let activeSlot = 0;
  let selected = [0, 1];
  const cardButtons: HTMLButtonElement[] = [];
  const sprites = pokemonCatalog.map((pokemon, index) => {
    const card = document.createElement('article');
    card.className = `pokemon-card type-${pokemon.types[0]}`;
    card.innerHTML = `<div class="card-top"><span>NO. ${String(pokemon.speciesId).padStart(4, '0')}</span><span class="assignment"></span></div><div class="sprite-mount"></div><div class="pokemon-info"><span class="genus"></span><h3></h3><span class="slug"></span></div><button class="choose" type="button"></button><div class="load-status" role="status"></div>`;
    card.querySelector('.genus')!.textContent = pokemon.genusKo;
    card.querySelector('h3')!.textContent = pokemon.nameKo;
    card.querySelector('.slug')!.textContent = pokemon.slug.toUpperCase();
    const status = card.querySelector('.load-status')!;
    const sprite = createSprite(pokemon, (message) => {
      status.textContent = message;
    });
    card.querySelector('.sprite-mount')!.append(sprite.element);
    const button = card.querySelector<HTMLButtonElement>('button')!;
    button.addEventListener('click', () => {
      const previous = selected[activeSlot]!;
      const occupied = selected.indexOf(index);
      if (occupied !== -1) selected[occupied] = previous;
      selected[activeSlot] = index;
      updateSelection();
    });
    cardButtons.push(button);
    grid.append(card);
    return sprite;
  });

  function updateSelection() {
    slots.replaceChildren();
    selected.forEach((pokemonIndex, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'player-slot';
      button.setAttribute('aria-pressed', String(index === activeSlot));
      button.textContent = `P${index + 1} · ${pokemonCatalog[pokemonIndex]!.nameKo}`;
      button.addEventListener('click', () => {
        activeSlot = index;
        updateSelection();
      });
      slots.append(button);
    });
    cardButtons.forEach((button, index) => {
      const assigned = selected.indexOf(index);
      button.textContent =
        selected[activeSlot] === index
          ? '선택한 파트너 ✓'
          : `P${activeSlot + 1} 파트너로 선택`;
      button.setAttribute(
        'aria-pressed',
        String(selected[activeSlot] === index),
      );
      button.setAttribute(
        'aria-label',
        `플레이어 ${activeSlot + 1}의 ${pokemonCatalog[index]!.nameKo} 선택`,
      );
      button.closest('article')!.querySelector('.assignment')!.textContent =
        assigned < 0 ? '선택 가능' : `P${assigned + 1} 파트너`;
    });
    query('#selection-help').textContent =
      `플레이어 ${activeSlot + 1}의 파트너를 선택하세요. 이미 선택된 포켓몬을 고르면 서로 교환합니다.`;
    query('#roster-summary').textContent =
      `준비 중인 ${selected.length}명 · ${selected.map((pokemonIndex) => pokemonCatalog[pokemonIndex]!.nameKo).join(' / ')}`;
  }
  query<HTMLSelectElement>('#player-count').addEventListener(
    'change',
    (event) => {
      const count = Number((event.target as HTMLSelectElement).value);
      const remaining = pokemonCatalog
        .map((_, index) => index)
        .filter((index) => !selected.includes(index));
      selected = [...selected, ...remaining].slice(0, count);
      activeSlot = Math.min(activeSlot, count - 1);
      updateSelection();
    },
  );
  query<HTMLSelectElement>('#animation').addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value as AnimationName;
    sprites.forEach((sprite) => sprite.setAnimation(value));
  });
  query<HTMLSelectElement>('#direction').addEventListener('change', (event) => {
    const value = (event.target as HTMLSelectElement).value as Direction;
    sprites.forEach((sprite) => sprite.setDirection(value));
  });
  query<HTMLInputElement>('#paused').addEventListener('change', (event) => {
    sprites.forEach((sprite) =>
      sprite.setPaused((event.target as HTMLInputElement).checked),
    );
  });
  query<HTMLInputElement>('#failure').addEventListener('change', (event) => {
    sprites.forEach((sprite) =>
      sprite.setFailure((event.target as HTMLInputElement).checked),
    );
  });
  updateSelection();
  return () => {
    sprites.forEach((sprite) => sprite.dispose());
    root.replaceChildren();
  };
}
