import { useEffect, useState } from 'react';
import { usePlaceLanguage } from '../../../hooks/usePlaceLanguage';
import { reverseGeocodeRepo } from '../../../repo/reverseGeocodeRepo';

/** How long a point has to rest before it is looked up, so a drag does not ask at every step. */
const SETTLE_MS = 350;

interface WaypointCoordinate {
  id: string;
  lat: number;
  lng: number;
}

const coordinateKey = (point: WaypointCoordinate) => `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;

/**
 * The place name of every waypoint by its id, as far as the reverse lookup has
 * answered. A waypoint without an entry is still loading, offline, or has no
 * name; the caller shows its coordinates then. A name is kept with the
 * coordinate it belongs to, so a moved point never shows its old name.
 */
export function useWaypointPlaceNames(waypoints: WaypointCoordinate[]): Record<string, string> {
  const lang = usePlaceLanguage();
  const [names, setNames] = useState<Record<string, { key: string; name: string }>>({});
  const signature = waypoints.map((point) => `${point.id}@${coordinateKey(point)}`).join('|');

  useEffect(() => {
    if (!signature) return undefined;
    let cancelled = false;
    const points = signature.split('|').map((entry) => {
      const [id, key] = entry.split('@');
      const [lat, lng] = key.split(',').map(Number);
      return { id, key, lat, lng };
    });
    const timer = window.setTimeout(() => {
      for (const point of points) {
        reverseGeocodeRepo.placeName(point.lat, point.lng, lang).then(
          (name) => {
            if (cancelled || !name) return;
            setNames((current) =>
              current[point.id]?.key === point.key && current[point.id]?.name === name
                ? current
                : { ...current, [point.id]: { key: point.key, name } },
            );
          },
          () => {
            // Offline or a failed lookup: the row keeps showing the coordinates.
          },
        );
      }
    }, SETTLE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [lang, signature]);

  const result: Record<string, string> = {};
  for (const point of waypoints) {
    const entry = names[point.id];
    if (entry && entry.key === coordinateKey(point)) result[point.id] = entry.name;
  }
  return result;
}
