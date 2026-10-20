import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Loader2,
  MoveHorizontal,
  Route,
  Shuffle,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from '../../../i18n';
import { useSettingsStore } from '../../../store/settingsStore';
import type { DistanceUnit } from '../../../types';
import { formatDistance, formatElevation } from '../../../utils/units';
import { MAP_CARD_GLASS } from '../../Map/mapControlShadow';
import { SoftPill, WhiteBadge } from '../../Planner/planParts';
import { fs } from '../../shared/DialogShell';
import { Tooltip } from '../../shared/Tooltip';
import { TourNotice } from '../tourParts';
import { variantPaintCss } from './legVariantPaint';
import { variantDelta, type LegVariant } from './legVariants';
import { formatTourDuration } from './tourDurationInput';
import { stopNumbersOf } from './tourPlannerWaypoints';
import type { LegComparison } from './useLegVariants';
import type { TourPlannerController } from './useTourPlanner';

type Translate = ReturnType<typeof useTranslation>['t'];

/** A signed difference: a plus for more, a minus sign for fewer, nothing for none worth printing. */
function signed(value: number, format: (absolute: number) => string): string | null {
  const text = format(Math.abs(value));
  if (Math.abs(value) < 1e-9 || /^0\s/.test(text)) return null;
  return `${value > 0 ? '+' : '−'}${text}`;
}

/** An end of the section by name: the stop by its number, else the shaping point it is. */
function endName(stop: number | undefined, t: Translate): string {
  return stop === undefined ? t('tours.planner.shapingPoint') : t('tours.planner.waypointLabel', { n: stop });
}

/**
 * One end of the section, as the waypoint list numbers it: a stop by its
 * number, a shaping point as the small dot it is on the map.
 */
function LegEnd({ stop }: { stop: number | undefined }) {
  if (stop === undefined) {
    return (
      <span className="grid h-5 w-5 flex-none place-items-center" aria-hidden="true">
        <span className="h-2.5 w-2.5 rounded-full bg-content-faint ring-2 ring-surface-card" />
      </span>
    );
  }
  return (
    <span
      className="grid h-5 w-5 flex-none place-items-center rounded-full bg-edge font-geist font-semibold tabular-nums text-content"
      style={fs(10)}
      aria-hidden="true"
    >
      {stop}
    </span>
  );
}

/**
 * The way's mark, the colour it is drawn in on the map: the way taken now on
 * the route's own icon, the others by their letter. The chosen one carries a
 * tick at its corner.
 */
function VariantMark({ variant, chosen }: { variant: LegVariant; chosen: boolean }) {
  return (
    <span
      className="relative grid h-7 w-7 flex-none place-items-center rounded-full font-geist font-bold uppercase shadow-sm"
      // The very colour this way is drawn in on the map: the one link between the row and the line.
      style={{ background: variantPaintCss(variant.key), color: 'var(--bike-highlight-casing)', ...fs(12) }}
      aria-hidden="true"
    >
      {variant.current ? <Route size={14} strokeWidth={2.4} /> : variant.key}
      {chosen && (
        <span className="absolute -bottom-1 -end-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-accent text-accent-text ring-2 ring-surface-card">
          <Check size={9} strokeWidth={3.2} />
        </span>
      )}
    </span>
  );
}

/** A height-bound figure: the value once the heights are in, a turning wheel while they are asked for, else unknown. */
function heightFigure(variant: LegVariant, value: number | null, format: (value: number) => string, t: Translate) {
  if (value !== null) return format(value);
  if (variant.heights === 'pending') {
    return <Loader2 size={10} className="animate-spin" aria-label={t('tours.variants.heightsPending')} />;
  }
  return t('tours.hike.ways.unknown');
}

/** What is known of one way, as the badges every tour card uses: length, climb, descent, walking time. */
function VariantFigures({ variant, unit, t }: { variant: LegVariant; unit: DistanceUnit; t: Translate }) {
  const elevation = (meters: number) => formatElevation(meters, unit);
  const faint = 'flex-none text-content-faint';
  const heightsNote = variant.heights === 'unknown' ? t('tours.variants.heightsUnknown') : '';
  const badges: { key: string; label: string; icon: ReactNode; value: ReactNode }[] = [
    {
      key: 'distance',
      label: t('tours.detail.distance'),
      icon: <MoveHorizontal size={10} strokeWidth={2.2} className={faint} />,
      value: formatDistance(variant.distanceM / 1000, unit),
    },
    {
      key: 'ascent',
      label: heightsNote || t('tours.detail.ascent'),
      icon: <TrendingUp size={10} strokeWidth={2.2} className={faint} />,
      value: heightFigure(variant, variant.gainM, elevation, t),
    },
    {
      key: 'descent',
      label: heightsNote || t('tours.detail.descent'),
      icon: <TrendingDown size={10} strokeWidth={2.2} className={faint} />,
      value: heightFigure(variant, variant.lossM, elevation, t),
    },
    {
      key: 'time',
      label: heightsNote || t('tours.planner.walkingEstimatedInfo'),
      icon: <Clock size={10} strokeWidth={2.2} className={faint} />,
      value: heightFigure(variant, variant.minutes, formatTourDuration, t),
    },
  ];
  return (
    <span className="flex min-w-0 flex-wrap gap-1">
      {badges.map((badge) => (
        <Tooltip key={badge.key} label={badge.label}>
          <span className="inline-flex" data-figure={badge.key}>
            <WhiteBadge icon={badge.icon}>{badge.value}</WhiteBadge>
          </span>
        </Tooltip>
      ))}
    </span>
  );
}

/** How another way differs from the one taken now, in length and time; nothing it cannot say. */
function VariantDelta({
  variant,
  current,
  unit,
  t,
}: {
  variant: LegVariant;
  current: LegVariant;
  unit: DistanceUnit;
  t: Translate;
}) {
  const delta = variantDelta(variant, current);
  const parts = [
    { key: 'distance', Icon: MoveHorizontal, text: signed(delta.distanceM / 1000, (km) => formatDistance(km, unit)) },
    {
      key: 'ascent',
      Icon: TrendingUp,
      text: delta.gainM === null ? null : signed(delta.gainM, (meters) => formatElevation(meters, unit)),
    },
    { key: 'time', Icon: Clock, text: delta.minutes === null ? null : signed(delta.minutes, formatTourDuration) },
  ].filter((part) => part.text !== null);
  if (parts.length === 0) return null;
  return (
    <Tooltip label={t('tours.variants.deltaHint')}>
      <span className="flex flex-wrap gap-1" data-testid="leg-variant-delta">
        {parts.map(({ key, Icon, text }) => (
          <SoftPill key={key} icon={<Icon size={10} strokeWidth={2.2} aria-hidden="true" />}>
            <span className="tabular-nums">{text}</span>
          </SoftPill>
        ))}
      </span>
    </Tooltip>
  );
}

/** One way as a choice in the list: its mark, its figures, and how it differs from the way taken now. */
function VariantRow({
  variant,
  current,
  chosen,
  disabled,
  unit,
  onSelect,
  onHover,
}: {
  variant: LegVariant;
  current: LegVariant;
  chosen: boolean;
  disabled: boolean;
  unit: DistanceUnit;
  onSelect: () => void;
  onHover: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const name = variant.current
    ? t('tours.variants.current')
    : t('tours.variants.option', { letter: variant.key.toUpperCase() });
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      aria-label={name}
      aria-disabled={disabled}
      data-variant={variant.key}
      onClick={() => {
        if (!disabled) onSelect();
      }}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      className={`flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2 text-start transition-colors aria-disabled:cursor-default ${chosen ? 'border-accent bg-surface-card shadow-sm' : 'border-edge-faint bg-surface-secondary hover:border-edge hover:bg-surface-card'}`}
    >
      <VariantMark variant={variant} chosen={chosen} />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-semibold text-content" style={fs(12, 'body')}>
          {name}
        </span>
        <VariantFigures variant={variant} unit={unit} t={t} />
        {!variant.current && <VariantDelta variant={variant} current={current} unit={unit} t={t} />}
      </span>
    </button>
  );
}

/** What the card says besides the ways: that it is asking, that there is nothing to choose, or why a choice changed nothing. */
function ComparisonNotice({ comparison, t }: { comparison: LegComparison; t: Translate }) {
  if (comparison.phase === 'loading') {
    return (
      <TourNotice role="status" icon={<Loader2 size={13} className="animate-spin" aria-hidden="true" />}>
        {t('tours.variants.loading')}
      </TourNotice>
    );
  }
  const warning =
    comparison.notice !== null
      ? t(`tours.variants.notice.${comparison.notice}`)
      : comparison.phase === 'failed'
        ? t('tours.variants.failed')
        : null;
  if (warning) {
    return (
      <TourNotice role="status" tone="warning" icon={<AlertTriangle size={13} aria-hidden="true" />}>
        {warning}
      </TourNotice>
    );
  }
  return comparison.phase === 'none' ? <TourNotice role="status">{t('tours.variants.none')}</TourNotice> : null;
}

/**
 * RTE-02: the ways a routed section of a hike can take, side by side in the
 * look of the other cards over the planner map. Each row is drawn on the map
 * in its colour; pointing at one lights its line up. Choosing one only marks
 * it: the route changes on the button, after the router was asked whether it
 * keeps to that way, and closing leaves everything as it was.
 */
export function LegVariantsCard({
  planner,
  comparison,
  width,
}: {
  planner: Pick<TourPlannerController, 'waypoints' | 'legVariants' | 'canEdit' | 'isSaving'>;
  comparison: LegComparison;
  width?: number;
}) {
  const { t } = useTranslation();
  const unit = useSettingsStore((state) => state.settings.distance_unit) ?? 'metric';
  const { select, hover, apply, close } = planner.legVariants;
  const stops = stopNumbersOf(planner.waypoints);
  const from = stops.get(comparison.leg.fromId);
  const to = stops.get(comparison.leg.toId);
  const current = comparison.variants.find((variant) => variant.current) ?? comparison.variants[0];
  const chosen = comparison.variants.find((variant) => variant.key === comparison.selected);
  const locked = !planner.canEdit || planner.isSaving || comparison.proving;
  const canApply = !!chosen && !chosen.current && !locked;
  return (
    <article
      className={`flex max-h-[70vh] flex-col gap-2.5 overflow-y-auto overscroll-contain rounded-2xl p-3 text-content ${width ? '' : 'w-[min(22rem,calc(100vw_-_2rem))]'}`}
      style={{ ...MAP_CARD_GLASS, width }}
      aria-label={t('tours.variants.title')}
      data-testid="leg-variants-card"
    >
      <div className="flex items-start gap-2">
        <span className="grid h-7 w-7 flex-none place-items-center rounded-full bg-surface-secondary text-content-muted">
          <Shuffle size={14} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-semibold" style={fs(14, 'body')}>
            {t('tours.variants.title')}
          </h3>
          <span
            role="group"
            className="mt-0.5 flex items-center gap-1 text-content-muted"
            aria-label={t('tours.variants.section', { from: endName(from, t), to: endName(to, t) })}
          >
            <LegEnd stop={from} />
            <ArrowRight
              size={12}
              strokeWidth={2.2}
              className="flex-none text-content-faint rtl:-scale-x-100"
              aria-hidden="true"
            />
            <LegEnd stop={to} />
          </span>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label={t('common.close')}
          className="flex-none rounded-lg p-1 text-content-muted hover:bg-surface-hover hover:text-content"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div role="radiogroup" aria-label={t('tours.variants.title')} className="flex flex-col gap-1.5">
        {comparison.variants.map((variant) => (
          <VariantRow
            key={variant.key}
            variant={variant}
            current={current}
            chosen={variant.key === comparison.selected}
            disabled={comparison.proving}
            unit={unit}
            onSelect={() => select(variant.key)}
            onHover={(on) => hover(on ? variant.key : null)}
          />
        ))}
      </div>
      <ComparisonNotice comparison={comparison} t={t} />
      <div className="flex items-center justify-end gap-2 pt-0.5">
        <button
          type="button"
          onClick={close}
          className="inline-flex h-8 items-center rounded-[10px] px-3 font-semibold text-content-muted transition-colors hover:bg-surface-hover hover:text-content"
          style={fs(12, 'body')}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          disabled={!canApply}
          onClick={() => void apply()}
          data-testid="leg-variants-apply"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] bg-accent px-3 font-semibold text-accent-text shadow-sm transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
          style={fs(12, 'body')}
        >
          {comparison.proving ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Check size={14} strokeWidth={2.4} aria-hidden="true" />
          )}
          {comparison.proving ? t('tours.variants.checking') : t('tours.variants.apply')}
        </button>
      </div>
    </article>
  );
}

/**
 * The comparison's card over the planner map, where a via ferrata's or a
 * place's card sits. Unlike those it stays while the map is panned and zoomed,
 * since the map is what the ways are compared on; Escape and its own buttons
 * close it.
 */
export default function LegVariantsOverlay({
  planner,
  insetEnd,
  bottom,
  width,
}: {
  planner: Pick<TourPlannerController, 'waypoints' | 'legVariants' | 'canEdit' | 'isSaving'>;
  insetEnd: number;
  bottom: number;
  width?: number;
}) {
  const { comparison, close } = planner.legVariants;
  const open = comparison !== null;
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, open]);
  if (!comparison) return null;
  return (
    <div
      className="absolute z-[20] flex justify-end transition-[bottom] duration-200 ease-out"
      style={{ insetInlineEnd: insetEnd, bottom, maxWidth: `calc(100% - ${insetEnd + 32}px)` }}
      data-testid="leg-variants-overlay"
    >
      <LegVariantsCard planner={planner} comparison={comparison} width={width} />
    </div>
  );
}
