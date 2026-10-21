import { ChevronDown, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { useTranslation } from '../../i18n';
import { useTripStore } from '../../store/tripStore';
import { dayLabel } from '../../utils/dayLabel';
import { Tooltip } from '../shared/Tooltip';
import { useAssistantView } from './assistantViewContext';
import { buildDayAfter, changedDays, type DayAfter, type DayChange, type TimelineStop } from './dayAfterModel';
import { useChangeHover } from './useChangeHover';

/**
 * The days a waiting card touches, as they would read once it ran: one thin
 * band per day with a block per stop, so a glance shows where the suggestion
 * lands among the rest. The details (times, the way between stops, free time,
 * a clash) stay folded away until asked for. Two days at most; the rest are
 * counted. Shown only while the planner holds this trip, since the day plans
 * come from it.
 */

/** Days drawn as a band; the rest are counted. */
const MAX_DAYS = 2;

const SEGMENT: Record<TimelineStop['status'], string> = {
  kept: 'bg-surface-secondary',
  new: 'border border-dashed border-success bg-success-soft',
  removed: 'border border-edge-faint opacity-50',
};

function Segment({ stop }: { stop: TimelineStop }) {
  const { tripId } = useAssistantView();
  const { lit, handlers } = useChangeHover(tripId, stop.toolCallId);
  const clash = stop.lead?.overlapsWith ? 'ring-1 ring-inset ring-danger' : '';
  return (
    <Tooltip label={stop.name} placement="top">
      <span
        {...(stop.toolCallId ? handlers : {})}
        className={`h-full min-w-[6px] flex-1 rounded-sm transition-shadow ${SEGMENT[stop.status]} ${clash} ${lit ? 'ring-2 ring-inset ring-accent' : ''}`}
      />
    </Tooltip>
  );
}

function Lead({ stop, timed }: { stop: TimelineStop; timed: boolean }) {
  const { t } = useTranslation();
  const lead = stop.lead;
  if (!lead) return null;
  const travel = lead.travelMinutes !== null && lead.travelMinutes > 0;
  if (!travel && lead.freeMinutes === null && !lead.overlapsWith) return null;
  return (
    <li
      className={`flex flex-wrap items-center gap-x-2 text-caption text-content-faint ${timed ? 'ps-[3.25rem]' : 'ps-1'}`}
    >
      {travel && <span>{t('assistant.change.timeline.travel', { count: lead.travelMinutes ?? 0 })}</span>}
      {lead.freeMinutes !== null && <span>{t('assistant.change.timeline.gap', { count: lead.freeMinutes })}</span>}
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
  return (
    <div>
      <div className="flex items-center gap-2">
        <bdi className="w-16 flex-shrink-0 truncate text-caption text-content-muted">{label}</bdi>
        <div className="flex h-6 min-w-0 flex-1 gap-0.5 overflow-hidden" aria-hidden="true">
          {day.stops.map((stop) => (
            <Segment key={stop.key} stop={stop} />
          ))}
        </div>
      </div>
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
  const toggleLabel = t(open ? 'assistant.change.timeline.hide' : 'assistant.change.timeline.show');
  return (
    <div className="mb-1 flex gap-1.5">
      <div className="min-w-0 flex-1 space-y-1.5">
        {shown.map(({ after, label }) => (
          <DayRow key={after.dayId} day={after} label={label} open={open} />
        ))}
        {rows.length > MAX_DAYS && (
          <p className="ps-[4.5rem] text-caption text-content-faint">
            {t('assistant.change.timeline.moreDays', { count: rows.length - MAX_DAYS })}
          </p>
        )}
      </div>
      <Tooltip label={toggleLabel} placement="top">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={toggleLabel}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-hover hover:text-content"
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
