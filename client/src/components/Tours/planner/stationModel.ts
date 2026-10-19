import type { TourPlannerWaypoint } from './tourPlannerWaypoints';

/**
 * CW-02: a city walk's time, walking and staying kept apart. A stay nobody
 * entered is unknown, never nothing: the total then counts only what is
 * known and says it is at least that much. A point passed through is a stay
 * of 0, entered on purpose.
 */
export interface WalkTimes {
  walkingMinutes: number | null;
  /** The stays entered, summed. */
  stayMinutes: number;
  /** Stations whose stay nobody entered. */
  unknownStays: number;
  /** Walking and the known stays; null while the walking time is unknown. */
  totalMinutes: number | null;
  /** The total leaves out a stay or the walking time that is not known. */
  partial: boolean;
}

/** The stations of a city walk: its points that are no shaping points. */
function stationsOf(points: readonly TourPlannerWaypoint[]): TourPlannerWaypoint[] {
  return points.filter((point) => !point.shaping);
}

export function walkTimes(points: readonly TourPlannerWaypoint[], walkingMinutes: number | null): WalkTimes {
  const stations = stationsOf(points);
  const stayMinutes = stations.reduce((sum, station) => sum + (station.stayMinutes ?? 0), 0);
  const unknownStays = stations.filter((station) => station.stayMinutes == null).length;
  return {
    walkingMinutes,
    stayMinutes,
    unknownStays,
    totalMinutes: walkingMinutes === null ? null : walkingMinutes + stayMinutes,
    partial: unknownStays > 0,
  };
}

/** What the station dialog edits; the rest of the point stays as it is. */
export type StationFields = Pick<TourPlannerWaypoint, 'name' | 'stayMinutes' | 'importance' | 'protected'>;

/** The point with the fields as edited, each one left out where it is empty. */
export function withStationFields(point: TourPlannerWaypoint, fields: StationFields): TourPlannerWaypoint {
  const { name: _name, stayMinutes: _stay, importance: _importance, protected: _protected, ...rest } = point;
  const name = fields.name?.trim();
  return {
    ...rest,
    ...(name ? { name } : {}),
    ...(fields.stayMinutes != null ? { stayMinutes: fields.stayMinutes } : {}),
    ...(fields.importance ? { importance: fields.importance } : {}),
    ...(fields.protected ? { protected: true } : {}),
  };
}

/** A stay as typed: empty is unknown, a whole number from 0 to a day is minutes, anything else is not taken. */
export function parseStay(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d{1,4}$/.test(trimmed)) return undefined;
  const minutes = Number(trimmed);
  return minutes <= 24 * 60 ? minutes : undefined;
}
