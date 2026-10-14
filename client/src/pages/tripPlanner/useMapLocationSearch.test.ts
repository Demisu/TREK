// FE-TP-LOCSEARCH-001 to FE-TP-LOCSEARCH-004
//
// The tour planner's map location search: a picked result only moves the camera,
// and the planner's own focus takes over again once it bumps its focus key.
import { act, renderHook } from '@testing-library/react';
import { useMapLocationSearch } from './useMapLocationSearch';

const PLANNER_POINTS: [number, number][] = [
  [48, 11],
  [48.1, 11.1],
];
const PICK = { name: 'Zugspitze', lat: 47.42, lng: 10.98 };

describe('useMapLocationSearch', () => {
  it('FE-TP-LOCSEARCH-001: without a pick the planner frames its own points', () => {
    const { result } = renderHook(() => useMapLocationSearch(3, PLANNER_POINTS));

    expect(result.current.mapFocusPoints).toBe(PLANNER_POINTS);
    expect(result.current.mapFocusKey).toBe('tour:3');
    expect(result.current.locationSearch.value).toBeNull();
  });

  it('FE-TP-LOCSEARCH-002: a pick frames the picked point under a fresh key each time', () => {
    const { result } = renderHook(() => useMapLocationSearch(3, PLANNER_POINTS));

    act(() => result.current.locationSearch.onChange(PICK));
    expect(result.current.locationSearch.value).toEqual(PICK);
    expect(result.current.mapFocusPoints).toEqual([[47.42, 10.98]]);
    expect(result.current.mapFocusKey).toBe('tour:3:search:1');

    act(() => result.current.locationSearch.onChange(PICK));
    expect(result.current.mapFocusKey).toBe('tour:3:search:2');
  });

  it('FE-TP-LOCSEARCH-003: clearing the field keeps the camera where the pick put it', () => {
    const { result } = renderHook(() => useMapLocationSearch(3, PLANNER_POINTS));

    act(() => result.current.locationSearch.onChange(PICK));
    act(() => result.current.locationSearch.onChange(null));

    expect(result.current.locationSearch.value).toBeNull();
    expect(result.current.mapFocusKey).toBe('tour:3:search:1');
  });

  it('FE-TP-LOCSEARCH-004: a new planner focus key wins over an older pick', () => {
    const { result, rerender } = renderHook(({ key }) => useMapLocationSearch(key, PLANNER_POINTS), {
      initialProps: { key: 3 },
    });

    act(() => result.current.locationSearch.onChange(PICK));
    rerender({ key: 4 });

    expect(result.current.mapFocusPoints).toBe(PLANNER_POINTS);
    expect(result.current.mapFocusKey).toBe('tour:4');
  });
});
