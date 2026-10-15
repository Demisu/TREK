import { useId, type ReactNode } from 'react'
import type { TourListItem } from '@trek/shared'
import { fs } from '../shared/DialogShell'
import { TourCautionBadge, TourDaysBadge, TourGradeTile } from './tourParts'
import type { Day } from '../../types'
import { endPlaceDrag, startPlaceDrag } from '../Map/markerDrag'
import { TourDayRowPills } from './TourDayRowFacts'
import { useTourDays } from './tourDays'

const NO_DAYS: Day[] = []

interface TourListRowProps {
  tour: TourListItem
  /** The trip's days, to name the ones the tour is on; without them the row names none. */
  days?: Day[]
  selected?: boolean
  disabled?: boolean
  /** The row can be picked up and dropped on a day of the plan, like a place. */
  draggableToDay?: boolean
  onSelect: (tour: TourListItem, opener: HTMLElement) => void
  action?: ReactNode
  children?: ReactNode
}

/**
 * A tour in a list, laid out like a stop in the day plan: its tile with the
 * grade, the name, and one line of the plan's white badges (time, distance,
 * ascent, the days it is on, a caution) with the description trailing after
 * them. The day and delete actions sit on the right.
 */
export default function TourListRow({ tour,
  days = NO_DAYS,
  selected = false, disabled = false,
  draggableToDay = false, onSelect, action, children }: TourListRowProps) {
  const nameId = useId()
  const tourDays = useTourDays(tour.place_id, days)
  const draggable = draggableToDay && !disabled
  const tone = selected ? 'bg-surface-selected' : disabled ? '' : 'hover:bg-surface-hover'
  const cursor = disabled ? 'cursor-default opacity-60' : draggable ? 'cursor-grab' : 'cursor-pointer'
  return (
    <li
      role="option"
      tabIndex={disabled ? -1 : 0}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      aria-labelledby={nameId}
      draggable={draggable || undefined}
      onDragStart={draggable ? (event) => startPlaceDrag(event.dataTransfer, tour.place_id) : undefined}
      onDragEnd={draggable ? endPlaceDrag : undefined}
      className={`group mx-1.5 rounded-[10px] px-1.5 py-2 outline-none transition-colors focus-visible:bg-surface-hover ${tone} ${cursor}`}
      onClick={event => { if (!disabled) onSelect(tour, event.currentTarget) }}
      onKeyDown={event => {
        if (disabled || event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(tour, event.currentTarget)
        }
      }}
    >
      <div className="flex items-center gap-2.5">
        <TourGradeTile tour={tour} />
        <div className="min-w-0 flex-1">
          <span id={nameId} className="block min-w-0 truncate font-semibold leading-tight text-content"
            style={fs(13, 'body')}>{tour.name}</span>
        {/* One line like a plan row's: the badges keep their place, the description gives way. */}
          <div
            data-testid="tour-metrics"
            className="mt-0.5 flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden"
          >
            <TourCautionBadge tour={tour} />
            <TourDayRowPills tour={tour} />
            <TourDaysBadge tourDays={tourDays} />
            {tour.description && (
              <span
                data-testid="tour-description-preview"
                className="min-w-0 flex-1 truncate text-content-faint"
                style={fs(10.5)}
              >
                {tour.description}
              </span>
            )}
          </div>
        </div>
        {action && (
          // Out on hover, focus or selection, as a plan row's controls are: the name and badges have the room otherwise.
          <div data-testid="tour-action-row" role="presentation"
            onClick={event => event.stopPropagation()}
            className={`flex-none items-center gap-1.5 group-focus-within:flex group-hover:flex ${selected ? 'flex' : 'hidden'}`}>
            {action}
          </div>
        )}
      </div>
      {children}
    </li>
  )
}
