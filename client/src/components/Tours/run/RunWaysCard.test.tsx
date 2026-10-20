import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '../../../../tests/helpers/render';
import { useTourRouteHighlightStore } from '../../../store/tourRouteHighlightStore';
import type { RouteWays } from '../bike/routeWays';
import type { RouteWaysState } from '../bike/useRouteWays';
import { hardestSac, RunWaysCard } from './RunWaysCard';

const hook = vi.hoisted(() => ({ state: null as unknown, retry: vi.fn(), input: null as unknown }));
vi.mock('../bike/useRouteWays', () => ({
  useRouteWays: (input: unknown) => {
    hook.input = input;
    return { ...(hook.state as object), retry: hook.retry };
  },
}));

// FE-TOUR-RUNWAYS-001 to FE-TOUR-RUNWAYS-007

type Planner = Parameters<typeof RunWaysCard>[0]['planner'];

const LINE: [number, number][] = [
  [47.0, 11.0],
  [47.001, 11.0],
  [47.002, 11.0],
  [47.003, 11.0],
];
const WAYS: RouteWays = {
  line: LINE,
  edges: [
    { from: 0, to: 1, lengthM: 600, surface: 'paved', way: 'road', sac: 'none', wayId: 1 },
    { from: 1, to: 2, lengthM: 300, surface: 'gravel', way: 'track', sac: 't1', wayId: 2 },
    { from: 2, to: 3, lengthM: 100, surface: 'ground', way: 'path', sac: 't2', wayId: 3 },
  ],
};

function planner(overrides: Partial<Planner> = {}): Planner {
  return {
    tripId: 4,
    mode: { type: 'new-draft' },
    isRun: true,
    route: LINE,
    routeCurrent: true,
    ...overrides,
  } as Planner;
}

function show(state: Partial<RouteWaysState>, overrides: Partial<Planner> = {}) {
  hook.state = { status: 'ready', ways: WAYS, grades: null, ...state };
  return render(<RunWaysCard planner={planner(overrides)} />);
}

beforeEach(() => {
  localStorage.clear();
  useTourRouteHighlightStore.getState().clear();
});
afterEach(() => vi.clearAllMocks());

describe('RunWaysCard (RUN-02)', () => {
  it('FE-TOUR-RUNWAYS-001: shows the surfaces, the hiking grades and the kinds of way, the ungraded named as unknown', () => {
    show({});
    expect(within(screen.getByTestId('route-ways-row-surface-paved')).getByText('60 %')).toBeInTheDocument();
    expect(screen.getByTestId('route-ways-row-surface-gravel')).toHaveTextContent('300 m');
    expect(screen.getByTestId('route-ways-row-grade-t1')).toHaveTextContent('T1, hiking');
    expect(screen.getByTestId('route-ways-row-grade-t2')).toHaveTextContent('10 %');
    expect(screen.getByTestId('route-ways-row-grade-none')).toHaveTextContent('No grade in the data');
    expect(screen.getByTestId('route-ways-row-way-track')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'About the path difficulty' })).toHaveAccessibleDescription(
      /unknown, not easy/
    );
  });

  it('FE-TOUR-RUNWAYS-002: the head says how much is unpaved and the hardest graded path, in words for assistive tech', () => {
    show({});
    expect(screen.getByText('40 % unpaved')).toBeInTheDocument();
    const hardest = screen.getByTestId('run-ways-hardest');
    expect(hardest).toHaveTextContent('T2');
    expect(hardest).toHaveTextContent('Hardest graded path: T2, mountain hiking');
    expect(hardest.textContent).not.toMatch(/[\u2013\u2014]/);
  });

  it('FE-TOUR-RUNWAYS-003: a grade row points at its stretches on the map in the grade colour, and lets go', () => {
    show({});
    const row = screen.getByTestId('route-ways-row-grade-t2');
    fireEvent.click(row);
    expect(useTourRouteHighlightStore.getState().highlight).toEqual({
      id: 'grade-t2',
      lines: [LINE.slice(2, 4)],
      paint: 's1',
    });
    fireEvent.click(row);
    expect(useTourRouteHighlightStore.getState().highlight).toBeNull();
  });

  it('FE-TOUR-RUNWAYS-004: a route all paved and ungraded shows no head badges, and its grades as unknown', () => {
    const paved: RouteWays = { line: LINE, edges: [WAYS.edges[0]] };
    show({ ways: paved });
    expect(screen.queryByText(/unpaved/)).toBeNull();
    expect(screen.queryByTestId('run-ways-hardest')).toBeNull();
    expect(screen.getByTestId('route-ways-row-grade-none')).toHaveTextContent('100 %');
  });

  it('FE-TOUR-RUNWAYS-005: says when it is still asking, offline, or failed with a way to ask again', () => {
    const loading = show({ status: 'loading', ways: null });
    expect(screen.getByTestId('run-ways-card')).toHaveTextContent(/./);
    loading.unmount();
    const offline = show({ status: 'offline', ways: null });
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    offline.unmount();
    show({ status: 'failed', ways: null });
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(hook.retry).toHaveBeenCalledTimes(1);
  });

  it('FE-TOUR-RUNWAYS-006: matched on foot without trail grades, and only for a run being edited with its route as planned now', () => {
    const run = show({});
    expect(hook.input).toMatchObject({
      tripId: 4,
      active: true,
      route: LINE,
      matching: 'run',
      withGrades: false,
    });
    run.unmount();
    const idle = show({ status: 'idle', ways: null });
    expect(screen.queryByTestId('run-ways-card')).toBeNull();
    idle.unmount();
    const bike = show({}, { isRun: false });
    expect(screen.queryByTestId('run-ways-card')).toBeNull();
    bike.unmount();
    show({}, { routeCurrent: false, mode: { type: 'view-gpx' } as Planner['mode'] });
    expect(screen.queryByTestId('run-ways-card')).toBeNull();
    expect(hook.input).toMatchObject({ active: false, route: null });
  });

  it('FE-TOUR-RUNWAYS-007: the hardest graded step along the route, a stretch of no length left out', () => {
    expect(hardestSac(WAYS)).toBe('t2');
    expect(hardestSac({ line: LINE, edges: [{ ...WAYS.edges[2], sac: 't5', lengthM: 0 }, WAYS.edges[1]] })).toBe('t1');
    expect(hardestSac({ line: LINE, edges: [WAYS.edges[0]] })).toBeNull();
  });
});
