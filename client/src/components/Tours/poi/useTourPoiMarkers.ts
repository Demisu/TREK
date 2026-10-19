import { useMemo } from 'react';
import { useTourPoiStore } from '../../../store/tourPoiStore';
import type { Poi } from '../../Map/poiCategories';

/**
 * PLN-02: the places found along the tour as the planner map draws POIs, each
 * in its category's look, and a click on one that picks it in the card.
 */
export function useTourPoiMarkers(): { pois: Poi[]; onPoiClick: (poi: Poi) => void } {
  const found = useTourPoiStore((state) => state.pois);
  const select = useTourPoiStore((state) => state.select);
  const pois = useMemo(
    () =>
      found.map((poi): Poi => ({
        osm_id: poi.id,
        name: poi.name,
        lat: poi.lat,
        lng: poi.lng,
        category: poi.category,
        poi_type: poi.kind,
        address: poi.address,
        website: poi.website,
        phone: poi.phone,
        opening_hours: poi.opening_hours,
        cuisine: null,
        source: poi.source,
      })),
    [found]
  );
  return { pois, onPoiClick: (poi: Poi) => select(poi.osm_id) };
}
