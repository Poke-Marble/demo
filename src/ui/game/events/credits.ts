import sprites from '../../../assets/generated/sprites.json';
import town from '../assets/tiny-town/credits.json';
import type { UICredit } from '../adapter';
import { portraitCredits } from '../portraits/catalog';

/** Read existing per-file metadata; never infer a blanket asset license. */
export function gameCredits(
  extra: readonly UICredit[] = [],
): readonly UICredit[] {
  return [
    {
      id: 'pokemon-rights',
      label: 'Pokémon',
      attribution:
        '비공식 팬 프로젝트. Pokémon 원 권리: Nintendo / Creatures Inc. / GAME FREAK inc. 원작 권리와 팬 제작 기여의 권리는 구별됩니다.',
    },
    ...sprites.assets.map((asset) => ({
      id: asset.pokemonId,
      label: `${asset.pokemonId} · Idle / Walk`,
      attribution: `${[...new Set(asset.credits.map((credit) => credit.creator.name))].join(', ')} · ${asset.licenseStatus} · ${asset.modifications}`,
      sourceUrl: asset.repository,
    })),
    ...town.files.map((file) => ({
      id: `tiny-town:${file.file}`,
      label: `Tiny Town · ${file.file}`,
      attribution: `${file.creator} · ${file.license} · ${file.modifications}`,
      sourceUrl: town.source,
    })),
    {
      id: 'events-art',
      sourceUrl:
        'https://github.com/PMDCollab/SpriteCollab/tree/6735193b9d6f499411171daf8d8b7adf1e2d8883',
      label: '전설 연출',
      attribution:
        '루기아·칠색조 Idle/Attack/Hover: CHUNSOFT 원작 추출. PMDCollab SpriteCollab revision 6735193b9d6f499411171daf8d8b7adf1e2d8883. 개별 credits: Unspecified; 원작 CC 허가 미확인. 저장소 비상업·출처표시 정책. 픽셀 크롭·정수 배율 확대.',
    },
    {
      id: 'mounted-flight-art',
      label: '아머까오 탑승 · 0823 Idle / Hover',
      sourceUrl:
        'https://github.com/PMDCollab/SpriteCollab/tree/948c79de39e3fe3067f1fd26294e19d864325cc9/sprite/0823',
      attribution:
        'Soulja · 팬 제작 PMD 스타일. 개별 credits 2024-10-07: Idle/Hover CC_BY-NC_4 (CC BY-NC 4.0, https://creativecommons.org/licenses/by-nc/4.0/). 비상업·제작자 표시·원출처 및 라이선스 유지. 이전 Idle 기여 NATANIEL_SAMA, ◥θ┴θ◤, G〜의 원본 credits도 보존. 원본 픽셀·파일 변경 없음; 렌더 시 프레임 선택 및 기존 승객 합성. 원작 Pokémon 권리는 별도. 원본·해시: events/mounted/assets/manifest.json.',
    },
    ...extra,
    ...portraitCredits,
  ];
}
