import { ArrowRight } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { focusRouteProfileAtDistance } from '../../../utils/routeGeometry';
import { fs } from '../../shared/DialogShell';
import { Tooltip } from '../../shared/Tooltip';
import type { TourPlannerController } from '../planner/useTourPlanner';
import { useWaypointPlaceNames } from '../planner/useWaypointPlaceNames';
import { InfoDot, TourSection } from '../tourParts';
import { StageEndCorner, StageMetricBadges } from './StageParts';
import type { TourStage } from './tourStages';

type StagesPlanner = Pick<
  TourPlannerController,
  'stages' | 'waypoints' | 'routeAnalysis' | 'setSelectedWaypointId' | 'setRouteProfileFocus'
>;

/** A stage's number as the list numbers a stop, with the moon at its corner where a night follows. */
function StageNumber({ number, night }: { number: number; night: boolean }) {
  return (
    <span
      className="relative grid h-7 w-7 flex-none place-items-center rounded-full bg-edge font-geist font-semibold tabular-nums text-content"
      style={fs(11.5)}
    >
      {number}
      {night && <StageEndCorner />}
    </span>
  );
}

/**
 * MDT-01: the stages of a multi-day tour under the whole tour's facts, the
 * second view of the same route: each stage from the stop it starts at to the
 * one it ends at, with what it measures. A stage shows where it ends, on the
 * map, in the profile and in the list of points.
 */
export function TourStagesSection({ planner }: { planner: StagesPlanner }) {
  const { t } = useTranslation();
  const placeNames = useWaypointPlaceNames(planner.waypoints);
  const { stages } = planner.stages;
  if (stages.length < 2) return null;
  const nameOf = (id: string) => {
    const index = planner.waypoints.findIndex((point) => point.id === id);
    // Stops are numbered as the list numbers them: a shaping point takes no number.
    const stop = planner.waypoints.slice(0, index + 1).filter((point) => !point.shaping).length;
    return planner.waypoints[index]?.name ?? placeNames[id] ?? t('tours.planner.waypointLabel', { n: stop });
  };
  const show = (stage: TourStage) => {
    planner.setSelectedWaypointId(stage.toId);
    const samples = planner.routeAnalysis?.distanceIndexedProfileSamples ?? [];
    planner.setRouteProfileFocus(stage.toM === null ? null : focusRouteProfileAtDistance(samples, stage.toM));
  };
  return (
    <TourSection
      label={t('tours.stages.title')}
      action={<InfoDot label={t('tours.stages.title')} description={t('tours.stages.timeInfo')} />}
    >
      <ol data-testid="tour-stages" className="-mx-1.5 m-0 flex list-none flex-col gap-px p-0">
        {stages.map((stage) => (
          <li key={stage.number}>
            <Tooltip label={t('tours.stages.show')}>
              <button
                type="button"
                data-testid="tour-stage-row"
                onClick={() => show(stage)}
                className="flex w-full min-w-0 items-center gap-2.5 rounded-[10px] px-1.5 py-1.5 text-start transition-colors hover:bg-surface-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <StageNumber number={stage.number} night={stage.number < stages.length} />
                <span className="flex min-w-0 flex-1 flex-col items-start gap-1">
                  <span
                    className="flex w-full min-w-0 items-center gap-1 font-semibold leading-tight text-content"
                    style={fs(12.5, 'body')}
                  >
                    <span className="min-w-0 truncate">{nameOf(stage.fromId)}</span>
                    <ArrowRight
                      size={12}
                      strokeWidth={2.2}
                      aria-hidden="true"
                      className="flex-none text-content-faint rtl:rotate-180"
                    />
                    <span className="min-w-0 truncate">{nameOf(stage.toId)}</span>
                  </span>
                  <StageMetricBadges stage={stage} />
                </span>
              </button>
            </Tooltip>
          </li>
        ))}
      </ol>
    </TourSection>
  );
}
