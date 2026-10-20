import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NO_SKI_CHOICE } from './skiChoice';
import { useSkiFields } from './useSkiFields';

// FE-TOUR-SKI-FIELDS-001 to FE-TOUR-SKI-FIELDS-002

describe('useSkiFields (SKI-02)', () => {
  it('FE-TOUR-SKI-FIELDS-001: a change is an edit only when it says something else and the planner allows it', () => {
    const onEdit = vi.fn(() => true);
    const { result } = renderHook(() => useSkiFields(NO_SKI_CHOICE, onEdit));
    act(() => result.current.change({ discipline: null, technique: null }));
    expect(onEdit).not.toHaveBeenCalled();
    act(() => result.current.change({ discipline: 'snowshoe', technique: null }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(result.current.choice).toEqual({ discipline: 'snowshoe', technique: null });

    onEdit.mockReturnValue(false);
    act(() => result.current.change({ discipline: 'alpine', technique: null }));
    expect(result.current.choice).toEqual({ discipline: 'snowshoe', technique: null });
  });

  it('FE-TOUR-SKI-FIELDS-002: a choice loaded from a tour or a draft is no edit', () => {
    const onEdit = vi.fn(() => true);
    const { result } = renderHook(() => useSkiFields(NO_SKI_CHOICE, onEdit));
    act(() => result.current.load({ discipline: 'cross_country', technique: 'classic' }));
    expect(result.current.choice).toEqual({ discipline: 'cross_country', technique: 'classic' });
    expect(onEdit).not.toHaveBeenCalled();
  });
});
