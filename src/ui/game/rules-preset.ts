import { normalizeRulesPreset, type RulesPreset } from '../../game/rulesets';

/** Setup-only selector; the adapter binds the chosen rules to a fresh session. */
export function createRulesPresetSelector(
  selected: RulesPreset,
  onChange: (preset: RulesPreset) => void,
): HTMLElement {
  const section = document.createElement('div');
  const label = document.createElement('label');
  label.className = 'pm-muted';
  label.append('경기 규칙 ');
  const select = document.createElement('select');
  select.setAttribute('aria-label', '경기 규칙');
  select.dataset.focus = 'rules-preset';
  for (const [value, name] of [
    ['standard', '표준'],
    ['quick', '짧은 경기'],
  ] as const) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = name;
    option.selected = selected === value;
    select.append(option);
  }
  select.onchange = () =>
    onChange(normalizeRulesPreset(select.value as RulesPreset));
  label.append(select);
  const details = document.createElement('p');
  details.className = 'pm-muted';
  details.textContent =
    selected === 'standard'
      ? '센터 1주회 · 최종시설 2주회 · 센터 건설 후 재방문'
      : '센터·최종시설 1주회 · 센터 건설 후 재방문';
  section.append(label, details);
  return section;
}
