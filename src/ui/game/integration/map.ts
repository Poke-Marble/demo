import { kantoJohtoMap } from '../../../data/maps/kanto-johto.ts';
import type { FinalFacility } from '../art/construction';

/** Bridge the story/content keys to the smaller architectural vocabulary. */
export const facilityArt: Readonly<Record<string, FinalFacility>> = {
  'oak-lab': 'lab',
  'elm-lab': 'lab',
  'cinnabar-pokemon-lab': 'lab',
  'viridian-gym': 'gym',
  'cerulean-gym': 'gym',
  'pewter-museum': 'museum',
  'moon-fossil-station': 'ranger-station',
  'vermilion-port-terminal': 'harbor',
  'pokemon-tower': 'cultural-hall',
  'celadon-department-store': 'department-store',
  'silph-head-office': 'silph',
  'warden-house': 'lodge',
  'safari-visitor-lodge': 'ranger-station',
  'guide-gent-house': 'lodge',
  'sprout-tower': 'cultural-hall',
  'alph-research-center': 'lab',
  'kurt-house': 'lodge',
  'goldenrod-radio-tower': 'radio-tower',
  'ecruteak-dance-theater': 'cultural-hall',
  'olivine-lighthouse': 'lighthouse',
  'mahogany-souvenir-shop': 'lodge',
  'dragon-shrine': 'cultural-hall',
  'league-reception-hall': 'league',
  'silver-expedition-lodge': 'lodge',
};
export const presentationMap = {
  ...kantoJohtoMap,
  tiles: kantoJohtoMap.tiles.map((tile) => ({
    ...tile,
    ...(tile.finalFacility
      ? {
          finalFacility: facilityArt[tile.finalFacility.key] ?? 'lodge',
          finalFacilityName: tile.finalFacility.nameKo,
        }
      : {}),
  })),
};
