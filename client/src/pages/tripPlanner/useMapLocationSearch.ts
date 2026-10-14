import { useCallback, useRef, useState } from 'react';
import type { LocationPoint } from '../../components/Planner/LocationSelect';

interface SearchCameraIntent {
  plannerFocusKey: number;
  sequence: number;
  point: [number, number];
}

/**
 * The TOUR-PLANNER location search: a picked result only moves the camera.
 * The search focus wins until the planner bumps its own focus key.
 */
export function useMapLocationSearch(plannerFocusKey: number, focusPoints: [number, number][]) {
  const [locationSearchValue, setLocationSearchValue] = useState<LocationPoint | null>(null);
  const [searchCameraIntent, setSearchCameraIntent] = useState<SearchCameraIntent | null>(null);
  const searchCameraSequenceRef = useRef(0);
  const onLocationSearchChange = useCallback(
    (location: LocationPoint | null) => {
      setLocationSearchValue(location);
      if (!location) return;
      searchCameraSequenceRef.current += 1;
      setSearchCameraIntent({
        plannerFocusKey,
        sequence: searchCameraSequenceRef.current,
        point: [location.lat, location.lng],
      });
    },
    [plannerFocusKey]
  );

  const searchFocusIsCurrent = searchCameraIntent?.plannerFocusKey === plannerFocusKey;
  const mapFocusPoints = searchFocusIsCurrent ? [searchCameraIntent.point] : focusPoints;
  const mapFocusKey = searchFocusIsCurrent
    ? `tour:${plannerFocusKey}:search:${searchCameraIntent.sequence}`
    : `tour:${plannerFocusKey}`;

  return {
    mapFocusPoints,
    mapFocusKey,
    locationSearch: { value: locationSearchValue, onChange: onLocationSearchChange },
  };
}
