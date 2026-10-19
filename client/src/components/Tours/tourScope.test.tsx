import type { TourListItem } from '@trek/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '../../../tests/helpers/render';
import { TourScopeSummary } from './TourScopeSummary';
import { tourScopeSummary } from './tourScope';

function tour(over: Partial<TourListItem> & Pick<TourListItem, 'place_id'>): TourListItem {
  return {
    tour_type: 'hike',
    name: `Tour ${over.place_id}`,
    distance: null,
    elevation_gain: null,
    elevation_loss: null,
    duration: null,
    difficulty: null,
    wanderer_ref: null,
    match_confidence: null,
    max_hiking_difficulty: 2,
    planned: false,
    caution: false,
    has_waypoints: true,
    origin: 'trek',
    ...over,
  } as TourListItem;
}

const HIKE_A = tour({
  place_id: 1,
  distance: 10,
  elevation_gain: 600,
  elevation_loss: 500,
  duration: 200,
  planned: true,
});
const HIKE_B = tour({
  place_id: 2,
  distance: 5.5,
  elevation_gain: null,
  elevation_loss: 100,
  duration: 100,
  break_additional_minutes: 30,
});
const GPX_HIKE = tour({
  place_id: 3,
  distance: 8,
  elevation_gain: 300,
  elevation_loss: 300,
  duration: 150,
  has_waypoints: false,
  origin: 'gpx',
});
const PADDLE = tour({
  place_id: 4,
  tour_type: 'kayak',
  distance: 12,
  elevation_gain: 40,
  elevation_loss: 40,
  duration: 180,
  planned: true,
});

describe('tourScopeSummary (STA-01)', () => {
  it('counts each tour once, by type, the most tours first, with how many are on a day', () => {
    const scope = tourScopeSummary([HIKE_A, PADDLE, HIKE_B, GPX_HIKE, HIKE_A]);
    expect(scope.count).toBe(4);
    expect(scope.onDays).toBe(2);
    expect(scope.types.map((type) => [type.type, type.count, type.onDays])).toEqual([
      ['hike', 3, 1],
      ['kayak', 1, 1],
    ]);
  });

  it('sums what is known and says how much of the whole that is, never a zero for unknown', () => {
    const [hike] = tourScopeSummary([HIKE_A, HIKE_B, GPX_HIKE]).types;
    expect(hike.distanceKm).toEqual({ value: 23.5, known: 3, of: 3 });
    expect(hike.ascentM).toEqual({ value: 900, known: 2, of: 3 });
    const [none] = tourScopeSummary([tour({ place_id: 9 })]).types;
    expect(none.distanceKm).toEqual({ value: null, known: 0, of: 1 });
  });

  it('keeps the routed, the imported and the planned time apart', () => {
    const [hike] = tourScopeSummary([HIKE_A, HIKE_B, GPX_HIKE]).types;
    expect(hike.routedMinutes).toEqual({ value: 300, known: 2, of: 2 });
    expect(hike.importedMinutes).toEqual({ value: 150, known: 1, of: 1 });
    // Planned: each tour's own time plus its breaks (HIKE_B's 30 min).
    expect(hike.plannedMinutes).toEqual({ value: 480, known: 3, of: 3 });
  });

  it('sums no heights for paddling, not even those a recorded paddle track brought', () => {
    const [paddle] = tourScopeSummary([PADDLE, { ...GPX_HIKE, place_id: 5, tour_type: 'kayak' }]).types;
    expect(paddle.ascentM).toEqual({ value: null, known: 0, of: 0 });
    expect(paddle.descentM).toEqual({ value: null, known: 0, of: 0 });
    expect(paddle.distanceKm.value).toBe(20);
  });
});

describe('TourScopeSummary', () => {
  beforeEach(() => localStorage.clear());

  it('shows the counts and each type with its sums, an incomplete one marked as at least', () => {
    render(<TourScopeSummary tours={[HIKE_A, HIKE_B, PADDLE]} />);
    const counts = screen.getByTestId('tour-scope-counts');
    expect(counts).toHaveTextContent('3Tours');
    expect(counts).toHaveTextContent('2Planned');
    expect(counts).toHaveTextContent('1Unplanned');
    const hike = screen.getByTestId('tour-scope-hike');
    expect(within(hike).getByText('15.5 km')).toBeInTheDocument();
    expect(within(hike).getByText('≥ 600 m')).toBeInTheDocument();
    expect(within(hike).getByText('Routed time')).toBeInTheDocument();
    expect(within(hike).queryByText('Time from imports')).toBeNull();
    // The paddle tour has no heights: no ascent, rather than 0 m.
    expect(within(screen.getByTestId('tour-scope-kayak')).queryByText('Ascent')).toBeNull();
  });

  it('folds to its counts, and remembers that in this browser', () => {
    const { unmount } = render(<TourScopeSummary tours={[HIKE_A]} />);
    fireEvent.click(screen.getByTestId('tour-scope-toggle'));
    expect(screen.queryByTestId('tour-scope-hike')).toBeNull();
    expect(screen.getByTestId('tour-scope-counts')).toBeInTheDocument();
    unmount();
    render(<TourScopeSummary tours={[HIKE_A]} />);
    expect(screen.queryByTestId('tour-scope-hike')).toBeNull();
    expect(screen.getByTestId('tour-scope-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('shows nothing for a trip without tours', () => {
    const { container } = render(<TourScopeSummary tours={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
