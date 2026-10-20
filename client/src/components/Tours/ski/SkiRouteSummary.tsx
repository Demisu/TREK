import type { SkiFlag, SkiGeometryPoint, SkiRouteOkLeg, SkiSegmentKind, SkiWhy } from '@trek/shared';
import { Info, MountainSnow } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from '../../../i18n';
import { useSettingsStore } from '../../../store/settingsStore';
import { formatDistance, formatElevation } from '../../../utils/units';
import { fs } from '../../shared/DialogShell';
import type { SkiTourRoute } from '../planner/skiRouting';
import { formatTourDuration } from '../planner/tourDurationInput';
import { RailCard, RailFacts } from '../tourParts';

/** Flags that say a stretch rests on a guess of the map data, not on what is mapped. */
const GUESSED: ReadonlySet<SkiFlag> = new Set([
  'inferred_link',
  'inferred_crossing',
  'dir_from_dem',
  'technique_assumed',
  'area_derived',
  'difficulty_unknown',
]);

/** Stretches ridden on a lift, a funicular or rack railway, or a gondola down. */
const RIDES: ReadonlySet<SkiSegmentKind> = new Set(['lift', 'rail', 'lift_down']);

type Seconds = SkiRouteOkLeg['seconds'];
type Avoided = Extract<SkiWhy, { kind: 'avoided_difficulty' }>;

/** The time of every planned leg, by what it is spent on. */
export function skiSecondsOf(route: SkiTourRoute): Seconds {
  const total: Seconds = { ski: 0, lift: 0, wait: 0, walk: 0 };
  for (const leg of route.legs) {
    if (leg?.status !== 'ok') continue;
    total.ski += leg.seconds.ski;
    total.lift += leg.seconds.lift;
    total.wait += leg.seconds.wait;
    total.walk += leg.seconds.walk;
  }
  return total;
}

/** The height lost along a stretch of a leg's line, counted where its points have a height. */
function descentAlong(geometry: readonly SkiGeometryPoint[], from: number, to: number): number {
  let down = 0;
  let last: number | null = null;
  for (const [, , height] of geometry.slice(from, to + 1)) {
    if (height === null) continue;
    if (last !== null && height < last) down += last - height;
    last = height;
  }
  return down;
}

/** The metres of runs, the height skied down on them, and the lift rides of every planned leg. */
export function skiTallyOf(route: SkiTourRoute): { runsM: number; downM: number; rides: number } {
  const tally = { runsM: 0, downM: 0, rides: 0 };
  for (const leg of route.legs) {
    if (leg?.status !== 'ok') continue;
    for (const segment of leg.segments) {
      if (RIDES.has(segment.kind)) tally.rides += 1;
      if (segment.kind !== 'run') continue;
      tally.runsM += segment.length_m;
      tally.downM += descentAlong(leg.geometry, segment.from, segment.to);
    }
  }
  return tally;
}

/** The harder runs the route kept clear of, and whether any stretch rests on a guess. */
function skiWhyOf(route: SkiTourRoute): { avoided: Avoided[]; guessed: boolean } {
  const why = route.legs.flatMap((leg) => (leg?.status === 'ok' ? leg.why : []));
  return {
    avoided: why.flatMap((entry) => (entry.kind === 'avoided_difficulty' ? [entry] : [])),
    guessed: why.some((entry) => entry.kind === 'flag' && GUESSED.has(entry.flag)),
  };
}

const minutes = (seconds: number) => formatTourDuration(Math.round(seconds / 60));

/** A calm line of the card: what the reader should know, never a warning about snow or safety. */
function Note({ children }: { children: string }) {
  return (
    <p className="m-0 flex min-w-0 items-start gap-1.5 text-content-muted" style={fs(11, 'body')}>
      <Info size={12} strokeWidth={2} className="mt-0.5 flex-none" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** The card the summary sits in, with the piste data build and the credit of the data closing it. */
function SummaryCard({ route, children }: { route: SkiTourRoute; children: ReactNode }) {
  const { t } = useTranslation();
  const credit = route.attribution ?? t('tours.ski.summary.source');
  return (
    <RailCard icon={<MountainSnow size={14} strokeWidth={2} />} title={t('tours.ski.summary.title')} foldId="ski-route">
      <div data-testid="ski-route-summary" className="flex min-w-0 flex-col gap-3">
        {children}
        {route.build && (
          <span className="text-content-faint" style={fs(10.5, 'caption')}>
            {t('tours.ski.summary.build', { build: route.build })}
          </span>
        )}
        <span className="text-content-faint" style={fs(10.5, 'caption')}>
          {[route.areaNames.join(', '), credit].filter(Boolean).join('. ')}
        </span>
      </div>
    </RailCard>
  );
}

/**
 * SKI-02: what the piste router made of a planned ski tour: the time on runs,
 * on lifts, waiting and on foot, the length of the runs, the height skied
 * down on them and the lift rides, the harder runs it kept clear of, and what
 * the reader should weigh: legs it could not plan, stretches that rest on a
 * guess, an older copy of the piste data. The build of the data, the ski
 * areas and the credit of the data close it. A tour opened as it was saved
 * says so, and keeps its line until something of it changes.
 */
export function SkiRouteSummary({ route }: { route: SkiTourRoute | null }) {
  const { t } = useTranslation();
  const unit = useSettingsStore((state) => state.settings.distance_unit) ?? 'metric';
  if (!route) return null;
  if (route.saved) {
    if (route.plannedLegs.length === 0 && !route.build) return null;
    return (
      <SummaryCard route={route}>
        <Note>{t('tours.ski.summary.saved')}</Note>
      </SummaryCard>
    );
  }
  if (route.legs.every((leg) => leg === null)) return null;
  const seconds = skiSecondsOf(route);
  const tally = skiTallyOf(route);
  const { avoided, guessed } = skiWhyOf(route);
  const level = (entry: Avoided) => t(`tours.ski.difficulty.${entry.level}`);
  const facts = [
    { label: t('tours.ski.summary.ski'), value: minutes(seconds.ski) },
    { label: t('tours.ski.summary.lift'), value: minutes(seconds.lift) },
    { label: t('tours.ski.summary.wait'), value: minutes(seconds.wait) },
    { label: t('tours.ski.summary.walk'), value: minutes(seconds.walk) },
    { label: t('tours.ski.summary.runs'), value: formatDistance(tally.runsM / 1000, unit) },
    { label: t('tours.ski.summary.descent'), value: formatElevation(tally.downM, unit) },
    { label: t('tours.ski.summary.lifts'), value: String(tally.rides) },
  ];
  return (
    <SummaryCard route={route}>
      <RailFacts facts={facts} />
      {avoided.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-content-faint" style={fs(10.5, 'body')}>
            {t('tours.ski.summary.avoided')}
          </span>
          <span className="flex flex-wrap gap-1">
            {avoided.map((entry, at) => (
              <span
                key={`${entry.level}-${entry.name ?? at}`}
                className="rounded-full bg-surface-secondary px-2 py-0.5 text-content-secondary"
                style={fs(10.5, 'caption')}
              >
                {entry.name ? `${level(entry)}: ${entry.name}` : level(entry)}
              </span>
            ))}
          </span>
        </div>
      )}
      {route.problems.length > 0 && <Note>{t('tours.ski.summary.unplanned')}</Note>}
      {guessed && <Note>{t('tours.ski.summary.guessed')}</Note>}
      {route.stale && <Note>{t('tours.ski.summary.stale')}</Note>}
    </SummaryCard>
  );
}
