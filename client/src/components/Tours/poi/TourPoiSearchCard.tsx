import type { TourPoi, TourPoiCategory } from '@trek/shared';
import { TOUR_POI_CORRIDORS_M } from '@trek/shared';
import {
  AlertTriangle,
  Clock,
  ExternalLink,
  Loader2,
  MoveHorizontal,
  Plus,
  RefreshCw,
  Route,
  Search,
  WifiOff,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from '../../../i18n';
import { useSettingsStore } from '../../../store/settingsStore';
import { useTourPoiStore } from '../../../store/tourPoiStore';
import { formatDistance } from '../../../utils/units';
import { TOUR_POI_LOOKS } from '../../Map/poiCategories';
import { WhiteBadge } from '../../Planner/planParts';
import { PillSelect, Segmented } from '../../shared/dialogParts';
import { fs } from '../../shared/DialogShell';
import type { TourPlannerController } from '../planner/useTourPlanner';
import { useWaypointPlaceNames } from '../planner/useWaypointPlaceNames';
import { RailCard, TourNotice } from '../tourParts';
import { formatPlannedTourDuration } from '../tourPresentation';
import { usePoiInsertion, type InsertionOutcome } from './usePoiInsertion';
import { useSelectedPoi, useTourPoiSearch, type TourPoiSearch } from './useTourPoiSearch';

type Unit = Parameters<typeof formatDistance>[1];

const km = (metres: number) => metres / 1000;

/** A category to search for, as a chip: its icon in its map colour, ticked or not. */
function CategoryChip({ category, on, onToggle }: { category: TourPoiCategory; on: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const look = TOUR_POI_LOOKS[category];
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      data-testid={`tour-poi-category-${category}`}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium transition-colors ${on ? 'bg-surface-card text-content shadow-sm ring-1 ring-inset ring-edge-faint' : 'bg-surface-tertiary text-content-muted hover:text-content'}`}
      style={fs(11.5, 'body')}
    >
      <look.Icon size={12} strokeWidth={2.2} style={{ color: on ? look.color : undefined }} />
      {t(look.labelKey)}
    </button>
  );
}

/** What the search answered beyond its places: out of date, offline, failed, partly searched, cut, or empty. */
function SearchNotices({ search, unit }: { search: TourPoiSearch; unit: Unit }) {
  const { t } = useTranslation();
  const { status, answer, outdated } = search;
  if (status === 'offline')
    return <TourNotice icon={<WifiOff size={13} strokeWidth={2} />}>{t('tours.poi.offline')}</TourNotice>;
  if (status === 'error')
    return (
      <TourNotice tone="warning" icon={<AlertTriangle size={13} strokeWidth={2} />}>
        {t('tours.poi.failed')}
      </TourNotice>
    );
  if (!answer) return null;
  // Out of date is no fault, the route was just changed (often by adding a place from here): said plainly.
  const notes = [
    answer.partial && t('tours.poi.partial'),
    answer.capped && t('tours.poi.capped'),
    answer.truncated && t('tours.poi.truncated'),
  ].filter((note): note is string => !!note);
  return (
    <>
      {outdated && <TourNotice icon={<RefreshCw size={13} strokeWidth={2} />}>{t('tours.poi.outdated')}</TourNotice>}
      {notes.map((note) => (
        <TourNotice key={note} tone="warning" icon={<AlertTriangle size={13} strokeWidth={2} />}>
          {note}
        </TourNotice>
      ))}
      {answer.pois.length === 0 && (
        <p className="m-0 text-content-muted" style={fs(12, 'body')}>
          {t('tours.poi.empty', { distance: formatDistance(km(search.corridorM), unit) })}
        </p>
      )}
    </>
  );
}

/** The point a place would follow, picked from the tour's points, with why one cannot take it. */
function AfterPicker({
  planner,
  poi,
  insertion,
}: {
  planner: TourPlannerController;
  poi: TourPoi;
  insertion: ReturnType<typeof usePoiInsertion>;
}) {
  const { t } = useTranslation();
  const names = useWaypointPlaceNames(planner.waypoints);
  const afterId = insertion.afterIdFor(poi);
  const options = planner.waypoints.map((point, index) => ({
    value: point.id,
    label: `${index + 1}. ${point.shaping ? t('tours.planner.shapingPoint') : (names[point.id] ?? `${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}`)}`,
  }));
  const block = afterId ? insertion.blockOf(afterId) : 'none';
  const locked = !planner.canEdit || planner.isSaving;
  return (
    <div className="flex flex-col gap-2 rounded-[10px] bg-surface-secondary p-2.5" data-testid="tour-poi-insert">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-content-muted" style={fs(11.5, 'body')}>
          {t('tours.poi.addAfter')}
        </span>
        <PillSelect
          quiet
          label={t('tours.poi.addAfter')}
          value={afterId ?? ''}
          options={options}
          onChange={(value) => insertion.chooseAfter(poi, value)}
        />
      </div>
      {block && (
        <p className="m-0 text-warning" style={fs(11, 'body')}>
          {t(`tours.poi.blocked.${block}`)}
        </p>
      )}
      <button
        type="button"
        disabled={!!block || locked}
        onClick={() => insertion.insert(poi)}
        data-testid="tour-poi-add"
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[10px] bg-accent px-3 font-semibold text-accent-text shadow-sm transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
        style={fs(12, 'body')}
      >
        <Plus size={14} strokeWidth={2.2} />
        {t('tours.poi.add')}
      </button>
      <p className="m-0 text-content-faint" style={fs(10.5, 'body')}>
        {t('tours.poi.notAPlace')}
      </p>
    </div>
  );
}

/** One place found: its kind, name and where it lies; opened, what the source says and the way to take it in. */
function PoiRow({
  poi,
  selected,
  planner,
  insertion,
  unit,
}: {
  poi: TourPoi;
  selected: boolean;
  planner: TourPlannerController;
  insertion: ReturnType<typeof usePoiInsertion>;
  unit: Unit;
}) {
  const { t } = useTranslation();
  const select = useTourPoiStore((state) => state.select);
  const look = TOUR_POI_LOOKS[poi.category];
  const rowRef = useRef<HTMLLIElement>(null);
  useEffect(() => {
    if (selected) rowRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);
  return (
    <li
      ref={rowRef}
      className={`rounded-[10px] ${selected ? 'bg-surface-selected' : ''}`}
      data-testid={`tour-poi-${poi.id}`}
    >
      <button
        type="button"
        onClick={() => select(selected ? null : poi.id)}
        aria-expanded={selected}
        className="flex w-full min-w-0 items-start gap-2.5 rounded-[10px] px-2 py-2 text-start transition-colors hover:bg-surface-hover"
      >
        {/* The category's own map colour, as its pin on the map has it: a light wash, the icon in full. */}
        <span
          className="grid h-7 w-7 flex-none place-items-center rounded-full"
          style={{ background: `color-mix(in srgb, ${look.color} 16%, transparent)`, color: look.color }}
        >
          <look.Icon size={14} strokeWidth={2.2} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="min-w-0 truncate font-semibold text-content" style={fs(12.5, 'body')}>
            {poi.name || t(look.labelKey)}
          </span>
          <span className="flex flex-wrap gap-1.5">
            <WhiteBadge icon={<MoveHorizontal size={10} strokeWidth={2.2} className="text-content-faint" />}>
              {t('tours.poi.fromRoute', { distance: formatDistance(km(poi.distance_m), unit) })}
            </WhiteBadge>
            <WhiteBadge icon={<Route size={10} strokeWidth={2.2} className="text-content-faint" />}>
              {t('tours.poi.along', { distance: formatDistance(km(poi.along_m), unit) })}
            </WhiteBadge>
          </span>
        </span>
      </button>
      {selected && (
        <div className="flex flex-col gap-2 px-2 pb-2.5">
          <p className="m-0 flex flex-wrap gap-x-3 text-content-faint" style={fs(10.5, 'body')}>
            <span>{t(look.labelKey)}</span>
            <span>{t(poi.source === 'trek-places' ? 'tours.poi.source.trek' : 'tours.poi.source.osm')}</span>
          </p>
          {poi.address && (
            <p className="m-0 text-content-secondary" style={fs(11.5, 'body')}>
              {poi.address}
            </p>
          )}
          {poi.opening_hours && (
            <p className="m-0 flex items-start gap-1.5 text-content-secondary" style={fs(11.5, 'body')}>
              <Clock size={12} strokeWidth={2.2} className="mt-0.5 flex-none text-content-faint" />
              <span>
                {poi.opening_hours}
                <span className="block text-content-faint" style={fs(10.5, 'body')}>
                  {t('tours.poi.hoursHint')}
                </span>
              </span>
            </p>
          )}
          {poi.website && (
            <a
              href={poi.website}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 self-start text-content-secondary underline-offset-2 hover:underline"
              style={fs(11.5, 'body')}
            >
              <ExternalLink size={12} strokeWidth={2.2} />
              {t('tours.poi.website')}
            </a>
          )}
          <AfterPicker planner={planner} poi={poi} insertion={insertion} />
        </div>
      )}
    </li>
  );
}

/** What taking a place in did: being planned, the route's change, or that it could not be told. */
function OutcomeNotice({ outcome, onDismiss, unit }: { outcome: InsertionOutcome; onDismiss: () => void; unit: Unit }) {
  const { t } = useTranslation();
  const signed = (value: string, negative: boolean) => `${negative ? '−' : '+'}${value}`;
  return (
    <div role="status" data-testid="tour-poi-outcome">
      <TourNotice
        icon={
          outcome.kind === 'measuring' ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Route size={13} strokeWidth={2} />
          )
        }
      >
        <span className="flex flex-col gap-1.5">
          <span>{t(`tours.poi.outcome.${outcome.kind}`, { name: outcome.name })}</span>
          {outcome.kind === 'measured' && (
            <span className="flex flex-wrap gap-1.5">
              <WhiteBadge>{signed(formatDistance(km(Math.abs(outcome.extraM)), unit), outcome.extraM < 0)}</WhiteBadge>
              {outcome.extraMinutes != null && (
                <WhiteBadge>
                  {signed(formatPlannedTourDuration(Math.abs(outcome.extraMinutes)), outcome.extraMinutes < 0)}
                </WhiteBadge>
              )}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-2 text-content-faint" style={fs(10.5, 'body')}>
            {t('tours.poi.undoHint')}
            <button type="button" onClick={onDismiss} className="font-semibold underline underline-offset-2">
              {t('common.close')}
            </button>
          </span>
        </span>
      </TourNotice>
    </div>
  );
}

/**
 * PLN-02/PLN-03: the card of the editor that looks for places along the tour
 * and takes one in as a stop. Searching changes nothing; only the add button
 * of a place does, as one step that undo takes back.
 */
export function TourPoiSearchCard({ planner }: { planner: TourPlannerController }) {
  const { t } = useTranslation();
  const unit = useSettingsStore((state) => state.settings.distance_unit) ?? 'metric';
  const search = useTourPoiSearch(planner);
  const insertion = usePoiInsertion(planner);
  const selected = useSelectedPoi();
  const pois = search.answer?.pois ?? [];
  if (!planner.route || planner.route.length < 2) return null;
  return (
    <RailCard
      icon={<Search size={14} strokeWidth={2} />}
      title={t('tours.poi.title')}
      foldId="along-tour"
      aside={
        search.answer ? (
          <span className="flex-none tabular-nums text-content-faint" style={fs(11.5, 'body')}>
            {pois.length}
          </span>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3" data-testid="tour-poi-card">
        <p className="m-0 text-content-faint" style={fs(11, 'body')}>
          {t('tours.poi.intro')}
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('tours.poi.categories')}>
          {search.offered.map((category) => (
            <CategoryChip
              key={category}
              category={category}
              on={search.categories.includes(category)}
              onToggle={() => search.toggleCategory(category)}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-content-muted" style={fs(11, 'body')}>
            {t('tours.poi.within')}
          </span>
          <Segmented<string>
            fill
            label={t('tours.poi.within')}
            value={String(search.corridorM)}
            onChange={(value) => search.setCorridorM(Number(value))}
            options={TOUR_POI_CORRIDORS_M.map((metres) => ({
              value: String(metres),
              label: formatDistance(km(metres), unit),
            }))}
          />
        </div>
        <button
          type="button"
          onClick={() => void search.search()}
          disabled={!search.canSearch}
          data-testid="tour-poi-search"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] bg-surface-tertiary font-semibold text-content transition-colors hover:bg-surface-hover disabled:cursor-default disabled:opacity-50"
          style={fs(12.5, 'body')}
        >
          {search.status === 'loading' ? (
            <Loader2 size={14} strokeWidth={2.2} className="animate-spin" />
          ) : search.answer ? (
            <RefreshCw size={14} strokeWidth={2.2} />
          ) : (
            <Search size={14} strokeWidth={2.2} />
          )}
          {t(
            search.status === 'loading' ? 'tours.poi.searching' : search.answer ? 'tours.poi.again' : 'tours.poi.search'
          )}
        </button>
        {insertion.outcome && <OutcomeNotice outcome={insertion.outcome} onDismiss={insertion.dismiss} unit={unit} />}
        <SearchNotices search={search} unit={unit} />
        {pois.length > 0 && (
          <ul className={`m-0 flex list-none flex-col gap-0.5 p-0 ${search.status === 'loading' ? 'opacity-60' : ''}`}>
            {pois.map((poi) => (
              <PoiRow
                key={poi.id}
                poi={poi}
                selected={selected?.id === poi.id}
                planner={planner}
                insertion={insertion}
                unit={unit}
              />
            ))}
          </ul>
        )}
      </div>
    </RailCard>
  );
}
