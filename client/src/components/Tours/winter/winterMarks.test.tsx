import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TourDayRowAvatar } from '../TourDayRowFacts';
import { TourGradeTile } from '../tourParts';
import { WinterActivityPill, WinterCornerMark } from './winterMarks';

// FE-TOUR-WINTER-MARK-001 to FE-TOUR-WINTER-MARK-005

const hike = { tour_type: 'hike' as const, max_hiking_difficulty: 2, wanderer_ref: null, has_waypoints: true };

describe('winter marks (HIK-01)', () => {
  it('FE-TOUR-WINTER-MARK-001: the corner mark names the label, and a hike without one shows none', () => {
    const { container, rerender } = render(<WinterCornerMark activity={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<WinterCornerMark activity="snowshoe" size={20} />);
    const mark = screen.getByRole('img', { name: 'tours.winter.activity.snowshoe' });
    expect(mark).toHaveAttribute('data-testid', 'tour-winter-mark');
    expect(mark).toHaveStyle({ width: '20px', height: '20px' });
  });

  it('FE-TOUR-WINTER-MARK-002: the pill names the label in the head look it is given', () => {
    render(<WinterActivityPill activity="winter_hike" className="head-pill" />);
    const pill = screen.getByTestId('tour-detail-winter');
    expect(pill).toHaveTextContent('tours.winter.activity.winter_hike');
    expect(pill).toHaveClass('head-pill');
  });

  it('FE-TOUR-WINTER-MARK-003: a tour list tile carries the mark beside its grade', () => {
    const { rerender } = render(<TourGradeTile tour={hike} />);
    expect(screen.queryByTestId('tour-winter-mark')).toBeNull();
    rerender(<TourGradeTile tour={{ ...hike, winter_activity: 'winter_hike' }} />);
    expect(screen.getByRole('img', { name: 'tours.winter.activity.winter_hike' })).toBeInTheDocument();
    expect(screen.getByText('T2')).toBeInTheDocument();
  });

  it('FE-TOUR-WINTER-MARK-004: the day plan tile stays as it was without a label, and carries the mark with one', () => {
    const { container, rerender } = render(<TourDayRowAvatar tour={hike} size={32} />);
    expect(container.firstElementChild).toHaveAttribute('data-testid', 'plan-tour-icon');
    rerender(<TourDayRowAvatar tour={{ ...hike, winter_activity: 'snowshoe' }} size={50} />);
    expect(screen.getByTestId('plan-tour-icon')).toHaveTextContent('T2');
    expect(screen.getByTestId('tour-winter-mark')).toHaveStyle({ width: '22px' });
  });

  it('FE-TOUR-WINTER-MARK-005: the corner mark goes by the same icon as the head pill of its label', () => {
    for (const activity of ['winter_hike', 'snowshoe'] as const) {
      const icon = activity === 'snowshoe' ? 'lucide-footprints' : 'lucide-snowflake';
      const mark = render(<WinterCornerMark activity={activity} />);
      expect(mark.container.querySelector(`svg.${icon}`)).not.toBeNull();
      mark.unmount();
      const pill = render(<WinterActivityPill activity={activity} className="head-pill" />);
      expect(pill.container.querySelector(`svg.${icon}`)).not.toBeNull();
      pill.unmount();
    }
  });
});
