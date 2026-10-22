import type { TourRouteCard, TourRouteStop } from '@trek/shared';
import { AlertTriangle, Flag, MapPin, MountainSnow, type LucideIcon } from 'lucide-react';
import { createElement } from 'react';

import { useTranslation } from '../../../../i18n';
import {
  focusRouteProfileAtDistance,
  type DistanceIndexedProfileSample,
  type RouteProfileFocus,
} from '../../../../utils/routeGeometry';
import { TOUR_POI_LOOKS } from '../../../Map/poiCategories';
import { SoftPill, WhiteBadge } from '../../../Planner/planParts';
import { Tooltip } from '../../../shared/Tooltip';
import { StageEndCorner } from '../../../Tours/stages/StageParts';
import { useCardFormat } from '../parts/useCardFormat';
import { chipStops } from './tourRouteModel';
import { FLAG_LOOK, stopName } from './tourRouteWords';

/**
 * The stops of a route as chips in the order they lie along it: the start
 * and the end, the huts, summits and stations on the way with their clock,
 * the walking time between them faint, and what lies a little off the way
 * quieter still. Pointing at a chip or tapping it moves the spot in focus
 * there, on the profile and on the map alike. Past eight the middle ones
 * fold into a count that names them.
 */

/** A stop's glyph: the flag at either end, the mountain at the highest point, the place's own for a kind. */
function iconOf(stop: TourRouteStop): LucideIcon {
  if (stop.kind === 'highest') return MountainSnow;
  if (stop.kind && stop.kind !== 'station') return TOUR_POI_LOOKS[stop.kind].Icon;
  return stop.role === 'start' || stop.role === 'end' ? Flag : MapPin;
}

/** The spot in focus for a stop: on the profile where it has one, else the stop itself at its distance. */
function focusOf(stop: TourRouteStop, samples: readonly DistanceIndexedProfileSample[]): RouteProfileFocus {
  return (
    focusRouteProfileAtDistance(samples, stop.atM) ?? {
      distanceMeters: stop.atM,
      elevationMeters: null,
      lat: stop.lat,
      lng: stop.lng,
      sampleIndex: 0,
    }
  );
}

function StopChip({
  stop,
  samples,
  onFocus,
}: {
  stop: TourRouteStop;
  samples: readonly DistanceIndexedProfileSample[];
  onFocus: (focus: RouteProfileFocus | null) => void;
}) {
  const { t } = useTranslation();
  const format = useCardFormat();
  const name = stopName(stop, t);
  const along = stop.role === 'along';
  const off =
    along && stop.offM !== null
      ? t('assistant.card.tour.alongOff', { distance: format.distance(stop.offM / 1000) })
      : null;
  const stay = stop.stayMinutes ? t('assistant.card.tour.stay', { time: format.minutes(stop.stayMinutes) }) : null;
  const clock = stop.clock ? format.clock(stop.clock) : null;
  const label = [name, clock, off, stay].filter(Boolean).join(', ');
  const glyph = createElement(iconOf(stop), {
    size: 10,
    strokeWidth: 2.2,
    'aria-hidden': true,
    className: 'flex-none text-content-faint',
  });
  const body = (
    <>
      <bdi className="max-w-[10rem] truncate">{name}</bdi>
      {clock && <span className="tabular-nums text-content-muted">{clock}</span>}
      {off && <span className="text-content-faint">{off}</span>}
    </>
  );
  return (
    <span className="inline-flex items-center gap-1">
      <Tooltip label={label}>
        <button
          type="button"
          aria-label={label}
          onMouseEnter={() => onFocus(focusOf(stop, samples))}
          onMouseLeave={() => onFocus(null)}
          onFocus={() => onFocus(focusOf(stop, samples))}
          onBlur={() => onFocus(null)}
          onClick={() => onFocus(focusOf(stop, samples))}
          className="relative inline-flex rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {along ? <WhiteBadge icon={glyph}>{body}</WhiteBadge> : <SoftPill icon={glyph}>{body}</SoftPill>}
          {stop.stageEnd && <StageEndCorner />}
        </button>
      </Tooltip>
      {stay && <span className="text-caption text-content-faint">{stay}</span>}
      {stop.flag && (
        <SoftPill tone="warning" icon={<AlertTriangle size={10} strokeWidth={2.2} aria-hidden="true" />}>
          {t(FLAG_LOOK[stop.flag].labelKey)}
        </SoftPill>
      )}
    </span>
  );
}

/** The walking time from one chip to the next, faint between them; nothing where it is not known. */
function Between({ from, to }: { from: TourRouteStop; to: TourRouteStop }) {
  const format = useCardFormat();
  if (from.minutes === null || to.minutes === null || to.minutes <= from.minutes) return null;
  return (
    <span className="text-caption tabular-nums text-content-faint">{format.minutes(to.minutes - from.minutes)}</span>
  );
}

export default function TourRouteStops({
  card,
  samples,
  onFocus,
}: {
  card: TourRouteCard;
  samples: readonly DistanceIndexedProfileSample[];
  onFocus: (focus: RouteProfileFocus | null) => void;
}) {
  const { t } = useTranslation();
  const { head, folded, tail } = chipStops(card);
  if (head.length === 0) return null;
  const chip = (stop: TourRouteStop, index: number, list: readonly TourRouteStop[]) => {
    // The time is walked from the last chip that has one: a place beside the way has none.
    const before = list
      .slice(0, index)
      .reverse()
      .find((other) => other.minutes !== null);
    return (
      <span className="inline-flex items-center gap-1.5">
        {before && <Between from={before} to={stop} />}
        <StopChip stop={stop} samples={samples} onFocus={onFocus} />
      </span>
    );
  };
  const names = folded.map((stop) => stopName(stop, t)).join(', ');
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" role="list" aria-label={t('assistant.card.tour.stops')}>
      {head.map((stop, index) => (
        <span key={`h-${index}`} role="listitem" className="inline-flex">
          {chip(stop, index, head)}
        </span>
      ))}
      {folded.length > 0 && (
        <span role="listitem" className="inline-flex">
          <Tooltip label={names}>
            <span className="inline-flex">
              <WhiteBadge>
                {t('assistant.card.tour.stopsMore', { count: folded.length })}
                <span className="sr-only">{`: ${names}`}</span>
              </WhiteBadge>
            </span>
          </Tooltip>
        </span>
      )}
      {tail.map((stop, index) => (
        <span key={`t-${index}`} role="listitem" className="inline-flex">
          {chip(stop, index, tail)}
        </span>
      ))}
    </div>
  );
}
