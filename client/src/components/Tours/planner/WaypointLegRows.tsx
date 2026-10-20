import type { PaddleLayout, PaddleRegionLoadState, TourFixedLeg } from '@trek/shared';
import { Spline } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { useSettingsStore } from '../../../store/settingsStore';
import type { TourFerrataCrossing } from '../../../store/tourFerrataCrossingStore';
import { formatDistance } from '../../../utils/units';
import { FerrataGlyph } from '../../Ferratas/FerrataGlyph';
import { fs } from '../../shared/DialogShell';
import { Tooltip } from '../../shared/Tooltip';
import { PaddleLegFailureRow, PaddleLegNotes } from '../paddle/PaddleLegParts';
import { isRegionLoadPending, regionLoadFailure } from '../paddle/paddleRegionLoad';
import { PaddleRegionLoadRow } from '../paddle/PaddleRegionLoadRow';
import { LockRow, PendingPortageRow, PortageLegRow } from '../paddle/PaddleWaypointParts';
import type { usePaddleRegionLoad } from '../paddle/usePaddleRegionLoad';
import { usePaddleWaypointActions } from '../paddle/usePaddleWaypointActions';
import { usePortageWay, type usePortageRouting } from '../paddle/usePortageRouting';
import type { PaddleLegFailure } from './paddleRouting';
import { lineLengthM } from './tourFixedLegs';
import type { TourPlannerController } from './useTourPlanner';

type WaypointPoint = TourPlannerController['waypoints'][number];

/**
 * A leg drawn by hand, as a badge on that leg in the dashed look the map draws
 * it in: no router planned it, and the badge says so. Its length is the line
 * the user drew, the only measure it has.
 */
function FreeLegRow({ leg }: { leg: TourFixedLeg }) {
  const { t } = useTranslation();
  const unit = useSettingsStore((state) => state.settings.distance_unit);
  // Read as plain numbers: this workspace compiles without strict mode, where the schema's tuples are "maybe two".
  const line = leg.geometry.map(([lat, lng]): [number, number] => [Number(lat), Number(lng)]);
  const distance = formatDistance(lineLengthM(line) / 1000, unit ?? 'metric');
  return (
    <li data-testid="tour-planner-free-leg" className="flex min-w-0 py-0.5 ps-[34px]">
      <Tooltip label={t('tours.planner.freeLegInfo')}>
        <span className="flex h-[26px] w-full min-w-0 items-center gap-1.5 rounded-full border border-dashed border-edge bg-surface-card pe-1 ps-2">
          <Spline size={13} strokeWidth={2} className="flex-none text-content-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-semibold text-content" style={fs(11.5, 'body')}>
            {t('tours.planner.freeLegBadge')}
          </span>
          <span
            className="flex-none rounded-full bg-surface-secondary px-1.5 font-geist tabular-nums leading-[18px] text-content-secondary"
            style={fs(10.5)}
          >
            {distance}
          </span>
        </span>
      </Tooltip>
    </li>
  );
}

/**
 * A via ferrata the route climbs between two waypoints, as a badge on that leg:
 * the ladder, its name, and its grade and length as chips inside, in the
 * ferrata violet the map draws it in.
 */
function FerrataLegRow({ crossing }: { crossing: TourFerrataCrossing }) {
  const { t } = useTranslation();
  const unit = useSettingsStore((state) => state.settings.distance_unit);
  const length = formatDistance((crossing.toM - crossing.fromM) / 1000, unit ?? 'metric');
  return (
    <li
      data-testid="tour-planner-ferrata-leg"
      aria-label={t('tours.ferrata.crossingInfo', { length, name: crossing.name })}
      className="flex min-w-0 py-0.5 ps-[34px]"
    >
      <span className="flex h-[26px] w-full min-w-0 items-center gap-1.5 rounded-full bg-surface-card pe-1 ps-1 shadow-sm ring-1 ring-inset ring-[color:var(--map-ferrata)]">
        <FerrataGlyph size={18} className="flex-none" />
        <span className="min-w-0 flex-1 truncate font-semibold text-content" style={fs(11.5, 'body')}>
          {crossing.name}
        </span>
        {crossing.grade && (
          <span
            className="flex-none rounded-full bg-surface-secondary px-1.5 font-geist font-semibold leading-[18px] text-content-secondary"
            style={fs(10.5)}
          >
            {crossing.grade}
          </span>
        )}
        <span
          className="flex-none rounded-full bg-surface-secondary px-1.5 font-geist tabular-nums leading-[18px] text-content-secondary"
          style={fs(10.5)}
        >
          {length}
        </span>
      </span>
    </li>
  );
}

/**
 * What a paddle tour shows under a waypoint: the portage that starts there,
 * and the lock at it with its times.
 */
function PaddleRowExtras({
  planner,
  point,
  index,
  layout,
  editable,
  routing,
}: {
  planner: TourPlannerController;
  point: TourPlannerController['waypoints'][number];
  index: number;
  layout: PaddleLayout;
  editable: boolean;
  routing: ReturnType<typeof usePortageRouting>;
}) {
  const paddle = usePaddleWaypointActions(planner);
  const way = usePortageWay(planner.waypoints, routing, index);
  const portage = layout.stretches.find((stretch) => stretch.kind === 'portage' && stretch.startIndex === index);
  const lock = point.lock ? layout.locks.find((stop) => stop.index === index) : undefined;
  return (
    <>
      {point.carryNext && <PendingPortageRow disabled={!editable} onRemove={() => paddle.togglePortage(point.id)} />}
      {portage && (
        <PortageLegRow
          lengthM={portage.toM - portage.fromM}
          extraMinutes={portage.extraMinutes}
          disabled={!editable}
          onExtraChange={(minutes) => paddle.setPortageExtra(point.id, minutes)}
          way={point.auto ? undefined : way}
        />
      )}
      {point.lock && (
        <LockRow
          lock={point.lock}
          bypassed={!!lock?.bypassed}
          disabled={!editable}
          onChange={(next) => paddle.setLock(point.id, next)}
        />
      )}
    </>
  );
}

/**
 * A leg the router could not plan. Where it lacked the water data of the
 * region (PAD-11C), the row follows the data instead: loading or asked for,
 * the leg waits calmly; declined, failed or not to be had, it says why.
 */
function LegFailure({
  code,
  load,
  disabled,
  onDrawStraight,
  onRetry,
  onLoadRetry,
}: {
  code: PaddleLegFailure;
  load: PaddleRegionLoadState | undefined;
  disabled: boolean;
  onDrawStraight: () => void;
  onRetry: () => void;
  onLoadRetry: () => void;
}) {
  const { t } = useTranslation();
  if (isRegionLoadPending(load)) {
    return <PaddleRegionLoadRow state={load} disabled={disabled} onDrawStraight={onDrawStraight} />;
  }
  return (
    <PaddleLegFailureRow
      code={code}
      disabled={disabled}
      onDrawStraight={onDrawStraight}
      onRetry={onRetry}
      message={regionLoadFailure(load, t)}
      onLoadRetry={load?.state === 'failed' ? onLoadRetry : undefined}
    />
  );
}

/**
 * The rows under a waypoint for the leg that starts there: the via ferrata it
 * crosses, a line drawn by hand, and on a paddle tour what the router found on
 * the way (PAD-11) or why it could not plan it, plus the portage and lock rows.
 */
export function WaypointLegRows({
  planner,
  point,
  index,
  crossings = [],
  routedLegs,
  paddleLayout,
  editable,
  portageRouting,
  regionLoad,
}: {
  planner: TourPlannerController;
  point: WaypointPoint;
  index: number;
  crossings?: TourFerrataCrossing[];
  routedLegs: TourPlannerController['paddleRoute'] | null;
  paddleLayout: PaddleLayout | null;
  editable: boolean;
  portageRouting: ReturnType<typeof usePortageRouting>;
  regionLoad: ReturnType<typeof usePaddleRegionLoad>;
}) {
  const failure = routedLegs?.failures.find((candidate) => candidate.index === index);
  return (
    <>
      {crossings.map((crossing) => (
        <FerrataLegRow key={`${crossing.id}-${crossing.fromM}`} crossing={crossing} />
      ))}
      {point.fixedLeg?.kind === 'free' && <FreeLegRow leg={point.fixedLeg} />}
      {routedLegs && <PaddleLegNotes leg={routedLegs.legs[index]} />}
      {failure && (
        <LegFailure
          code={failure.code}
          load={regionLoad.byLeg.get(index)}
          disabled={!editable}
          onDrawStraight={() => planner.toggleWaypointFreeLeg(point.id)}
          onRetry={() => planner.recomputeLeg(point.id)}
          onLoadRetry={regionLoad.retry}
        />
      )}
      {paddleLayout && (
        <PaddleRowExtras
          planner={planner}
          point={point}
          index={index}
          layout={paddleLayout}
          editable={editable}
          routing={portageRouting}
        />
      )}
    </>
  );
}
