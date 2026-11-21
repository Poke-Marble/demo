import type { Tile } from '../../../game/contracts';

export const scenes = [
  'start',
  'whirl',
  'bell',
  'fly',
  'port',
  'forest',
  'gym',
  'center',
  'town',
  'mountain',
  'shrine',
  'power',
  'lake',
  'den',
  'ice',
] as const;
export type RegionalScene = (typeof scenes)[number];
/** Optional render-only metadata. Never changes tile kind, economy or rules. */
export type ArtTile = Pick<Tile, 'id' | 'kind'> & {
  visualScene?: RegionalScene;
};
const places: Record<string, RegionalScene> = {
  start: 'start',
  // Historical landmark IDs now identify different Johto places.
  whirl: 'lake',
  'whirl-islands': 'whirl',
  'lugia-trial': 'whirl',
  'bell-tower': 'den',
  'ho-oh-trial': 'bell',
  fly: 'fly',
  'fly-corner': 'fly',
  vermilion: 'port',
  olivine: 'port',
  cianwood: 'port',
  cherrygrove: 'port',
  viridian: 'forest',
  azalea: 'forest',
  'safari-kanto': 'forest',
  pewter: 'gym',
  cerulean: 'gym',
  saffron: 'gym',
  blackthorn: 'gym',
  cinnabar: 'center',
  goldenrod: 'center',
  celadon: 'center',
  indigo: 'center',
  violet: 'shrine',
  ecruteak: 'shrine',
  lavender: 'shrine',
  'ruins-alph': 'shrine',
  'mt-moon': 'mountain',
  'rock-tunnel': 'mountain',
  'mt-silver': 'mountain',
  seafoam: 'ice',
  'lake-rage': 'lake',
  'power-plant': 'power',
};
export function regionalScene(tile: ArtTile): RegionalScene {
  return (
    tile.visualScene ??
    places[tile.id.split(':').at(-1)!] ??
    (tile.kind === 'start' ? 'start' : 'town')
  );
}
