import { fireEvent, render, screen } from '@testing-library/react';
import { useState, type ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { RunFields, RunProfileField } from './RunFields';
import { runPaceInvalid } from './runPace';

// FE-TOUR-RUN-FIELDS-001 to FE-TOUR-RUN-FIELDS-006

type Planner = ComponentProps<typeof RunFields>['planner'];

const analysis = { distanceKm: 8 } as Planner['routeAnalysis'];

/** The fields over a planner that keeps the pace it is given and times it as the real one does. */
function Stateful({
  initial = null,
  distance = analysis,
}: {
  initial?: number | null;
  distance?: Planner['routeAnalysis'];
}) {
  const [pace, setPace] = useState<number | null>(initial);
  const invalid = runPaceInvalid(pace);
  const planner: Planner = {
    runProfile: 'running',
    setRunProfile: vi.fn(),
    runPace: { paceSecondsPerKm: pace, setPace, load: setPace },
    runPaceMissing: pace === null,
    runPaceInvalid: invalid,
    routeAnalysis: distance,
    walkingDurationMinutes:
      pace === null || invalid || !distance ? null : Math.round((distance.distanceKm * pace) / 60),
  };
  return (
    <>
      <RunFields planner={planner} locked={false} />
      <output data-testid="pace">{pace === null ? 'none' : String(pace)}</output>
    </>
  );
}

const paceField = () => screen.getByRole('textbox');

describe('RunFields (RUN-01)', () => {
  it('FE-TOUR-RUN-FIELDS-001: offers the profile on purpose, with what it asks the router for', () => {
    const onChange = vi.fn();
    render(<RunProfileField value="running" onChange={onChange} />);
    const running = screen.getByRole('button', { name: 'tours.run.profile.running' });
    expect(running).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('tours.run.profileHint.running')).toBeInTheDocument();
    fireEvent.click(running);
    expect(onChange).toHaveBeenCalledWith('running');
  });

  it('FE-TOUR-RUN-FIELDS-002: asks for a pace without offering one, and says a run is saved with one', () => {
    render(<Stateful />);
    expect(paceField()).toHaveValue('');
    expect(paceField()).toHaveAttribute('placeholder', '0:00');
    expect(screen.getByText('min/km')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('tours.run.paceNeeded');
    expect(screen.queryByTestId('tour-run-time-sum')).toBeNull();
    expect(screen.getByRole('button', { name: 'tours.run.paceInfoLabel' })).toHaveAccessibleDescription(
      'tours.run.paceInfo'
    );
  });

  it('FE-TOUR-RUN-FIELDS-003: a pace typed shows the sum the time is: 8 km at 6:00 min/km is 48 minutes', () => {
    render(<Stateful />);
    fireEvent.focus(paceField());
    fireEvent.change(paceField(), { target: { value: '6:00' } });
    expect(screen.getByTestId('pace')).toHaveTextContent('360');
    const sum = screen.getByTestId('tour-run-time-sum');
    expect(sum).toHaveTextContent('8 km');
    expect(sum).toHaveTextContent('6:00 /km');
    expect(sum).toHaveTextContent('48 min');
    expect(sum).toHaveAttribute('aria-label', 'tours.run.timeSum');
    expect(screen.queryByRole('status')).toBeNull();
    fireEvent.blur(paceField());
    expect(paceField()).toHaveValue('6:00');
  });

  it('FE-TOUR-RUN-FIELDS-004: text that is no pace is kept and marked on leaving the field, and the sum goes', () => {
    render(<Stateful initial={360} />);
    fireEvent.focus(paceField());
    fireEvent.change(paceField(), { target: { value: '6:75' } });
    // While typing, the last readable pace stands.
    expect(screen.getByTestId('pace')).toHaveTextContent('360');
    fireEvent.blur(paceField());
    expect(screen.getByTestId('pace')).toHaveTextContent('NaN');
    expect(paceField()).toHaveValue('6:75');
    expect(paceField()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('tours.run.paceInvalid');
    expect(screen.queryByTestId('tour-run-time-sum')).toBeNull();
    // Back in the field, the text is there to fix, and a pace fixes it.
    fireEvent.focus(paceField());
    expect(paceField()).toHaveValue('6:75');
    fireEvent.change(paceField(), { target: { value: '6:15' } });
    fireEvent.blur(paceField());
    expect(screen.getByTestId('pace')).toHaveTextContent('375');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('FE-TOUR-RUN-FIELDS-005: a pace out of bounds is marked, and clearing the field leaves no pace', () => {
    render(<Stateful />);
    fireEvent.focus(paceField());
    fireEvent.change(paceField(), { target: { value: '1:30' } });
    expect(screen.getByRole('alert')).toHaveTextContent('tours.run.paceInvalid');
    fireEvent.change(paceField(), { target: { value: '' } });
    fireEvent.keyDown(paceField(), { key: 'Enter' });
    expect(screen.getByTestId('pace')).toHaveTextContent('none');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('FE-TOUR-RUN-FIELDS-006: no sum before the route is in, whatever the pace', () => {
    render(<Stateful initial={300} distance={null} />);
    expect(paceField()).toHaveValue('5:00');
    expect(screen.queryByTestId('tour-run-time-sum')).toBeNull();
  });
});
