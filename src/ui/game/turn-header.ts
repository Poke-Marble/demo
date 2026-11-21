import type { GameView } from './adapter';
import { ownerTheme } from './art/ownership';
import { portraitSource } from './portraits/portrait';
import './turn-header.css';

const sideNames = { south: '남쪽', west: '서쪽', north: '북쪽', east: '동쪽' };
const endNames: Record<string, string> = {
  'last-player-standing': '파산 · 마지막 생존',
  'three-city-groups': '도시 그룹 독점',
  'one-side-cities': '한 면 도시 독점',
  'four-landmarks': '명소 독점',
  'round-limit-assets': '제한 라운드 · 자산 승리',
};
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls = '',
  text = '',
) {
  const result = document.createElement(tag);
  result.className = cls;
  result.textContent = text;
  return result;
}
const amount = (n: number) => `${n.toLocaleString('ko-KR')} ₽`;
const playerName = (view: GameView, id: string) =>
  view.participants.find((p) => p.id === id)?.name ??
  view.state.players.find((p) => p.id === id)?.name ??
  id;

/** Pure presentation of matchProgress. Never counts UI updates, rolls or seat wraps. */
export function mountTurnHeader(openInfo: () => void) {
  const element = node('section', 'pm-turn-header');
  element.setAttribute('aria-label', '턴 진행');
  return {
    element,
    update(view: GameView) {
      element.replaceChildren();
      const progress = view.matchProgress;
      if (!progress) {
        element.append(node('span', '', '경기 진행 정보 미연결'));
        return;
      }
      const finished = view.state.phase === 'finished';
      const id = finished
        ? view.state.victory?.winnerId
        : progress.activePlayerId;
      const player = view.state.players.find((p) => p.id === id);
      const identity = node('div', 'pm-turn-identity');
      if (player) {
        identity.style.setProperty('--turn-color', ownerTheme(player).color);
        const portrait = node('span', 'pm-turn-portrait');
        const source = portraitSource(player.pokemonId, 'Normal');
        if (source) {
          const img = node('img');
          img.src = source.url;
          img.alt = `${playerName(view, player.id)} 초상`;
          portrait.append(img);
        }
        const name = node('div');
        const current = progress.players.find((p) => p.playerId === player.id);
        name.append(
          node(
            'strong',
            '',
            `${playerName(view, player.id)}${finished ? ' 승리' : ' 차례'}`,
          ),
          node(
            'small',
            '',
            finished
              ? '게임 결과'
              : current?.trial
                ? '시험 체류 · 기본 차례'
                : progress.extraRoll
                  ? '더블 · 추가 굴림'
                  : '기본 차례',
          ),
        );
        identity.append(portrait, name);
      }
      const round = node('div', 'pm-turn-round');
      round.append(
        node(
          'strong',
          '',
          `${finished ? '종료' : '라운드'} ${progress.currentRound} / ${progress.roundLimit}`,
        ),
        node(
          'small',
          '',
          `남은 ${progress.remainingRounds}라운드${finished ? '' : ' · 현재 포함'}`,
        ),
      );
      const seats = node('ol', 'pm-turn-seats');
      seats.setAttribute('aria-label', '원래 좌석 차례 순서');
      for (const seat of progress.players) {
        const seatPlayer = view.state.players.find(
          (p) => p.id === seat.playerId,
        );
        const participant = view.participants.find(
          (p) => p.id === seat.playerId,
        );
        const item = node(
          'li',
          `pm-turn-seat${seat.bankrupt ? ' is-bankrupt' : ''}`,
        );
        item.style.setProperty('--turn-color', ownerTheme(seatPlayer).dark);
        const active =
          !finished &&
          !seat.bankrupt &&
          seat.playerId === progress.activePlayerId;
        if (active) item.setAttribute('aria-current', 'step');
        item.setAttribute(
          'aria-label',
          `${seat.seat + 1}번 ${playerName(view, seat.playerId)} · ${seat.bankrupt ? '파산 · 차례 건너뜀' : active ? '현재 차례' : '참가 중'}`,
        );
        item.append(
          node(
            'span',
            '',
            `${seat.seat + 1} ${participant?.controller === 'human' ? '나' : 'AI'}`,
          ),
          node('span', '', seat.bankrupt ? '파산' : active ? '현재' : '·'),
        );
        seats.append(item);
      }
      const info = node('button', 'pm-turn-info', '승리·진척 ⓘ');
      info.type = 'button';
      info.dataset.focus = 'turn-progress-info';
      info.onclick = openInfo;
      element.append(identity, round, seats, info);
    },
    destroy() {
      element.remove();
    },
  };
}

/** Conditions, counts and rankings come from the core; names/membership from the supplied map. */
export function createTurnProgressInfo(view: GameView) {
  const root = node('div', 'pm-turn-details');
  const m = view.matchProgress;
  if (!m) {
    root.append(node('p', '', '경기 진행 정보 미연결'));
    return root;
  }
  root.append(
    node('p', '', m.roundDefinition),
    node(
      'p',
      '',
      `전역 턴 ${m.globalTurnNumber} · 완료 라운드 ${m.completedRounds} · 남은 ${m.remainingRounds} (현재 미완료 라운드 포함)`,
    ),
  );
  const rules = node('section');
  rules.append(node('h3', '', '승리 조건 5종'));
  const list = node('ul');
  for (const text of [
    `파산: 다른 참가자가 모두 파산하여 ${m.criteria.survivorsToWin}명 생존. 현재 ${m.survivors}명 생존.`,
    `그룹: 도시 그룹 ${m.criteria.groupsToWin}개 전체 소유.`,
    '한 면: 한쪽 면의 일반 도시를 모두 소유 (명소·특수 칸 제외).',
    `명소: ${m.criteria.landmarksToWin}개 소유.`,
    `제한 라운드: ${m.roundLimit}라운드 완료 후 생존자 총자산 1위. ${m.criteria.assetFormula}. 동점은 현금, 원래 좌석 순.`,
  ])
    list.append(node('li', '', text));
  rules.append(
    list,
    node(
      'p',
      '',
      '즉시 승리 조건을 제한 라운드 자산 판정보다 먼저 확인합니다. 미납 정산 중에는 자산 순위를 확정하지 않습니다.',
    ),
  );
  root.append(rules);
  const names = (ids: readonly string[]) =>
    ids
      .map((id) => view.map.tiles.find((t) => t.id === id)?.nameKo ?? id)
      .join(' · ');
  for (const p of m.players) {
    const section = node('section');
    const completed = p.groups.filter(
      (g) => g.total > 0 && g.owned === g.total,
    ).length;
    section.append(
      node(
        'h3',
        '',
        `${p.seat + 1}. ${playerName(view, p.playerId)}${p.bankrupt ? ' · 파산 · 차례 건너뜀' : ''}`,
      ),
    );
    section.append(
      node(
        'p',
        '',
        `완료 기본 차례 ${p.completedBasicTurns} · 개인 주회 ${p.completedLaps}${p.trial ? ' · 시험 체류 중' : ''}`,
      ),
    );
    section.append(
      node(
        'p',
        '',
        `그룹 ${completed}/${m.criteria.groupsToWin} · 명소 ${p.landmarksOwned}/${m.criteria.landmarksToWin} · 생존 ${p.bankrupt ? '탈락' : `${m.survivors}명 중 참가`}`,
      ),
    );
    const targets = node('ul');
    for (const g of p.groups) {
      const group = view.map.cityGroups.find((v) => v.id === g.groupId);
      const near = !p.bankrupt && g.owned > 0 && g.total - g.owned === 1;
      targets.append(
        node(
          'li',
          near ? 'is-near' : '',
          `${group?.nameKo ?? g.groupId} ${g.owned}/${g.total}${near ? ' · 독점까지 1개' : ''} — ${names(group?.cityIds ?? [])}`,
        ),
      );
    }
    for (const s of p.sides) {
      const ids = view.map.tiles
        .filter((t) => t.kind === 'city' && t.side === s.side)
        .map((t) => t.id);
      const near = !p.bankrupt && s.owned > 0 && s.total - s.owned === 1;
      targets.append(
        node(
          'li',
          near ? 'is-near' : '',
          `${sideNames[s.side]} 면 ${s.owned}/${s.total}${near ? ' · 독점까지 1개' : ''} — ${names(ids)}`,
        ),
      );
    }
    const landmarks = view.map.tiles.filter((t) => t.kind === 'landmark');
    targets.append(
      node(
        'li',
        '',
        `명소 목록 — ${landmarks.map((t) => `${t.nameKo} (${view.state.holdings.some((h) => h.tileId === t.id && h.ownerId === p.playerId) ? '소유' : '미소유'})`).join(' · ')}`,
      ),
    );
    const rank = m.assetRanking?.find((r) => r.playerId === p.playerId);
    section.append(
      targets,
      node(
        'p',
        '',
        rank
          ? `총자산 ${amount(rank.total)} · 현금 ${amount(rank.cash)} · 토지·건설 ${amount(rank.propertyCost)}`
          : '총자산 순위: 미납 정산 대기',
      ),
    );
    root.append(section);
  }
  if (m.endReason)
    root.append(node('p', '', `결과: ${endNames[m.endReason] ?? m.endReason}`));
  return root;
}
