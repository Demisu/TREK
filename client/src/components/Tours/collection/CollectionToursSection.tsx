import type { CollectionTourItem } from '@trek/shared';
import { AlertTriangle, CopyPlus, Gauge, Moon, Route, Trash2, Waypoints, WifiOff } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { WhiteBadge } from '../../Planner/planParts';
import ConfirmDialog from '../../shared/ConfirmDialog';
import { fs } from '../../shared/DialogShell';
import { Tooltip } from '../../shared/Tooltip';
import { TourMeasurePills } from '../library/tourPreviewParts';
import { runPaceText } from '../run/runPaceText';
import { CardAction, TourGradeTile, TourNotice } from '../tourParts';
import { CollectionTourTakeOverDialog } from './CollectionTourTakeOverDialog';
import { useCollectionTourTakeOver } from './useCollectionTourTakeOver';
import { useCollectionTours, type CollectionTours } from './useCollectionTours';

/** Where a kept tour came from and who kept it, as one tooltip. */
function sourceText(tour: CollectionTourItem, t: (key: string, params?: Record<string, unknown>) => string) {
  const source = t('tours.collection.source', { tour: tour.source.tourName, trip: tour.source.tripTitle });
  return tour.saved_by ? `${source}. ${t('tours.collection.keptBy', { name: tour.saved_by })}` : source;
}

/**
 * What the trip's list shows of a kept tour beyond its measures: a run's pace
 * and a multi-day tour's stages, each a badge whose tooltip names it.
 */
function KeptTourTypeBadges({ tour }: { tour: CollectionTourItem }) {
  const { t } = useTranslation();
  const pace = runPaceText(tour, t);
  const stages = tour.stage_count ? t('tours.stages.count', { count: tour.stage_count }) : null;
  const icon = 'flex-none text-content-faint';
  return (
    <>
      {pace && (
        <Tooltip label={t('tours.run.pace')}>
          <span className="inline-flex" data-testid="kept-tour-pace" aria-label={`${t('tours.run.pace')}: ${pace}`}>
            <WhiteBadge icon={<Gauge size={10} strokeWidth={2.2} className={icon} />}>{pace}</WhiteBadge>
          </span>
        </Tooltip>
      )}
      {stages && (
        <span className="inline-flex" data-testid="kept-tour-stages">
          <WhiteBadge icon={<Moon size={10} strokeWidth={2.2} className={icon} />}>{stages}</WhiteBadge>
        </span>
      )}
    </>
  );
}

/**
 * One kept tour as a card: its grade tile with where it came from, its name
 * and type, its measures and waypoints as badges, the trip it was saved from,
 * and the way into a trip. Removing it sits quietly in its corner.
 */
function KeptTourCard({
  tour,
  canRemove,
  onTake,
  onRemove,
}: {
  tour: CollectionTourItem;
  canRemove: boolean;
  onTake: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const tile = { ...tour, has_waypoints: tour.waypoint_count > 0 };
  return (
    <article
      data-testid={`kept-tour-${tour.id}`}
      className="group flex min-w-0 flex-col gap-2.5 rounded-2xl border border-edge-faint bg-surface-card p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex min-w-0 items-start gap-3">
        <TourGradeTile tour={tile} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
          <h3 className="m-0 truncate font-semibold text-content" style={fs(13.5, 'body')}>
            {tour.name}
          </h3>
          <span className="truncate text-content-faint" style={fs(11, 'body')}>
            {t(`tourTypes.${tour.tour_type}`)}
          </span>
        </div>
        {canRemove && (
          <Tooltip label={t('tours.collection.remove')}>
            <button
              type="button"
              onClick={onRemove}
              aria-label={t('tours.collection.remove')}
              data-testid={`kept-tour-remove-${tour.id}`}
              className="grid h-7 w-7 flex-none place-items-center rounded-full text-content-faint opacity-0 transition-opacity hover:bg-danger-soft hover:text-danger focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent group-hover:opacity-100"
            >
              <Trash2 size={13} strokeWidth={2} />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <TourMeasurePills tour={tour} testPrefix="kept-tour" />
        <KeptTourTypeBadges tour={tour} />
        {tour.waypoint_count > 0 && (
          <Tooltip label={t('tours.collection.points', { count: tour.waypoint_count })}>
            <span className="inline-flex" aria-label={t('tours.collection.points', { count: tour.waypoint_count })}>
              <WhiteBadge icon={<Waypoints size={10} strokeWidth={2.2} className="flex-none text-content-faint" />}>
                {tour.waypoint_count}
              </WhiteBadge>
            </span>
          </Tooltip>
        )}
      </div>
      <div className="mt-auto flex min-w-0 items-center gap-2 border-t border-edge-faint pt-2.5">
        <Tooltip label={sourceText(tour, t)}>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 text-content-muted" style={fs(11, 'body')}>
            <Route size={12} strokeWidth={2} className="flex-none text-content-faint" />
            <span className="truncate">{tour.source.tripTitle}</span>
          </span>
        </Tooltip>
        <Tooltip label={t('tours.collection.addHint')}>
          <span className="inline-flex">
            <CardAction icon={<CopyPlus size={12} strokeWidth={2} />} onClick={onTake}>
              {t('tours.collection.add')}
            </CardAction>
          </span>
        </Tooltip>
      </div>
    </article>
  );
}

/** What stands above the cards while they cannot be shown: offline, or failed with a retry. */
function SectionProblem({ kept }: { kept: CollectionTours }) {
  const { t } = useTranslation();
  if (kept.status === 'offline')
    return <TourNotice icon={<WifiOff size={13} strokeWidth={2} />}>{t('tours.collection.offline')}</TourNotice>;
  if (kept.status !== 'error') return null;
  return (
    <TourNotice tone="warning" icon={<AlertTriangle size={13} strokeWidth={2} />}>
      <span className="flex flex-wrap items-center gap-2">
        {t('tours.collection.toursFailed')}
        <button type="button" onClick={kept.retry} className="font-semibold underline underline-offset-2">
          {t('tours.planner.retry')}
        </button>
      </span>
    </TourNotice>
  );
}

/**
 * LIB-03 on a collection's page: the whole tours it keeps, above its places,
 * each ready to be taken into a trip. Nothing shows while it keeps none, or
 * while the Tours addon is off.
 */
export function CollectionToursSection({ collectionId, canRemove }: { collectionId: number; canRemove: boolean }) {
  const { t } = useTranslation();
  const kept = useCollectionTours(collectionId);
  const takeOver = useCollectionTourTakeOver(collectionId);
  const problem = kept.status === 'error' || kept.status === 'offline';
  if (!kept.enabled || (kept.tours.length === 0 && !problem)) return null;
  return (
    <section aria-label={t('tours.title')} className="mb-5 flex flex-col gap-2.5" data-testid="collection-tours">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-subtle text-accent-on">
          <Route size={13} strokeWidth={2.2} />
        </span>
        <h2 className="m-0 font-semibold text-content" style={fs(13, 'body')}>
          {t('tours.title')}
        </h2>
        {kept.tours.length > 0 && <WhiteBadge>{kept.tours.length}</WhiteBadge>}
      </div>
      <SectionProblem kept={kept} />
      {kept.tours.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {kept.tours.map((tour) => (
            <KeptTourCard
              key={tour.id}
              tour={tour}
              canRemove={canRemove}
              onTake={() => takeOver.show(tour)}
              onRemove={() => kept.askRemove(tour)}
            />
          ))}
        </div>
      )}
      <CollectionTourTakeOverDialog takeOver={takeOver} />
      <ConfirmDialog
        isOpen={kept.removing !== null}
        onClose={kept.cancelRemove}
        onConfirm={() => void kept.confirmRemove()}
        title={t('tours.collection.removeTitle')}
        message={t('tours.collection.removeBody')}
        confirmLabel={t('tours.collection.remove')}
        cancelLabel={t('common.cancel')}
        danger
      />
    </section>
  );
}
