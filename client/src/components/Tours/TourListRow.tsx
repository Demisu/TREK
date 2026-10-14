import { useId, type ReactNode } from 'react'
import type { TourListItem } from '@trek/shared'
import { Link2 } from 'lucide-react'
import { fs } from '../shared/DialogShell'
import { SoftPill } from '../Planner/planParts'
import { TourFactPills, TourGradeTile } from './tourParts'
import { tourWebsitePresentation } from './tourPresentation'

interface TourListRowProps {
  tour: TourListItem
  selected?: boolean
  disabled?: boolean
  onSelect: (tour: TourListItem, opener: HTMLElement) => void
  action?: ReactNode
  children?: ReactNode
}

/** A tour in a list, shaped like a place row: tile, name, its facts as pills and the day action on the right. */
export default function TourListRow({ tour, selected = false, disabled = false, onSelect, action, children }: TourListRowProps) {
  const nameId = useId()
  const tone = selected ? 'bg-surface-selected' : disabled ? '' : 'hover:bg-surface-hover'
  const website = tourWebsitePresentation(tour.website)
  return (
    <li
      role="option"
      tabIndex={disabled ? -1 : 0}
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      aria-labelledby={nameId}
      className={`group mb-px rounded-[12px] px-2.5 py-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--text-primary)] ${tone} ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'}`}
      onClick={event => { if (!disabled) onSelect(tour, event.currentTarget) }}
      onKeyDown={event => {
        if (disabled || event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(tour, event.currentTarget)
        }
      }}
    >
      {/* The tile, the name and the day actions share the head line; the rest runs the
          full width under them, below the tile too. */}
      <div className="flex items-center gap-2.5">
        <TourGradeTile tour={tour} />
        <span id={nameId} className="block min-w-0 flex-1 truncate font-semibold leading-tight text-content" style={fs(13, 'body')}>{tour.name}</span>
        {action && (
          <div data-testid="tour-action-row" role="presentation" className="flex flex-none items-center gap-1.5" onClick={event => event.stopPropagation()}>
            {action}
          </div>
        )}
      </div>
      {tour.description && (
        <div data-testid="tour-description-preview" className="mt-2.5 rounded-[10px] bg-surface-card px-2 py-1.5 text-content-secondary shadow-sm ring-1 ring-inset ring-edge-faint" style={fs(11)}>
          <span className="overflow-hidden text-ellipsis" style={{ lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {tour.description}
          </span>
        </div>
      )}
      <TourFactPills tour={tour} className={tour.description ? 'mt-1.5' : 'mt-2.5'} />
      {website && (
        <div className="mt-1 flex min-w-0">
          <SoftPill icon={<Link2 size={10} strokeWidth={2.2} className="flex-none text-content-faint" />}>
            <span className="min-w-0 truncate">{website.provider ?? website.domain}</span>
          </SoftPill>
        </div>
      )}
      {children}
    </li>
  )
}
