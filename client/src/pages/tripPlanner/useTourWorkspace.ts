import type { TourListItem } from '@trek/shared';
import { useCallback } from 'react';
import { useGpxConversion } from '../../components/Tours/conversion/useGpxConversion';
import { useTourPlanner } from '../../components/Tours/planner/useTourPlanner';
import { useRecordedTrack } from '../../components/Tours/useRecordedTrack';
import { useTourGpxImport } from '../../components/Tours/useTourGpxImport';
import { useWandererBrowser } from '../../components/Tours/wanderer/useWandererBrowser';
import { tourRepo } from '../../repo/tourRepo';
import { useAddonStore } from '../../store/addonStore';
import { useTripStore } from '../../store/tripStore';
import type { Place } from '../../types';
import type { useTripPlanner } from './useTripPlanner';

/**
 * The desktop tours workspace: the tour editor, its GPX import (button and file drop)
 * and the wanderer trail browser, wired so that whatever comes in opens on the map.
 */
export function useTourWorkspace(
  planner: ReturnType<typeof useTripPlanner>,
  canPlaceEdit: boolean,
  canDayEdit: boolean
) {
  const {
    activeTab,
    enabledAddons,
    invalidateTourPlaceIds,
    isMobile,
    places,
    reloadTourPlaceIds,
    t,
    toast,
    tours,
    tripActions,
    tripId,
    upsertTour,
  } = planner;
  // wanderer only while the admin allows it under Tours (the store reads Tours being on into it too).
  const wandererAllowed = useAddonStore((state) => state.toursWanderer);

  const tourPlanner = useTourPlanner({
    tripId,
    canEdit: canPlaceEdit,
    canAssign: canDayEdit,
    active: activeTab === 'tour-planner' && enabledAddons.tours && !isMobile,
    onSaved: async (result) => {
      upsertTour(result.tour);
      toast.success(t('tours.planner.saved'));
      await tripActions.loadTrip(tripId);
      void reloadTourPlaceIds();
    },
  });

  // A tour of the trip opened in the planner: an import has no waypoints of its own and
  // shows as it came in, a planned tour opens in the editor. Never over an edit it would
  // replace.
  const { hasUnsavedChanges, viewGpxTour, openTour } = tourPlanner;
  /** An import shown as it came in, over whatever the planner shows; the caller asked before discarding. */
  const viewImportedTour = useCallback(
    (tour: TourListItem) => {
      // The store first: right after an import the page's list may not have the new place yet.
      const byId = (item: { id: number }) => item.id === tour.place_id;
      const place = useTripStore.getState().places.find(byId) ?? places.find(byId);
      viewGpxTour(tour, place?.route_geometry ?? null);
    },
    [places, viewGpxTour]
  );
  const openTourInPlanner = useCallback(
    (placeId: number, known?: TourListItem) => {
      const tour = known ?? tours.find((item) => item.place_id === placeId);
      if (!tour || hasUnsavedChanges) return;
      if (tour.has_waypoints === false) viewImportedTour(tour);
      else void openTour(tour);
    },
    [hasUnsavedChanges, openTour, tours, viewImportedTour]
  );

  // The tours workspace's GPX import, shared by its button and its file drop. One new
  // tour opens on the map at once.
  const openImportedTours = useCallback(
    (imported: TourListItem[]) => {
      if (imported.length === 1) openTourInPlanner(imported[0].place_id, imported[0]);
    },
    [openTourInPlanner]
  );
  const tourGpxImport = useTourGpxImport({
    tripId,
    canEdit: canPlaceEdit,
    onToursChanged: (placeIds) => invalidateTourPlaceIds(placeIds ? { placeIds } : undefined),
    onImported: openImportedTours,
  });

  // Browsing the user's wanderer trails in place of the editor rail; the trail shows on the map.
  const wandererBrowser = useWandererBrowser({
    tripId,
    enabled: activeTab === 'tour-planner' && wandererAllowed && !isMobile && canPlaceEdit,
    onImported: async (tour) => {
      upsertTour(tour);
      await useTripStore.getState().refreshPlaces(tripId);
      void invalidateTourPlaceIds({ placeIds: [tour.place_id] });
      openTourInPlanner(tour.place_id, tour);
    },
    onOpenTour: openTourInPlanner,
  });

  // An import planned as an editable tour: analysed on request, adopted over itself or as a new draft.
  const tourConversion = useGpxConversion(tourPlanner);
  // The way back from an import planned over in place to its recorded track.
  const recordedTrack = useRecordedTrack({
    tripId,
    planner: tourPlanner,
    tours,
    canEdit: canPlaceEdit,
    onRestored: async (tour) => {
      upsertTour(tour);
      await useTripStore.getState().refreshPlaces(tripId);
      void invalidateTourPlaceIds({ placeIds: [tour.place_id] });
      viewImportedTour(tour);
    },
  });

  // What the tour's detail does beyond a place's: a rename reloads the tours, a reimport from its
  // source check takes the new snapshot in and opens it.
  const tourDetailActions = {
    onUpdatePlace: async (placeId: number, data: Partial<Place>) => {
      await tripActions.updatePlace(tripId, placeId, data);
      await reloadTourPlaceIds();
    },
    onSourceReimported: async (tour: TourListItem) => {
      upsertTour(tour);
      await useTripStore.getState().refreshPlaces(tripId);
      void invalidateTourPlaceIds({ placeIds: [tour.place_id] });
      planner.handlePlaceClick(tour.place_id);
    },
    // P2C-07: the copy opens at once, under a name that says it is one; renaming it is the next step.
    onSaveAsNew: async (tour: TourListItem) => {
      try {
        const { tour: copy } = await tourRepo.copy(
          tripId,
          tour.place_id,
          t('tours.copy.name', { name: tour.name }).slice(0, 255)
        );
        upsertTour(copy);
        await useTripStore.getState().refreshPlaces(tripId);
        void invalidateTourPlaceIds({ placeIds: [copy.place_id] });
        planner.handlePlaceClick(copy.place_id);
        toast.success(t('tours.copy.saved'));
      } catch {
        toast.error(t('tours.copy.failed'));
      }
    },
  };

  return {
    tourPlanner,
    viewImportedTour,
    tourGpxImport,
    wandererBrowser,
    tourConversion,
    recordedTrack,
    tourDetailActions,
  };
}
