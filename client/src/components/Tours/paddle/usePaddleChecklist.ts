import {
  haversineMetres,
  paddleCheckSummaryOf,
  type ObstacleDecision,
  type ObstacleReviewOp,
  type PaddleCheck,
  type TourListItem,
  type TourObstacleCheck,
  type TourObstacleEntry,
  type TourOwnEntry,
  type TripMember,
} from '@trek/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNetworkMode } from '../../../hooks/useNetworkMode';
import { useTranslation } from '../../../i18n';
import { applyObstacleOps } from '../../../repo/obstacleCheckLocal';
import { tourRepo } from '../../../repo/tourRepo';
import { useAuthStore } from '../../../store/authStore';
import {
  focusPaddleArea,
  focusPaddleObstacle,
  selectPaddleObstacle,
  usePaddleObstacleStore,
} from '../../../store/paddleObstacleStore';
import { useToast } from '../../shared/Toast';
import type { TourPlannerController } from '../planner/useTourPlanner';
import { focusPointsOf, nextPendingEntry } from './paddleCheckModel';
import type { TrackPaddlePlan } from './useTrackPaddlePlan';

export type PaddleChecklistStatus = 'off' | 'new' | 'loading' | 'ready' | 'offline-empty' | 'error';

interface PaddleChecklistOptions {
  tripId: number;
  planner: TourPlannerController;
  tours: readonly TourListItem[];
  tripMembers: readonly TripMember[];
  canEdit: boolean;
  /** The tours workspace is open on a desktop with the Tours addon on. */
  active: boolean;
  trackPaddlePlan?: Pick<TrackPaddlePlan, 'dirty' | 'startPick' | 'pick'>;
  /** The tour as it stands after a save, for the lists and the map to take it in. */
  onSaved: (tour: TourListItem) => void;
}

interface Loaded {
  key: string;
  check: TourObstacleCheck | null;
  stale: boolean;
  failed: boolean;
}

/** The paddle tour the planner has open, saved or shown as recorded, or null. */
function openPaddleTour(mode: TourPlannerController['mode'], tours: readonly TourListItem[]): TourListItem | null {
  if (mode.type !== 'edit-saved' && mode.type !== 'view-gpx') return null;
  const tour = tours.find((item) => item.place_id === mode.placeId) ?? (mode.type === 'view-gpx' ? mode.tour : null);
  return tour?.tour_type === 'kayak' ? tour : null;
}

/** Reads the checklist for the bench the list shows, again whenever its revision or the connection changes. */
function useChecklistRead(tripId: number, tour: TourListItem | null, active: boolean) {
  const { offline } = useNetworkMode();
  const placeId = tour?.place_id ?? null;
  const revision = tour?.paddle_check?.revision ?? null;
  const key = `${placeId}:${revision}:${offline}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!active || placeId === null) return;
    const controller = new AbortController();
    tourRepo
      .obstacleCheck(tripId, placeId, revision, controller.signal)
      .then(({ check, stale }) => {
        if (!controller.signal.aborted) setLoaded({ key, check, stale, failed: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoaded({ key, check: null, stale: false, failed: true });
      });
    return () => controller.abort();
  }, [active, key, placeId, revision, tripId]);
  const current = loaded?.key === key ? loaded : null;
  return { current, offline, key, setLoaded };
}

/** Where a portage for an obstacle starts on a planned tour: the control point whose leg passes it. */
function waypointBefore(points: TourPlannerController['waypoints'], alongM: number): string | null {
  let distance = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    distance += haversineMetres(a.lat, a.lng, b.lat, b.lng);
    if (distance >= alongM) return a.id;
  }
  return points[points.length - 2]?.id ?? null;
}

/**
 * PAD-06 and PAD-09 in the tours workspace: the checklist of the open paddle
 * tour, read through the offline core for the bench the list shows, with the
 * paddlers' decisions saved optimistically and rolled back on a failure.
 * Deciding waits while the route has unsaved changes, since a decision binds
 * to the route the server judged.
 */
export function usePaddleChecklist(options: PaddleChecklistOptions) {
  const { tripId, planner, tours, canEdit, active, trackPaddlePlan } = options;
  const { mode, waypoints, setSelectedWaypointId } = planner;
  const tour = useMemo(() => openPaddleTour(mode, tours), [mode, tours]);
  const read = useChecklistRead(tripId, tour, active);
  const writes = useChecklistWrites(options, tour, read);
  const selectedRef = usePaddleObstacleStore((state) => state.selectedRef);
  const [dialogKey, setDialogKey] = useState<string | null>(null);

  const check = writes.optimistic ?? read.current?.check ?? null;
  const dirty = planner.hasUnsavedChanges || !!trackPaddlePlan?.dirty;
  let status: PaddleChecklistStatus = 'off';
  if (active && mode.type === 'new-draft' && planner.isPaddle) status = 'new';
  else if (active && tour) {
    if (!read.current) status = 'loading';
    else if (read.current.check) status = 'ready';
    else status = read.offline ? 'offline-empty' : 'error';
  }
  const placeId = tour?.place_id ?? -1;
  const summary: PaddleCheck | null =
    writes.optimistic && tour?.paddle_check
      ? {
          ...paddleCheckSummaryOf(writes.optimistic.entries, writes.optimistic.own, tour.paddle_check),
          revision: tour.paddle_check.revision,
        }
      : (tour?.paddle_check ?? null);

  const entryForRef = useCallback(
    (ref: string) => check?.entries.find((entry) => entry.refs.includes(ref)) ?? null,
    [check]
  );
  const select = useCallback((entry: TourObstacleEntry) => {
    const ref = entry.refs[0];
    if (ref && focusPaddleObstacle(ref)) {
      setDialogKey(null);
      return;
    }
    selectPaddleObstacle(null);
    focusPaddleArea(focusPointsOf(entry));
    setDialogKey(entry.key);
  }, []);
  const selectOwn = useCallback(
    (own: TourOwnEntry) => {
      focusPaddleArea(focusPointsOf(own));
      const waypoint = own.index === null ? undefined : waypoints[own.index];
      if (mode.type === 'edit-saved' && waypoint) setSelectedWaypointId(waypoint.id);
    },
    [mode.type, setSelectedWaypointId, waypoints]
  );
  // A track takes the portage on its own pick; a planned tour selects the control point to carry from.
  const planPortage = useCallback(
    (entry: TourObstacleEntry) => {
      selectPaddleObstacle(null);
      setDialogKey(null);
      focusPaddleArea(focusPointsOf(entry));
      if (mode.type === 'view-gpx') {
        if (trackPaddlePlan?.pick !== 'portage') trackPaddlePlan?.startPick('portage');
        return;
      }
      const waypoint = waypointBefore(waypoints, entry.along_m ?? 0);
      if (waypoint) setSelectedWaypointId(waypoint);
    },
    [mode.type, setSelectedWaypointId, trackPaddlePlan, waypoints]
  );
  const nextOf = useCallback((entry: TourObstacleEntry) => (check ? nextPendingEntry(check, entry) : null), [check]);

  return {
    status,
    tour,
    check,
    summary,
    stale: read.current?.stale ?? false,
    dirty,
    canDecide: canEdit && status === 'ready' && !dirty && placeId > 0 && writes.savingKey === null,
    savingKey: writes.savingKey,
    selectedKey: (selectedRef ? entryForRef(selectedRef)?.key : null) ?? dialogKey,
    dialogKey,
    entryForRef,
    select,
    selectOwn,
    closeDialog: () => setDialogKey(null),
    ...writes.actions,
    nextOf,
    next: (entry: TourObstacleEntry) => {
      const following = nextOf(entry);
      if (following) select(following);
    },
    planPortage,
    memberName: (id: number | null) => options.tripMembers.find((member) => member.id === id)?.username ?? null,
  };
}

export type PaddleChecklist = ReturnType<typeof usePaddleChecklist>;

/** The decisions saved through the offline core: shown at once, the server's answer taken in, a failure undone. */
function useChecklistWrites(
  options: PaddleChecklistOptions,
  tour: TourListItem | null,
  read: ReturnType<typeof useChecklistRead>
) {
  const { tripId, onSaved } = options;
  const { t } = useTranslation();
  const toast = useToast();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const [pending, setPending] = useState<{ key: string; check: TourObstacleCheck } | null>(null);
  const base = read.current?.check ?? null;
  const placeId = tour?.place_id ?? null;
  const { setLoaded, offline } = read;

  const save = useCallback(
    async (key: string, op: ObstacleReviewOp) => {
      if (!base || placeId === null) return;
      setPending({
        key,
        check: applyObstacleOps(base, [op], { now: new Date().toISOString(), userId, revision: 'pending' }),
      });
      try {
        const result = await tourRepo.saveObstacleReviews(tripId, placeId, { ops: [op] }, userId);
        const revision = result.tour.paddle_check?.revision ?? null;
        setLoaded({
          key: `${placeId}:${revision}:${offline}`,
          check: result.obstacle_check ?? base,
          stale: false,
          failed: false,
        });
        onSaved(result.tour);
      } catch {
        toast.error(t('tours.paddle.marks.failed'));
      } finally {
        setPending(null);
      }
    },
    [base, offline, onSaved, placeId, setLoaded, t, toast, tripId, userId]
  );

  const actions = useMemo(
    () => ({
      decide: (entry: TourObstacleEntry, decision: ObstacleDecision) =>
        save(entry.key, {
          key: entry.key,
          op: 'decide',
          decision,
          note: entry.decision?.note ?? null,
          basis: entry.basis,
        }),
      setNote: (entry: TourObstacleEntry, note: string | null) =>
        save(entry.key, { key: entry.key, op: 'note', decision: null, note: note?.trim() || null, basis: null }),
      clear: (entry: TourObstacleEntry) =>
        save(entry.key, { key: entry.key, op: 'clear', decision: null, note: null, basis: null }),
      keep: (entry: TourObstacleEntry) =>
        save(entry.key, { key: entry.key, op: 'keep', decision: null, note: null, basis: null }),
    }),
    [save]
  );
  return { optimistic: pending?.check ?? null, savingKey: pending?.key ?? null, actions };
}
