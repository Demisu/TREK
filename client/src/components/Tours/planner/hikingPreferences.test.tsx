import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { HikingPreferencesField } from './HikingPreferencesField';
import { hikingCostingOptions } from './tourRouting';

describe('hikingCostingOptions (MF-08)', () => {
  it('asks the router only for what was switched on, in the options it was checked with', () => {
    expect(hikingCostingOptions(null)).toEqual({});
    expect(hikingCostingOptions({ avoid_steps: false })).toEqual({});
    expect(
      hikingCostingOptions({ avoid_steps: true, avoid_ferries: true, prefer_paths: true, shortest: true })
    ).toEqual({ step_penalty: 600, use_ferry: 0, walkway_factor: 0.5, shortest: true });
  });
});

describe('HikingPreferencesField (MF-08)', () => {
  it('shows each checked preference with what it does, and switching one keeps the others', () => {
    const setHikingPreferences = vi.fn();
    render(
      <HikingPreferencesField
        planner={{ hikingPreferences: { prefer_paths: true }, setHikingPreferences }}
        locked={false}
      />
    );
    const steps = screen.getByRole('button', { name: 'tours.preferences.avoid_steps' });
    expect(steps).toHaveAttribute('aria-pressed', 'false');
    expect(steps).toHaveAccessibleDescription('tours.preferences.avoid_stepsHint');
    expect(screen.getByRole('button', { name: 'tours.preferences.prefer_paths' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.click(steps);
    expect(setHikingPreferences).toHaveBeenCalledWith({ prefer_paths: true, avoid_steps: true });
    fireEvent.click(screen.getByRole('button', { name: 'tours.preferences.prefer_paths' }));
    expect(setHikingPreferences).toHaveBeenLastCalledWith({ prefer_paths: false });
  });

  it('changes nothing while the tour is locked', () => {
    const setHikingPreferences = vi.fn();
    render(<HikingPreferencesField planner={{ hikingPreferences: null, setHikingPreferences }} locked />);
    fireEvent.click(screen.getByRole('button', { name: 'tours.preferences.shortest' }));
    expect(setHikingPreferences).not.toHaveBeenCalled();
  });
});
