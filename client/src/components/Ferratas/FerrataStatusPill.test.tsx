// FE-FERRATA-PILL-001 to FE-FERRATA-PILL-004: what the via ferrata layer says about itself.
import { describe, expect, it } from 'vitest';

import { render, screen } from '../../../tests/helpers/render';
import FerrataStatusPill from './FerrataStatusPill';

describe('FerrataStatusPill', () => {
  it('FE-FERRATA-PILL-001: says nothing while the layer is off', () => {
    const { container } = render(<FerrataStatusPill status="idle" count={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('FE-FERRATA-PILL-002: counts what it found, in the plural form the count takes', () => {
    const { rerender } = render(<FerrataStatusPill status="ready" count={12} />);
    expect(screen.getByRole('status')).toHaveTextContent('12 via ferrata routes');

    rerender(<FerrataStatusPill status="ready" count={1} />);
    expect(screen.getByRole('status')).toHaveTextContent('1 via ferrata route');
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Via ferratas: 1 via ferrata route');
  });

  it('FE-FERRATA-PILL-003: shows loading and the two reasons a request was not made', () => {
    const { rerender } = render(<FerrataStatusPill status="loading" count={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading via ferratas…');

    rerender(<FerrataStatusPill status="tooLarge" count={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('Zoom in to load via ferratas');
    expect(screen.getByRole('status')).toHaveClass('text-content-secondary');

    rerender(<FerrataStatusPill status="offline" count={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('Via ferratas need a connection');
  });

  it('FE-FERRATA-PILL-004: an unreachable Overpass reads as a problem', () => {
    render(<FerrataStatusPill status="error" count={0} />);
    expect(screen.getByRole('status')).toHaveTextContent('Overpass unreachable');
    expect(screen.getByRole('status')).toHaveClass('text-danger');
  });
});
