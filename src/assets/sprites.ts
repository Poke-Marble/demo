import manifest from './generated/sprites.json';
import type { PokemonId } from '../game/contracts';

const urls = import.meta.glob<string>('./vendor/sprite/**/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

export type AnimationName = 'Idle' | 'Walk';
export type SpriteAnimation =
  (typeof manifest.assets)[number]['animations'][number];
export const directions = ['S', 'SE', 'E', 'NE', 'N', 'NW', 'W', 'SW'] as const;
export type Direction = (typeof directions)[number];

export function findSprite(pokemonId: PokemonId, name: AnimationName) {
  const asset = manifest.assets.find((entry) => entry.pokemonId === pokemonId);
  const animation = asset?.animations.find((entry) => entry.name === name);
  const url = animation ? urls[animation.path] : undefined;
  return { asset, animation, url };
}
