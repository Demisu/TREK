// FE-FERRATA-CARD-001 to FE-FERRATA-CARD-005: the card for one picked via ferrata.
import { describe, expect, it, vi } from 'vitest';

import type { Ferrata } from '@trek/shared';

import { fireEvent, render, screen } from '../../../tests/helpers/render';
import FerrataDetailCard from './FerrataDetailCard';

const FERRATA: Ferrata = {
  id: 'way/77',
  name: 'Via ferrata Pisciadù',
  grade: { raw: '5', level: 5, plus: '+' },
  routeName: 'Sella group',
  geometry: [
    [46.53, 11.81],
    [46.54, 11.82],
  ],
  osmUrl: 'https://www.openstreetmap.org/way/77',
};

describe('FerrataDetailCard', () => {
  it('FE-FERRATA-CARD-001: shows the name, the route, the grade badge and the attribution', () => {
    render(<FerrataDetailCard ferrata={FERRATA} />);

    expect(screen.getByRole('heading', { name: 'Via ferrata Pisciadù' })).toBeInTheDocument();
    expect(screen.getByText('Sella group')).toBeInTheDocument();
    expect(screen.getByText('K5+')).toHaveClass('text-danger');
    expect(screen.getByText('Data © OpenStreetMap contributors')).toBeInTheDocument();
  });

  it('FE-FERRATA-CARD-002: links to the way on openstreetmap.org in a new tab', () => {
    render(<FerrataDetailCard ferrata={FERRATA} />);
    const link = screen.getByRole('link', { name: /View in OpenStreetMap/ });

    expect(link).toHaveAttribute('href', 'https://www.openstreetmap.org/way/77');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('FE-FERRATA-CARD-003: an unnamed way takes its route name as title and does not repeat it', () => {
    render(<FerrataDetailCard ferrata={{ ...FERRATA, name: null }} />);

    expect(screen.getByRole('heading', { name: 'Sella group' })).toBeInTheDocument();
    expect(screen.getAllByText('Sella group')).toHaveLength(1);
  });

  it('FE-FERRATA-CARD-004: a letter scale keeps its raw grade, no grade at all reads unknown, both neutral', () => {
    const { rerender } = render(
      <FerrataDetailCard ferrata={{ ...FERRATA, grade: { raw: 'C/D', level: null, plus: null } }} />
    );
    expect(screen.getByText('C/D')).toHaveClass('text-content-secondary');

    rerender(
      <FerrataDetailCard
        ferrata={{ ...FERRATA, name: null, routeName: null, grade: { raw: null, level: null, plus: null } }}
      />
    );
    expect(screen.getByText('Grade unknown')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unnamed via ferrata' })).toBeInTheDocument();
  });

  it('FE-FERRATA-CARD-005: offers a close button only when it can be closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(<FerrataDetailCard ferrata={FERRATA} />);
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();

    rerender(<FerrataDetailCard ferrata={FERRATA} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
