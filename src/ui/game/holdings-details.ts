import type { GameView } from './adapter';

/** Read-only ownership projection. Prices and available actions stay in adapter. */
export function createHoldingsDetails(view: GameView, playerId?: string) {
  const content = document.createElement('section');
  content.className = 'pm-holdings-details';
  const search = document.createElement('input');
  search.type = 'search';
  search.placeholder = '도시·명소·소유자 검색';
  search.setAttribute('aria-label', '소유 자산 검색');
  const count = document.createElement('p');
  count.setAttribute('role', 'status');
  const list = document.createElement('ul');
  list.className = 'pm-holdings-list';
  const rows = view.state.holdings
    .filter((holding) => !playerId || holding.ownerId === playerId)
    .map((holding) => {
      const tile = view.map.tiles.find((t) => t.id === holding.tileId);
      const owner = view.state.players.find((p) => p.id === holding.ownerId);
      const row = document.createElement('li');
      row.textContent = `${tile?.nameKo ?? holding.tileId} · ${owner?.name ?? ''} · ${tile?.kind === 'landmark' ? '특별 명소' : `Lv.${holding.facilityLevel}`}`;
      return row;
    });
  list.append(...rows);
  function filter() {
    const query = search.value.trim().toLocaleLowerCase('ko');
    for (const row of rows)
      row.hidden = !row.textContent?.toLocaleLowerCase('ko').includes(query);
    const visible = rows.filter((row) => !row.hidden).length;
    count.textContent = rows.length
      ? `${visible} / ${rows.length}개 자산`
      : '아직 보유한 도시·명소가 없습니다.';
    if (rows.length && !visible) count.textContent += ' · 검색 결과 없음';
  }
  search.addEventListener('input', filter);
  content.append(search, count, list);
  filter();
  return content;
}
