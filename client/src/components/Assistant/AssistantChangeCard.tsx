import type { AssistantApplied, AssistantChangePreview, AssistantChangeVerbKey } from '@trek/shared';
import {
  CalendarArrowUp,
  CalendarMinus,
  CalendarPlus,
  Check,
  CircleSlash,
  ListTodo,
  LoaderCircle,
  Luggage,
  MapPin,
  MapPinPlus,
  NotebookPen,
  PencilLine,
  Plus,
  StickyNote,
  Ticket,
  Trash2,
  TriangleAlert,
  Undo2,
  Wallet,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';

import { useTranslation } from '../../i18n';
import { blockKeyOf } from '../../store/assistantMapModel';
import { chatOf, useAssistantStore } from '../../store/assistantStore';
import { useTripStore } from '../../store/tripStore';
import ToggleSwitch from '../Settings/ToggleSwitch';
import { useToast } from '../shared/Toast';
import { Tooltip } from '../shared/Tooltip';
import AssistantChangeFields from './AssistantChangeFields';
import AssistantCompareSwitch from './AssistantCompareSwitch';
import AssistantDayBand from './AssistantDayBand';
import AssistantWeekOverview from './AssistantWeekOverview';
import { type ChangeItem, type ChangeState, undoLeftMs } from './assistantParts';
import { useAssistantView } from './assistantViewContext';
import { changePoints, type DayChange } from './dayAfterModel';
import { useChangeHover } from './useChangeHover';
import { useWeekDays } from './useWeekDays';

/**
 * The changes the assistant proposes in one go, as one card in plain words:
 * what happens to which place, note or item, field by field. Nothing is
 * written before the user applies it. Each change keeps its own decision, so
 * when the card holds several, each has a switch and the button applies the
 * ones left on. Once decided, the card turns into a receipt per change, with
 * a way to the change on the map and, for a while, undo.
 *
 * Every change wears its kind: a tinted tile with the icon of what it touches
 * and a badge naming the verb, in the tone of what happens (green adds, blue
 * changes, amber moves, red takes away). Its fields sit as badges holding a
 * label badge, so a row of them reads at a glance.
 *
 * While it waits, the card shows the days it touches as they would read
 * afterwards, and each row lights its pin on the map (and the pin its row).
 * Once applied, the head offers the plan before and after the block on the
 * map, and taking the whole block back at once.
 */

type Tone = 'success' | 'info' | 'warning' | 'danger';

const TILE: Record<Tone, string> = {
  success: 'bg-success-soft text-success',
  info: 'bg-info-soft text-info',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/** What each kind of change looks like. A table, so a new verb fails to compile until it has a look. */
const VERB_LOOK: Record<AssistantChangeVerbKey, { Icon: typeof Check; tone: Tone }> = {
  addPlace: { Icon: MapPinPlus, tone: 'success' },
  addPlaceToDay: { Icon: CalendarPlus, tone: 'success' },
  updatePlace: { Icon: PencilLine, tone: 'info' },
  assignPlace: { Icon: CalendarPlus, tone: 'success' },
  moveAssignment: { Icon: CalendarArrowUp, tone: 'warning' },
  removeFromDay: { Icon: CalendarMinus, tone: 'danger' },
  addDayNote: { Icon: StickyNote, tone: 'success' },
  updateDayNote: { Icon: StickyNote, tone: 'info' },
  addPackingItem: { Icon: Luggage, tone: 'success' },
  updatePackingItem: { Icon: Luggage, tone: 'info' },
  addTodo: { Icon: ListTodo, tone: 'success' },
  addBudgetItem: { Icon: Wallet, tone: 'success' },
  updateBudgetItem: { Icon: Wallet, tone: 'info' },
  addReservation: { Icon: Ticket, tone: 'success' },
  importBooking: { Icon: Ticket, tone: 'success' },
  rememberNote: { Icon: NotebookPen, tone: 'info' },
  genericCreate: { Icon: Plus, tone: 'success' },
  genericUpdate: { Icon: PencilLine, tone: 'info' },
  genericRemove: { Icon: Trash2, tone: 'danger' },
};

/** How a decided change reads: one quiet mark, its words in the tooltip. */
const RECEIPT: Record<Exclude<ChangeState, 'pending'>, { labelKey: string; Icon: typeof Check; tone: string }> = {
  applying: { labelKey: 'assistant.change.applying', Icon: LoaderCircle, tone: 'text-content-muted' },
  applied: { labelKey: 'assistant.change.applied', Icon: Check, tone: 'text-success' },
  failed: { labelKey: 'assistant.change.failed', Icon: TriangleAlert, tone: 'text-danger' },
  discarded: { labelKey: 'assistant.change.discarded', Icon: CircleSlash, tone: 'text-content-faint' },
  expired: { labelKey: 'assistant.change.expired', Icon: CircleSlash, tone: 'text-content-faint' },
};

const ICON_BUTTON =
  'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-hover hover:text-content disabled:opacity-50';

function KindTile({
  verbKey,
  size = 'md',
  dimmed = false,
}: {
  verbKey: AssistantChangeVerbKey | null;
  size?: 'sm' | 'md';
  dimmed?: boolean;
}) {
  const box = size === 'sm' ? 'h-7 w-7 rounded-md' : 'h-8 w-8 rounded-lg';
  if (!verbKey) return <span className={`trek-skeleton flex-shrink-0 ${box}`} aria-hidden="true" />;
  const { Icon, tone } = VERB_LOOK[verbKey];
  return (
    <span
      aria-hidden="true"
      className={`flex flex-shrink-0 items-center justify-center ${box} ${dimmed ? 'bg-surface-secondary text-content-faint' : TILE[tone]}`}
    >
      <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2.1} />
    </span>
  );
}

/** The verb as a quiet line over the name of what it touches. */
function ChangeHead({ preview, struck = false }: { preview: AssistantChangePreview | null; struck?: boolean }) {
  const { t } = useTranslation();
  if (!preview) return <span className="trek-skeleton inline-block h-4 w-40" aria-hidden="true" />;
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex min-w-0 items-center gap-1.5 text-caption text-content-muted">
        <span className="truncate">{t(`assistant.change.verb.${preview.verbKey}`)}</span>
        {preview.domain && (
          // Where in TREK a change outside the trip plan lands: the vacation planner, the journal.
          <span className="flex-shrink-0 rounded-full bg-surface-secondary px-1.5 font-medium text-content-secondary">
            {t(`assistant.domain.${preview.domain}`)}
          </span>
        )}
      </span>
      <bdi className={`truncate text-body font-semibold text-content ${struck ? 'line-through' : ''}`}>
        {preview.subject}
      </bdi>
    </span>
  );
}

/** The time now, ticking once more when the next undo window closes. */
function useUndoClock(items: ChangeItem[]): number {
  const [now, setNow] = useState(() => Date.now());
  const next = Math.min(...items.map((i) => undoLeftMs(i.applied, now)).filter((ms) => ms > 0));
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => setNow(Date.now()), next + 50);
    return () => window.clearTimeout(timer);
  }, [next]);
  return now;
}

/** Whether an applied change can still be taken back now. */
function undoableNow(item: ChangeItem, undone: Readonly<Record<string, true>>, now: number): boolean {
  return (
    item.state === 'applied' &&
    !undone[item.toolCallId] &&
    !!item.preview?.undoable &&
    undoLeftMs(item.applied, now) > 0
  );
}

/** The waiting changes the user left on that touch the day plan. */
function dayChangesOf(items: readonly ChangeItem[], excluded: ReadonlySet<string>): DayChange[] {
  return items.flatMap((i) =>
    i.state === 'pending' && i.preview?.effect && !excluded.has(i.toolCallId)
      ? [{ toolCallId: i.toolCallId, effect: i.preview.effect, subject: i.preview.subject }]
      : []
  );
}

/** What an applied change can be shown as on the map; a kept note, a todo or an expense has no place there. */
const ON_MAP: ReadonlySet<AssistantApplied['entity']> = new Set(['place', 'assignment', 'day_note', 'reservation']);

function Receipt({
  item,
  undone,
  canUndo,
  onUndo,
}: {
  item: ChangeItem;
  undone: boolean;
  canUndo: boolean;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const { onShowOnMap } = useAssistantView();
  if (item.state === 'pending') return null;
  const receipt = undone ? RECEIPT.discarded : RECEIPT[item.state];
  const { Icon } = receipt;
  const applied = item.state === 'applied' && !undone ? item.applied : null;
  const mappable = applied !== null && ON_MAP.has(applied.entity);
  const settled = item.state === 'discarded' || item.state === 'expired' || undone;
  const statusLabel = t(undone ? 'assistant.change.undone' : receipt.labelKey);
  return (
    <div className="trek-assistant-enter flex items-center gap-2.5 py-1.5">
      <KindTile verbKey={item.preview?.verbKey ?? null} size="sm" dimmed={settled} />
      <div className={`min-w-0 flex-1 ${settled ? 'opacity-60' : ''}`}>
        <ChangeHead preview={item.preview} struck={settled} />
      </div>
      {applied && mappable && onShowOnMap && (
        <Tooltip label={t('assistant.change.showOnMap')} placement="top">
          <button
            type="button"
            onClick={() => onShowOnMap(applied)}
            aria-label={t('assistant.change.showOnMap')}
            className={ICON_BUTTON}
          >
            <MapPin size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      )}
      {canUndo && (
        <Tooltip label={t('assistant.change.undo')} placement="top">
          <button type="button" onClick={onUndo} aria-label={t('assistant.change.undo')} className={ICON_BUTTON}>
            <Undo2 size={14} aria-hidden="true" />
          </button>
        </Tooltip>
      )}
      <Tooltip label={statusLabel} placement="top">
        <span
          role="img"
          aria-label={statusLabel}
          className={`flex h-7 w-5 items-center justify-center ${receipt.tone}`}
        >
          <Icon size={15} strokeWidth={2.4} className={item.state === 'applying' ? 'animate-spin' : ''} />
        </span>
      </Tooltip>
    </div>
  );
}

/** A change waiting for its decision; resting on it lights its pin on the map. */
function PendingRow({
  item,
  excluded,
  withSwitch,
  disabled,
  onToggle,
}: {
  item: ChangeItem;
  excluded: boolean;
  withSwitch: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const { tripId } = useAssistantView();
  const { litFromMap, handlers } = useChangeHover(tripId, item.preview?.effect ? item.toolCallId : null);
  return (
    <div
      {...handlers}
      className={`-mx-1.5 flex gap-2.5 rounded-lg px-1.5 py-2.5 transition-[opacity,background-color] ${
        excluded ? 'opacity-45' : ''
      } ${litFromMap ? 'bg-surface-hover' : ''}`}
    >
      <KindTile verbKey={item.preview?.verbKey ?? null} />
      <div className="min-w-0 flex-1">
        <ChangeHead preview={item.preview} />
        {item.preview && <AssistantChangeFields rows={item.preview.rows} />}
      </div>
      {withSwitch && (
        <ToggleSwitch on={!excluded} onToggle={onToggle} label={t('assistant.change.include')} disabled={disabled} />
      )}
    </div>
  );
}

/** The card's head: what the card is, what can be done with it as a whole, and how many changes it holds. */
function CardHead({ open, count, actions }: { open: boolean; count: number; actions?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="mb-1 flex min-h-7 items-center gap-2">
      <span className="min-w-0 flex-1 truncate text-caption font-semibold text-content-secondary">
        {t(open ? 'assistant.change.title' : 'assistant.change.doneTitle')}
      </span>
      {actions}
      <span className="text-caption tabular-nums text-content-faint">{count}</span>
    </div>
  );
}

/** On the phone the map hides behind the chat: this shrinks the chat and frames what the card would change. */
function ViewOnMapButton({ changes }: { changes: readonly DayChange[] }) {
  const { t } = useTranslation();
  const { tripId } = useAssistantView();
  const requestCamera = useAssistantStore((s) => s.requestCamera);
  const setMinimized = useAssistantStore((s) => s.setMinimized);
  const show = () => {
    const { assignments, places } = useTripStore.getState();
    requestCamera(tripId, changePoints(changes, assignments, places), 'fit', 'user');
    setMinimized(true);
  };
  return (
    <Tooltip label={t('assistant.change.viewOnMap')} placement="top">
      <button type="button" onClick={show} aria-label={t('assistant.change.viewOnMap')} className={ICON_BUTTON}>
        <MapPin size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

/** Takes back every change of the block that still can be, the last one first, and says how it went. */
function UndoAllButton({ toolCallIds }: { toolCallIds: readonly string[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { tripId } = useAssistantView();
  const undoBlock = useAssistantStore((s) => s.undoBlock);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { done, stale, failed } = await undoBlock(tripId, toolCallIds);
      if (failed > 0) toast.error(t('assistant.change.undoAllFailed', { count: failed }));
      else if (stale > 0) toast.warning(t('assistant.change.undoAllPartial', { done, stale }));
      else toast.success(t('assistant.change.undoneAll', { count: done }));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Tooltip label={t('assistant.change.undoAll')} placement="top">
      <button
        type="button"
        disabled={busy}
        onClick={() => void run()}
        aria-label={t('assistant.change.undoAll')}
        className={ICON_BUTTON}
      >
        {busy ? (
          <LoaderCircle size={14} aria-hidden="true" className="animate-spin" />
        ) : (
          <Undo2 size={14} aria-hidden="true" />
        )}
      </button>
    </Tooltip>
  );
}

/** What the head offers: on a waiting card the way to the map on the phone, on a receipt the block as a whole. */
function HeadActions({
  open,
  items,
  changes,
  undoable,
}: {
  open: boolean;
  items: readonly ChangeItem[];
  changes: readonly DayChange[];
  undoable: readonly string[];
}) {
  const { tripId, variant, onShowOnMap } = useAssistantView();
  const here = useTripStore((s) => s.trip?.id === tripId);
  if (open) {
    const toMap = variant === 'fullscreen' && !!onShowOnMap && here && changes.length > 0;
    return toMap ? <ViewOnMapButton changes={changes} /> : null;
  }
  return (
    <>
      {onShowOnMap && <AssistantCompareSwitch tripId={tripId} blockKey={blockKeyOf(items.map((i) => i.toolCallId))} />}
      {undoable.length >= 2 && <UndoAllButton toolCallIds={undoable} />}
    </>
  );
}

export default function AssistantChangeCard({ items }: { items: ChangeItem[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { tripId } = useAssistantView();
  const isRunning = useAssistantStore((s) => chatOf(s, tripId).isRunning);
  const undone = useAssistantStore((s) => chatOf(s, tripId).undone);
  const decide = useAssistantStore((s) => s.decide);
  const undo = useAssistantStore((s) => s.undo);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const now = useUndoClock(items);

  const pending = items.filter((i) => i.state === 'pending');
  const chosen = pending.filter((i) => !excluded.has(i.toolCallId)).length;
  const changes = useMemo(() => dayChangesOf(items, excluded), [items, excluded]);
  const undoable = items.filter((i) => undoableNow(i, undone, now)).map((i) => i.toolCallId);

  const week = useWeekDays(pending);
  const [showAll, setShowAll] = useState(false);
  // A plan over a week reads from its grid; the single changes wait behind one line.
  const folded = week.length > 0 && !showAll;

  const toggleDay = (ids: readonly string[], include: boolean) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (include) next.delete(id);
        else next.add(id);
      }
      return next;
    });

  const toggle = (toolCallId: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (!next.delete(toolCallId)) next.add(toolCallId);
      return next;
    });

  const submit = (applyChosen: boolean) =>
    decide(
      tripId,
      pending.map((i) => ({ toolCallId: i.toolCallId, approved: applyChosen && !excluded.has(i.toolCallId) }))
    );

  // An undone change reads as undone from the store; only what stays needs a word.
  const runUndo = async (toolCallId: string) => {
    const outcome = await undo(tripId, toolCallId);
    if (outcome === 'stale') toast.warning(t('assistant.change.undoStale'));
    else if (outcome === 'failed') toast.error(t('assistant.change.undoFailed'));
  };

  const open = pending.length > 0;
  return (
    <section className="trek-popover-enter rounded-xl border border-edge-faint bg-surface-card px-3 pb-2 pt-2.5 shadow-card">
      <CardHead
        open={open}
        count={items.length}
        actions={<HeadActions open={open} items={items} changes={changes} undoable={undoable} />}
      />
      {open && week.length > 0 && (
        <AssistantWeekOverview days={week} excluded={excluded} disabled={isRunning} onToggleDay={toggleDay} />
      )}
      {open && !folded && <AssistantDayBand changes={changes} />}
      {folded && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mb-1 w-full rounded-lg px-2 py-1.5 text-center text-caption font-medium text-content-muted transition-colors hover:bg-surface-hover hover:text-content"
        >
          {t('assistant.week.showAll', { count: pending.length })}
        </button>
      )}
      <div className={open ? 'divide-y divide-edge-faint' : ''}>
        {items.map((item) =>
          item.state === 'pending' ? (
            folded ? null : (
              <PendingRow
                key={item.toolCallId}
                item={item}
                excluded={excluded.has(item.toolCallId)}
                withSwitch={pending.length > 1}
                disabled={isRunning}
                onToggle={() => toggle(item.toolCallId)}
              />
            )
          ) : (
            <Receipt
              key={item.toolCallId}
              item={item}
              undone={!!undone[item.toolCallId]}
              canUndo={undoable.includes(item.toolCallId)}
              onUndo={() => void runUndo(item.toolCallId)}
            />
          )
        )}
      </div>
      {open && (
        <>
          <p className="sr-only" role="status">
            {t('assistant.change.pending', { count: pending.length })}
          </p>
          <div className="flex justify-end gap-2 border-t border-edge-faint pt-2.5">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => void submit(false)}
              className="rounded-lg px-3 py-1.5 text-body text-content-secondary hover:bg-surface-hover hover:text-content disabled:opacity-50"
            >
              {t('assistant.change.discard')}
            </button>
            <button
              type="button"
              disabled={isRunning || chosen === 0}
              onClick={() => void submit(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-body font-medium text-accent-text hover:bg-accent-hover disabled:opacity-50"
            >
              <Check size={14} aria-hidden="true" />
              {pending.length === 1 ? t('assistant.change.apply') : t('assistant.change.applyN', { count: chosen })}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
