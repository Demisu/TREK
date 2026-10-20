import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { useFerrataMapLayer } from '../../components/Ferratas/useFerrataMapLayer';
import { paddleMapItems, selectedPaddleKey } from '../../components/Tours/paddle/paddleMapLayer';
import { usePaddlePaint } from '../../components/Tours/paddle/paddlePaint';
import type { TourPlannerController } from '../../components/Tours/planner/useTourPlanner';
import { baseLayerFor, PISTE_OVERLAY, SEAMARK_OVERLAY, tourMapLayersFor } from '../../components/Tours/tourMapLayers';
import { useBaseMapHealth, useTourRasterOverlay } from '../../components/Tours/useTourRasterOverlay';
import { useAddonStore } from '../../store/addonStore';
import { selectPaddleObstacle, usePaddleObstacleStore } from '../../store/paddleObstacleStore';

const NO_CROSSINGS: never[] = [];

type FerrataLayerState = ReturnType<typeof useFerrataMapLayer>;

/**
 * What the planner map shows for the tour in it (P2B-06/07): the base layers
 * and overlays of its type, an import with its own type's and a draft with the
 * one chosen. A type without the via ferrata layer, or no tour open at all,
 * neither draws nor warns about ferratas, even if the layer was switched on before; a base layer it
 * does not offer falls back to its default without changing the choice kept,
 * which is also what an install whose admin withdrew OpenHikingMap sees.
 * The pistes (SKI-01) are offered with no tour open too, whatever type was chosen last.
 */
export function useTourStageLayers(
  tourPlanner: Pick<TourPlannerController, 'mode' | 'tourType' | 'mapBaseLayer' | 'mapOverlays' | 'toggleMapOverlay'>,
  ferrata: FerrataLayerState
) {
  const { mode } = tourPlanner;
  // MAP-01, BIK-06: a type's own map (OpenHikingMap for a hike, CyclOSM for a bike tour) while a
  // tour of that type is open, planned or viewed as it came in, never with no tour open, and only
  // while the admin offers it.
  const hikingMapAllowed = useAddonStore((state) => state.toursHikingMap);
  const cycleMapAllowed = useAddonStore((state) => state.toursCycleMap);
  const tourOpen = mode.type !== 'neutral';
  const layerSet = tourMapLayersFor(mode.type === 'view-gpx' ? mode.tour.tour_type : tourPlanner.tourType, {
    hikingMap: hikingMapAllowed && tourOpen,
    cycleMap: cycleMapAllowed && tourOpen,
  });
  const baseLayer = baseLayerFor(layerSet, tourPlanner.mapBaseLayer);
  const baseHealth = useBaseMapHealth(baseLayer);
  // With no tour open nothing is a hike yet: the ferratas wait for one, as the seamarks wait for a paddle tour.
  const offersFerratas = mode.type !== 'neutral' && layerSet.overlays.includes('ferratas');
  const { toggleMapOverlay } = tourPlanner;
  const offersSeamarks = layerSet.overlays.includes('seamarks');
  const toggleSeamarks = useCallback(() => toggleMapOverlay(SEAMARK_OVERLAY.id), [toggleMapOverlay]);
  const seamarks = useTourRasterOverlay(
    SEAMARK_OVERLAY,
    offersSeamarks,
    tourPlanner.mapOverlays.has(SEAMARK_OVERLAY.id),
    toggleSeamarks
  );
  // SKI-01: the pistes for the types they serve, and with no tour open, so a ski area can be
  // looked at without any route. Switching them never touches the tour: the switch is the map view's.
  const offersPistes = !tourOpen || layerSet.overlays.includes('pistes');
  const togglePistes = useCallback(() => toggleMapOverlay(PISTE_OVERLAY.id), [toggleMapOverlay]);
  const pistes = useTourRasterOverlay(
    PISTE_OVERLAY,
    offersPistes,
    tourPlanner.mapOverlays.has(PISTE_OVERLAY.id),
    togglePistes
  );
  const overlays = useMemo(
    () => [...(offersSeamarks ? [seamarks] : []), ...(offersPistes ? [pistes] : [])],
    [offersSeamarks, seamarks, offersPistes, pistes]
  );
  // PAD-05B: the obstacles the sync hook read around the paddle tour, only while one is open.
  const { features, related, selectedRef } = usePaddleObstacleStore(
    useShallow((state) => ({ features: state.features, related: state.related, selectedRef: state.selectedRef }))
  );
  const paddlePaint = usePaddlePaint();
  const paddleItems = useMemo(() => paddleMapItems(features, related, paddlePaint), [features, related, paddlePaint]);
  const paddle = useMemo(
    () =>
      paddleItems.length
        ? {
            items: paddleItems,
            selectedRef,
            selectedKey: selectedPaddleKey(features, selectedRef),
            onSelect: selectPaddleObstacle,
          }
        : undefined,
    [paddleItems, features, selectedRef]
  );
  const tourLayers = useMemo(
    () => ({
      bases: layerSet.bases,
      overlays,
      paddle,
      baseHealth,
    }),
    [layerSet, overlays, paddle, baseHealth]
  );
  return {
    baseLayer,
    tourLayers,
    ferrataLayer: offersFerratas ? ferrata.layer : undefined,
    ferrataCrossings: offersFerratas ? ferrata.crossings : NO_CROSSINGS,
    ferrataSelected: offersFerratas ? ferrata.selected : null,
  };
}
