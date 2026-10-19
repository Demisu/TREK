import type { TourListItem, TourTypeKey } from '@trek/shared';
import { ChartColumnBig, ChevronDown, Mountain, Route, Waves } from 'lucide-react';
import { useMemo, useState, type ComponentType } from 'react';
import { useTranslation } from '../../i18n';
import { useSettingsStore } from '../../store/settingsStore';
import { useTripStore } from '../../store/tripStore';
import { formatDistance, formatElevation } from '../../utils/units';
import { fs } from '../shared/DialogShell';
import { InfoDot, RailCard, RailFacts, type TourMetricField } from './tourParts';
import { formatPlannedTourDuration } from './tourPresentation';
import { tourScopeSummary, type ScopeSum, type TourTypeScope } from './tourScope';

type Translate = (key: string, params?: Record<string, unknown>) => string;

const TYPE_ICON: Partial<Record<TourTypeKey, ComponentType<{ size?: number; strokeWidth?: number }>>> = {
  hike: Mountain,
  kayak: Waves,
};

/** Whether the card is folded, kept per browser like other view conveniences; a blocked storage keeps it open. */
const FOLDED_KEY = 'trek.tours.scopeSummary.folded';
function readFolded(): boolean {
  try {
    return localStorage.getItem(FOLDED_KEY) === '1';
  } catch {
    return false;
  }
}
function storeFolded(folded: boolean): void {
  try {
    localStorage.setItem(FOLDED_KEY, folded ? '1' : '0');
  } catch {
    // Private mode or blocked storage: the card simply opens again next time.
  }
}

/** A count as a white badge of the card: the number, then what it counts. */
function CountBadge({ value, label, tone = 'neutral' }: { value: number; label: string; tone?: 'neutral' | 'faint' }) {
  return (
    <span
      className={`inline-flex flex-none items-center gap-1 rounded-full bg-surface-card px-2 py-0.5 shadow-sm ring-1 ring-inset ring-edge-faint ${tone === 'faint' ? 'text-content-muted' : 'text-content-secondary'}`}
      style={fs(11, 'body')}
    >
      <span className="font-geist font-semibold tabular-nums text-content">{value}</span>
      {label}
    </span>
  );
}

/**
 * A sum as a fact: nothing when no tour has the value, else the sum, marked as
 * at least that much with the reason in its info dot when some tours lack it.
 */
function sumFact(
  label: string,
  sum: ScopeSum,
  format: (value: number) => string,
  t: Translate
): TourMetricField | null {
  if (sum.value === null) return null;
  const partial = sum.known < sum.of;
  return {
    label,
    value: partial ? `≥ ${format(sum.value)}` : format(sum.value),
    info: partial
      ? {
          label: t('tours.scope.partial'),
          description: t('tours.scope.partialBody', { known: sum.known, of: sum.of }),
        }
      : undefined,
  };
}

function typeFacts(scope: TourTypeScope, unit: Parameters<typeof formatDistance>[1], t: Translate): TourMetricField[] {
  const distance = (km: number) => formatDistance(km, unit);
  const height = (m: number) => formatElevation(m, unit);
  return [
    sumFact(t('tours.detail.distance'), scope.distanceKm, distance, t),
    sumFact(t('tours.detail.ascent'), scope.ascentM, height, t),
    sumFact(t('tours.detail.descent'), scope.descentM, height, t),
    sumFact(t('tours.scope.routed'), scope.routedMinutes, formatPlannedTourDuration, t),
    sumFact(t('tours.scope.imported'), scope.importedMinutes, formatPlannedTourDuration, t),
    sumFact(t('tours.scope.planned'), scope.plannedMinutes, formatPlannedTourDuration, t),
  ].filter((fact): fact is TourMetricField => fact !== null);
}

/** One tour type: its name with how many tours and how many are on a day, then its sums. */
function TypeScope({ scope }: { scope: TourTypeScope }) {
  const { t } = useTranslation();
  const unit = useSettingsStore((state) => state.settings.distance_unit) ?? 'metric';
  const Icon = TYPE_ICON[scope.type] ?? Route;
  const facts = typeFacts(scope, unit, t);
  return (
    <section
      aria-label={t(`tourTypes.${scope.type}`)}
      className="flex flex-col gap-2.5"
      data-testid={`tour-scope-${scope.type}`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="grid h-4 w-4 flex-none place-items-center text-content-muted">
          <Icon size={13} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 truncate font-semibold text-content" style={fs(12, 'body')}>
          {t(`tourTypes.${scope.type}`)}
        </span>
        <span className="font-geist tabular-nums text-content-faint" style={fs(11)}>
          {scope.count}
        </span>
      </div>
      {facts.length > 0 ? (
        <RailFacts facts={facts} />
      ) : (
        <p className="m-0 text-content-faint" style={fs(11.5, 'body')}>
          {t('tours.scope.noMeasures')}
        </p>
      )}
    </section>
  );
}

/**
 * STA-01: what the trip's tours add up to, above their list, by type: how many,
 * how many are on a day, distance, ascent and descent, and the three kinds of
 * time apart (the router's, an import's, the planned one with breaks), never
 * added up across types. It reads the list as filtered, so a type chosen in the
 * filter narrows both. A value no tour has is left out rather than shown as
 * zero; a sum some tours lack is marked as at least that much. Folding it is
 * remembered in this browser.
 */
export function TourScopeSummary({ tours }: { tours: readonly TourListItem[] }) {
  const { t } = useTranslation();
  const [folded, setFolded] = useState(readFolded);
  // On a day as the day lists say, not the list's flag, so a tour put on a day counts at once (as its row's badge does).
  const assignments = useTripStore((state) => state.assignments);
  const scope = useMemo(() => {
    const onDays = new Set(Object.values(assignments ?? {}).flatMap((list) => list.map((item) => item.place_id)));
    return tourScopeSummary(tours, (tour) => onDays.has(tour.place_id));
  }, [assignments, tours]);
  if (scope.count === 0) return null;
  const toggle = () => {
    setFolded((value) => {
      storeFolded(!value);
      return !value;
    });
  };
  const toggleLabel = folded ? t('common.expand') : t('common.collapse');
  return (
    <RailCard
      icon={<ChartColumnBig size={14} strokeWidth={2} />}
      title={t('tours.scope.title')}
      aside={
        <span className="flex flex-none items-center gap-0.5">
          <InfoDot label={t('tours.scope.title')} description={t('tours.scope.info')} />
          <button
            type="button"
            onClick={toggle}
            aria-expanded={!folded}
            aria-label={toggleLabel}
            data-testid="tour-scope-toggle"
            className="grid h-6 w-6 place-items-center rounded-full text-content-faint transition-colors hover:bg-surface-hover hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <ChevronDown size={14} strokeWidth={2.2} className={`transition-transform ${folded ? '' : 'rotate-180'}`} />
          </button>
        </span>
      }
    >
      <div className="flex flex-wrap items-center gap-1.5" data-testid="tour-scope-counts">
        <CountBadge value={scope.count} label={t('tours.mode.tours')} />
        <CountBadge value={scope.onDays} label={t('places.planned')} tone="faint" />
        <CountBadge value={scope.count - scope.onDays} label={t('places.unplanned')} tone="faint" />
      </div>
      {!folded && (
        <div className="mt-3.5 flex flex-col gap-4 border-t border-edge-faint pt-3.5">
          {scope.types.map((typeScope) => (
            <TypeScope key={typeScope.type} scope={typeScope} />
          ))}
        </div>
      )}
    </RailCard>
  );
}
