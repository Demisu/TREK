import { Info, MountainSnow, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { useSettingsStore } from '../../../store/settingsStore';
import { formatDistance } from '../../../utils/units';
import { SoftPill } from '../../Planner/planParts';
import ToggleSwitch from '../../Settings/ToggleSwitch';
import { fs } from '../../shared/DialogShell';
import { Tooltip } from '../../shared/Tooltip';
import { bikePaintCss } from '../bike/bikePaint';
import { FigureBadge } from '../paddle/FigureBadge';
import { ReadStatusNotice } from '../ReadStatusNotice';
import { RailCard } from '../tourParts';
import { hikePaintCss } from './hikePaint';
import { isSacStep, sacStepOfClass, type SacClass } from './sacGrades';
import { useSacGrades, type SacGradeRow, type SacGrades } from './useSacGrades';

const percent = (share: number) => `${Math.round(share * 100)} %`;
const stepName = (step: number) => `T${step}`;

/** The colour a class is drawn in on the map, as a CSS variable: the step's own, the grey of the unknown otherwise. */
const paintOf = (key: SacClass) => (isSacStep(key) ? hikePaintCss(key) : bikePaintCss('unknown'));

/** A grade as a small white chip: a dot in its map colour and the step, or a question mark for the unknown. */
function GradeChip({ grade }: { grade: SacClass }) {
  const step = sacStepOfClass(grade);
  return (
    <span className="inline-flex h-[18px] w-[34px] flex-none items-center justify-center gap-1 rounded-full bg-surface-card font-geist font-semibold tabular-nums text-content shadow-sm ring-1 ring-inset ring-edge-faint">
      <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full" style={{ background: paintOf(grade) }} />
      <span className={step === null ? 'text-content-faint' : ''} style={fs(10.5)}>
        {step === null ? '?' : stepName(step)}
      </span>
    </span>
  );
}

/** Where a row's grade comes from, said in its tooltip: the scale and the tag, or why it is unknown. */
function useRowSource(row: SacGradeRow): string {
  const { t } = useTranslation();
  const step = sacStepOfClass(row.key);
  if (step !== null) return t('tours.hike.sac.stepTip', { step: stepName(step), tag: row.tags[0] ?? '' });
  if (row.key === 'untagged') return t('tours.hike.sac.untaggedTip');
  if (row.key === 'unclear') return t('tours.hike.sac.unclearTip', { tags: row.tags.join(', ') });
  if (row.key === 'unmatched') return t('tours.hike.sac.unmatchedTip');
  return '';
}

/**
 * One class of the hike: its chip, its name, how far and how much of the
 * route it covers. Pressed, the map draws its stretches alone; pressed again,
 * every grade again.
 */
function GradeRow({ row, grades, limit }: { row: SacGradeRow; grades: SacGrades; limit: number | null }) {
  const { t } = useTranslation();
  const unit = useSettingsStore((state) => state.settings.distance_unit) ?? 'metric';
  const source = useRowSource(row);
  const step = sacStepOfClass(row.key);
  const pressed = grades.focus === row.key;
  return (
    <li>
      <Tooltip label={source} disabled={!source} placement="top">
        <button
          type="button"
          aria-pressed={pressed}
          data-testid={`sac-row-${row.key}`}
          onClick={() => grades.focusOn(row.key)}
          className={`flex w-full min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-start transition-colors hover:bg-surface-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${pressed ? 'bg-surface-tertiary' : ''}`}
        >
          <GradeChip grade={row.key} />
          <span
            className={`min-w-0 flex-1 truncate ${step === null ? 'text-content-muted' : 'text-content'}`}
            style={fs(12, 'body')}
          >
            {t(`tours.hike.sac.${row.key}`)}
          </span>
          {step !== null && limit !== null && step > limit && (
            <SoftPill tone="warning">{t('tours.hike.sac.aboveLimit')}</SoftPill>
          )}
          <span className="flex-none font-geist tabular-nums text-content-faint" style={fs(11)}>
            {formatDistance(row.lengthM / 1000, unit)}
          </span>
          <span className="w-10 flex-none text-end font-geist tabular-nums text-content-secondary" style={fs(11)}>
            {percent(row.share)}
          </span>
        </button>
      </Tooltip>
    </li>
  );
}

/** The classes as one bar along the route's length, in the map's colours, so the mix reads at a glance. */
function GradeBar({ rows }: { rows: SacGradeRow[] }) {
  return (
    <span aria-hidden="true" className="flex h-2 w-full overflow-hidden rounded-full bg-surface-tertiary">
      {rows.map((row) => (
        <span key={row.key} className="h-full" style={{ width: `${row.share * 100}%`, background: paintOf(row.key) }} />
      ))}
    </span>
  );
}

/**
 * What is known at a glance: how much of the route has a grade, the highest
 * one, and apart from them, marked as a setting, the routing limit the hike
 * was planned with, which says nothing about the ways themselves.
 */
function GradeSummary({ grades, limit }: { grades: SacGrades; limit: number | null }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FigureBadge
        label={t('tours.hike.sac.known')}
        value={percent(grades.knownShare)}
        info={t('tours.hike.sac.knownTip')}
        testId="sac-known"
      />
      {grades.highest !== null && (
        <FigureBadge label={t('tours.hike.sac.highest')} value={stepName(grades.highest)} testId="sac-highest" />
      )}
      {limit !== null && (
        <FigureBadge
          label={t('tours.hike.sac.routingLimit')}
          value={stepName(limit)}
          icon={<SlidersHorizontal size={10} strokeWidth={2.2} className="flex-none text-content-faint" />}
          info={t('tours.hike.sac.routingLimitTip')}
          testId="sac-routing-limit"
        />
      )}
    </div>
  );
}

function GradeList({ grades, limit }: { grades: SacGrades; limit: number | null }) {
  const { t } = useTranslation();
  const known = grades.rows.filter((row) => isSacStep(row.key));
  const unknown = grades.rows.filter((row) => !isSacStep(row.key));
  return (
    <>
      <GradeSummary grades={grades} limit={limit} />
      <GradeBar rows={grades.rows} />
      {known.length > 0 && (
        <ul className="m-0 flex list-none flex-col p-0">
          {known.map((row) => (
            <GradeRow key={row.key} row={row} grades={grades} limit={limit} />
          ))}
        </ul>
      )}
      {unknown.length > 0 && (
        <div className="flex min-w-0 flex-col gap-1">
          <span
            className="font-geist font-bold uppercase tracking-[.08em] text-content-faint"
            style={fs(9.5, 'caption')}
          >
            {t('tours.hike.sac.unknown')}
          </span>
          <ul className="m-0 flex list-none flex-col p-0">
            {unknown.map((row) => (
              <GradeRow key={row.key} row={row} grades={grades} limit={limit} />
            ))}
          </ul>
        </div>
      )}
      <span className="inline-flex gap-1.5 text-content-faint" style={fs(11, 'body')}>
        <Info size={12} strokeWidth={2} className="mt-0.5 flex-none" />
        {t('tours.hike.sac.source')}
      </span>
    </>
  );
}

/**
 * MAP-03: the SAC grades along a hike, on the traveller's word. Switched on,
 * the grades OpenStreetMap gives the ways under the line are read and drawn
 * along it on the map, each class with its share; the unknown stays unknown
 * and says why. The routing limit, where the hike was planned with one, sits
 * apart as the setting it is. Nothing here changes the tour.
 */
export function SacGradesCard({
  tripId,
  route,
  routeCurrent = true,
  routingLimit,
}: {
  tripId: number | string;
  /** The tour's own line, or null while there is none. */
  route: [number, number][] | null;
  /** False while the line is being planned anew. */
  routeCurrent?: boolean;
  /** The routing limit the hike is planned with, or null where it was not routed (an import). */
  routingLimit: number | null;
}) {
  const { t } = useTranslation();
  const grades = useSacGrades({ tripId, route, current: routeCurrent });
  if (!grades.available) return null;
  return (
    <RailCard icon={<MountainSnow size={14} strokeWidth={2} />} title={t('tours.hike.sac.title')} foldId="hike-sac">
      <div data-testid="sac-grades-card" className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="min-w-0 flex-1 text-content-secondary" style={fs(12, 'body')}>
            {t('tours.hike.sac.show')}
          </span>
          <ToggleSwitch on={grades.shown} onToggle={grades.toggle} label={t('tours.hike.sac.show')} />
        </div>
        {grades.shown && (
          <ReadStatusNotice
            status={grades.status}
            messages={{
              loading: t('tours.hike.sac.loading'),
              offline: t('tours.hike.sac.offline'),
              failed: t('tours.hike.sac.failed'),
            }}
            onRetry={grades.retry}
          />
        )}
        {grades.shown && grades.status === 'ready' && <GradeList grades={grades} limit={routingLimit} />}
      </div>
    </RailCard>
  );
}
