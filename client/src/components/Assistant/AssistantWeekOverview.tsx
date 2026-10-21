import { Check, Minus } from 'lucide-react';

import { useTranslation } from '../../i18n';
import type { WeekDay } from './useWeekDays';

/**
 * A plan over several days as one grid: a tile per day with how many changes
 * it gets, taken in or left out as a whole with one tap. The single changes
 * stay below it, folded away until asked for.
 */
export default function AssistantWeekOverview({
  days,
  excluded,
  disabled,
  onToggleDay,
}: {
  days: readonly WeekDay[];
  excluded: ReadonlySet<string>;
  disabled: boolean;
  onToggleDay: (ids: readonly string[], include: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="group"
      aria-label={t('assistant.week.title')}
      className="mb-2 grid gap-1.5"
      style={{ gridTemplateColumns: `repeat(${Math.min(days.length, 7)}, minmax(0, 1fr))` }}
    >
      {days.map((day, i) => {
        const on = day.ids.filter((id) => !excluded.has(id)).length;
        const taken = on > 0;
        return (
          <button
            key={day.id}
            type="button"
            disabled={disabled}
            aria-pressed={taken}
            onClick={() => onToggleDay(day.ids, !taken)}
            className={`trek-assistant-enter group/day relative flex min-w-0 flex-col items-center gap-0.5 rounded-xl border px-1 py-2 transition-all disabled:cursor-default ${
              taken
                ? 'border-accent bg-accent-subtle text-content shadow-sm hover:-translate-y-px hover:shadow-md'
                : 'border-dashed border-edge text-content-faint hover:border-edge-secondary'
            }`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <span
              aria-hidden="true"
              className={`absolute end-1 top-1 grid h-3.5 w-3.5 place-items-center rounded-full ${
                taken ? 'bg-accent text-accent-text' : 'bg-surface-tertiary text-content-faint'
              }`}
            >
              {taken ? <Check size={9} strokeWidth={3} /> : <Minus size={9} strokeWidth={3} />}
            </span>
            <span className="text-caption text-content-muted">{day.weekday ?? t('assistant.week.day')}</span>
            <span className="text-subtitle font-bold tabular-nums leading-none">{day.n}</span>
            <span className={`text-caption tabular-nums ${taken ? 'text-content-secondary' : ''}`}>
              {t('assistant.week.changes', { count: taken ? on : day.ids.length })}
            </span>
          </button>
        );
      })}
    </div>
  );
}
