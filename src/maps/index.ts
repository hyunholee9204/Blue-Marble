import type { MapDef } from '../engine/types';
import { metroZombie } from './metroZombie';
import { worldTour } from './worldTour';
import { grandVoyage } from './grandVoyage';
import { spaceFrontier } from './spaceFrontier';
import { amusementPark } from './amusementPark';
import { volcanoIsle } from './volcanoIsle';

export const MAPS: MapDef[] = [metroZombie, worldTour, grandVoyage, spaceFrontier, amusementPark, volcanoIsle];

/** Shown on the map picker as "준비 중". */
export const UPCOMING_MAPS: { emoji: string; name: string; description: string }[] = [];

export function getMap(id: string): MapDef {
  const map = MAPS.find((m) => m.id === id);
  if (!map) throw new Error(`Unknown map: ${id}`);
  return map;
}
