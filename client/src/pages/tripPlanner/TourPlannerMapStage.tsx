import { lazy, Suspense, useMemo, useState, type ReactElement } from 'react';
import FerrataDetailOverlay from '../../components/Ferratas/FerrataDetailOverlay';
import { useFerrataMapLayer } from '../../components/Ferratas/useFerrataMapLayer';
import { useOutsidePressGuard } from '../../components/Ferratas/useOutsidePressGuard';
import { MAP_LAYER_SWITCHER_INSET, MAP_ROUND_CONTROL_SIZE } from '../../components/Map/MapLayerSwitcher';
import { MapViewAuto as MapView } from '../../components/Map/MapViewAuto';
import LocationSelect from '../../components/Planner/LocationSelect';
import { isRtlLanguage, useTranslation } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import type { useTripPlanner } from './useTripPlanner';
import type { useTripPlannerPage } from './useTripPlannerPage';

// The 3D mode pulls the GL engine in, so it loads only once someone switches to it.
const TourTerrainMap = lazy(() => import('../../components/Tours/terrain/TourTerrainMap'));

/** The route blue the planner draws a tour in. */
const TOUR_TRACK_COLOR = '#0a84ff';
/** The gap both maps keep between the bottom edge, their row of controls and what floats above it. */
const CONTROL_GAP = 12;
/** A via ferrata's card floats above the bottom row of controls, at the gap the row keeps to the edge. */
const FERRATA_CARD_BOTTOM = CONTROL_GAP + MAP_ROUND_CONTROL_SIZE + CONTROL_GAP;

type Planner = ReturnType<typeof useTripPlanner>;
type PageState = ReturnType<typeof useTripPlannerPage>;

export interface TourPlannerMapStageProps
  extends
    Pick<Planner, 'tripId' | 'mapTileUrl' | 'leftHidden' | 'rightHidden' | 't'>,
    Pick<PageState, 'tourPlanner' | 'tourMap' | 'locationSearch'> {
  canPlaceEdit: boolean;
  leftPanelPx: number;
  rightPanelPx: number;
}

/**
 * The tour planner tab's map and the location search floating over it. It returns a
 * fragment so both sit straight in the tab container, ahead of the side panels, with
 * the stacking they had when this lived in the page.
 */
export function TourPlannerMapStage({
  tripId,
  mapTileUrl,
  leftHidden,
  rightHidden,
  t,
  tourPlanner,
  tourMap,
  locationSearch,
  canPlaceEdit,
  leftPanelPx,
  rightPanelPx,
}: Readonly<TourPlannerMapStageProps>): ReactElement {
  const [terrain3d, setTerrain3d] = useState(false);
  // How high the 3D map's controls reach: one row, or two once the grade legend moved above the dock.
  const [terrainControlsPx, setTerrainControlsPx] = useState(MAP_ROUND_CONTROL_SIZE);
  // One via ferrata layer for both modes: it stays on, and keeps its card, across 2D and 3D.
  // The trip's area for the layer to prefetch: the framed points and the tour's line.
  const ferrataArea = useMemo(
    () => [tourMap.focusPoints, ...(tourMap.route ?? [])],
    [tourMap.focusPoints, tourMap.route]
  );
  const ferrata = useFerrataMapLayer(tripId, ferrataArea);
  // The click that closes a ferrata's card must not also add a waypoint under it.
  const closingPress = useOutsidePressGuard();
  const { language } = useTranslation();
  const distanceUnit = useSettingsStore((s) => s.settings.distance_unit);
  const analysis = tourPlanner.mode.type === 'view-gpx' ? tourPlanner.readOnlyGpxAnalysis : tourPlanner.routeAnalysis;
  const editing = tourPlanner.mode.type === 'new-draft' || tourPlanner.mode.type === 'edit-saved';
  const canEditRoute = canPlaceEdit && !tourPlanner.isSaving && editing;
  const waypoints = {
    points: editing ? tourPlanner.waypoints : [],
    selectedId: editing ? tourPlanner.selectedWaypointId : null,
    onSelect: tourPlanner.setSelectedWaypointId,
    onMove: canEditRoute ? tourPlanner.setWaypointPosition : undefined,
    onAdd: closingPress.guard(canEditRoute ? tourPlanner.addWaypoint : undefined),
  };
  // What each panel covers of the map, a collapsed one its rail.
  const leftInset = leftHidden ? 56 : leftPanelPx;
  const rightInset = rightHidden ? 56 : rightPanelPx;
  return (
    <>
      {terrain3d ? (
        <Suspense fallback={null}>
          <TourTerrainMap
            samples={analysis?.distanceIndexedProfileSamples ?? []}
            routes={tourMap.route}
            trackColor={TOUR_TRACK_COLOR}
            unit={distanceUnit}
            baseLayer={tourPlanner.mapBaseLayer}
            onBaseLayerChange={tourPlanner.setMapBaseLayer}
            onExit={() => setTerrain3d(false)}
            focus={tourPlanner.routeProfileFocus}
            onFocusChange={tourPlanner.setRouteProfileFocus}
            leftWidth={leftInset}
            rightWidth={rightInset}
            waypoints={waypoints}
            framePoints={tourMap.focusPoints}
            ferrataLayer={ferrata.layer}
            onViewportChange={ferrata.onViewportChange}
            onControlsHeightChange={setTerrainControlsPx}
          />
        </Suspense>
      ) : (
        <MapView
          tripId={tripId}
          places={[]}
          route={tourMap.route}
          followSelection={false}
          onMapClick={closingPress.guard(
            canEditRoute
              ? ({ latlng }: { latlng: { lat: number; lng: number } }) =>
                  tourPlanner.addWaypoint(latlng.lat, latlng.lng)
              : undefined
          )}
          tileUrl={mapTileUrl}
          leftWidth={leftPanelPx}
          rightWidth={rightPanelPx}
          focusPoints={tourMap.focusPoints}
          focusKey={tourMap.focusKey}
          plannerWaypoints={waypoints.points}
          selectedPlannerWaypointId={waypoints.selectedId}
          onPlannerWaypointClick={tourPlanner.setSelectedWaypointId}
          onPlannerWaypointMove={waypoints.onMove}
          routeProfileFocus={tourPlanner.routeProfileFocus}
          viewBaseLayer={tourPlanner.mapBaseLayer}
          onViewBaseLayerChange={tourPlanner.setMapBaseLayer}
          onToggleTerrain3d={() => setTerrain3d(true)}
          ferrataLayer={ferrata.layer}
          onViewportChange={ferrata.onViewportChange}
        />
      )}
      {/* The card sits at the inline end; the panels keep their physical sides, so in a
          right-to-left language that end is the left panel's. */}
      <FerrataDetailOverlay
        selection={ferrata.selected}
        onClose={ferrata.close}
        onOutsidePress={closingPress.arm}
        insetEnd={(isRtlLanguage(language) ? leftInset : rightInset) + MAP_LAYER_SWITCHER_INSET}
        bottom={terrain3d ? CONTROL_GAP + terrainControlsPx + CONTROL_GAP : FERRATA_CARD_BOTTOM}
      />
      {/* Centred over the map between the two panels, which sit on fixed physical sides. */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          insetInline: 0,
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'none',
          zIndex: 19,
        }}
      >
        <div
          style={{
            transform: `translateX(${(leftInset - rightInset) / 2}px)`,
            width: `min(360px, calc(100vw - ${leftInset + rightInset + 32}px))`,
            pointerEvents: 'auto',
          }}
        >
          <LocationSelect
            value={locationSearch.value}
            onChange={locationSearch.onChange}
            placeholder={t('tours.planner.mapSearch')}
            ariaLabel={t('tours.planner.mapSearch')}
            floating
            showSearchStatus
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </>
  );
}
