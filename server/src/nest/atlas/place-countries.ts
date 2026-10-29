import type { PlaceRow } from '../../db/repositories/Places.repository';
import { resolveCountryCodeSync } from './atlas-geo';

type LocatedPlace = Pick<PlaceRow, 'lat' | 'lng' | 'address'>;

/**
 * The one way a place gets its country, for every view that counts countries
 * (#2875): the country of its cached region first, the bundled borders for a
 * place that has no cached region. place_regions is a region cache, and a place
 * in a country the region bundle does not cover (Vatican City) or one whose
 * background lookup has not finished holds no row there, so a count that read the
 * cache alone lost countries the Atlas map shows.
 *
 * The border lookup is a point-in-polygon test, so each resolver runs it once per
 * location: the places of a city trip mostly share their coordinates or address.
 */
export function placeCountryResolver(): (place: LocatedPlace, cached: string | null | undefined) => string | null {
  const byLocation = new Map<string, string | null>();
  return (place, cached) => {
    if (cached) return cached;
    const key = `${place.lat},${place.lng},${place.address ?? ''}`;
    let code = byLocation.get(key);
    if (code === undefined) {
      code = resolveCountryCodeSync(place);
      byLocation.set(key, code);
    }
    return code;
  };
}
