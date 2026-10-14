import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { TourListItem } from '@trek/shared'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, Clock, Info, Mountain, Plus, Ruler, type LucideIcon } from 'lucide-react'
import type { Day, DistanceUnit } from '../../types'
import type { RouteGeometryAnalysis } from '../../utils/routeGeometry'
import { useTranslation } from '../../i18n'
import { useSettingsStore } from '../../store/settingsStore'
import { formatDistance, formatElevation } from '../../utils/units'
import { formatDate } from '../../utils/formatters'
import { ContextMenu, useContextMenu } from '../shared/ContextMenu'
import { DialogButton, fs } from '../shared/DialogShell'
import { Tooltip } from '../shared/Tooltip'
import { useTripStore } from '../../store/tripStore'
import { BOX, Eyebrow } from '../Planner/bookings/bookingParts'
import { SoftPill } from '../Planner/planParts'
import { formatPlannedTourDuration, hikeSourceBadgeLabel, tourPlannedTimes, tourSource } from './tourPresentation'

type Translate = (key: string, params?: Record<string, unknown>) => string

/** The round tile a tour stands behind in a list, where a place has its avatar. */
export function TourTile({ size = 34, color, raised = false }: { size?: number; color?: string; raised?: boolean }) {
  return (
    <span className={`grid flex-none place-items-center rounded-full ${raised ? 'bg-surface-card shadow-sm' : 'bg-surface-tertiary'}`} style={{ width: size, height: size }}>
      <Mountain size={Math.round(size * 0.44)} strokeWidth={1.9} style={{ color: color ?? 'var(--text-muted)' }} />
    </span>
  )
}

/**
 * A tour's tile in a list: its T-scale grade in place of the mountain, named in
 * full by its tooltip (a GPX import carries no grade and keeps the mountain),
 * and where it came from, when that was not TREK, as a small badge over its foot.
 */
export function TourGradeTile({ tour }: { tour: Pick<TourListItem, 'max_hiking_difficulty' | 'wanderer_ref' | 'has_waypoints'> }) {
  const { t } = useTranslation()
  const level = tour.max_hiking_difficulty
  const source = tourSource(tour)
  const label = level == null ? null : t(`tours.planner.difficulty.t${level}`)
  return (
    <span className="relative flex-none">
      <Tooltip label={label ?? ''} disabled={label == null}>
        <span aria-label={label ?? undefined} className="grid h-[34px] w-[34px] place-items-center rounded-full bg-edge font-geist font-semibold tabular-nums text-content" style={fs(12, 'body')}>
          {level == null ? <Mountain size={15} strokeWidth={1.9} className="text-content-secondary" /> : `T${level}`}
        </span>
      </Tooltip>
      {source !== 'trek' && (
        <span className="absolute inset-x-0 -bottom-1.5 flex justify-center">
          <Tooltip label={hikeSourceBadgeLabel(tour, t)}>
            <span data-testid="tour-source-badge" aria-label={hikeSourceBadgeLabel(tour, t)}
              className="rounded-full bg-surface-card px-1 font-geist font-semibold uppercase leading-[14px] tracking-[.04em] text-content-secondary shadow-sm ring-1 ring-inset ring-edge-faint"
              style={fs(8.5)}>
              {t(`tours.badgeShort.${source}`)}
            </span>
          </Tooltip>
        </span>
      )}
    </span>
  )
}

/** One measured fact of a tour as a white pill: its icon, an optional short word and the value, named in full for a screen reader. */
function TourMetricPill({ icon: Icon, label, value, prefix }: { icon: LucideIcon; label: string; value: string; prefix?: string }) {
  return (
    <SoftPill className="tabular-nums" icon={<Icon size={10} strokeWidth={2.2} className="flex-none text-content-faint" />}>
      <span aria-label={`${label}: ${value}`}>{prefix ? `${prefix} ${value}` : value}</span>
    </SoftPill>
  )
}

/** The facts of a tour as white pills, kept to one short row: how far, up and down, how long, how hard, and where it came from when that was not TREK. */
export function TourFactPills({ tour, className = '', children }: { tour: TourListItem; className?: string; children?: ReactNode }) {
  const { t } = useTranslation()
  const unit = useSettingsStore(state => state.settings.distance_unit)
  const times = tourPlannedTimes(tour)
  const shownMinutes = times.plannedTotalMinutes ?? times.walkingMinutes
  const timeParts = [
    times.walkingMinutes != null ? `${t('tours.planner.walkingShort')} ${formatPlannedTourDuration(times.walkingMinutes)}` : null,
    times.breakMinutes != null ? `${t('tours.planner.breaksShort')} ${formatPlannedTourDuration(times.breakMinutes)}` : null,
    times.plannedTotalMinutes != null
      ? `${t('tours.planner.plannedShort')} ${formatPlannedTourDuration(times.plannedTotalMinutes)}${times.manuallyOverridden ? ` (${t('tours.planner.plannedTotalManual')})` : ''}`
      : null,
  ].filter((part): part is string => part !== null)
  return (
    <div data-testid="tour-metrics" className={`flex min-w-0 flex-wrap items-center gap-1 ${className}`}>
      <TourMetricPill icon={Ruler} label={t('tours.detail.distance')} value={formatDistance(tour.distance ?? 0, unit)} />
      {tour.elevation_gain != null && <TourMetricPill icon={ArrowUp} label={t('tours.detail.ascent')} value={formatElevation(tour.elevation_gain, unit)} />}
      {tour.elevation_loss != null && <TourMetricPill icon={ArrowDown} label={t('tours.detail.descent')} value={formatElevation(tour.elevation_loss, unit)} />}
      {shownMinutes != null && (
        <Tooltip label={timeParts.join(', ')}>
          <span className="inline-flex">
            <TourMetricPill icon={Clock} label={timeParts.join(', ')} value={formatPlannedTourDuration(shownMinutes)} />
          </span>
        </Tooltip>
      )}
      {tour.caution && (
        <Tooltip label={t('tours.caution.tooltip')}>
          <span aria-label={t('tours.caution.badge')} className="inline-flex">
            <SoftPill tone="warning" icon={<AlertTriangle size={10} strokeWidth={2.2} className="flex-none" />}>{t('tours.caution.badge')}</SoftPill>
          </span>
        </Tooltip>
      )}
      {children}
    </div>
  )
}

/** "Day 2, Tue, Jul 8: Lakes" as far as the day has a date and a title. */
function dayMenuLabel(day: Day, index: number, t: Translate, locale: string): string {
  const date = formatDate(day.date, locale)
  const head = date ? `${t('dayplan.dayN', { n: index + 1 })}, ${date}` : t('dayplan.dayN', { n: index + 1 })
  return day.title ? `${head}: ${day.title}` : head
}

/**
 * Putting a tour on a day: a round "+" on a row, or a footer button with a
 * chevron, both opening the trip's days as a menu.
 */
export function TourDayMenu({ days, placeId, onPick, disabled = false, label, variant = 'round', primary = false }: {
  days: Day[]
  placeId?: number
  onPick: (day: Day, index: number) => void
  disabled?: boolean
  label: string
  variant?: 'round' | 'button'
  primary?: boolean
}) {
  const { t, locale } = useTranslation()
  const menu = useContextMenu()
  const assignments = useTripStore(state => state.assignments ?? {})
  const assigned = (dayId: number) => placeId != null && (assignments[String(dayId)] ?? []).some(assignment => assignment.place_id === placeId)
  const items = days.map((day, index) => ({
    label: dayMenuLabel(day, index, t, locale),
    disabled: assigned(day.id),
    onClick: () => onPick(day, index),
  }))
  const hasAvailableDay = items.some(item => !item.disabled)
  const open = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || !hasAvailableDay) return
    if (menu.menu) { event.stopPropagation(); menu.close(); return }
    menu.open(event, items, true)
  }
  return (
    <>
      {variant === 'round' ? (
        <Tooltip label={label} disabled={!!menu.menu}>
          <button type="button" onClick={open} disabled={disabled || !hasAvailableDay} aria-label={label} aria-haspopup="menu" aria-expanded={!!menu.menu}
            className={`grid h-[26px] w-[26px] flex-none place-items-center rounded-full shadow-sm ring-1 transition-colors disabled:cursor-default disabled:opacity-40 ${menu.menu ? 'bg-accent text-accent-text ring-transparent' : 'bg-surface-card text-content-muted ring-edge-faint enabled:hover:bg-accent enabled:hover:text-accent-text enabled:hover:ring-transparent'}`}>
            <Plus size={13} strokeWidth={2.4} />
          </button>
        </Tooltip>
      ) : (
        <DialogButton variant={primary ? 'primary' : 'secondary'} onClick={open} disabled={disabled || !hasAvailableDay}
          aria-haspopup="menu" aria-expanded={!!menu.menu} icon={<Plus size={14} strokeWidth={2} />}>
          {label}
          <ChevronDown size={13} strokeWidth={2.2} className={`transition-transform ${menu.menu ? 'rotate-180' : ''}`} />
        </DialogButton>
      )}
      <ContextMenu menu={disabled ? null : menu.menu} onClose={menu.close} />
    </>
  )
}

/** The round info dot beside a label; hover, focus and a tap show the explanation as a tooltip. */
export function InfoDot({ description, label }: { description: string; label: string }) {
  const id = useId()
  return (
    <Tooltip label={description}>
      <button type="button" aria-label={label} aria-describedby={id}
        className="grid h-5 w-5 flex-none place-items-center rounded-full text-content-faint transition-colors hover:bg-surface-card hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <Info size={13} strokeWidth={2} aria-hidden="true" />
        <span id={id} className="sr-only">{description}</span>
      </button>
    </Tooltip>
  )
}

/** A labelled block of a tour panel: the eyebrow, an optional control on its right, then the content. */
export function TourSection({ label, action, children, className = '' }: { label: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="mb-2 flex min-h-[18px] items-center gap-2">
        <Eyebrow>{label}</Eyebrow>
        {action && <span className="ms-auto flex items-center">{action}</span>}
      </div>
      {children}
    </section>
  )
}

/** One sentence the panel has to say (read-only, a warning, a status), in the card look. */
export function TourNotice({ tone = 'neutral', icon, children, role }: { tone?: 'neutral' | 'warning'; icon?: ReactNode; children: ReactNode; role?: 'status' }) {
  const look = tone === 'warning'
    ? 'border-transparent bg-warning-soft text-warning'
    : 'border-edge-faint bg-surface-card text-content-muted'
  return (
    <div role={role} className={`flex items-start gap-2 rounded-[10px] border px-3 py-2 leading-snug ${look}`} style={fs(12, 'body')}>
      {icon && <span className="mt-[2px] flex-none">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

/** The chevron that folds a section away, quiet like the rest of a panel's controls. */
export function FoldButton({ expanded, onToggle, controls, label }: { expanded: boolean; onToggle: () => void; controls: string; label: string }) {
  return (
    <Tooltip label={label}>
      <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={controls} aria-label={label}
        className="grid h-6 w-6 place-items-center rounded-full text-content-faint transition-colors hover:bg-surface-card hover:text-content focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
        <ChevronDown size={14} strokeWidth={2.2} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
      </button>
    </Tooltip>
  )
}

interface TourMetricField {
  label: string
  /** Said instead of `label` where the field is too narrow for it, rather than cutting it off. */
  shortLabel?: string
  value: string
  info?: { label: string; description: string }
}

/** A label that falls back to its short form when the full one does not fit its box. */
function FitLabel({ full, short }: { full: string; short?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [narrow, setNarrow] = useState(false)
  useLayoutEffect(() => {
    const element = ref.current?.parentElement
    if (!element || !short) return
    // Measured with the full text in place: it fits when it does not overflow its box.
    const check = () => {
      const probe = ref.current
      if (!probe) return
      setNarrow(probe.scrollWidth > element.clientWidth + 0.5)
    }
    check()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(check)
    observer.observe(element)
    return () => observer.disconnect()
  }, [full, short])
  if (!short) return <>{full}</>
  return (
    <>
      <span ref={ref} aria-hidden={narrow || undefined} className={`inline-block whitespace-nowrap ${narrow ? 'invisible absolute' : ''}`}>{full}</span>
      {narrow && <span title={full}>{short}</span>}
    </>
  )
}

/**
 * A tour's numbers as labelled fields, the way a booking card shows its facts:
 * distance, any extra the caller has (the walking time), then the altitudes.
 */
export function TourMetricFields({ analysis, unit, extra = [], columns }: {
  analysis: Pick<RouteGeometryAnalysis, 'distanceKm' | 'minEle' | 'maxEle' | 'gain' | 'loss'> | null
  unit?: DistanceUnit
  extra?: Array<TourMetricField>
  /** A fixed column count for a narrow rail; the inspector lets the fields flow. */
  columns?: 2
}) {
  const { t } = useTranslation()
  const fields: TourMetricField[] = [
    { label: t('tours.detail.distance'), value: analysis ? formatDistance(analysis.distanceKm, unit) : '-' },
    ...extra,
  ]
  if (analysis?.minEle != null) fields.push({ label: t('tours.detail.minAltitude'), value: formatElevation(analysis.minEle, unit) })
  if (analysis?.maxEle != null) fields.push({ label: t('tours.detail.maxAltitude'), value: formatElevation(analysis.maxEle, unit) })
  if (analysis?.gain != null) fields.push({ label: t('tours.detail.ascent'), value: formatElevation(analysis.gain, unit) })
  if (analysis?.loss != null) fields.push({ label: t('tours.detail.descent'), value: formatElevation(analysis.loss, unit) })
  const grid = columns === 2 ? 'grid-cols-2' : 'grid-cols-[repeat(auto-fit,minmax(104px,1fr))]'
  return (
    <dl className={`m-0 grid gap-2 ${grid}`}>
      {fields.map(field => (
        <div key={field.label} className="min-w-0">
          <dt className="mb-[3px] flex min-w-0 items-center gap-0.5">
            <Eyebrow className="relative min-w-0 truncate"><FitLabel full={field.label} short={field.shortLabel} /></Eyebrow>
            {field.info && <span className="-my-1 flex-none"><InfoDot label={field.info.label} description={field.info.description} /></span>}
          </dt>
          <dd className={`${BOX} m-0 truncate px-[10px] py-[7px] text-center font-semibold tabular-nums text-content`} style={fs(12.5, 'body')}>{field.value}</dd>
        </div>
      ))}
    </dl>
  )
}
