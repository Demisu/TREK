import { Mountain } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from '../../../i18n';
import { SoftPill } from '../../Planner/planParts';
import { Tooltip } from '../../shared/Tooltip';
import { percent } from '../bike/RouteWaySections';
import { unpavedShareOf, type RouteWays, type SacClass } from '../bike/routeWays';
import { HikeWaysCard } from '../hike/HikeWaysCard';
import type { TourPlannerController } from '../planner/useTourPlanner';

type GradedClass = Exclude<SacClass, 'none'>;

/** The steps from easy to hard, so the hardest one along the route is the last one found. */
const SAC_STEPS: readonly GradedClass[] = ['t1', 't2', 't3', 't4', 't5', 't6'];

/** The hardest graded step along the route, or null when no way on it carries a grade. */
export function hardestSac(ways: RouteWays): GradedClass | null {
  const found = new Set(ways.edges.filter((edge) => edge.lengthM > 0).map((edge) => edge.sac));
  return [...SAC_STEPS].reverse().find((step) => found.has(step)) ?? null;
}

/**
 * The card's head: how much of the run is known to be unpaved, and the
 * hardest graded path on it, named in the words the hike's trail details use.
 */
function RunWaysBadges({ ways }: { ways: RouteWays | null }) {
  const { t } = useTranslation();
  const unpaved = useMemo(() => (ways ? unpavedShareOf(ways) : null), [ways]);
  const hardest = useMemo(() => (ways ? hardestSac(ways) : null), [ways]);
  if (unpaved === null && hardest === null) return null;
  const hardestText = hardest ? t('tours.run.ways.gradeTop', { grade: t(`tours.hike.sac.${hardest}`) }) : '';
  return (
    <span className="flex flex-none items-center gap-1">
      {unpaved !== null && <SoftPill>{t('tours.bike.ways.unpavedBadge', { share: percent(unpaved) })}</SoftPill>}
      {hardest && (
        <Tooltip label={hardestText}>
          <span data-testid="run-ways-hardest" className="inline-flex">
            <SoftPill icon={<Mountain size={10} strokeWidth={2.2} aria-hidden="true" />}>
              <span aria-hidden="true">{hardest.toUpperCase()}</span>
              <span className="sr-only">{hardestText}</span>
            </SoftPill>
          </span>
        </Tooltip>
      )}
    </span>
  );
}

type RunWaysPlanner = Pick<TourPlannerController, 'tripId' | 'mode' | 'isRun' | 'route' | 'routeCurrent'>;

/**
 * RUN-02: what the run being planned runs on, in the same card a hike shows
 * its trail details in: switched on by the runner, the SAC grade, the surface
 * or the kind of way along the line, drawn on the map in the same colours and
 * named in the same words, the line matched as a run. The head adds what a
 * runner reads first: the unpaved share and the hardest graded path. Nothing
 * here grades the run, changes its time or changes the tour.
 */
export function RunWaysCard({ planner }: { planner: RunWaysPlanner }) {
  const editing = planner.mode.type === 'new-draft' || planner.mode.type === 'edit-saved';
  if (!planner.isRun || !editing) return null;
  return (
    <HikeWaysCard
      tripId={planner.tripId}
      route={planner.route}
      routeCurrent={planner.routeCurrent}
      routingLimit={null}
      matching="run"
      aside={(ways) => <RunWaysBadges ways={ways.routeWays} />}
    />
  );
}
