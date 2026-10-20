// FE-TOUR-WAYPOINT-LIST-001 to FE-TOUR-WAYPOINT-LIST-008: shaping points, the water router's answers
// and a city walk's stops in the list (P2A-03, P2A-05, PAD-11, CW-01).
import userEvent from '@testing-library/user-event';
import type { PaddleRouteLeg } from '@trek/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '../../../../tests/helpers/render';
import { resetAllStores, seedStore } from '../../../../tests/helpers/store';
import { hikePlannerDefaults } from '../../../../tests/helpers/tourPlannerStub';
import { useSettingsStore } from '../../../store/settingsStore';
import type { PaddleTourRoute } from './paddleRouting';
import TourWaypointList from './TourWaypointList';
import type { TourPlannerController } from './useTourPlanner';

/** The item at `i`, or a failure that names the index instead of a later undefined. */
function at<T>(list: readonly T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`nothing at ${i}`);
  return item;
}

vi.mock('./useWaypointPlaceNames', () => ({ useWaypointPlaceNames: () => ({}) }));

const START = { id: 'a', lat: 49.1, lng: 12.1, role: 'start' as const };
const SHAPE = { id: 's', lat: 49.08, lng: 12.11, role: 'via' as const, shaping: true };
const STOP = { id: 'b', lat: 49.05, lng: 12.12, role: 'via' as const };
const END = { id: 'c', lat: 49.0, lng: 12.1, role: 'end' as const };

const segment = (kind: 'water' | 'rapids' | 'pass' | 'gap', from: number, to: number, grade: number | null = null) => ({
  kind,
  from,
  to,
  name: null,
  source: null,
  osm_ref: null,
  grade,
});

const WHITEWATER: PaddleRouteLeg = {
  status: 'ok',
  geometry: [
    [49.05, 12.12],
    [49.04, 12.12],
    [49.03, 12.115],
    [49.0, 12.1],
  ],
  segments: [segment('water', 0, 1), segment('rapids', 1, 2, 2), segment('gap', 2, 3)],
  distance_m: 5800,
  snapped_m: { from: 0, to: 0 },
};

function planner(overrides: Partial<TourPlannerController> = {}): TourPlannerController {
  return {
    ...hikePlannerDefaults(),
    waypoints: [START, SHAPE, STOP, END],
    selectedWaypointId: null,
    setSelectedWaypointId: vi.fn(),
    reorderWaypoint: vi.fn(),
    moveWaypoint: vi.fn(),
    removeWaypoint: vi.fn(),
    ...overrides,
  } as unknown as TourPlannerController;
}

function paddleRoute(legs: PaddleTourRoute['legs'], failures: PaddleTourRoute['failures'] = []): PaddleTourRoute {
  return { coordinates: [], parts: [], distanceMeters: 0, legs, legLengths: legs.map(() => 0), failures };
}

beforeEach(() => {
  resetAllStores();
  seedStore(useSettingsStore, { settings: { distance_unit: 'metric' } });
});

describe('TourWaypointList', () => {
  it('FE-TOUR-WAYPOINT-LIST-001: numbers the stops only; a shaping point is a dot and does not count', () => {
    render(<TourWaypointList planner={planner()} canEdit isSaving={false} />);
    const rows = screen.getAllByTestId('tour-planner-waypoint-row');
    expect(rows).toHaveLength(4);
    expect(within(at(rows, 1)).getByLabelText('Shaping point')).toHaveAttribute('data-waypoint-shaping', 'true');
    expect(
      [...document.querySelectorAll('[data-waypoint-number]')].map((el) => el.getAttribute('data-waypoint-number'))
    ).toEqual(['1', '2', '3']);
    expect(screen.getByText('Click the route on the map to add a shaping point there.')).toBeInTheDocument();
  });

  it('FE-TOUR-WAYPOINT-LIST-002: the menu plans a routed leg again, draws it by hand, and turns a stop into a shaping point', async () => {
    const controller = planner({ selectedWaypointId: 'b' });
    render(<TourWaypointList planner={controller} canEdit isSaving={false} />);
    const row = at(screen.getAllByTestId('tour-planner-waypoint-row'), 2);
    await userEvent.click(within(row).getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('button', { name: 'Plan the next leg again' }));
    expect(controller.recomputeLeg).toHaveBeenCalledWith('b');

    await userEvent.click(within(row).getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('button', { name: 'Make it a shaping point' }));
    expect(controller.setWaypointShaping).toHaveBeenCalledWith('b', true);

    await userEvent.click(within(row).getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('button', { name: 'Draw the next leg by hand' }));
    expect(controller.toggleWaypointFreeLeg).toHaveBeenCalledWith('b');
  });

  it('FE-TOUR-WAYPOINT-LIST-003: a shaping point becomes a stop again; the first point offers no shaping', async () => {
    const controller = planner({ selectedWaypointId: 's' });
    const { rerender } = render(<TourWaypointList planner={controller} canEdit isSaving={false} />);
    await userEvent.click(
      within(at(screen.getAllByTestId('tour-planner-waypoint-row'), 1)).getByRole('button', { name: 'More actions' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Make it a stop' }));
    expect(controller.setWaypointShaping).toHaveBeenCalledWith('s', false);

    rerender(<TourWaypointList planner={planner({ selectedWaypointId: 'a' })} canEdit isSaving={false} />);
    await userEvent.click(
      within(at(screen.getAllByTestId('tour-planner-waypoint-row'), 0)).getByRole('button', { name: 'More actions' })
    );
    expect(screen.queryByRole('button', { name: 'Make it a shaping point' })).not.toBeInTheDocument();
  });

  it('FE-TOUR-WAYPOINT-LIST-004: a paddle leg shows its whitewater and its data gap with their lengths', () => {
    const route = paddleRoute([null, null, WHITEWATER]);
    render(
      <TourWaypointList
        planner={planner({ ...{ isPaddle: true, tourType: 'kayak' }, paddleRoute: route, routeCurrent: true })}
        canEdit
        isSaving={false}
      />
    );
    const notes = screen.getByTestId('tour-planner-leg-notes');
    expect(within(notes).getByText('Whitewater 2')).toBeInTheDocument();
    expect(within(notes).getByText('Gap in the map data')).toBeInTheDocument();
  });

  it('FE-TOUR-WAYPOINT-LIST-005: a leg the router could not plan says why and offers the way out', async () => {
    const route = paddleRoute(
      [{ status: 'failed', code: 'busy', at: null }, null, null],
      [{ index: 0, code: 'busy', at: null }]
    );
    const controller = planner({ isPaddle: true, tourType: 'kayak', paddleRoute: route, routeCurrent: true });
    render(<TourWaypointList planner={controller} canEdit isSaving={false} />);
    const failure = screen.getByTestId('tour-planner-leg-failure');
    expect(within(failure).getByRole('alert')).toHaveTextContent('The route planner is busy. Try again in a moment.');
    await userEvent.click(within(failure).getByRole('button', { name: 'Try again' }));
    expect(controller.recomputeLeg).toHaveBeenCalledWith('a');
    await userEvent.click(within(failure).getByRole('button', { name: 'Draw straight' }));
    expect(controller.toggleWaypointFreeLeg).toHaveBeenCalledWith('a');
  });

  it('FE-TOUR-WAYPOINT-LIST-006: a point off the water offers no retry; legs drawn by hand can go back to the water in one step', async () => {
    const drawn = {
      kind: 'free' as const,
      geometry: [
        [49.1, 12.1],
        [49.08, 12.11],
      ] as [number, number][],
    };
    const route = paddleRoute(
      [null, { status: 'failed', code: 'not_on_water', at: null }, null],
      [{ index: 1, code: 'not_on_water', at: null }]
    );
    const auto = { from: { id: 'a', lat: 49.1, lng: 12.1 }, to: { id: 'c', lat: 49.0, lng: 12.1 } };
    const controller = planner({
      isPaddle: true,
      tourType: 'kayak',
      paddleRoute: route,
      routeCurrent: true,
      waypoints: [{ ...START, fixedLeg: drawn }, SHAPE, { ...STOP, auto }, END],
    });
    render(<TourWaypointList planner={controller} canEdit isSaving={false} />);
    expect(
      within(screen.getByTestId('tour-planner-leg-failure')).queryByRole('button', { name: 'Try again' })
    ).toBeNull();
    expect(screen.getByTestId('tour-planner-auto-point')).toHaveAttribute('aria-label', 'Found');
    await userEvent.click(screen.getByTestId('tour-planner-route-on-water'));
    expect(controller.routeDrawnLegsOnWater).toHaveBeenCalled();
  });

  it('FE-TOUR-WAYPOINT-LIST-007: a city walk names its stops, shows their stay and edits one stop from its menu', async () => {
    const cathedral = {
      ...STOP,
      key: 'stop-cathedral',
      name: 'Cathedral',
      stayMinutes: 30,
      importance: 'must' as const,
    };
    const controller = planner({
      tourType: 'walk',
      waypoints: [START, SHAPE, cathedral, END],
      selectedWaypointId: 'b',
    });
    render(<TourWaypointList planner={controller} canEdit isSaving={false} />);
    const rows = screen.getAllByTestId('tour-planner-waypoint-row');
    expect(within(at(rows, 2)).getByTestId('tour-planner-waypoint-name')).toHaveTextContent('Cathedral');
    expect(within(at(rows, 2)).getByTestId('station-pills')).toHaveTextContent('Must see');
    expect(within(at(rows, 0)).getByTestId('station-pills')).toHaveTextContent('Stay unknown');
    expect(within(at(rows, 1)).queryByTestId('station-pills')).not.toBeInTheDocument();

    await userEvent.click(within(at(rows, 2)).getByRole('button', { name: 'More actions' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit stop' }));
    const stay = screen.getByLabelText('Stay in minutes');
    await userEvent.clear(stay);
    await userEvent.type(stay, '45');
    await userEvent.click(screen.getByTestId('station-save'));
    expect(screen.queryByTestId('station-dialog')).not.toBeInTheDocument();
    expect(controller.editWaypoints).toHaveBeenCalledTimes(1);
    const update = vi.mocked(controller.editWaypoints).mock.calls[0]?.[0] as (
      points: TourPlannerController['waypoints']
    ) => TourPlannerController['waypoints'];
    expect(update([START, SHAPE, cathedral, END])).toEqual([START, SHAPE, { ...cathedral, stayMinutes: 45 }, END]);
  });

  it('FE-TOUR-WAYPOINT-LIST-007b: a hike has no stop pills and no stop to edit', async () => {
    const controller = planner({ selectedWaypointId: 'b' });
    render(<TourWaypointList planner={controller} canEdit isSaving={false} />);
    expect(screen.queryByTestId('station-pills')).not.toBeInTheDocument();
    await userEvent.click(
      within(at(screen.getAllByTestId('tour-planner-waypoint-row'), 2)).getByRole('button', { name: 'More actions' })
    );
    expect(screen.queryByRole('button', { name: 'Edit stop' })).not.toBeInTheDocument();
  });

  it('FE-TOUR-WAYPOINT-LIST-008: the way back of a loop walk is no stop: no pills and no stop to edit', async () => {
    const back = { ...START, id: 'back', role: 'end' as const };
    const controller = planner({
      tourType: 'walk',
      isLoop: true,
      waypoints: [START, STOP, back],
      selectedWaypointId: 'back',
    });
    render(<TourWaypointList planner={controller} canEdit isSaving={false} />);
    const rows = screen.getAllByTestId('tour-planner-waypoint-row');
    expect(within(at(rows, 0)).getByTestId('station-pills')).toBeInTheDocument();
    expect(within(at(rows, 2)).queryByTestId('station-pills')).not.toBeInTheDocument();
    await userEvent.click(within(at(rows, 2)).getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('button', { name: 'Edit stop' })).not.toBeInTheDocument();
  });
});
