import { act, renderHook, waitFor } from '@testing-library/react';
import type { TourPoi, TourPoiSearchResponse } from '@trek/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '../../../../tests/helpers/render';
import { OnlineOnlyError } from '../../../repo/onlineOnly';
import { tourPoiSearchRepo } from '../../../repo/tourPoiSearchRepo';
import { useTourPoiStore } from '../../../store/tourPoiStore';
import type { TourPlannerWaypoint } from '../planner/tourPlannerWaypoints';
import type { TourPlannerController } from '../planner/useTourPlanner';
import { TourPoiSearchCard } from './TourPoiSearchCard';
import { usePoiInsertion, type PoiInsertionPlanner } from './usePoiInsertion';
import { useTourPoiSearch } from './useTourPoiSearch';

// FE-TOUR-POI-001 to FE-TOUR-POI-008

vi.mock('../planner/useWaypointPlaceNames', () => ({ useWaypointPlaceNames: () => ({}) }));

const ROUTE: Array<[number, number]> = [
  [47.0, 11.0],
  [47.01, 11.0],
  [47.02, 11.0],
];
const PA: TourPlannerWaypoint = { id: 'a', lat: 47.0, lng: 11.0, role: 'start' };
const PB: TourPlannerWaypoint = { id: 'b', lat: 47.01, lng: 11.0, role: 'via' };
const PC: TourPlannerWaypoint = { id: 'c', lat: 47.02, lng: 11.0, role: 'end' };
const POINTS = [PA, PB, PC];
const SPRING: TourPoi = {
  id: 'node:1',
  name: 'Spring',
  lat: 47.015,
  lng: 11.001,
  category: 'drinking_water',
  kind: 'amenity=drinking_water',
  source: 'openstreetmap',
  address: null,
  website: 'https://example.test',
  phone: null,
  opening_hours: 'Mo-Su 08:00-18:00',
  distance_m: 80,
  along_m: 1650,
};
const ANSWER: TourPoiSearchResponse = { pois: [SPRING], truncated: false, partial: false, capped: false };

let search: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  useTourPoiStore.getState().clear();
  search = vi.spyOn(tourPoiSearchRepo, 'search').mockResolvedValue(ANSWER);
});
afterEach(() => vi.restoreAllMocks());

const searchPlanner = (over: Partial<TourPlannerController> = {}) =>
  ({
    tripId: 4,
    tourType: 'hike',
    route: ROUTE,
    mode: { type: 'edit-saved', placeId: 9 },
    ...over,
  }) as TourPlannerController;

describe('useTourPoiSearch (PLN-02)', () => {
  it('FE-TOUR-POI-001: searches only when asked, with the type’s first three kinds and the corridor', async () => {
    const { result } = renderHook(() => useTourPoiSearch(searchPlanner()));
    expect(search).not.toHaveBeenCalled();
    expect(result.current.categories).toEqual(['viewpoint', 'shelter', 'drinking_water']);
    await act(() => result.current.search());
    expect(search).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        tour_type: 'hike',
        corridor_m: 500,
        line: ROUTE,
        categories: ['viewpoint', 'shelter', 'drinking_water'],
      }),
      expect.any(AbortSignal)
    );
    expect(result.current.status).toBe('ready');
    expect(useTourPoiStore.getState().pois).toEqual([SPRING]);
  });

  it('FE-TOUR-POI-002: a change of the choices marks the answer outdated, and a kind can be dropped or added', async () => {
    const { result } = renderHook(() => useTourPoiSearch(searchPlanner()));
    await act(() => result.current.search());
    act(() => result.current.toggleCategory('viewpoint'));
    expect(result.current.categories).toEqual(['shelter', 'drinking_water']);
    expect(result.current.outdated).toBe(true);
    act(() => result.current.toggleCategory('food'));
    expect(result.current.categories).toContain('food');
  });

  it('FE-TOUR-POI-003: says when it is offline or failed, and takes the places off the map then', async () => {
    search.mockRejectedValueOnce(new OnlineOnlyError()).mockRejectedValueOnce(new Error('500'));
    const { result } = renderHook(() => useTourPoiSearch(searchPlanner()));
    await act(() => result.current.search());
    expect(result.current.status).toBe('offline');
    await act(() => result.current.search());
    expect(result.current.status).toBe('error');
    expect(useTourPoiStore.getState().pois).toEqual([]);
  });

  it('FE-TOUR-POI-004: a paddle tour starts with its own kinds', () => {
    const { result } = renderHook(() => useTourPoiSearch(searchPlanner({ tourType: 'kayak' })));
    expect(result.current.categories).toEqual(['slipway', 'boat_rental', 'drinking_water']);
  });
});

/** A planner the insertion reads, its route and measures set by the test. */
function insertionPlanner(over: Partial<PoiInsertionPlanner> = {}): PoiInsertionPlanner {
  return {
    waypoints: POINTS,
    route: ROUTE,
    editWaypoints: vi.fn(),
    setSelectedWaypointId: vi.fn(),
    routeCurrent: true,
    status: 'ready',
    distanceMeters: 2200,
    walkingDurationMinutes: 40,
    canEdit: true,
    isSaving: false,
    ...over,
  };
}

describe('usePoiInsertion (PLN-03)', () => {
  it('FE-TOUR-POI-005: suggests the point before the place and takes it in as one step after it', () => {
    const planner = insertionPlanner();
    const { result } = renderHook(() => usePoiInsertion(planner));
    expect(result.current.afterIdFor(SPRING)).toBe('b');
    act(() => {
      result.current.insert(SPRING);
    });
    expect(planner.editWaypoints).toHaveBeenCalledTimes(1);
    const updater = vi.mocked(planner.editWaypoints).mock.calls[0]?.[0] as (
      points: TourPlannerWaypoint[]
    ) => TourPlannerWaypoint[];
    expect(updater(POINTS).map((point) => point.id)).toEqual(['a', 'b', expect.any(String), 'c']);
    expect(planner.setSelectedWaypointId).toHaveBeenCalled();
  });

  it('FE-TOUR-POI-006: reads what it added only from the route planned after, and nothing once the point is gone', () => {
    let planner = insertionPlanner();
    const { result, rerender } = renderHook(() => usePoiInsertion(planner));
    act(() => {
      result.current.insert(SPRING);
    });
    const added = vi.mocked(planner.setSelectedWaypointId).mock.calls[0]?.[0] as string;
    const withPoint = [PA, PB, { id: added, lat: 47.015, lng: 11.001, role: 'via' as const }, PC];
    planner = insertionPlanner({ waypoints: withPoint, routeCurrent: false, status: 'routing' });
    rerender();
    expect(result.current.outcome).toEqual({ kind: 'measuring', name: 'Spring' });
    planner = insertionPlanner({ waypoints: withPoint, distanceMeters: 2450, walkingDurationMinutes: 46 });
    rerender();
    expect(result.current.outcome).toEqual({ kind: 'measured', name: 'Spring', extraM: 250, extraMinutes: 6 });
    planner = insertionPlanner({ waypoints: withPoint, status: 'routing-failed' });
    rerender();
    expect(result.current.outcome).toEqual({ kind: 'unmeasured', name: 'Spring' });
    planner = insertionPlanner();
    rerender();
    expect(result.current.outcome).toBeNull();
  });

  it('FE-TOUR-POI-007: takes nothing in while saving, without edit rights, or into a stretch drawn by hand', () => {
    const free: TourPlannerWaypoint[] = [
      PA,
      {
        ...PB,
        fixedLeg: {
          kind: 'free',
          geometry: [
            [47.01, 11.0],
            [47.02, 11.0],
          ],
        },
      },
      PC,
    ];
    for (const planner of [insertionPlanner({ isSaving: true }), insertionPlanner({ canEdit: false })]) {
      const { result } = renderHook(() => usePoiInsertion(planner));
      expect(result.current.insert(SPRING)).toBe(false);
      expect(planner.editWaypoints).not.toHaveBeenCalled();
    }
    const planner = insertionPlanner({ waypoints: free });
    const { result } = renderHook(() => usePoiInsertion(planner));
    act(() => result.current.chooseAfter(SPRING, 'b'));
    expect(result.current.blockOf('b')).toBe('free');
    expect(result.current.insert(SPRING)).toBe(false);
  });
});

describe('TourPoiSearchCard', () => {
  it('FE-TOUR-POI-008: lists what was found with where it lies; opening a place offers to add it after a point', async () => {
    const planner = {
      ...searchPlanner(),
      ...insertionPlanner(),
    } as unknown as TourPlannerController;
    render(<TourPoiSearchCard planner={planner} />);
    fireEvent.click(screen.getByTestId('tour-poi-search'));
    const row = await screen.findByTestId('tour-poi-node:1');
    expect(row).toHaveTextContent('Spring');
    expect(row).toHaveTextContent('80 m from the route');
    fireEvent.click(within(row).getByRole('button', { name: /Spring/ }));
    expect(within(row).getByText('Mo-Su 08:00-18:00')).toBeInTheDocument();
    expect(within(row).getByText('As the source has them; check before you go.')).toBeInTheDocument();
    fireEvent.click(within(row).getByTestId('tour-poi-add'));
    await waitFor(() => expect(planner.editWaypoints).toHaveBeenCalledTimes(1));
  });
});
