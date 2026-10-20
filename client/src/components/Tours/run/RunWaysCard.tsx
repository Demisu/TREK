import { Layers, Mountain } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from '../../../i18n';
import { SoftPill } from '../../Planner/planParts';
import { Tooltip } from '../../shared/Tooltip';
import { sacPaintKey } from '../bike/bikePaint';
import {
  percent,
  RouteWaysProgress,
  RouteWaysSource,
  ShareBar,
  ShareList,
  SurfaceSection,
  WaySection,
  WaysSection,
} from '../bike/RouteWaySections';
import { sharesBy, unpavedShareOf, type RouteWayEdge, type RouteWays, type SacClass } from '../bike/routeWays';
import { useRouteWays } from '../bike/useRouteWays';
import type { TourPlannerController } from '../planner/useTourPlanner';
import { RailCard } from '../tourParts';

type GradedClass = Exclude<SacClass, 'none'>;

const sacOf = (edge: RouteWayEdge) => edge.sac;

/** The steps from easy to hard, so the hardest one along the route is the last one found. */
const SAC_STEPS: readonly GradedClass[] = ['t1', 't2', 't3', 't4', 't5', 't6'];

/** A hiking grade in the words the hiking limit uses for it, a way without one as unknown. */
function useSacLabel() {
  const { t } = useTranslation();
  return (key: SacClass) => (key === 'none' ? t('tours.bike.trail.none') : t(`tours.planner.difficulty.${key}`));
}

/** The hardest graded step along the route, or null when no way on it carries a grade. */
export function hardestSac(ways: RouteWays): GradedClass | null {
  const found = new Set(ways.edges.filter((edge) => edge.lengthM > 0).map((edge) => edge.sac));
  return [...SAC_STEPS].reverse().find((step) => found.has(step)) ?? null;
}

/**
 * RUN-02: the hiking grades along a run (sac_scale) as OpenStreetMap mappers
 * gave them, by share, each pointing at its stretches on the map. A way
 * without a grade is its own row: unknown, never easy. What the grades are
 * and are not sits behind the info dot, not in a line of its own.
 */
function PathGradeSection({ ways }: { ways: RouteWays }) {
  const { t } = useTranslation();
  const labelOf = useSacLabel();
  const rows = useMemo(() => sharesBy<SacClass>(ways, sacOf), [ways]);
  return (
    <WaysSection
      label={t('tours.run.ways.grade')}
      info={{ label: t('tours.run.ways.gradeInfoLabel'), description: t('tours.run.ways.gradeInfo') }}
    >
      <ShareBar rows={rows} paintOf={sacPaintKey} />
      <ShareList ways={ways} rows={rows} idPrefix="grade" classOf={sacOf} labelOf={labelOf} paintOf={sacPaintKey} />
    </WaysSection>
  );
}

/** The card's head: how much of the run is known to be unpaved, and the hardest graded path on it. */
function RunWaysBadges({ ways }: { ways: RouteWays | null }) {
  const { t } = useTranslation();
  const labelOf = useSacLabel();
  const unpaved = useMemo(() => (ways ? unpavedShareOf(ways) : null), [ways]);
  const hardest = useMemo(() => (ways ? hardestSac(ways) : null), [ways]);
  if (unpaved === null && hardest === null) return null;
  const hardestText = hardest ? t('tours.run.ways.gradeTop', { grade: labelOf(hardest) }) : '';
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
 * RUN-02: what the run being planned runs on: its surfaces, the hiking grades
 * of its paths and its kinds of way, read off the router's description of the
 * route matched on foot. Where the data says nothing the card says unknown,
 * and nothing here grades the run, changes its time or changes the tour.
 */
export function RunWaysCard({ planner }: { planner: RunWaysPlanner }) {
  const { t } = useTranslation();
  const editing = planner.mode.type === 'new-draft' || planner.mode.type === 'edit-saved';
  const state = useRouteWays({
    tripId: planner.tripId,
    active: planner.isRun && editing,
    route: planner.routeCurrent ? planner.route : null,
    matchAs: 'pedestrian',
    withGrades: false,
  });
  const { ways } = state;
  if (!planner.isRun || !editing || state.status === 'idle') return null;
  return (
    <RailCard
      icon={<Layers size={14} strokeWidth={2} />}
      title={t('tours.bike.ways.title')}
      foldId="run-ways"
      aside={<RunWaysBadges ways={ways} />}
    >
      <div data-testid="run-ways-card" className="flex min-w-0 flex-col gap-3">
        <RouteWaysProgress state={state} />
        {ways && (
          <>
            <SurfaceSection ways={ways} />
            <PathGradeSection ways={ways} />
            <WaySection ways={ways} />
            <RouteWaysSource />
          </>
        )}
      </div>
    </RailCard>
  );
}
