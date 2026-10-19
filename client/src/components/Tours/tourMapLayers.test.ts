import { describe, expect, it } from 'vitest';
import { baseLayerFor, tourMapLayersFor } from './tourMapLayers';

describe('tourMapLayersFor (MAP-01)', () => {
  it('offers OpenHikingMap to a hike only while the admin allows it', () => {
    expect(tourMapLayersFor('hike').bases).not.toContain('hiking');
    expect(tourMapLayersFor('hike', { hikingMap: true }).bases).toEqual(['default', 'topo', 'hiking', 'satellite']);
    expect(tourMapLayersFor('hike', { hikingMap: true }).overlays).toEqual(['ferratas']);
    expect(tourMapLayersFor('kayak', { hikingMap: true }).bases).not.toContain('hiking');
    expect(tourMapLayersFor(null, { hikingMap: true }).bases).not.toContain('hiking');
  });

  it('falls back to the standard map once the admin withdrew it, keeping the choice for later', () => {
    expect(baseLayerFor(tourMapLayersFor('hike', { hikingMap: true }), 'hiking')).toBe('hiking');
    expect(baseLayerFor(tourMapLayersFor('hike'), 'hiking')).toBe('default');
  });
});
