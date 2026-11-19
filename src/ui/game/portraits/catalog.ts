import manifest from './manifest.json';
import type { PokemonId } from '../../../game/contracts';

export function portraitEntry(pokemonId: PokemonId, emotion: string) {
  return (
    manifest.portraits.find(
      (entry) => entry.pokemonId === pokemonId && entry.emotion === emotion,
    ) ??
    manifest.portraits.find(
      (entry) => entry.pokemonId === pokemonId && entry.emotion === 'Normal',
    )
  );
}

export const portraitCredits = manifest.portraits.map((portrait) => ({
  id: `portrait:${portrait.pokemonId}:${portrait.emotion}`,
  label: `${portrait.pokemonId} · ${portrait.emotion}.png`,
  attribution: `${[...new Set(portrait.credits.map((credit) => credit.creator.name))].join(', ')} · ${portrait.licenseStatus} · ${portrait.provenance === 'original-game-extraction' ? '원작 추출 자료' : '팬 기여 또는 혼합 자료'} · ${portrait.modifications}`,
  sourceUrl: portrait.url,
}));
