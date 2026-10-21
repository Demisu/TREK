import { ChevronDown, CircleCheck, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useTranslation } from '../../i18n';
import { useTripStore } from '../../store/tripStore';
import { dayLabel } from '../../utils/dayLabel';
import { Tooltip } from '../shared/Tooltip';
import { useAssistantView } from './assistantViewContext';
import {
  buildDayAfter,
  changedDays,
  type DayAfter,
  type DayChange,
  dayIssues,
  stopIssue,
  type TimelineStop,
} from './dayAfterModel';
import { useChangeHover } from './useChangeHover';

/**
 * The days a waiting card touches, as they would read once it ran: per day its
 * date and its stops in order as small named chips, so a glance shows where the
 * suggestion lands among the rest. The details (times, the way between stops,
 * free time, a clash) stay folded away until asked for. Two days at most; the
 * rest are counted. Shown only while the planner holds this trip, since the day
 * plans come from it.
 */

/** Days shown; the rest are counted. */
const MAX_DAYS = 2;
/** Stops shown as chips on a day; the rest are counted. */
const MAX_CHIPS = 6;

const CHIP: Record<TimelineStop['status'], string> = {
  kept: 'border-transparent bg-surface-secondary text-content-muted',
  new: 'border-dashed border-success bg-success-soft text-content',
  removed: 'border-transparent text-content-faint line-through',
};

/** One stop of the day, named; the change it belongs to lights up with it. */
function StopChip({ stop }: { stop: TimelineStop }) {
  const { tripId } = useAssistantView();
  const { lit, handlers } = useChangeHover(tripId, stop.toolCallId);
  const clash = stop.lead?.overlapsWith ? 'border-danger' : stopIssue(stop) ? 'border-warning' : '';
  return (
    <span
      {...(stop.toolCallId ? handlers : {})}
      className={`inline-flex max-w-[11rem] items-center rounded-full border px-2 py-0.5 text-caption transition-colors ${CHIP[stop.status]} ${clash} ${lit ? 'bg-surface-hover' : ''}`}
    >
      <bdi className="truncate">{stop.name}</bdi>
    </span>
  );
}

function Lead({ stop, timed }: { stop: TimelineStop; timed: boolean }) {
  const { t } = useTranslation();
  const lead = stop.lead;
  if (!lead) return null;
  const travel = lead.travelMinutes !== null && lead.travelMinutes > 0;
  if (!travel && lead.freeMinutes === null && !lead.overlapsWith && lead.shortBy === null) return null;
  return (
    <li
      className={`flex flex-wrap items-center gap-x-2 text-caption text-content-faint ${timed ? 'ps-[3.25rem]' : 'ps-1'}`}
    >
      {travel && <span>{t('assistant.change.timeline.travel', { count: lead.travelMinutes ?? 0 })}</span>}
      {lead.freeMinutes !== null && <span>{t('assistant.change.timeline.gap', { count: lead.freeMinutes })}</span>}
      {lead.shortBy !== null && (
        <span className="inline-flex items-center gap-1 font-medium text-warning">
          <TriangleAlert size={11} aria-hidden="true" className="flex-shrink-0" />
          {t('assistant.change.timeline.tight', { count: lead.shortBy })}
        </span>
      )}
      {lead.overlapsWith && (
        <span className="inline-flex items-center gap-1 text-content-muted">
          <TriangleAlert size={11} aria-hidden="true" className="flex-shrink-0 text-danger" />
          <bdi>{t('assistant.change.timeline.overlap', { place: lead.overlapsWith })}</bdi>
        </span>
      )}
    </li>
  );
}

function StopLine({ stop, timed }: { stop: TimelineStop; timed: boolean }) {
  const { t } = useTranslation();
  const { tripId } = useAssistantView();
  const { lit, handlers } = useChangeHover(tripId, stop.toolCallId);
  const removed = stop.status === 'removed';
  return (
    <li
      {...(stop.toolCallId ? handlers : {})}
      className={`flex items-center gap-2 rounded-md px-1 py-0.5 ${lit ? 'bg-surface-hover' : ''}`}
    >
      {timed && (
        <span className="w-10 flex-shrink-0 text-caption tabular-nums text-content-faint">{stop.time ?? ''}</span>
      )}
      <bdi className={`min-w-0 truncate text-caption ${removed ? 'text-content-faint line-through' : 'text-content'}`}>
        {stop.name}
      </bdi>
      {stop.status === 'new' && (
        <span className="flex-shrink-0 rounded-full bg-surface-secondary px-1.5 text-caption text-content-muted">
          {t('assistant.change.timeline.new')}
        </span>
      )}
    </li>
  );
}

function DayRow({ day, label, open }: { day: DayAfter; label: string; open: boolean }) {
  const timed = day.stops.some((s) => s.time !== null);
  const chips = day.stops.slice(0, MAX_CHIPS);
  return (
    <div>
      <bdi className="block truncate text-caption font-medium text-content-muted">{label}</bdi>
      {!open && (
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
          {chips.map((stop) => (
            <StopChip key={stop.key} stop={stop} />
          ))}
          {day.stops.length > MAX_CHIPS && (
            <span className="text-caption tabular-nums text-content-faint">+{day.stops.length - MAX_CHIPS}</span>
          )}
        </div>
      )}
      {open && (
        <ol className="trek-assistant-enter mt-1 space-y-0.5" aria-label={label}>
          {day.stops.map((stop) => (
            <StopGroup key={stop.key} stop={stop} timed={timed} />
          ))}
        </ol>
      )}
    </div>
  );
}

function StopGroup({ stop, timed }: { stop: TimelineStop; timed: boolean }) {
  return (
    <>
      <Lead stop={stop} timed={timed} />
      <StopLine stop={stop} timed={timed} />
    </>
  );
}

export default function AssistantDayBand({ changes }: { changes: readonly DayChange[] }) {
  const { t, locale } = useTranslation();
  const { tripId } = useAssistantView();
  const [open, setOpen] = useState(false);
  const plan = useTripStore(
    useShallow((s) => ({
      here: s.trip?.id === tripId,
      days: s.days,
      assignments: s.assignments,
      places: s.places,
    }))
  );

  const rows = useMemo(() => {
    if (!plan.here || changes.length === 0) return [];
    return changedDays(changes).flatMap((dayId) => {
      const index = plan.days.findIndex((d) => d.id === dayId);
      const day = plan.days[index];
      if (!day) return [];
      const after = buildDayAfter({
        dayId,
        assignments: plan.assignments,
        places: plan.places,
        changes,
        defaultMode: day.default_transport_mode,
      });
      return after.stops.length > 0 ? [{ after, label: dayLabel(day, index, t, locale) }] : [];
    });
  }, [plan, changes, t, locale]);

  if (rows.length === 0) return null;
  const shown = rows.slice(0, MAX_DAYS);
  const issues = rows.reduce((sum, row) => sum + dayIssues(row.after), 0);
  const measured = rows.some((row) => row.after.stops.some((stop) => stop.lead?.travelMinutes != null));
  const toggleLabel = t(open ? 'assistant.change.timeline.hide' : 'assistant.change.timeline.show');
  return (
    <div className="mb-1 flex gap-1.5">
      <div className="min-w-0 flex-1 space-y-1.5">
        {shown.map(({ after, label }) => (
          <DayRow key={after.dayId} day={after} label={label} open={open} />
        ))}
        {rows.length > MAX_DAYS && (
          <p className="text-caption text-content-faint">
            {t('assistant.change.timeline.moreDays', { count: rows.length - MAX_DAYS })}
          </p>
        )}
      </div>
      {(issues > 0 || measured) && (
        // What the check found, at a glance; a tap opens the schedule that says where.
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`inline-flex h-6 flex-shrink-0 items-center gap-1 self-start rounded-full px-2 text-caption font-medium transition-colors ${
            issues > 0 ? 'bg-warning-soft text-warning hover:brightness-95' : 'bg-success-soft text-success'
          }`}
        >
          {issues > 0 ? <TriangleAlert size={12} aria-hidden="true" /> : <CircleCheck size={12} aria-hidden="true" />}
          {issues > 0 ? t('assistant.check.issues', { count: issues }) : t('assistant.check.ok')}
        </button>
      )}
      <Tooltip label={toggleLabel} placement="top">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={toggleLabel}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-content-muted outline-none transition-colors hover:bg-surface-hover hover:text-content focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </Tooltip>
    </div>
  );
}
