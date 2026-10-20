import type { SkiFlag, SkiRouteOkLeg, SkiWhy } from '@trek/shared';
import { Info, MountainSnow } from 'lucide-react';
import { useTranslation } from '../../../i18n';
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

/**
 * SKI-02: what the piste router made of a planned ski tour: the time on runs,
 * on lifts, waiting and on foot, the harder runs it kept clear of, and what
 * the reader should weigh: legs it could not plan, stretches that rest on a
 * guess, an older copy of the piste data. The ski areas and the source of the
 * data close it.
 */
export function SkiRouteSummary({ route }: { route: SkiTourRoute | null }) {
  const { t } = useTranslation();
  if (!route || route.legs.every((leg) => leg === null)) return null;
  const seconds = skiSecondsOf(route);
  const { avoided, guessed } = skiWhyOf(route);
  const level = (entry: Avoided) => t(`tours.ski.difficulty.${entry.level}`);
  const facts = [
    { label: t('tours.ski.summary.ski'), value: minutes(seconds.ski) },
    { label: t('tours.ski.summary.lift'), value: minutes(seconds.lift) },
    { label: t('tours.ski.summary.wait'), value: minutes(seconds.wait) },
    { label: t('tours.ski.summary.walk'), value: minutes(seconds.walk) },
  ];
  return (
    <RailCard icon={<MountainSnow size={14} strokeWidth={2} />} title={t('tours.ski.summary.title')} foldId="ski-route">
      <div data-testid="ski-route-summary" className="flex min-w-0 flex-col gap-3">
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
        <span className="text-content-faint" style={fs(10.5, 'caption')}>
          {[route.areaNames.join(', '), t('tours.ski.summary.source')].filter(Boolean).join('. ')}
        </span>
      </div>
    </RailCard>
  );
}
