import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTileHealth, useTourRasterOverlay } from './useTourRasterOverlay';

const SEAMARKS = { id: 'seamarks', url: 'https://x/{z}/{x}/{y}.png', attribution: 'x', minZoom: 6, maxZoom: 18 };

describe('useTileHealth', () => {
  it('counts a source down after a run of failures, never after a stray one, and up again on one tile', () => {
    const { result } = renderHook(() => useTileHealth());
    act(() => result.current.onTileError());
    expect(result.current.down).toBe(false);
    act(() => {
      result.current.onTileError();
      result.current.onTileError();
      result.current.onTileError();
    });
    expect(result.current.down).toBe(true);
    act(() => result.current.onTileLoad());
    expect(result.current.down).toBe(false);
  });

  it('starts afresh on reset', () => {
    const { result } = renderHook(() => useTileHealth());
    act(() => {
      for (let i = 0; i < 4; i++) result.current.onTileError();
    });
    act(() => result.current.reset());
    expect(result.current.down).toBe(false);
    act(() => result.current.onTileError());
    expect(result.current.down).toBe(false);
  });
});

describe('useTourRasterOverlay', () => {
  it('is off unless offered and on, and down after a run of failures until switched again', () => {
    const toggle = vi.fn();
    const { result, rerender } = renderHook(
      ({ offered, active }) => useTourRasterOverlay(SEAMARKS, offered, active, toggle),
      {
        initialProps: { offered: false, active: true },
      }
    );
    expect(result.current.status).toBe('off');
    rerender({ offered: true, active: true });
    expect(result.current.status).toBe('on');
    act(() => {
      for (let i = 0; i < 4; i++) result.current.onTileError();
    });
    expect(result.current.status).toBe('down');
    act(() => result.current.onToggle());
    expect(toggle).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('on');
  });
});
