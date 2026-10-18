import { JourneyDetailPageDesktop } from '../JourneyDetailPage';

/**
 * The trip's Journal tab on the desktop: the Journey addon's own journal view,
 * not a copy of it, so the journal looks and works the same in both places and
 * stays live through the journey's own sync. The wrapper moves the view's fixed
 * bars below the trip's tab bar (see .trip-embedded-journal).
 */
export default function TripJournalPanel({ journeyId }: { journeyId: number | null }) {
  if (journeyId == null) return null;
  return (
    <div className="trip-embedded-journal absolute inset-0 overflow-y-auto">
      <JourneyDetailPageDesktop journeyId={journeyId} embedded />
    </div>
  );
}
