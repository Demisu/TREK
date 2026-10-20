import { fireEvent, render, screen } from '@testing-library/react';
import type { WinterActivity } from '@trek/shared';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { WinterActivityField } from './WinterActivityField';

// FE-TOUR-WINTER-FIELD-001 to FE-TOUR-WINTER-FIELD-004

const toggle = () => screen.getByRole('button', { name: 'tours.winter.title' });
const option = (activity: WinterActivity) => screen.getByRole('button', { name: `tours.winter.activity.${activity}` });

/** The field over a planner that keeps what it is given, as the real one does. */
function Stateful({ initial = null }: { initial?: WinterActivity | null }) {
  const [winterActivity, setWinterActivity] = useState<WinterActivity | null>(initial);
  return (
    <>
      <WinterActivityField planner={{ winterActivity, setWinterActivity }} locked={false} />
      <output data-testid="saved">{winterActivity ?? 'none'}</output>
    </>
  );
}

describe('WinterActivityField (HIK-01)', () => {
  it('FE-TOUR-WINTER-FIELD-001: is off by default, its choice dimmed and out of reach until it is switched on', () => {
    const setWinterActivity = vi.fn();
    render(<WinterActivityField planner={{ winterActivity: null, setWinterActivity }} locked={false} />);
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByTestId('tour-winter-kind')).toHaveClass('opacity-50');
    expect(option('winter_hike')).toBeDisabled();
    expect(option('snowshoe')).toBeDisabled();
    fireEvent.click(option('snowshoe'));
    expect(setWinterActivity).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'tours.winter.infoLabel' })).toHaveAccessibleDescription(
      'tours.winter.info'
    );
    fireEvent.click(toggle());
    expect(setWinterActivity).toHaveBeenCalledWith('winter_hike');
  });

  it('FE-TOUR-WINTER-FIELD-002: switched on, it names the label chosen and takes the other one', () => {
    const setWinterActivity = vi.fn();
    render(<WinterActivityField planner={{ winterActivity: 'snowshoe', setWinterActivity }} locked={false} />);
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(option('snowshoe')).toHaveAttribute('aria-pressed', 'true');
    expect(option('winter_hike')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('group', { name: 'tours.winter.kind' })).toBeInTheDocument();
    fireEvent.click(option('winter_hike'));
    expect(setWinterActivity).toHaveBeenLastCalledWith('winter_hike');
    fireEvent.click(toggle());
    expect(setWinterActivity).toHaveBeenLastCalledWith(null);
  });

  it('FE-TOUR-WINTER-FIELD-003: switched off and on again, it comes back with the label it had', () => {
    render(<Stateful initial="snowshoe" />);
    fireEvent.click(toggle());
    expect(screen.getByTestId('saved')).toHaveTextContent('none');
    expect(option('snowshoe')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle());
    expect(screen.getByTestId('saved')).toHaveTextContent('snowshoe');
  });

  it('FE-TOUR-WINTER-FIELD-004: changes nothing while the tour is locked', () => {
    const setWinterActivity = vi.fn();
    render(<WinterActivityField planner={{ winterActivity: 'winter_hike', setWinterActivity }} locked />);
    fireEvent.click(toggle());
    fireEvent.click(option('snowshoe'));
    expect(setWinterActivity).not.toHaveBeenCalled();
    expect(option('snowshoe')).toBeDisabled();
  });
});
