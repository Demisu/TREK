import type { GpxConversion } from './conversion/useGpxConversion';
import { TourPlannerRail } from './planner/TourPlannerPanels';
import type { TourPlannerController } from './planner/useTourPlanner';
import type { TrackPaddlePlan } from './paddle/useTrackPaddlePlan';
import type { RecordedTrack } from './useRecordedTrack';
import WandererBrowserRail from './wanderer/WandererBrowserRail';
import type { WandererBrowser } from './wanderer/useWandererBrowser';

/** The tours workspace's left rail: the tour editor, or the wanderer trails while those are browsed. */
export default function TourWorkspaceRail({
  planner,
  wanderer,
  conversion,
  recordedTrack,
  trackPaddlePlan,
  canEdit,
  canAssign,
}: {
  planner: TourPlannerController;
  wanderer: WandererBrowser;
  conversion: GpxConversion;
  recordedTrack: RecordedTrack;
  /** The portages and locks of a recorded paddle track in view. */
  trackPaddlePlan?: TrackPaddlePlan;
  canEdit: boolean;
  canAssign: boolean;
}) {
  return wanderer.open ? (
    <WandererBrowserRail browser={wanderer} />
  ) : (
    <TourPlannerRail
      planner={planner}
      canEdit={canEdit}
      canAssign={canAssign}
      conversion={conversion}
      recordedTrack={recordedTrack}
      trackPaddlePlan={trackPaddlePlan}
      onOpenWanderer={wanderer.enabled ? wanderer.openBrowser : undefined}
    />
  );
}
