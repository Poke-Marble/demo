import generated from './generated/pokemon.ko.json';
import type { PokemonId } from '../game/contracts';

export const pokemonCatalog = generated.pokemon.map((pokemon) => ({
  ...pokemon,
  id: pokemon.id as PokemonId,
}));
export type PokemonData = (typeof pokemonCatalog)[number];
