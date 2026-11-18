export function createArtCredits() {
  const details = document.createElement('details');
  details.className = 'pm-art-credits';
  const summary = document.createElement('summary');
  summary.textContent = '아트 크레딧';
  const text = document.createElement('p');
  text.textContent =
    '건축·수목: 프로젝트 공통 투영 SVG 모형. 지면: Kenney (CC0). 포켓몬 스프라이트: 기존 프로젝트 에셋 매니페스트 참조.';
  const source = document.createElement('a');
  source.href = 'https://kenney.nl/assets/tiny-town';
  source.textContent = '지면 에셋 원출처';
  source.target = '_blank';
  source.rel = 'noreferrer';
  text.append(' ', source);
  details.append(summary, text);
  return details;
}
