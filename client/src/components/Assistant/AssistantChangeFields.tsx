import type { AssistantChangeLabelKey, AssistantChangeRow } from '@trek/shared';
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  Clock,
  Hash,
  LogIn,
  LogOut,
  type LucideIcon,
  Tag,
  Wallet,
} from 'lucide-react';
import { useState } from 'react';

import { useTranslation } from '../../i18n';
import { CHANGE_LABELS } from './assistantParts';

/**
 * The fields of one change, read at a glance: the few that decide whether it
 * fits (when, what, what it costs) as quiet icon chips, a value that changes
 * as old to new, everything else folded behind one "Details" line. Positions
 * and colours never show; the map and the trip show those better.
 */

/** The fields worth a chip of their own, each with its glyph, in this order. */
const KEY_FIELDS: Partial<Record<AssistantChangeLabelKey, LucideIcon>> = {
  day: CalendarDays,
  time: Clock,
  endTime: Clock,
  checkIn: LogIn,
  checkOut: LogOut,
  dueDate: CalendarClock,
  category: Tag,
  price: Wallet,
  quantity: Hash,
};
const KEY_ORDER = Object.keys(KEY_FIELDS) as AssistantChangeLabelKey[];

/** Fields that mean nothing written out. */
const HIDDEN: ReadonlySet<AssistantChangeLabelKey> = new Set(['coordinates', 'position', 'icon', 'color', 'currency']);

/** What a row is called: its label, or for a tool's own argument the argument's name in words. */
function labelOf(row: AssistantChangeRow, t: (key: string) => string): string {
  if (row.labelKey === 'field' && row.field) return row.field.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return t(CHANGE_LABELS[row.labelKey]?.labelKey ?? 'assistant.change.label.field');
}

/** "#3" is how a day comes from the server; it reads as "Day 3". */
function shown(row: AssistantChangeRow, value: string | null | undefined, dayWord: string): string {
  if (row.labelKey === 'day' && value && /^#\d+$/.test(value)) return `${dayWord} ${value.slice(1)}`;
  return value ?? '';
}

function Chip({ row }: { row: AssistantChangeRow }) {
  const { t } = useTranslation();
  const Icon = KEY_FIELDS[row.labelKey] ?? Tag;
  const label = labelOf(row, t);
  const dayWord = t('assistant.week.day');
  const changed = row.op !== 'add' && !!row.before;
  return (
    <span
      title={label}
      className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-secondary px-1.5 py-0.5 text-caption text-content-secondary"
    >
      <Icon size={11} aria-label={label} className="flex-shrink-0 text-content-faint" />
      {changed && (
        <>
          <bdi className="min-w-0 truncate text-content-faint line-through">{shown(row, row.before, dayWord)}</bdi>
          <ArrowRight size={10} aria-hidden="true" className="flex-shrink-0 text-content-faint rtl:-scale-x-100" />
        </>
      )}
      <bdi className="min-w-0 truncate font-medium text-content">{shown(row, row.after, dayWord)}</bdi>
    </span>
  );
}

/** A field behind "Details": its name, then the value, old to new where it changes. */
function DetailLine({ row }: { row: AssistantChangeRow }) {
  const { t } = useTranslation();
  const changed = row.op !== 'add' && !!row.before;
  return (
    <div className="flex min-w-0 gap-2 text-caption">
      <span className="w-24 flex-shrink-0 truncate text-content-faint">{labelOf(row, t)}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1 text-content-secondary">
        {changed && (
          <>
            <bdi className="min-w-0 truncate text-content-faint line-through">{row.before}</bdi>
            <ArrowRight size={10} aria-hidden="true" className="flex-shrink-0 text-content-faint rtl:-scale-x-100" />
          </>
        )}
        <bdi className="min-w-0 truncate">{row.after || t('assistant.change.empty')}</bdi>
      </span>
    </div>
  );
}

export default function AssistantChangeFields({ rows }: { rows: AssistantChangeRow[] }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const visible = rows.filter((row) => !HIDDEN.has(row.labelKey) && row.labelKey !== 'name');
  const key = visible
    .filter((row) => row.labelKey in KEY_FIELDS && row.after)
    .sort((a, b) => KEY_ORDER.indexOf(a.labelKey) - KEY_ORDER.indexOf(b.labelKey));
  const rest = visible.filter((row) => !key.includes(row));
  if (key.length === 0 && rest.length === 0) return null;

  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {key.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {key.map((row, i) => (
            <Chip key={`${row.labelKey}-${i}`} row={row} />
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 self-start rounded-md text-caption text-content-faint transition-colors hover:text-content"
          >
            <ChevronDown
              size={12}
              aria-hidden="true"
              className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            />
            {t(open ? 'assistant.change.detailsHide' : 'assistant.change.details')}
          </button>
          {open && (
            <div className="trek-assistant-enter flex flex-col gap-1 rounded-lg bg-surface-secondary px-2.5 py-2">
              {rest.map((row, i) => (
                <DetailLine key={`${row.labelKey}-${i}`} row={row} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
