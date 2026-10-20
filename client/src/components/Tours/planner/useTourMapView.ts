import { useCallback, useState } from 'react';
import type { TourBaseLayer } from '../../Map/MapLayerSwitcher';

interface OverlayChoice {
  /** Switched on by hand. */
  on: ReadonlySet<string>;
  /** Switched off by hand: an overlay on by default for a type (the pistes on a ski tour, SKI-01) stays off. */
  off: ReadonlySet<string>;
}

/**
 * How the planner's map looks, kept with the planner so it lasts while tours
 * are opened, saved and closed: the base layer and the overlays switched on
 * or off by hand. Planner-local by design (P2B-07): nothing here touches the
 * global map setting, and none of it changes a tour.
 */
export function useTourMapView() {
  const [mapBaseLayer, setMapBaseLayer] = useState<TourBaseLayer>('default');
  const [overlays, setOverlays] = useState<OverlayChoice>(() => ({ on: new Set(), off: new Set() }));
  /**
   * An overlay switched by hand. `shown` is whether it shows now, for an
   * overlay that can show without being switched on; left out, it shows
   * while it is switched on.
   */
  const toggleMapOverlay = useCallback((id: string, shown?: boolean) => {
    setOverlays(({ on, off }) => {
      const nextOn = new Set(on);
      const nextOff = new Set(off);
      if (shown ?? on.has(id)) {
        nextOn.delete(id);
        nextOff.add(id);
      } else {
        nextOn.add(id);
        nextOff.delete(id);
      }
      return { on: nextOn, off: nextOff };
    });
  }, []);
  return { mapBaseLayer, setMapBaseLayer, mapOverlays: overlays.on, mapOverlaysOff: overlays.off, toggleMapOverlay };
}
