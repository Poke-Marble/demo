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
      label: '전설·비행 연출',
      attribution:
        '자체 CSS 도형. 임시 전설 실루엣, 파도·깃털·빛. 외부 전설 이미지·음원 사용 없음.',
    },
    ...extra,
    ...portraitCredits,
  ];
}
