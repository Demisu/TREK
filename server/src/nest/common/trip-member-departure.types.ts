/**
 * What the trip roster tells the rest of the app when someone leaves a trip.
 *
 * A port rather than the journal link service itself: the journey domain
 * already depends on the trip roster through others, so reaching into it from
 * the roster closed a cycle. It lives in common/ because either domain owning
 * it would draw that edge again. The journey domain binds the token
 * (TripMemberDepartureModule), and the roster calls it inside the transaction
 * that removes the member.
 */
export const TRIP_MEMBER_DEPARTURE = Symbol('TRIP_MEMBER_DEPARTURE');

export interface TripMemberDeparture {
  /** `userId` is off the trip now; whatever they held through it goes too. Runs in the caller's transaction. */
  memberLeft(tripId: number, userId: number): Promise<void>;
}
