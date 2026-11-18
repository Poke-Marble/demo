export function createArtCredits() {
  const details = document.createElement('details');
  details.className = 'pm-art-credits';
  const summary = document.createElement('summary');
  summary.textContent = '아트 크레딧';
  const text = document.createElement('p');
  text.textContent =
    '시설·수목: Foxowl, TheDeadHeroAlistair, Game Freak. 항구: Vurtax, Acanthite Team, Palladium Forums. 지면: Kenney (CC0).';
  const source = document.createElement('a');
  source.href = 'https://eeveeexpo.com/resources/565/';
  source.textContent = 'Foxowl 원출처·사용 조건';
  source.target = '_blank';
  source.rel = 'noreferrer';
  text.append(' ', source);
  details.append(summary, text);
  return details;
}
