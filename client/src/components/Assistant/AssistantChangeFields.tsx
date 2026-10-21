import type { AssistantChangeLabelKey, AssistantChangeRow } from '@trek/shared';
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Clock,
  Hash,
  ListOrdered,
  LogIn,
  LogOut,
  type LucideIcon,
  Tag,
  Wallet,
} from 'lucide-react';

import { useTranslation } from '../../i18n';
import { SoftPill } from '../Planner/planParts';

/**
 * The few facts that tell a change apart at a glance, as badges on the line
 * under its name the way the planner's day list shows a place: when, what
 * kind, what it costs, a new order. A value that changes reads old to new.
 * The rest of what the change sets is not listed: the planner shows it once
 * applied.
 */

/** The fields worth a place on the line, each with its glyph, in this order. */
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
  order: ListOrdered,
};
const KEY_ORDER = Object.keys(KEY_FIELDS) as AssistantChangeLabelKey[];
const MAX_FACTS = 3;

/** "#3" is how a day comes from the server; it reads as "Day 3". */
function shown(row: AssistantChangeRow, value: string | null | undefined, dayWord: string): string {
  if (row.labelKey === 'day' && value && /^#\d+$/.test(value)) return `${dayWord} ${value.slice(1)}`;
  return value ?? '';
}

export default function AssistantChangeFields({ rows }: { rows: AssistantChangeRow[] }) {
  const { t } = useTranslation();
  const dayWord = t('assistant.week.day');
  const facts = rows
    .filter((row) => row.labelKey in KEY_FIELDS && row.after)
    .sort((a, b) => KEY_ORDER.indexOf(a.labelKey) - KEY_ORDER.indexOf(b.labelKey))
    .slice(0, MAX_FACTS);
  if (facts.length === 0) return null;
  return (
    <>
      {facts.map((row, i) => {
        const Icon = KEY_FIELDS[row.labelKey] ?? Tag;
        const changed = row.op !== 'add' && !!row.before;
        return (
          <SoftPill
            key={`${row.labelKey}-${i}`}
            className="max-w-full tabular-nums"
            icon={<Icon size={10} strokeWidth={2.2} aria-hidden="true" className="flex-none text-content-faint" />}
          >
            {changed && (
              <>
                <bdi className="truncate text-content-faint line-through">{shown(row, row.before, dayWord)}</bdi>
                <ArrowRight size={9} aria-hidden="true" className="flex-none text-content-faint rtl:-scale-x-100" />
              </>
            )}
            <bdi className="truncate">{shown(row, row.after, dayWord)}</bdi>
          </SoftPill>
        );
      })}
    </>
  );
}
