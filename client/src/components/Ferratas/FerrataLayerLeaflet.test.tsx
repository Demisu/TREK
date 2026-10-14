/**
 * FE-FERRATA-LEAFLET-001 to FE-FERRATA-LEAFLET-007: the via ferrata layer on
 * the Leaflet renderer.
 *
 * Leaflet itself is not under test: the mock reflects each polyline's props
 * back as data attributes, so the assertions read which lines are drawn, in
 * which order and with what options. Casing and line stay non-interactive so
 * they cannot swallow clicks meant for places; only the invisible hit line on
 * top carries the tooltip and the click.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { Ferrata } from '@trek/shared';

import FerrataLayerLeaflet from './FerrataLayerLeaflet';

vi.mock('../../i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

vi.mock('react-leaflet', () => ({
  Polyline: ({
    positions,
    pathOptions,
    interactive,
    bubblingMouseEvents,
    eventHandlers,
    children,
  }: {
    positions: unknown;
    pathOptions: { color: string; weight: number; opacity: number; dashArray?: string };
    interactive?: boolean;
    bubblingMouseEvents?: boolean;
    eventHandlers?: { click?: (event: { latlng: { lat: number; lng: number } }) => void };
    children?: ReactNode;
  }) => (
    <div
      data-testid="polyline"
      data-positions={JSON.stringify(positions)}
      data-color={pathOptions.color}
      data-weight={pathOptions.weight}
      data-opacity={pathOptions.opacity}
      data-dash={pathOptions.dashArray ?? ''}
      data-interactive={interactive === false ? 'false' : 'true'}
      data-bubbles={bubblingMouseEvents === false ? 'false' : 'true'}
      onClick={() => eventHandlers?.click?.({ latlng: { lat: 46.505, lng: 11.705 } })}
    >
      {children}
    </div>
  ),
  Tooltip: ({ children }: { children: ReactNode }) => <span data-testid="tooltip">{children}</span>,
}));

const ferrata = (id: string, name: string | null, level: number | null, routeName: string | null = null): Ferrata => ({
  id,
  name,
  grade: { raw: level === null ? null : String(level), level, plus: level === 4 ? '+' : null },
  routeName,
  geometry: [
    [46.5, 11.7],
    [46.51, 11.71],
  ],
  osmUrl: `https://www.openstreetmap.org/${id}`,
});

describe('FerrataLayerLeaflet', () => {
  it('FE-FERRATA-LEAFLET-001: draws nothing for no ferratas', () => {
    const { container } = render(<FerrataLayerLeaflet ferratas={[]} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('FE-FERRATA-LEAFLET-002: casing, dashed line, then the invisible hit line, in [lat, lng]', () => {
    render(<FerrataLayerLeaflet ferratas={[ferrata('way/1', 'Pisciadù', 3)]} onSelect={vi.fn()} />);
    const lines = screen.getAllByTestId('polyline');

    expect(lines.map((line) => line.dataset.weight)).toEqual(['6', '3', '16']);
    expect(lines.map((line) => line.dataset.interactive)).toEqual(['false', 'false', 'true']);
    expect(lines[1]?.dataset.dash).toBe('6 5');
    expect(lines[2]?.dataset.opacity).toBe('0');
    expect(JSON.parse(lines[0]?.dataset.positions ?? '[]')).toEqual([
      [46.5, 11.7],
      [46.51, 11.71],
    ]);
  });

  it('FE-FERRATA-LEAFLET-003: the tooltip names the ferrata and its grade, or falls back to the route and unnamed', () => {
    render(
      <FerrataLayerLeaflet
        ferratas={[
          ferrata('way/1', 'Pisciadù', 4),
          ferrata('way/2', null, null, 'Sentiero attrezzato'),
          ferrata('way/3', null, null),
        ]}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getAllByTestId('tooltip').map((tip) => tip.textContent)).toEqual([
      'PisciadùK4+',
      'Sentiero attrezzato',
      'ferratas.unnamed',
    ]);
  });

  it('FE-FERRATA-LEAFLET-004: a click on the hit line hands the ferrata and the point to onSelect', () => {
    const onSelect = vi.fn();
    const target = ferrata('way/9', 'Tridentina', 2);
    render(<FerrataLayerLeaflet ferratas={[target]} onSelect={onSelect} />);

    const [, , hit] = screen.getAllByTestId('polyline');
    if (!hit) throw new Error('no hit line');
    fireEvent.click(hit);
    expect(onSelect).toHaveBeenCalledWith(target, { lng: 11.705, lat: 46.505 });
  });

  it('FE-FERRATA-LEAFLET-006: the hit line keeps its click from reaching the map, so no control point lands under it', () => {
    render(<FerrataLayerLeaflet ferratas={[ferrata('way/1', 'Pisciadù', 3)]} onSelect={vi.fn()} />);
    const [, , hit] = screen.getAllByTestId('polyline');
    expect(hit?.dataset.bubbles).toBe('false');
  });

  it('FE-FERRATA-LEAFLET-007: the grade sits beside the name as its own label, without a separator', () => {
    render(<FerrataLayerLeaflet ferratas={[ferrata('way/1', 'Pisciadù', 4)]} onSelect={vi.fn()} />);
    const tip = screen.getByTestId('tooltip');
    expect(tip.textContent).not.toContain('·');
    expect(tip.querySelector('span')?.textContent).toBe('K4+');
  });

  it('FE-FERRATA-LEAFLET-005: a theme change recolours the lines without a refetch', async () => {
    const root = document.documentElement;
    root.style.setProperty('--warning', 'orange');
    const list = [ferrata('way/1', 'Pisciadù', 3)];
    render(<FerrataLayerLeaflet ferratas={list} onSelect={vi.fn()} />);
    expect(screen.getAllByTestId('polyline')[1]?.dataset.color).toBe('orange');

    await act(async () => {
      root.style.setProperty('--warning', 'gold');
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getAllByTestId('polyline')[1]?.dataset.color).toBe('gold'));
    root.style.removeProperty('--warning');
  });
});
