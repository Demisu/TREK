// CW-03, CW-04: a city walk's stops in its detail, checked off for the day it
// was opened from, and its progress as a pill of the desktop day row.
import type { TourDetailResponse, TourListItem, TourWaypoint } from '@trek/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '../../../../tests/helpers/render';
import { tourRepo } from '../../../repo/tourRepo';
import { tourVisitRepo } from '../../../repo/tourVisitRepo';
import { useTourVisitStore } from '../../../store/tourVisitStore';
import { ToastContainer } from '../../shared/Toast';
import { WalkProgressPill, WalkStationsCard, type WalkDay } from './WalkStations';

const walk: TourListItem = {
  place_id: 42,
  name: 'Old town',
  tour_type: 'walk',
  distance: 0.3,
  elevation_gain: null,
  elevation_loss: null,
  duration: 20,
  break_additional_minutes: null,
  planned_duration_minutes: null,
  difficulty: null,
  wanderer_ref: null,
  match_confidence: 1,
  max_hiking_difficulty: null,
  planned: true,
  caution: false,
  station_count: 3,
};

const waypoints: TourWaypoint[] = [
  {
    lat: 48,
    lng: 11,
    role: 'start',
    sequence: 0,
    key: 'stop-01',
    name: 'Museum',
    stay_minutes: 30,
    opening_hours: 'Mo-Fr 09:00-09:20',
  },
  { lat: 48.0005, lng: 11, role: 'via', sequence: 1, key: 'shape-01', shaping: true },
  { lat: 48.001, lng: 11, role: 'via', sequence: 2, key: 'stop-02', opening_hours: 'sunrise-sunset' },
  { lat: 48.002, lng: 11, role: 'end', sequence: 3, name: 'Cafe', stay_minutes: 15, opening_hours: 'Mo 10:00-18:00' },
];

const day: WalkDay = {
  date: '2026-10-19',
  start: '09:00',
  route: [
    [48, 11],
    [48.001, 11],
    [48.002, 11],
  ],
  walkingMinutes: 20,
};

function detail(points: TourWaypoint[] = waypoints): Promise<TourDetailResponse> {
  return Promise.resolve({ tour: walk, waypoints: points });
}

function card(props: Partial<Parameters<typeof WalkStationsCard>[0]> = {}) {
  return render(
    <>
      <ToastContainer />
      <WalkStationsCard tour={walk} tripId={4} assignmentId={9} canMark {...props} />
    </>
  );
}

const UNREAD = 'The stops of this walk could not be loaded. Open it again while online to see them and check them off.';

const rowOf = async (name: string) =>
  (await screen.findAllByTestId('walk-station')).find((row) => row.textContent?.includes(name)) as HTMLElement;

beforeEach(() => {
  useTourVisitStore.setState({ tripId: '4', byAssignment: {} });
  vi.spyOn(tourRepo, 'detail').mockImplementation(() => detail());
});

afterEach(() => vi.restoreAllMocks());

describe('WalkStationsCard', () => {
  it('shows nothing for a tour that is no city walk', () => {
    render(<WalkStationsCard tour={{ ...walk, tour_type: 'hike' }} tripId={4} assignmentId={9} canMark />);
    expect(screen.queryByTestId('walk-stations')).not.toBeInTheDocument();
  });

  it('says it is loading until the stops are read', () => {
    vi.mocked(tourRepo.detail).mockReturnValue(new Promise(() => undefined));
    card();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('lists the stops in their order without the shaping points, an unnamed one by its number', async () => {
    card();
    const rows = await screen.findAllByTestId('walk-station');
    expect(rows.map((row) => row.querySelector('.font-semibold')?.textContent)).toEqual(['Museum', 'Stop 2', 'Cafe']);
    expect(tourRepo.detail).toHaveBeenCalledWith(4, 42, expect.any(AbortSignal));
  });

  it('opened without a day, offers nothing to check off and says where to', async () => {
    card({ assignmentId: null });
    await screen.findAllByTestId('walk-station');
    expect(
      screen.getByText('Open the walk from a day of the plan to check its stops off for that day.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Mark visited')).not.toBeInTheDocument();
  });

  it('checks a stop off for its day and skips another, through the store', async () => {
    const update = vi
      .spyOn(tourVisitRepo, 'update')
      .mockResolvedValueOnce({ visits: [{ assignment_id: 9, station_key: 'stop-01', status: 'visited' }] })
      .mockResolvedValueOnce({
        visits: [
          { assignment_id: 9, station_key: 'stop-01', status: 'visited' },
          { assignment_id: 9, station_key: 'stop-02', status: 'skipped' },
        ],
      });
    card();

    fireEvent.click(within(await rowOf('Museum')).getByText('Mark visited'));
    expect(update).toHaveBeenLastCalledWith(4, 9, 'stop-01', { status: 'visited' });
    expect(await within(await rowOf('Museum')).findByText('Visited on this day')).toBeInTheDocument();
    fireEvent.click(within(await rowOf('Stop 2')).getByText('Skip'));
    expect(update).toHaveBeenLastCalledWith(4, 9, 'stop-02', { status: 'skipped' });
    expect(await within(await rowOf('Stop 2')).findByText('Skipped on this day')).toBeInTheDocument();
  });

  it('a stop visited on that day says so and can be taken back', async () => {
    useTourVisitStore.setState({ byAssignment: { 9: { 'stop-01': 'visited' } } });
    const update = vi.spyOn(tourVisitRepo, 'update').mockResolvedValue({ visits: [] });
    card();

    const museum = await rowOf('Museum');
    expect(within(museum).getByText('Visited on this day')).toBeInTheDocument();
    fireEvent.click(within(museum).getByText('Take back'));

    expect(update).toHaveBeenCalledWith(4, 9, 'stop-01', { status: 'planned' });
  });

  it('a stop without a key has nothing to check off, and without the right to plan the day no stop has', async () => {
    const { unmount } = card();
    expect(within(await rowOf('Cafe')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(await rowOf('Museum')).getByText('Mark visited')).toBeInTheDocument();
    unmount();

    card({ canMark: false });
    await screen.findAllByTestId('walk-station');
    expect(screen.queryByText('Mark visited')).not.toBeInTheDocument();
    expect(screen.queryByText('Skip')).not.toBeInTheDocument();
  });

  it('on a day put on the plan offline, says the stops wait for the sync and offers no buttons', async () => {
    card({ assignmentId: -1700000000000 });
    await screen.findAllByTestId('walk-station');
    expect(
      screen.getByText('This walk was put on the day while offline. Its stops can be checked off once it has synced.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Mark visited')).not.toBeInTheDocument();
    expect(screen.queryByText('Open the walk from a day of the plan to check its stops off for that day.')).toBeNull();
  });

  it('a mark the server refuses is taken back and said in a toast', async () => {
    vi.spyOn(tourVisitRepo, 'update').mockRejectedValue(new Error('No permission'));
    card();

    fireEvent.click(within(await rowOf('Museum')).getByText('Mark visited'));

    expect(
      await screen.findByText('The stop could not be marked. Open the walk again and try once more.')
    ).toBeInTheDocument();
    expect(within(await rowOf('Museum')).getByText('Mark visited')).toBeInTheDocument();
  });

  it('heads the stops with how many were visited on that day', async () => {
    useTourVisitStore.setState({ byAssignment: { 9: { 'stop-01': 'visited', 'stop-02': 'skipped' } } });
    card();
    expect(await screen.findByText('1 of 3 visited')).toBeInTheDocument();
  });

  it('on a day with a start, shows each arrival and what the opening hours say about it', async () => {
    card({ day });
    expect(within(await rowOf('Museum')).getByText('Arrival about 09:00')).toBeInTheDocument();
    expect(within(await rowOf('Museum')).getByTestId('walk-station-conflict')).toHaveTextContent(
      'Arrival 09:00, stay until 09:30, but it closes at 09:20'
    );
    expect(within(await rowOf('Stop 2')).getByText('Arrival about 09:40')).toBeInTheDocument();
    expect(within(await rowOf('Stop 2')).getByText('Opening hours not read here: sunrise-sunset')).toBeInTheDocument();
    expect(within(await rowOf('Cafe')).getByText('Arrival 09:50 at the earliest')).toBeInTheDocument();
    expect(within(await rowOf('Cafe')).getByTestId('walk-station-conflict')).toHaveTextContent(
      'Closed at 09:50 by its opening hours'
    );
    expect(screen.getByText(/Opening hours as OpenStreetMap has them/)).toBeInTheDocument();
  });

  it('on a day without a start, asks for one and leaves the hours unsaid', async () => {
    card({ day: { ...day, start: null } });
    expect(
      await screen.findByText('Give the walk a time on this day to see arrivals and opening hours.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/Arrival/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Opening hours as OpenStreetMap has them/)).not.toBeInTheDocument();
  });

  it('names no source of hours when no stop has any', async () => {
    vi.mocked(tourRepo.detail).mockImplementation(() =>
      detail(waypoints.map(({ opening_hours: _hours, ...point }) => point))
    );
    card({ day });
    expect(within(await rowOf('Museum')).getByText('Arrival about 09:00')).toBeInTheDocument();
    expect(screen.queryByText(/Opening hours as OpenStreetMap has them/)).not.toBeInTheDocument();
  });

  it('a walk whose stops cannot be read lists none, counts none and says so', async () => {
    vi.mocked(tourRepo.detail).mockRejectedValue(new Error('Tour not available offline'));
    card();
    expect(await screen.findByText(UNREAD)).toBeInTheDocument();
    expect(screen.queryAllByTestId('walk-station')).toEqual([]);
    expect(screen.queryByText(/visited/)).not.toBeInTheDocument();
  });

  it("offline, the route's two ends read in place of the stops are no stops: no count, and it says so", async () => {
    useTourVisitStore.setState({ byAssignment: { 9: { 'stop-01': 'visited', 'stop-02': 'visited' } } });
    const ends: TourWaypoint[] = [
      { lat: 48, lng: 11, role: 'start', sequence: 0 },
      { lat: 48.002, lng: 11, role: 'end', sequence: 1 },
    ];
    vi.mocked(tourRepo.detail).mockImplementation(() => detail(ends));
    card({ day });

    expect(await screen.findByText(UNREAD)).toBeInTheDocument();
    expect(screen.queryAllByTestId('walk-station')).toEqual([]);
    expect(screen.queryByText(/visited/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Arrival/)).not.toBeInTheDocument();
  });

  it('a walk saved offline lists its stops before the sync gave them keys', async () => {
    const unsaved = waypoints.map(({ key: _key, ...point }) => point);
    vi.mocked(tourRepo.detail).mockImplementation(() => detail(unsaved));
    card({ tour: { ...walk, place_id: -1700000000001 }, assignmentId: -1700000000000 });

    expect(await screen.findAllByTestId('walk-station')).toHaveLength(3);
    expect(screen.getByText('0 of 3 visited')).toBeInTheDocument();
    expect(screen.queryByText(UNREAD)).not.toBeInTheDocument();
  });

  it('a walk without stops lists none and misses nothing', async () => {
    vi.mocked(tourRepo.detail).mockImplementation(() => detail([]));
    card({ tour: { ...walk, station_count: 0 } });
    await vi.waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument());

    expect(screen.queryAllByTestId('walk-station')).toEqual([]);
    expect(screen.queryByText(UNREAD)).not.toBeInTheDocument();
    expect(screen.queryByText(/visited/)).not.toBeInTheDocument();
  });
});

describe('WalkProgressPill', () => {
  it('says nothing for a hike, a walk without stops, or a day without marks', () => {
    useTourVisitStore.setState({ byAssignment: { 9: { 'stop-01': 'visited' } } });
    render(
      <>
        <WalkProgressPill tour={{ ...walk, tour_type: 'hike' }} assignmentId={9} />
        <WalkProgressPill tour={{ ...walk, station_count: 0 }} assignmentId={9} />
        <WalkProgressPill tour={walk} assignmentId={10} />
        <WalkProgressPill tour={walk} assignmentId={undefined} />
      </>
    );
    expect(screen.queryByTestId('plan-walk-progress')).not.toBeInTheDocument();
  });

  it('shows the visited stops of all of them, named in full', () => {
    useTourVisitStore.setState({
      byAssignment: { 9: { a1b2c3: 'visited', d4e5f6: 'visited', g7h8i9: 'skipped' }, 10: { a1b2c3: 'skipped' } },
    });
    render(
      <>
        <WalkProgressPill tour={{ ...walk, station_count: 5 }} assignmentId={9} />
        <WalkProgressPill tour={{ ...walk, station_count: 5 }} assignmentId={10} />
      </>
    );
    const [day9, day10] = screen.getAllByTestId('plan-walk-progress');
    expect(day9).toHaveTextContent('2/5');
    expect(day9).toHaveAccessibleName('2 of 5 visited');
    expect(day10).toHaveTextContent('0/5');
  });
});
