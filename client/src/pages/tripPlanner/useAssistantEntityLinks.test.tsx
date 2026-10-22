/**
 * FE-PLANNER-ENTITYLINK-001 to FE-PLANNER-ENTITYLINK-002
 *
 * The links the chat opens the planner with while it is on screen: another
 * tab of the trip switches there and leaves the URL, and the parts' own links
 * (tours, bookings, road trip) take nothing yet.
 */
import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { useAssistantEntityLinks } from './useAssistantEntityLinks';

type Options = Parameters<typeof useAssistantEntityLinks>[0];

function setup(path: string) {
  const planner = { activeTab: 'plan', handleTabChange: vi.fn() } as unknown as Options['planner'];
  const workspace = {} as Options['workspace'];
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  );
  const hook = renderHook(
    () => {
      useAssistantEntityLinks({ planner, workspace });
      return useLocation();
    },
    { wrapper }
  );
  return { planner, hook };
}

describe('useAssistantEntityLinks', () => {
  it('FE-PLANNER-ENTITYLINK-001: another tab switches there and leaves the URL, what it reads stays', () => {
    const { planner, hook } = setup('/trips/5?tab=finanzplan&expense=7');
    expect(planner.handleTabChange).toHaveBeenCalledWith('finanzplan');
    expect(hook.result.current.search).toBe('?expense=7');
  });

  it("FE-PLANNER-ENTITYLINK-002: the parts' own links take nothing yet, and nothing switches without a tab", () => {
    const { planner, hook } = setup('/trips/5?tour=12');
    expect(planner.handleTabChange).not.toHaveBeenCalled();
    expect(hook.result.current.search).toBe('?tour=12');
  });
});
