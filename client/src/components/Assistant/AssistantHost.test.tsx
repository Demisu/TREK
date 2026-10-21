/**
 * FE-AI-HOST-001 to FE-AI-HOST-005
 *
 * The desktop host follows the trip on screen and sends "Show on map" and a
 * picked day to the planner through its links.
 */
import type { AssistantApplied } from '@trek/shared';
import { useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { act, render, screen } from '../../../tests/helpers/render';
import { useTripStore } from '../../store/tripStore';
import type { Trip } from '../../types';
import AssistantHost from './AssistantHost';

interface WindowProps {
  trip: { id: number; title: string } | null;
  onShowOnMap?: (applied: AssistantApplied) => void;
  onFocusDay?: (dayId: number) => void;
}
const seen: { props: WindowProps | null } = { props: null };

vi.mock('./AssistantWindow', () => ({
  default: (props: WindowProps) => {
    seen.props = props;
    return null;
  },
}));

function Location() {
  const { pathname, search } = useLocation();
  return <output data-testid="location">{`${pathname}${search}`}</output>;
}

function renderAt(path: string) {
  return render(
    <>
      <AssistantHost />
      <Location />
    </>,
    { initialEntries: [path] }
  );
}

const applied = (entity: AssistantApplied['entity'], ids: number[], dayId: number | null): AssistantApplied => ({
  toolCallId: 'c1',
  entity,
  ids,
  dayId,
  undoUntil: null,
});

const INITIAL = useTripStore.getState();

afterEach(() => {
  useTripStore.setState(INITIAL, true);
  seen.props = null;
});

describe('AssistantHost', () => {
  it('FE-AI-HOST-001: outside a trip the window gets no trip and asks which one', () => {
    renderAt('/dashboard');
    expect(seen.props?.trip).toBeNull();
  });

  it('FE-AI-HOST-002: inside a trip it is about that trip, named once the planner has it', () => {
    renderAt('/trips/5/files');
    expect(seen.props?.trip).toEqual({ id: 5, title: '' });

    act(() => useTripStore.setState({ trip: { id: 5, title: 'Kyoto' } as Trip }));
    expect(seen.props?.trip).toEqual({ id: 5, title: 'Kyoto' });
  });

  it('FE-AI-HOST-003: "Show on map" opens the planner on the place, or on the day', () => {
    renderAt('/trips/5/files');
    act(() => seen.props?.onShowOnMap?.(applied('place', [7], 2)));
    expect(screen.getByTestId('location')).toHaveTextContent('/trips/5?place=7');

    act(() => seen.props?.onShowOnMap?.(applied('day_note', [9], 3)));
    expect(screen.getByTestId('location')).toHaveTextContent('/trips/5?day=3');
  });

  it('FE-AI-HOST-005: a day picked in the chat selects it in the planner', () => {
    renderAt('/trips/5');
    act(() => seen.props?.onFocusDay?.(12));
    expect(screen.getByTestId('location')).toHaveTextContent('/trips/5?day=12');
  });

  it('FE-AI-HOST-004: a route that only looks like a trip is none', () => {
    renderAt('/trips/new');
    expect(seen.props?.trip).toBeNull();
  });
});
