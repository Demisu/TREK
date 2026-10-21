import type { AssistantFoundPlace } from '@trek/shared';
import { Check, ChevronDown, LoaderCircle, MapPin, Plus } from 'lucide-react';
import { type ReactNode, useRef } from 'react';

import { useTranslation } from '../../i18n';
import { PopoverItem } from '../Packing/PackingPopover';
import { getCategoryIcon } from '../shared/categoryIcons';
import { PopoverListPanel } from '../shared/dialogParts';
import { Tooltip } from '../shared/Tooltip';
import { usePopoverList } from '../shared/usePopoverList';
import { useAssistantView } from './assistantViewContext';
import type { useAssistantPlaceStrip } from './useAssistantPlaceStrip';
import { useFoundPlacePhoto } from './useFoundPlacePhoto';

type Strip = ReturnType<typeof useAssistantPlaceStrip>;

const ACTION =
  'inline-flex items-center gap-1 rounded-lg bg-surface-secondary text-caption font-medium text-content transition-colors hover:bg-surface-hover disabled:cursor-default disabled:opacity-50 disabled:hover:bg-surface-secondary';

/** "+ Day 3" for the day in focus, a list of the trip's days beside it; "Pick a day" when no day is in focus. */
function SuggestButton({ place, strip, tall }: { place: AssistantFoundPlace; strip: Strip; tall: boolean }) {
  const { t } = useTranslation();
  const { days, focusDay, disabled, blockedKey, adding } = strip;
  const list = usePopoverList(focusDay ? days.findIndex((d) => d.id === focusDay.id) : 0, {
    estimatedHeight: Math.min(320, days.length * 34 + 8),
  });
  const height = tall ? 'h-10' : 'h-7';
  const busy = adding === place.ref;

  const pick = (dayId: number) => {
    list.close();
    void strip.suggest(place, dayId);
  };

  const buttons = (
    <span className="inline-flex min-w-0 gap-px">
      {focusDay ? (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void strip.suggest(place, focusDay.id)}
            aria-label={t('assistant.place.addTo', { day: focusDay.label })}
            className={`${ACTION} ${height} rounded-e-none px-2`}
          >
            {busy ? (
              <LoaderCircle size={12} aria-hidden="true" className="animate-spin" />
            ) : (
              <Plus size={12} aria-hidden="true" />
            )}
            <span className="truncate">{t('assistant.place.addToShort', { n: focusDay.n })}</span>
          </button>
          <button
            ref={list.triggerRef}
            type="button"
            disabled={disabled}
            onClick={list.toggle}
            aria-expanded={list.open}
            aria-controls={list.open ? list.listId : undefined}
            aria-label={t('assistant.place.pickDay')}
            className={`${ACTION} ${height} rounded-s-none px-1.5`}
          >
            <ChevronDown size={12} aria-hidden="true" />
          </button>
        </>
      ) : (
        <button
          ref={list.triggerRef}
          type="button"
          disabled={disabled}
          onClick={list.toggle}
          aria-expanded={list.open}
          aria-controls={list.open ? list.listId : undefined}
          className={`${ACTION} ${height} px-2`}
        >
          <Plus size={12} aria-hidden="true" />
          <span className="truncate">{t('assistant.place.pickDay')}</span>
          <ChevronDown size={12} aria-hidden="true" className="text-content-faint" />
        </button>
      )}
    </span>
  );

  return (
    <>
      {blockedKey ? (
        <Tooltip label={t(blockedKey)} placement="top">
          {/* A disabled button gets no pointer events; the wrapper carries the reason. */}
          <span className="inline-flex min-w-0">{buttons}</span>
        </Tooltip>
      ) : (
        buttons
      )}
      <PopoverListPanel list={list} label={t('assistant.place.pickDay')} className="max-w-[16rem]">
        {days.map((day) => (
          <PopoverItem
            key={day.id}
            icon={null}
            label={day.label}
            active={day.id === focusDay?.id}
            onClick={() => pick(day.id)}
          />
        ))}
      </PopoverListPanel>
    </>
  );
}

/**
 * One place a search found, as a small card: its picture from TREK's photo
 * proxy (or its category's icon), its name, the category it most likely
 * belongs in, whether it is open now while the trip runs, how far it is from
 * the last stop of the day in focus, and one way on: "+ Day 3" for a new
 * place, "On map" for one the trip has. A click on the card shows it on the
 * map, and resting the pointer on it pins it there for a moment.
 */
export default function AssistantPlaceCard({
  place,
  strip,
  suggested,
}: {
  place: AssistantFoundPlace;
  strip: Strip;
  suggested: boolean;
}) {
  const { t } = useTranslation();
  const { variant, density } = useAssistantView();
  const ref = useRef<HTMLLIElement>(null);
  const photo = useFoundPlacePhoto(place, ref);
  const category = strip.categoryOf(place);
  const distance = strip.distanceOf(place);
  const Icon = category ? getCategoryIcon(category.icon) : MapPin;
  const tall = variant === 'fullscreen';

  let action: ReactNode = null;
  if (place.inTripPlaceId !== null) {
    action = (
      <Tooltip label={t('assistant.place.inTrip')} placement="top">
        <button type="button" onClick={() => strip.show(place)} className={`${ACTION} ${tall ? 'h-10' : 'h-7'} px-2`}>
          <MapPin size={12} aria-hidden="true" />
          {t('assistant.place.showOnMap')}
        </button>
      </Tooltip>
    );
  } else if (suggested) {
    action = (
      <span className="inline-flex h-7 items-center gap-1 text-caption text-content-muted">
        <Check size={12} aria-hidden="true" className="text-success" />
        {t('assistant.place.suggested')}
      </span>
    );
  } else if (strip.canSuggest) {
    action = <SuggestButton place={place} strip={strip} tall={tall} />;
  }

  return (
    <li
      ref={ref}
      className={`flex flex-shrink-0 snap-start flex-col overflow-hidden rounded-xl border border-edge-faint bg-surface-card ${
        density === 'compact' ? 'w-[168px]' : 'w-[200px]'
      }`}
      onMouseEnter={() => strip.hover(place)}
      onMouseLeave={() => strip.hover(null)}
    >
      <button
        type="button"
        onClick={() => strip.show(place)}
        onFocus={() => strip.hover(place)}
        onBlur={() => strip.hover(null)}
        className="flex flex-col text-start outline-none focus-visible:bg-surface-hover"
      >
        <span className="flex h-[72px] w-full items-center justify-center overflow-hidden bg-surface-secondary">
          {photo ? (
            <img src={photo} alt="" decoding="async" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            // The category's own colour, data from the trip; only the small icon wears it.
            <Icon size={20} aria-hidden="true" style={{ color: category?.color ?? 'var(--text-faint)' }} />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5 px-2.5 pt-2">
          <bdi className="truncate text-body font-semibold text-content">{place.name}</bdi>
          {(category || place.openNow !== null) && (
            <span className="flex min-w-0 items-center gap-2 text-caption text-content-muted">
              {category && <bdi className="min-w-0 truncate">{category.name}</bdi>}
              {place.openNow === true && (
                <span className="inline-flex flex-shrink-0 items-center gap-1">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
                  {t('assistant.place.openNow')}
                </span>
              )}
              {place.openNow === false && <span className="flex-shrink-0">{t('assistant.place.closed')}</span>}
            </span>
          )}
          {distance && (
            <span className="truncate text-caption text-content-faint">
              {t('assistant.place.fromPrev', { distance })}
            </span>
          )}
        </span>
      </button>
      <div className="mt-auto flex min-w-0 px-2.5 pb-2.5 pt-2">{action}</div>
    </li>
  );
}
