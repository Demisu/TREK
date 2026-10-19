import type { TourVisit, TourVisitStatus } from '@trek/shared';
import { create } from 'zustand';
import { tourVisitRepo } from '../repo/tourVisitRepo';

/** A station's status on one day of its walk; a station not listed is planned. */
type VisitsByStation = Readonly<Record<string, TourVisitStatus>>;

interface TourVisitState {
  /** The trip the visits were read for. */
  tripId: string | null;
  /** Per day assignment, the stations visited or skipped. */
  byAssignment: Readonly<Record<number, VisitsByStation>>;
  load: (tripId: number | string) => Promise<void>;
  /** Nothing known for this trip: its visits could not be read. */
  reset: (tripId: number | string) => void;
  /** Marks a station, at once on screen; a write the server refuses puts it back and throws. */
  mark: (
    tripId: number | string,
    assignmentId: number,
    stationKey: string,
    status: TourVisitStatus | 'planned'
  ) => Promise<void>;
  /** Another traveller marked a station: the day's visits as the server has them now. */
  applyRemote: (assignmentId: number, visits: readonly TourVisit[]) => void;
}

function byStation(visits: readonly TourVisit[]): VisitsByStation {
  return Object.fromEntries(visits.map((visit) => [visit.station_key, visit.status]));
}

function withStatus(day: VisitsByStation | undefined, key: string, status: TourVisitStatus | 'planned') {
  const next = { ...day };
  if (status === 'planned') delete next[key];
  else next[key] = status;
  return next;
}

/**
 * CW-03: how far each city walk got on its days, for the day plan's rows and
 * the walk's stations. Read once a trip opens, kept current by the trip's
 * socket, and written one station at a time.
 */
export const useTourVisitStore = create<TourVisitState>((set, get) => ({
  tripId: null,
  byAssignment: {},
  load: async (tripId) => {
    const { visits } = await tourVisitRepo.list(tripId);
    const grouped: Record<number, Record<string, TourVisitStatus>> = {};
    for (const visit of visits) (grouped[visit.assignment_id] ??= {})[visit.station_key] = visit.status;
    set({ tripId: String(tripId), byAssignment: grouped });
  },
  reset: (tripId) => set({ tripId: String(tripId), byAssignment: {} }),
  mark: async (tripId, assignmentId, stationKey, status) => {
    const before = get().byAssignment[assignmentId];
    set((state) => ({
      byAssignment: { ...state.byAssignment, [assignmentId]: withStatus(before, stationKey, status) },
    }));
    try {
      const { visits } = await tourVisitRepo.update(tripId, assignmentId, stationKey, { status });
      get().applyRemote(assignmentId, visits);
    } catch (failure) {
      set((state) => ({ byAssignment: { ...state.byAssignment, [assignmentId]: before ?? {} } }));
      throw failure;
    }
  },
  applyRemote: (assignmentId, visits) =>
    set((state) => ({ byAssignment: { ...state.byAssignment, [assignmentId]: byStation(visits) } })),
}));
