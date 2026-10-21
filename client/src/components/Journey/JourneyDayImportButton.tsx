import { ListChecks } from 'lucide-react';
import type React from 'react';
import { useTranslation } from '../../i18n';
import { fs } from '../shared/DialogShell';
import { Tooltip } from '../shared/Tooltip';

/**
 * Taking a day over with its stays (JRN-02), in the day header beside the
 * route: for an editor whose Dawarich answers, with the number of stays still
 * waiting on the day; offline it stays, dimmed, and says why.
 */
export default function JourneyDayImportButton({
  pending,
  canTakeOver,
  needsConnection,
  onOpen,
}: {
  /** Stays of the day nobody decided on yet. */
  pending: number;
  canTakeOver: boolean;
  needsConnection: boolean;
  onOpen: () => void;
}): React.ReactElement | null {
  const { t } = useTranslation();
  if (!canTakeOver && !needsConnection) return null;
  const label = !canTakeOver
    ? t('dawarich.error.offline')
    : pending > 0
      ? t('journey.dayImport.pending', { count: pending })
      : t('journey.dayImport.openHint');
  return (
    <Tooltip label={label} placement="top">
      <button
        type="button"
        onClick={canTakeOver ? onOpen : undefined}
        aria-disabled={!canTakeOver}
        aria-label={label}
        data-testid="journey-day-import"
        className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-content-secondary transition-colors aria-disabled:cursor-default aria-disabled:opacity-40 [&:not([aria-disabled=true])]:hover:bg-surface-hover"
        style={{ background: 'var(--vg-surf2)' }}
      >
        <ListChecks size={14} strokeWidth={2.2} aria-hidden="true" />
        {pending > 0 && (
          <span className="font-bold tabular-nums" style={fs(10.5)}>
            {pending}
          </span>
        )}
      </button>
    </Tooltip>
  );
}
