import type { TourActivity, TourDetailResponse, TourListItem } from '@trek/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../../i18n';
import { tourRepo } from '../../../repo/tourRepo';
import { useToast } from '../../shared/Toast';
import { inDayOrder, refusalOf, type TourExecution } from './tourActivityModel';

interface TourActivitiesOptions {
  tripId: number;
  tour: TourListItem;
  /** The days the tour is on, each an execution a recording can belong to. */
  executions: readonly TourExecution[];
  canEdit: boolean;
  /** Lets the trip's lists take in a change: the tour lists its recordings, a recording the tour it documents. */
  onToursChanged?: (placeIds: number[]) => Promise<void> | void;
}

/** Which execution the assignment dialog is open for: `undefined` lets it pick the first free one. */
export interface AssignTarget {
  assignmentId?: number | null;
}

/** The refs a list item names, so the detail is read again when another client changed them. */
function refsKey(tour: TourListItem): string {
  return (tour.activity_tracks ?? []).map((ref) => `${ref.id}:${ref.track_place_id}:${ref.assignment_id}`).join(',');
}

/**
 * ACT-01: the recorded tracks of a tour in its detail, read with the detail
 * (online from the server, offline from the copy the last detail left), and
 * the two changes the user can make: open the assignment for an execution,
 * and take a recording off after confirming it. Both writes are online only,
 * as the GPX import a recording comes through is; a refused one says why and
 * changes nothing.
 */
export function useTourActivities({ tripId, tour, executions, canEdit, onToursChanged }: TourActivitiesOptions) {
  const { t } = useTranslation();
  const toast = useToast();
  const placeId = tour.place_id;
  const refs = refsKey(tour);
  const [loaded, setLoaded] = useState<{ placeId: number; activities: TourActivity[] } | null>(null);
  const [assigning, setAssigning] = useState<AssignTarget | null>(null);
  const [removing, setRemoving] = useState<TourActivity | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    tourRepo.detail(tripId, placeId, controller.signal).then(
      (detail) => {
        if (!controller.signal.aborted) setLoaded({ placeId, activities: detail.activities ?? [] });
      },
      () => {
        if (!controller.signal.aborted) setLoaded({ placeId, activities: [] });
      }
    );
    return () => controller.abort();
    // `refs` is the list's word that the recordings changed elsewhere.
  }, [tripId, placeId, refs]);

  const activities = useMemo(
    () => (loaded?.placeId === placeId ? inDayOrder(loaded.activities, executions) : null),
    [executions, loaded, placeId]
  );

  /** One write, its answer taken in, the lists told and the user too; false when it was refused. */
  const apply = useCallback(
    async (write: () => Promise<TourDetailResponse>, success: string, changed: number[]): Promise<boolean> => {
      setBusy(true);
      try {
        const detail = await write();
        setLoaded({ placeId, activities: detail.activities ?? [] });
        await onToursChanged?.(changed);
        toast.success(t(success));
        return true;
      } catch (error: unknown) {
        const refusal = refusalOf(error);
        toast.error(t(refusal ? `tours.activity.refused.${refusal}` : 'tours.activity.failed'));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onToursChanged, placeId, t, toast]
  );

  /** The confirmed assignment from the dialog; the dialog closes once it is written. */
  const assign = useCallback(
    async (trackPlaceId: number, assignmentId: number | null) => {
      if (!canEdit || busy) return;
      const done = await apply(
        () => tourRepo.assignActivity(tripId, placeId, { track_place_id: trackPlaceId, assignment_id: assignmentId }),
        'tours.activity.assigned',
        [placeId, trackPlaceId]
      );
      if (done) setAssigning(null);
    },
    [apply, busy, canEdit, placeId, tripId]
  );

  /** The recording asked about, taken off once the user confirmed it. */
  const remove = useCallback(async () => {
    const target = removing;
    if (!canEdit || !target || busy) return;
    setRemoving(null);
    await apply(() => tourRepo.unassignActivity(tripId, placeId, target.id), 'tours.activity.removed', [
      placeId,
      target.track.place_id,
    ]);
  }, [apply, busy, canEdit, placeId, removing, tripId]);

  return {
    /** Null while the detail loads. */
    activities,
    canEdit,
    busy,
    assigning,
    openAssign: (target: AssignTarget = {}) => {
      if (canEdit) setAssigning(target);
    },
    closeAssign: () => {
      if (!busy) setAssigning(null);
    },
    assign,
    removing,
    askRemove: (activity: TourActivity) => {
      if (canEdit) setRemoving(activity);
    },
    cancelRemove: () => setRemoving(null),
    remove,
  };
}

export type TourActivities = ReturnType<typeof useTourActivities>;
