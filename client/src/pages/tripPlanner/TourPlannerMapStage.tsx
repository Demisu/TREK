import type { ReactElement } from 'react';
import { MapViewAuto as MapView } from '../../components/Map/MapViewAuto';
import LocationSelect from '../../components/Planner/LocationSelect';
import type { useTripPlanner } from './useTripPlanner';
import type { useTripPlannerPage } from './useTripPlannerPage';

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
  return (
    <>
      <MapView
        tripId={tripId}
        places={[]}
        route={tourMap.route}
        followSelection={false}
        onMapClick={
          canPlaceEdit &&
          !tourPlanner.isSaving &&
          (tourPlanner.mode.type === 'new-draft' || tourPlanner.mode.type === 'edit-saved')
            ? ({ latlng }: { latlng: { lat: number; lng: number } }) => tourPlanner.addWaypoint(latlng.lat, latlng.lng)
            : undefined
        }
        tileUrl={mapTileUrl}
        leftWidth={leftPanelPx}
        rightWidth={rightPanelPx}
        focusPoints={tourMap.focusPoints}
        focusKey={tourMap.focusKey}
        plannerWaypoints={
          tourPlanner.mode.type === 'new-draft' || tourPlanner.mode.type === 'edit-saved' ? tourPlanner.waypoints : []
        }
        selectedPlannerWaypointId={
          tourPlanner.mode.type === 'new-draft' || tourPlanner.mode.type === 'edit-saved'
            ? tourPlanner.selectedWaypointId
            : null
        }
        onPlannerWaypointClick={tourPlanner.setSelectedWaypointId}
        onPlannerWaypointMove={
          canPlaceEdit &&
          !tourPlanner.isSaving &&
          (tourPlanner.mode.type === 'new-draft' || tourPlanner.mode.type === 'edit-saved')
            ? tourPlanner.setWaypointPosition
            : undefined
        }
        routeProfileFocus={tourPlanner.routeProfileFocus}
        viewBaseLayer={tourPlanner.mapBaseLayer}
        onViewBaseLayerChange={tourPlanner.setMapBaseLayer}
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
            transform: `translateX(${((leftHidden ? 56 : leftPanelPx) - (rightHidden ? 56 : rightPanelPx)) / 2}px)`,
            width: `min(360px, calc(100vw - ${(leftHidden ? 56 : leftPanelPx) + (rightHidden ? 56 : rightPanelPx) + 32}px))`,
            pointerEvents: 'auto',
          }}
        >
          <LocationSelect
            value={locationSearch.value}
            onChange={locationSearch.onChange}
            placeholder={t('reservations.searchLocation')}
            ariaLabel={t('reservations.searchLocation')}
            showSearchStatus
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </>
  );
}
