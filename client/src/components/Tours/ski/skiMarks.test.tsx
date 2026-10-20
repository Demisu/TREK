import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TourDayRowAvatar } from '../TourDayRowFacts';
import { TourGradeTile } from '../tourParts';
import { SkiCornerMark, SkiHeadPill, skiClassificationText, skiDisciplineOf, skiTechniqueOf } from './skiMarks';

// FE-TOUR-SKI-MARK-001 to FE-TOUR-SKI-MARK-005

const t = (key: string) => key;
const skiTrack = {
  tour_type: 'ski' as const,
  max_hiking_difficulty: null,
  wanderer_ref: null,
  has_waypoints: false,
  ski_discipline: 'cross_country' as const,
  ski_technique: 'skating' as const,
};

describe('ski marks (SKI-02)', () => {
  it('FE-TOUR-SKI-MARK-001: reads the discipline of a ski track only, and the technique of cross-country only', () => {
    expect(skiDisciplineOf(skiTrack)).toBe('cross_country');
    expect(skiTechniqueOf(skiTrack)).toBe('skating');
    expect(skiTechniqueOf({ ...skiTrack, ski_discipline: 'alpine' })).toBeNull();
    expect(skiDisciplineOf({ tour_type: 'hike', ski_discipline: 'alpine' })).toBeNull();
    expect(skiDisciplineOf({ tour_type: 'ski' })).toBeNull();
    expect(skiClassificationText(skiTrack, t)).toBe(
      'tours.ski.discipline.cross_country, tours.ski.technique: tours.ski.technique.skating'
    );
    expect(skiClassificationText({ tour_type: 'ski', ski_discipline: 'touring' }, t)).toBe(
      'tours.ski.discipline.touring'
    );
    expect(skiClassificationText({ tour_type: 'run' }, t)).toBeNull();
  });

  it('FE-TOUR-SKI-MARK-002: the corner mark names the classification, and any other tour shows none', () => {
    const { container, rerender } = render(<SkiCornerMark tour={{ tour_type: 'hike' }} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SkiCornerMark tour={{ tour_type: 'ski', ski_discipline: 'snowboard' }} size={20} />);
    const mark = screen.getByRole('img', { name: 'tours.ski.discipline.snowboard' });
    expect(mark).toHaveAttribute('data-testid', 'tour-ski-mark');
    expect(mark).toHaveStyle({ width: '20px', height: '20px' });
  });

  it('FE-TOUR-SKI-MARK-003: the head pill names the discipline with a cross-country technique inside it', () => {
    const { container, rerender } = render(<SkiHeadPill tour={{ tour_type: 'bike' }} className="head-pill" />);
    expect(container).toBeEmptyDOMElement();
    rerender(<SkiHeadPill tour={skiTrack} className="head-pill" />);
    const pill = screen.getByTestId('tour-detail-ski');
    expect(pill).toHaveClass('head-pill');
    expect(pill).toHaveTextContent('tours.ski.discipline.cross_country');
    expect(screen.getByTestId('tour-detail-ski-technique')).toHaveTextContent('tours.ski.technique.skating');
    rerender(<SkiHeadPill tour={{ ...skiTrack, ski_discipline: 'alpine' }} className="head-pill" />);
    expect(screen.queryByTestId('tour-detail-ski-technique')).toBeNull();
  });

  it('FE-TOUR-SKI-MARK-004: a tour list tile shows the ski icon with the discipline at its corner', () => {
    render(<TourGradeTile tour={skiTrack} />);
    expect(screen.getByLabelText('tourTypes.ski')).toBeInTheDocument();
    expect(screen.getByTestId('tour-ski-mark')).toBeInTheDocument();
  });

  it('FE-TOUR-SKI-MARK-005: the day plan tile names the type and carries the mark, a ski track without one stays plain', () => {
    const { container, rerender } = render(
      <TourDayRowAvatar tour={{ ...skiTrack, ski_discipline: null, ski_technique: null }} size={32} />
    );
    expect(container.firstElementChild).toHaveAttribute('data-testid', 'plan-tour-icon');
    expect(screen.getByRole('img', { name: 'tourTypes.ski' })).toBeInTheDocument();
    rerender(<TourDayRowAvatar tour={skiTrack} size={50} />);
    expect(screen.getByTestId('tour-ski-mark')).toHaveStyle({ width: '22px' });
  });
});
