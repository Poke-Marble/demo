import type { FlightSelection } from '../contracts';

const kinds = {
  city: '일반도시',
  landmark: '관광명소',
  trial: '전설 이벤트',
  start: '출발',
  fly: '공중날기',
};
/** Renders only supplied state. No price, destination or facility rule calculation. */
export function decorateDestination(
  button: HTMLButtonElement,
  destination: FlightSelection['destinations'][number],
) {
  button.className = 'pm-flight-card';
  const meta = destination.metadata;
  const title = document.createElement('strong');
  title.textContent = destination.label;
  button.textContent = '';
  button.append(title);
  const line = (text: string, className = '') => {
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    button.append(span);
  };
  if (!meta) {
    line('미리보기 정보 없음');
    return;
  }
  line(kinds[meta.kind], 'pm-flight-kind');
  if (meta.ownership) {
    const owner =
      meta.ownership === 'unowned'
        ? '무소유'
        : meta.ownership === 'self'
          ? '내 땅'
          : '상대 소유';
    line(
      `${owner}${meta.ownerName ? ` · ${meta.ownerName}` : ''}${meta.ownerType ? ` · ${meta.ownerType}` : ''}`,
      'pm-flight-owner',
    );
    if (meta.ownerColor && /^[a-z]+$/.test(meta.ownerColor))
      button.dataset.ownerColor = meta.ownerColor;
  }
  if (meta.facilityStage !== undefined)
    line(
      `시설 ${meta.facilityStage}단계 · ${meta.facilityName ?? '시설명 정보 없음'}`,
    );
  else if (meta.facilityName) line(meta.facilityName);
  const prices = [
    meta.toll !== undefined
      ? `통행료 견적 ${meta.toll.toLocaleString('ko-KR')} ₽`
      : '',
    meta.purchase !== undefined
      ? `매입비 견적 ${meta.purchase.toLocaleString('ko-KR')} ₽`
      : '',
  ].filter(Boolean);
  line(prices.join(' · ') || '가격 미리보기 정보 없음', 'pm-flight-price');
}
