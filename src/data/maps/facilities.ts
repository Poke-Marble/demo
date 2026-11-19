import type { FinalFacility } from './types.ts';

const source = (page: string) =>
  `https://bulbapedia.bulbagarden.net/wiki/${page}`;
const facility = (
  key: string,
  nameKo: string,
  page: string,
  noteKo: string,
  basis: FinalFacility['basis'] = 'canonical',
): FinalFacility => ({ key, nameKo, basis, sourceUrl: source(page), noteKo });

/** Stable art/content keys; architecture and all costs remain proposals. */
export const finalFacilities = {
  pallet: facility(
    'oak-lab',
    '오박사 연구소',
    'Professor_Oak%27s_Laboratory',
    '태초마을의 시작 포켓몬 연구소를 대표시설로 선택.',
  ),
  viridian: facility(
    'viridian-gym',
    '상록체육관',
    'Viridian_Gym',
    '상록의 체육관. 초반에 방문하지만 원작 체육관 도전은 후반이라는 차이를 유지.',
  ),
  pewter: facility(
    'pewter-museum',
    '회색 과학박물관',
    'Pewter_Museum_of_Science',
    '초기 체육관 도시의 다른 상징인 과학박물관을 선택.',
  ),
  'mt-moon': facility(
    'moon-fossil-station',
    '달맞이산 화석조사소',
    'Mt._Moon',
    '원작 화석 발견을 바탕으로 창작한 조사 건물. 원작 고유 건물이 아님.',
    'board-adaptation',
  ),
  cerulean: facility(
    'cerulean-gym',
    '블루체육관',
    'Cerulean_Gym',
    '블루시티의 수상 체육관을 선택.',
  ),
  vermilion: facility(
    'vermilion-port-terminal',
    '갈색항 여객터미널',
    'Vermilion_City',
    '상트앙느호가 정박하는 항구를 건축모형으로 각색. 터미널 건물과 명칭은 창작.',
    'board-adaptation',
  ),
  lavender: facility(
    'pokemon-tower',
    '포켓몬타워',
    'Pok%C3%A9mon_Tower',
    '관동 초기 세대의 보라타운 사건 배경. 성도 시대의 라디오타워로 대체하지 않음.',
  ),
  celadon: facility(
    'celadon-department-store',
    '무지개 백화점',
    'Celadon_Department_Store',
    '무지개시티의 백화점. 체육관 대신 상업 중심 이미지를 선택.',
  ),
  saffron: facility(
    'silph-head-office',
    '실프주식회사 본사',
    'Silph_Co.',
    '노랑시티의 실프 본사와 로켓단 사건을 대표.',
  ),
  fuchsia: facility(
    'warden-house',
    '사파리 원장 집',
    'Fuchsia_City',
    '연분홍의 사파리 원장 집을 선택. 별도 사파리존 안내소와 구분.',
  ),
  'safari-kanto': facility(
    'safari-visitor-lodge',
    '사파리 방문자 안내소',
    'Kanto_Safari_Zone',
    '사파리 입장·탐험을 하나의 안내 건물로 각색. 고유 건물명으로 주장하지 않음.',
    'board-adaptation',
  ),
  cinnabar: facility(
    'cinnabar-pokemon-lab',
    '홍련 포켓몬연구소',
    'Cinnabar_Lab',
    '관동 초기 세대 홍련의 화석 복원 연구소를 선택. 분화 후 모습은 재현하지 않음.',
  ),
  'new-bark': facility(
    'elm-lab',
    '공박사 연구소',
    'Professor_Elm%27s_Laboratory',
    '연두마을의 성도 여행 시작 연구소.',
  ),
  cherrygrove: facility(
    'guide-gent-house',
    '무궁 안내할아버지 집',
    'Cherrygrove_City',
    '초반 마을을 안내하는 할아버지의 집을 선택.',
  ),
  violet: facility(
    'sprout-tower',
    '모다피의 탑',
    'Sprout_Tower',
    '도라지의 초기 수련 장소. 전설 시험의 방울탑과 다른 탑.',
  ),
  'ruins-alph': facility(
    'alph-research-center',
    '알프 유적 연구소',
    'Ruins_of_Alph',
    '원작 유적 연구시설. 유적을 일반 구매 목적지로 취급하는 부분은 보드 규칙.',
  ),
  azalea: facility(
    'kurt-house',
    '강집의 집',
    'Kurt',
    '고동마을 볼 장인의 집. 야돈우물 사건과 여행 동기를 연결.',
  ),
  goldenrod: facility(
    'goldenrod-radio-tower',
    '금빛 라디오타워',
    'Goldenrod_Radio_Tower',
    '금빛의 방송 시설. 로켓단 점거와 버전별 전설 단서를 연결.',
  ),
  ecruteak: facility(
    'ecruteak-dance-theater',
    '인주 무도장',
    'Ecruteak_City',
    '기모노걸의 무도장. 방울탑·소용돌이섬을 도시 최종시설로 중복 사용하지 않음.',
  ),
  olivine: facility(
    'olivine-lighthouse',
    '담청 등대',
    'Olivine_Lighthouse',
    '빛을 내는 전룡과 약을 구하는 항해의 배경.',
  ),
  mahogany: facility(
    'mahogany-souvenir-shop',
    '황토 기념품점',
    'Mahogany_Town',
    '원작 로켓단 아지트 입구의 기념품점. 범죄 운영을 경제 기능으로 구현하지 않음.',
  ),
  blackthorn: facility(
    'dragon-shrine',
    '용의굴 사당',
    'Dragon%27s_Den',
    '검은먹 인근 용의굴의 사당. 도시 타일의 대표권역으로 묶음.',
  ),
  indigo: facility(
    'league-reception-hall',
    '포켓몬리그 접견관',
    'Indigo_Plateau',
    '리그 도전 시설을 하나의 접견관으로 요약한 건물명·모형.',
    'board-adaptation',
  ),
  'mt-silver': facility(
    'silver-expedition-lodge',
    '은빛산 탐사산장',
    'Mt._Silver',
    '후반 탐험의 상징으로 창작한 산장. 원작 고유 건물이 아님.',
    'board-adaptation',
  ),
} as const satisfies Readonly<Record<string, FinalFacility>>;
