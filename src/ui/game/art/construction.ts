import type { ArtTile, RegionalScene } from './places';

export const constructionStages = [
  'unowned',
  'camp',
  'shop',
  'center',
  'final',
] as const;
export type ConstructionStage = (typeof constructionStages)[number];
export const ownerColors = [
  '#e29860',
  '#69a6c8',
  '#b18cca',
  '#80af77',
] as const;
export type OwnerColor = (typeof ownerColors)[number];
export type FinalFacility =
  | 'lab'
  | 'department-store'
  | 'silph'
  | 'radio-tower'
  | 'lighthouse'
  | 'gym'
  | 'museum'
  | 'harbor'
  | 'cultural-hall'
  | 'ranger-station'
  | 'lodge'
  | 'league';
/** Render-only input: supplied by the integration, no purchase or economy decisions. */
export interface ConstructionVisual {
  stage: ConstructionStage;
  ownerColor?: OwnerColor;
}
export interface BuildingMetadata {
  finalFacility?: FinalFacility;
  visualScene?: RegionalScene;
}
export type BuildingTile = ArtTile & BuildingMetadata;
export const finalFacilities: Readonly<Record<string, FinalFacility>> = {
  pallet: 'lab',
  'new-bark': 'lab',
  celadon: 'department-store',
  saffron: 'silph',
  goldenrod: 'radio-tower',
  olivine: 'lighthouse',
  pewter: 'museum',
  viridian: 'gym',
  cerulean: 'gym',
  fuchsia: 'ranger-station',
  cinnabar: 'lab',
  vermilion: 'harbor',
  lavender: 'cultural-hall',
  cherrygrove: 'harbor',
  violet: 'gym',
  azalea: 'gym',
  cianwood: 'gym',
  ecruteak: 'cultural-hall',
  mahogany: 'lodge',
  blackthorn: 'gym',
  indigo: 'league',
  'safari-kanto': 'ranger-station',
  'mt-moon': 'ranger-station',
  'rock-tunnel': 'ranger-station',
  'ruins-alph': 'museum',
  'lake-rage': 'ranger-station',
  'mt-silver': 'ranger-station',
};
export function finalFacility(tile: BuildingTile): FinalFacility {
  return (
    tile.finalFacility ?? finalFacilities[tile.id.split(':').at(-1)!] ?? 'lodge'
  );
}
/** Temporary compatibility mapping: owner + 0/1/2/3 => camp/shop/center/final.
 * This mapping is visual only; economy owners may instead pass explicit stages. */
export function constructionFromHolding(
  holding?: { facilityLevel: number },
  seat = 0,
): ConstructionVisual {
  if (!holding) return { stage: 'unowned' };
  const level = Number.isFinite(holding.facilityLevel)
    ? Math.max(0, Math.min(3, Math.trunc(holding.facilityLevel)))
    : 0;
  return {
    stage: constructionStages[level + 1]!,
    ownerColor: ownerColors[((seat % 4) + 4) % 4]!,
  };
}
export function builtComponents(state: ConstructionVisual) {
  const rank = constructionStages.indexOf(state.stage);
  return {
    flag: rank >= 1,
    shop: rank >= 2,
    center: rank >= 3,
    signature: rank >= 4,
  };
}
