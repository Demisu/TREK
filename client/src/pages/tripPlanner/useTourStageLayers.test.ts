import { renderHook } from '@testing-library/react';
import type { TourListItem } from '@trek/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TourPlannerController } from '../../components/Tours/planner/useTourPlanner';
import { useAddonStore } from '../../store/addonStore';
import { useTourStageLayers } from './useTourStageLayers';

type Planner = Parameters<typeof useTourStageLayers>[0];
type Ferrata = Parameters<typeof useTourStageLayers>[1];

const ferrata = { layer: undefined, crossings: [], selected: null } as unknown as Ferrata;

function planner(mode: TourPlannerController['mode'], tourType: Planner['tourType'] = 'hike'): Planner {
  return { mode, tourType, mapBaseLayer: 'hiking', mapOverlays: new Set(), toggleMapOverlay: () => {} };
}

const basesOf = (p: Planner) => renderHook(() => useTourStageLayers(p, ferrata)).result.current;

describe('useTourStageLayers: OpenHikingMap (MAP-01)', () => {
  beforeEach(() => useAddonStore.setState({ toursHikingMap: true }));

  it('offers it while a hike is planned, as a draft or a saved tour in the editor', () => {
    for (const mode of [{ type: 'new-draft' }, { type: 'edit-saved', placeId: 4 }] as const) {
      const layers = basesOf(planner(mode));
      expect(layers.tourLayers.bases).toContain('hiking');
      expect(layers.baseLayer).toBe('hiking');
    }
  });

  it('not with no tour open, over an import viewed as it came in, or for a paddle tour', () => {
    const viewed = { type: 'view-gpx', placeId: 9, tour: { place_id: 9, tour_type: 'hike' } as TourListItem } as const;
    for (const p of [planner({ type: 'neutral' }), planner(viewed), planner({ type: 'new-draft' }, 'kayak')]) {
      const layers = basesOf(p);
      expect(layers.tourLayers.bases).not.toContain('hiking');
      // The choice is kept; the map shows the type's default until a hike is planned again.
      expect(layers.baseLayer).toBe('default');
    }
  });

  it('not where the admin withdrew it', () => {
    useAddonStore.setState({ toursHikingMap: false });
    expect(basesOf(planner({ type: 'new-draft' })).tourLayers.bases).not.toContain('hiking');
  });
});
