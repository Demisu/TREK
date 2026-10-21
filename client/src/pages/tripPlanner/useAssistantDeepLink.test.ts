import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAssistantStore } from '../../store/assistantStore';
import type { Day } from '../../types';
import { useAssistantDeepLink } from './useAssistantDeepLink';

const day = (id: number, tripId = 5) => ({ id, trip_id: tripId }) as Day;

function setup(query: string, days: Day[]) {
  const searchParams = new URLSearchParams(query);
  const setSearchParams = vi.fn((update: (params: URLSearchParams) => URLSearchParams) => update(searchParams));
  const selectDay = vi.fn();
  const hook = renderHook(
    ({ list }) =>
      useAssistantDeepLink({
        searchParams,
        setSearchParams: setSearchParams as never,
        tripId: 5,
        days: list,
        selectDay,
      }),
    { initialProps: { list: days } }
  );
  return { searchParams, setSearchParams, selectDay, hook };
}

afterEach(() => {
  useAssistantStore.setState({ window: { open: false, minimized: false } });
});

describe('useAssistantDeepLink', () => {
  it('FE-PLANNER-ASSISTLINK-001: ?assistant=1 opens the assistant and leaves the URL', () => {
    const { searchParams, setSearchParams } = setup('tab=plan&assistant=1', []);
    expect(useAssistantStore.getState().window).toEqual({ open: true, minimized: false });
    expect(searchParams.has('assistant')).toBe(false);
    expect(searchParams.get('tab')).toBe('plan');
    expect(setSearchParams).toHaveBeenCalledWith(expect.any(Function), { replace: true });
  });

  it('FE-PLANNER-ASSISTLINK-002: ?day= selects a day of this trip', () => {
    const { searchParams, selectDay } = setup('day=8', [day(7), day(8)]);
    expect(selectDay).toHaveBeenCalledWith(8);
    expect(searchParams.has('day')).toBe(false);
  });

  it('FE-PLANNER-ASSISTLINK-003: waits for the days of this trip, then drops a day it does not hold', () => {
    const { searchParams, selectDay, hook } = setup('day=8', [day(8, 4)]);
    expect(searchParams.get('day')).toBe('8');
    hook.rerender({ list: [day(7)] });
    expect(selectDay).not.toHaveBeenCalled();
    expect(searchParams.has('day')).toBe(false);
  });

  it('FE-PLANNER-ASSISTLINK-004: does nothing without a link', () => {
    const { setSearchParams, selectDay } = setup('tab=plan&place=3', [day(7)]);
    expect(setSearchParams).not.toHaveBeenCalled();
    expect(selectDay).not.toHaveBeenCalled();
    expect(useAssistantStore.getState().window.open).toBe(false);
  });
});
