import type { TourListItem } from '@trek/shared';
import { Activity } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '../../../../tests/helpers/render';
import TourDayRowFacts, { TourDayRowPills } from '../TourDayRowFacts';
import { tourDayRowIcon } from '../tourDayRowIcon';
import { movingTimeLabel } from '../tourFacts';
import { tourMapLayersFor } from '../tourMapLayers';
import { TourGradeTile } from '../tourParts';
import { RunHeadPills } from './RunHeadPills';
import { runPaceText } from './runPaceText';

// FE-TOUR-RUN-MARK-001 to FE-TOUR-RUN-MARK-006

const run: TourListItem = {
  place_id: 7,
  name: 'River loop',
  tour_type: 'run',
  run_profile: 'running',
  run_pace_seconds_per_km: 360,
  distance: 8,
  elevation_gain: 40,
  elevation_loss: 40,
  duration: 48,
  break_additional_minutes: null,
  planned_duration_minutes: null,
  difficulty: null,
  wanderer_ref: null,
  match_confidence: 1,
  max_hiking_difficulty: null,
  planned: true,
  caution: false,
  has_waypoints: true,
};

describe('a run wherever a tour shows (RUN-01)', () => {
  it('FE-TOUR-RUN-MARK-001: says a run pace as min:s per km, and nothing for a run without one or another type', () => {
    expect(runPaceText(run)).toBe('6:00 min/km');
    expect(runPaceText({ ...run, run_pace_seconds_per_km: null })).toBeNull();
    expect(runPaceText({ ...run, run_pace_seconds_per_km: 5 })).toBeNull();
    expect(runPaceText({ ...run, tour_type: 'hike' })).toBeNull();
  });

  it('FE-TOUR-RUN-MARK-002: the time is named as planned, and the run goes by its own icon and maps', () => {
    expect(movingTimeLabel(run, 'walking', (key) => key)).toBe('tours.run.timeEstimated');
    expect(tourDayRowIcon('run')).toBe(Activity);
    expect(tourMapLayersFor('run')).toEqual({
      bases: ['default', 'topo', 'satellite'],
      defaultBase: 'default',
      overlays: [],
    });
  });

  it('FE-TOUR-RUN-MARK-003: the day plan shows the planned running time and the pace it is planned at', () => {
    render(<TourDayRowFacts tour={run} />);
    expect(screen.getByTestId('trip-plan-tour-walking-time')).toHaveAccessibleName('Running time (planned): 48 min');
    expect(screen.getByTestId('plan-tour-run-pace')).toHaveAccessibleName('Planned pace: 6:00 min/km');
    expect(screen.getByTestId('plan-tour-ascent')).toHaveTextContent('40');
  });

  it('FE-TOUR-RUN-MARK-004: an imported run without a pace shows no time and no pace, rather than made-up ones', () => {
    render(<TourDayRowFacts tour={{ ...run, run_pace_seconds_per_km: null, duration: null, has_waypoints: false }} />);
    expect(screen.queryByTestId('trip-plan-tour-walking-time')).toBeNull();
    expect(screen.queryByTestId('plan-tour-run-pace')).toBeNull();
    expect(screen.getByTestId('plan-tour-distance')).toBeInTheDocument();
  });

  it('FE-TOUR-RUN-MARK-005: the tour list names the pace in the time tooltip, and the tile the type', () => {
    render(<TourDayRowPills tour={run} compact />);
    expect(screen.getByTestId('trip-plan-tour-time')).toHaveAccessibleName(
      'Running time (planned): 48 min, Planned pace: 6:00 min/km, Planned total duration: 48 min'
    );
    render(<TourGradeTile tour={run} />);
    expect(screen.getByLabelText('Run')).toBeInTheDocument();
  });

  it('FE-TOUR-RUN-MARK-006: the head names the profile and the pace, a run without a pace only its profile', () => {
    const { rerender } = render(<RunHeadPills tour={run} className="head-pill" />);
    expect(screen.getByTestId('tour-detail-run-profile')).toHaveTextContent('Running');
    const pace = screen.getByTestId('tour-detail-run-pace');
    expect(pace).toHaveTextContent('6:00 min/km');
    expect(pace).toHaveClass('head-pill');
    rerender(<RunHeadPills tour={{ ...run, run_pace_seconds_per_km: null }} className="head-pill" />);
    expect(screen.queryByTestId('tour-detail-run-pace')).toBeNull();
    rerender(<RunHeadPills tour={{ ...run, tour_type: 'hike', run_profile: null }} className="head-pill" />);
    expect(screen.queryByTestId('tour-detail-run-profile')).toBeNull();
  });
});
