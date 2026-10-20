import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '../../../../tests/helpers/render';
import { SacGradesCard } from './SacGradesCard';
import type { SacGradeRow, SacGrades } from './useSacGrades';

const hook = vi.hoisted(() => ({ grades: null as unknown, input: null as unknown }));
vi.mock('./useSacGrades', () => ({
  useSacGrades: (input: unknown) => {
    hook.input = input;
    return hook.grades;
  },
}));

// FE-HIKE-SACCARD-001 to FE-HIKE-SACCARD-007

const LINE: [number, number][] = [
  [47.0, 11.0],
  [47.01, 11.0],
];
const ROWS: SacGradeRow[] = [
  { key: 't2', lengthM: 1200, share: 0.4, tags: ['mountain_hiking'] },
  { key: 't4', lengthM: 600, share: 0.2, tags: ['alpine_hiking'] },
  { key: 'unclear', lengthM: 300, share: 0.1, tags: ['T3', 'hiking;mountain_hiking'] },
  { key: 'untagged', lengthM: 700, share: 0.2, tags: [] },
  { key: 'unmatched', lengthM: 100, share: 0.05, tags: [] },
  { key: 'unasked', lengthM: 100, share: 0.05, tags: [] },
];

function grades(overrides: Partial<SacGrades> = {}): SacGrades {
  return {
    available: true,
    shown: true,
    toggle: vi.fn(),
    status: 'ready',
    rows: ROWS,
    knownShare: 0.6,
    highest: 4,
    focus: null,
    focusOn: vi.fn(),
    retry: vi.fn(),
    ...overrides,
  };
}

function show(state: SacGrades, routingLimit: number | null = 3) {
  hook.grades = state;
  return render(<SacGradesCard tripId={4} route={LINE} routingLimit={routingLimit} />);
}

beforeEach(() => localStorage.clear());

describe('SacGradesCard (MAP-03)', () => {
  it('FE-HIKE-SACCARD-001: without a line to grade there is no card', () => {
    show(grades({ available: false, shown: false, status: 'off', rows: [] }));
    expect(screen.queryByTestId('sac-grades-card')).toBeNull();
    expect(hook.input).toEqual({ tripId: 4, route: LINE, current: true });
  });

  it('FE-HIKE-SACCARD-002: switched off it only offers the switch, and the switch turns it on', () => {
    const state = grades({ shown: false, status: 'off', rows: [] });
    show(state);
    const toggle = screen.getByRole('button', { name: 'Show along the route' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('sac-row-t2')).toBeNull();
    fireEvent.click(toggle);
    expect(state.toggle).toHaveBeenCalledTimes(1);
  });

  it('FE-HIKE-SACCARD-003: lists the known steps with their share, the unknown apart, and the routing limit as a setting', () => {
    show(grades());
    expect(within(screen.getByTestId('sac-row-t2')).getByText('T2')).toBeInTheDocument();
    expect(screen.getByTestId('sac-row-t2')).toHaveTextContent('Mountain hiking');
    expect(screen.getByTestId('sac-row-t2')).toHaveTextContent('40 %');
    expect(within(screen.getByTestId('sac-row-untagged')).getByText('?')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
    expect(screen.getByTestId('sac-known')).toHaveTextContent('60 %');
    expect(screen.getByTestId('sac-highest')).toHaveTextContent('T4');
    expect(screen.getByTestId('sac-routing-limit')).toHaveTextContent('Routing limit');
    expect(screen.getByTestId('sac-routing-limit')).toHaveTextContent('T3');
    // Only a known step above the limit says so; the unknown never does.
    expect(within(screen.getByTestId('sac-row-t4')).getByText('Above the limit')).toBeInTheDocument();
    expect(within(screen.getByTestId('sac-row-t2')).queryByText('Above the limit')).toBeNull();
    expect(within(screen.getByTestId('sac-row-untagged')).queryByText('Above the limit')).toBeNull();
  });

  it('FE-HIKE-SACCARD-004: an import, planned without a routing limit, shows none and nothing above it', () => {
    show(grades({ highest: null, rows: ROWS.slice(2), knownShare: 0 }), null);
    expect(screen.queryByTestId('sac-routing-limit')).toBeNull();
    expect(screen.queryByTestId('sac-highest')).toBeNull();
    expect(screen.queryByText('Above the limit')).toBeNull();
    expect(screen.getByTestId('sac-known')).toHaveTextContent('0 %');
  });

  it('FE-HIKE-SACCARD-005: a row draws its class alone on the map, and shows that it does', () => {
    const state = grades({ focus: 't4' });
    show(state);
    expect(screen.getByTestId('sac-row-t4')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('sac-row-t2')).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByTestId('sac-row-t2'));
    expect(state.focusOn).toHaveBeenCalledWith('t2');
  });

  it('FE-HIKE-SACCARD-006: says when it is asking, offline, or failed with a way to ask again', () => {
    const loading = show(grades({ status: 'loading', rows: [] }));
    expect(screen.getByRole('status')).toHaveTextContent('Reading the SAC grades');
    loading.unmount();
    const offline = show(grades({ status: 'offline', rows: [] }));
    expect(screen.getByText('The SAC grades need a connection.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    offline.unmount();
    const state = grades({ status: 'failed', rows: [] });
    show(state);
    expect(screen.getByText(/The tour is unchanged/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(state.retry).toHaveBeenCalledTimes(1);
  });

  it('FE-HIKE-SACCARD-007: a row names its scale and its source, an unclear one what OpenStreetMap wrote', async () => {
    show(grades());
    fireEvent.mouseEnter(screen.getByTestId('sac-row-t2'));
    const source = 'SAC hiking scale T2, from OpenStreetMap: sac_scale=mountain_hiking';
    expect(await screen.findByText(source)).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByTestId('sac-row-t2'));
    fireEvent.mouseEnter(screen.getByTestId('sac-row-unclear'));
    expect(await screen.findByText(/T3, hiking;mountain_hiking/)).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByTestId('sac-row-unclear'));
    fireEvent.mouseEnter(screen.getByTestId('sac-row-untagged'));
    expect(await screen.findByText(/Unknown does not mean easy/)).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByTestId('sac-row-untagged'));
    fireEvent.mouseEnter(screen.getByTestId('sac-row-unmatched'));
    expect(await screen.findByText(/no way lies clearly under the line/i)).toBeInTheDocument();
    // A way that could not be asked about says so in its row; there is nothing more to name.
    expect(screen.getByTestId('sac-row-unasked')).toHaveTextContent('Could not be asked this time');
  });
});
