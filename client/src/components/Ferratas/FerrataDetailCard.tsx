import { ExternalLink, Mountain, X } from 'lucide-react';

import type { Ferrata } from '@trek/shared';

import { useTranslation } from '../../i18n';
import { type PillTone, SoftPill } from '../Planner/planParts';
import { type FerrataTone, ferrataGradeLabel, ferrataGradeTone, ferrataOsmUrl } from './ferrataModel';

/** The badge tone per difficulty band; the same bands colour the line on the map. */
const PILL_TONE: Record<FerrataTone, PillTone> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
  unknown: 'neutral',
};

/**
 * One via ferrata, picked on the map: its name, the grade as a badge, the
 * route it belongs to and the way back to the source. OpenStreetMap's data is
 * ODbL, which asks for the attribution next to anything shown from it, so the
 * card carries it rather than relying on the map's own corner.
 */
export default function FerrataDetailCard({ ferrata, onClose }: { ferrata: Ferrata; onClose?: () => void }) {
  const { t } = useTranslation();
  const name = ferrata.name ?? ferrata.routeName ?? t('ferratas.unnamed');
  // The route line only adds something when it is not already the title.
  const route = ferrata.routeName && ferrata.routeName !== name ? ferrata.routeName : null;
  // A letter scale ("C/D") the contract keeps as `raw` still says more than "unknown".
  const grade = ferrataGradeLabel(ferrata.grade) ?? ferrata.grade.raw ?? t('ferratas.unknownGrade');

  return (
    <article
      className="w-72 max-w-full rounded-xl border border-edge bg-surface-card p-3 text-content shadow-lg"
      data-testid="ferrata-detail-card"
    >
      <div className="flex items-start gap-2">
        <Mountain size={16} className="mt-0.5 flex-none text-content-muted" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-subtitle font-semibold">{name}</h3>
          {route && <p className="truncate text-caption text-content-muted">{route}</p>}
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="flex-none rounded-lg p-1 text-content-muted hover:bg-surface-hover hover:text-content"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <SoftPill tone={PILL_TONE[ferrataGradeTone(ferrata.grade)]}>{grade}</SoftPill>
      </div>
      <a
        href={ferrataOsmUrl(ferrata)}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-body font-medium text-accent-on hover:underline"
      >
        {t('ferratas.viewInOsm')}
        <ExternalLink size={13} aria-hidden="true" />
      </a>
      <p className="mt-2 text-caption text-content-faint">{t('ferratas.attribution')}</p>
    </article>
  );
}
