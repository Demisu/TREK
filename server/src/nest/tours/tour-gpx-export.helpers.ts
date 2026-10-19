import type { BikeProfile, PaddleBoatType } from '@trek/shared';

/** What GPX calls the activity in a track's <type>; a paddle tour says what it is paddled in. */
const PADDLE_ACTIVITY: Record<PaddleBoatType, string> = {
  kayak: 'kayaking',
  canoe: 'canoeing',
  sup: 'stand_up_paddling',
  other: 'paddling',
};

/** A bike tour says what it is ridden on, in the words Garmin and Strava read. */
const BIKE_ACTIVITY: Record<BikeProfile, string> = {
  touring: 'cycling',
  road: 'road_biking',
  gravel: 'gravel_cycling',
  mtb: 'mountain_biking',
};

/** The activity a tour's track names in GPX: a paddle tour its boat, a bike tour its profile, a hike hiking; whatever is missing falls back to the plainest. */
export function gpxActivityOf(tour: { tour_type: string; boat_type?: string | null; bike_profile?: string | null }): string {
  const { tour_type: type, boat_type: boat, bike_profile: bike } = tour;
  if (type === 'kayak') return PADDLE_ACTIVITY[(boat ?? 'other') as PaddleBoatType] ?? PADDLE_ACTIVITY.other;
  if (type === 'bike') return BIKE_ACTIVITY[(bike ?? 'touring') as BikeProfile] ?? BIKE_ACTIVITY.touring;
  return type === 'hike' ? 'hiking' : type;
}
