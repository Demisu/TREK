import { AlertTriangle, Info, Layers, Loader2, RefreshCw, WifiOff } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from '../../../i18n';
import { useSettingsStore } from '../../../store/settingsStore';
import { useTourRouteHighlightStore } from '../../../store/tourRouteHighlightStore';
import { formatDistance } from '../../../utils/units';
import { SoftPill } from '../../Planner/planParts';
import { fs } from '../../shared/DialogShell';
import type { TourPlannerController } from '../planner/useTourPlanner';
import { CardAction, RailCard, TourNotice } from '../tourParts';
import { bikePaintCss, surfacePaintKey, trailPaintKey, type BikePaintKey } from './bikePaint';
import {
  sharesBy,
  stretchesOf,
  trailClassOf,
  UNPAVED,
  type ClassShare,
  type RouteWayEdge,
  type RouteWays,
  type SurfaceClass,
  type TrailClass,
  type WayClass,
} from './routeWays';
import { useRouteWays, type TrailGrades } from './useRouteWays';

const percent = (share: number) => `${Math.round(share * 100)} %`;

interface ShareRowProps<C extends string> {
  id: string;
  row: ClassShare<C>;
  label: string;
  paint: BikePaintKey;
  /** A dot in the class's colour; a kind of way has none. */
  dot: boolean;
  ways: RouteWays;
  inClass: (edge: RouteWayEdge) => boolean;
}

/**
 * One class of the route: its share and length, and a switch that points at
 * its stretches on the map. Pressed again, or another row pressed, it lets go.
 */
function ShareRow<C extends string>({ id, row, label, paint, dot, ways, inClass }: ShareRowProps<C>) {
  const unit = useSettingsStore((state) => state.settings.distance_unit) ?? 'metric';
  const shown = useTourRouteHighlightStore((state) => state.highlight?.id === id);
  const toggle = () =>
    useTourRouteHighlightStore.getState().show(shown ? null : { id, lines: stretchesOf(ways, inClass), paint });
  return (
    <li>
      <button
        type="button"
        aria-pressed={shown}
        data-testid={`bike-ways-row-${id}`}
        onClick={toggle}
        className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-start hover:bg-surface-tertiary ${shown ? 'bg-surface-tertiary' : ''}`}
      >
        <span
          aria-hidden="true"
          className={`h-2.5 w-2.5 flex-none rounded-full ${dot ? '' : 'border border-edge'}`}
          style={dot ? { background: bikePaintCss(paint) } : undefined}
        />
        <span className="min-w-0 flex-1 truncate text-content" style={fs(12, 'body')}>
          {label}
        </span>
        <span className="flex-none font-geist tabular-nums text-content-faint" style={fs(11)}>
          {formatDistance(row.lengthM / 1000, unit)}
        </span>
        <span className="w-10 flex-none text-end font-geist tabular-nums text-content-secondary" style={fs(11)}>
          {percent(row.share)}
        </span>
      </button>
    </li>
  );
}

/** The shares as one bar, in the classes' colours, so the mix reads at a glance. */
function ShareBar<C extends string>({ rows, paintOf }: { rows: ClassShare<C>[]; paintOf: (key: C) => BikePaintKey }) {
  return (
    <span aria-hidden="true" className="flex h-2 w-full overflow-hidden rounded-full bg-surface-tertiary">
      {rows.map((row) => (
        <span
          key={row.key}
          className="h-full"
          style={{ width: `${row.share * 100}%`, background: bikePaintCss(paintOf(row.key)) }}
        />
      ))}
    </span>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="font-geist font-bold uppercase tracking-[.08em] text-content-faint" style={fs(9.5, 'caption')}>
        {label}
      </span>
      {children}
    </div>
  );
}

function SurfaceSection({ ways }: { ways: RouteWays }) {
  const { t } = useTranslation();
  const rows = useMemo(() => sharesBy<SurfaceClass>(ways, (edge) => edge.surface), [ways]);
  return (
    <Section label={t('tours.bike.ways.surface')}>
      <ShareBar rows={rows} paintOf={surfacePaintKey} />
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((row) => (
          <ShareRow
            key={row.key}
            id={`surface-${row.key}`}
            row={row}
            label={t(`tours.bike.ways.surface.${row.key}`)}
            paint={surfacePaintKey(row.key)}
            dot
            ways={ways}
            inClass={(edge) => edge.surface === row.key}
          />
        ))}
      </ul>
    </Section>
  );
}

function WaySection({ ways }: { ways: RouteWays }) {
  const { t } = useTranslation();
  const rows = useMemo(() => sharesBy<WayClass>(ways, (edge) => edge.way), [ways]);
  return (
    <Section label={t('tours.bike.ways.way')}>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((row) => (
          <ShareRow
            key={row.key}
            id={`way-${row.key}`}
            row={row}
            label={t(`tours.bike.ways.way.${row.key}`)}
            paint="way"
            dot={false}
            ways={ways}
            inClass={(edge) => edge.way === row.key}
          />
        ))}
      </ul>
    </Section>
  );
}

/** BIK-05: the trail grades along a mountain bike tour, downhill and uphill apart, the unknown said. */
function TrailSection({ ways, grades, onRetry }: { ways: RouteWays; grades: TrailGrades; onRetry: () => void }) {
  const { t } = useTranslation();
  const classOf = useMemo(
    () =>
      (edge: RouteWayEdge): TrailClass =>
        edge.wayId !== null && grades.unasked.has(edge.wayId)
          ? 'unasked'
          : trailClassOf(edge.wayId === null ? undefined : grades.byWay.get(edge.wayId)),
    [grades]
  );
  const uphillOf = useMemo(
    () =>
      (edge: RouteWayEdge): string => {
        const step = edge.wayId === null ? null : grades.byWay.get(edge.wayId)?.mtb_scale_uphill;
        return step ? `u${step[0]}` : 'none';
      },
    [grades]
  );
  const rows = useMemo(() => sharesBy<TrailClass>(ways, classOf), [ways, classOf]);
  const uphill = useMemo(() => sharesBy<string>(ways, uphillOf).filter((row) => row.key !== 'none'), [ways, uphillOf]);
  // Nothing could be asked about: said once with a way to ask again, not as a row covering the whole tour.
  const noneAnswered =
    grades.status === 'ready' && grades.byWay.size === 0 && rows.every((row) => row.key === 'unasked');
  const unread = noneAnswered ? 'failed' : grades.status;
  if (unread !== 'ready')
    return (
      <Section label={t('tours.bike.trail.title')}>
        <GradesStatus status={unread} onRetry={onRetry} />
      </Section>
    );
  return (
    <>
      <Section label={t('tours.bike.trail.title')}>
        <ShareBar rows={rows} paintOf={trailPaintKey} />
        <ul className="m-0 flex list-none flex-col p-0">
          {rows.map((row) => (
            <ShareRow
              key={row.key}
              id={`trail-${row.key}`}
              row={row}
              label={t(`tours.bike.trail.${row.key}`)}
              paint={trailPaintKey(row.key)}
              dot
              ways={ways}
              inClass={(edge) => classOf(edge) === row.key}
            />
          ))}
        </ul>
      </Section>
      {uphill.length > 0 && (
        <Section label={t('tours.bike.trail.uphillTitle')}>
          <ul className="m-0 flex list-none flex-col p-0">
            {uphill.map((row) => (
              <ShareRow
                key={row.key}
                id={`uphill-${row.key}`}
                row={row}
                label={t('tours.bike.trail.uphillStep', { step: row.key.slice(1) })}
                paint="way"
                dot={false}
                ways={ways}
                inClass={(edge) => uphillOf(edge) === row.key}
              />
            ))}
          </ul>
        </Section>
      )}
      <span className="text-content-faint" style={fs(11, 'body')}>
        {t('tours.bike.trail.note')}
      </span>
    </>
  );
}

function GradesStatus({ status, onRetry }: { status: Exclude<TrailGrades['status'], 'ready'>; onRetry: () => void }) {
  const { t } = useTranslation();
  if (status === 'loading')
    return (
      <span className="inline-flex items-center gap-1.5 text-content-muted" style={fs(11.5, 'body')}>
        <Loader2 size={12} strokeWidth={2} className="animate-spin" />
        {t('tours.bike.trail.loading')}
      </span>
    );
  return (
    <TourNotice
      tone="warning"
      icon={status === 'offline' ? <WifiOff size={13} strokeWidth={2} /> : <AlertTriangle size={13} strokeWidth={2} />}
    >
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{t(status === 'offline' ? 'tours.bike.ways.offline' : 'tours.bike.trail.failed')}</span>
        {status === 'failed' && (
          <CardAction icon={<RefreshCw size={12} strokeWidth={2} />} onClick={onRetry}>
            {t('common.errorRetry')}
          </CardAction>
        )}
      </span>
    </TourNotice>
  );
}

/** BIK-02: a road bike tour names what of it is known to be unpaved, and points at it on the map. */
function UnpavedNotice({ ways }: { ways: RouteWays }) {
  const { t } = useTranslation();
  const unit = useSettingsStore((state) => state.settings.distance_unit) ?? 'metric';
  const unpaved = ways.edges.filter((edge) => UNPAVED.has(edge.surface)).reduce((sum, edge) => sum + edge.lengthM, 0);
  if (unpaved === 0) return null;
  const show = () =>
    useTourRouteHighlightStore
      .getState()
      .show({ id: 'unpaved', lines: stretchesOf(ways, (edge) => UNPAVED.has(edge.surface)), paint: 'gravel' });
  return (
    <TourNotice tone="warning" icon={<AlertTriangle size={13} strokeWidth={2} />}>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{t('tours.bike.ways.unpavedNotice', { length: formatDistance(unpaved / 1000, unit) })}</span>
        <CardAction icon={<Layers size={12} strokeWidth={2} />} onClick={show}>
          {t('tours.bike.ways.showOnMap')}
        </CardAction>
      </span>
    </TourNotice>
  );
}

/**
 * BIK-01 to BIK-05: what the bike tour being planned runs on, its surfaces and
 * its kinds of way, and on a mountain bike tour the trail grades. Read off the
 * router's description of the route as OpenStreetMap maps it; where the data
 * says nothing the card says unknown. Nothing here changes the tour.
 */
export function BikeWaysCard({ planner }: { planner: TourPlannerController }) {
  const { t } = useTranslation();
  const editing = planner.mode.type === 'new-draft' || planner.mode.type === 'edit-saved';
  const route = planner.routeCurrent ? planner.route : null;
  const state = useRouteWays({
    tripId: planner.tripId,
    active: planner.isBike && editing,
    route,
    profile: planner.bikeProfile,
  });
  const { ways } = state;
  const unpavedShare = useMemo(
    () => (ways ? sharesBy(ways, (edge) => (UNPAVED.has(edge.surface) ? 'unpaved' : 'other')) : []),
    [ways]
  );
  if (!planner.isBike || !editing || state.status === 'idle') return null;
  const unpaved = unpavedShare.find((row) => row.key === 'unpaved');
  return (
    <RailCard
      icon={<Layers size={14} strokeWidth={2} />}
      title={t('tours.bike.ways.title')}
      foldId="bike-ways"
      aside={
        unpaved ? (
          <SoftPill tone="warning">{t('tours.bike.ways.unpavedBadge', { share: percent(unpaved.share) })}</SoftPill>
        ) : undefined
      }
    >
      <div data-testid="bike-ways-card" className="flex min-w-0 flex-col gap-3">
        {state.status === 'loading' && (
          <span className="inline-flex items-center gap-1.5 text-content-muted" style={fs(11.5, 'body')}>
            <Loader2 size={12} strokeWidth={2} className="animate-spin" />
            {t('tours.bike.ways.loading')}
          </span>
        )}
        {state.status === 'offline' && (
          <TourNotice icon={<WifiOff size={13} strokeWidth={2} />}>{t('tours.bike.ways.offline')}</TourNotice>
        )}
        {state.status === 'failed' && (
          <TourNotice tone="warning" icon={<AlertTriangle size={13} strokeWidth={2} />}>
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{t('tours.bike.ways.failed')}</span>
              <CardAction icon={<RefreshCw size={12} strokeWidth={2} />} onClick={state.retry}>
                {t('common.errorRetry')}
              </CardAction>
            </span>
          </TourNotice>
        )}
        {ways && (
          <>
            {planner.bikeProfile === 'road' && <UnpavedNotice ways={ways} />}
            <SurfaceSection ways={ways} />
            <WaySection ways={ways} />
            {state.grades && <TrailSection ways={ways} grades={state.grades} onRetry={state.retry} />}
            <span className="inline-flex gap-1.5 text-content-faint" style={fs(11, 'body')}>
              <Info size={12} strokeWidth={2} className="mt-0.5 flex-none" />
              {t('tours.bike.ways.source')}
            </span>
          </>
        )}
      </div>
    </RailCard>
  );
}
