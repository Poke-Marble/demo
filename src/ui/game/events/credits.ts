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
      label: '전설·비행 연출',
      attribution:
        '루기아·칠색조 Idle/Attack/Hover: CHUNSOFT 원작 추출. PMDCollab SpriteCollab revision 6735193b9d6f499411171daf8d8b7adf1e2d8883. 개별 credits: Unspecified; 원작 CC 허가 미확인. 저장소 비상업·출처표시 정책. 픽셀 크롭·확대. CSS 파도·깃털·기존 비행 도형은 자체 작성.',
    },
    ...extra,
    ...portraitCredits,
  ];
}
