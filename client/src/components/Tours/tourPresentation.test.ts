import { describe, expect, it, vi } from 'vitest'
import { filterTours, formatPlannedTourDuration, hikeSourceBadgeLabel, plannedTotalText, tourPlannedTimes, tourSource, tourWebsitePresentation } from './tourPresentation'

describe('tourPresentation', () => {
  it('formats planned Tour totals using the shared compact duration formatter', () => {
    expect(formatPlannedTourDuration(0)).toBe('0 min')
    expect(formatPlannedTourDuration(45)).toBe('45 min')
    expect(formatPlannedTourDuration(95)).toBe('1 h 35 min')
  })

  it('calculates planned total from walking and breaks unless a manual override exists', () => {
    expect(tourPlannedTimes({ duration: 80, planned_duration_minutes: null, break_additional_minutes: 25 })).toEqual({
      walkingMinutes: 80, breakMinutes: 25, plannedTotalMinutes: 105, manuallyOverridden: false, walk: null, atLeast: false,
    })
    expect(tourPlannedTimes({ duration: 80, planned_duration_minutes: 130, break_additional_minutes: 25 })).toEqual({
      walkingMinutes: 80, breakMinutes: 25, plannedTotalMinutes: 130, manuallyOverridden: true, walk: null, atLeast: false,
    })
    expect(tourPlannedTimes({ duration: null, planned_duration_minutes: null, break_additional_minutes: 25 }).plannedTotalMinutes).toBeNull()
  })

  it('CW-02: adds a city walk its stays and no breaks, and says the total is at least that while a stay is not entered', () => {
    const walk = { tour_type: 'walk' as const, duration: 45, planned_duration_minutes: null, break_additional_minutes: 15 }
    expect(tourPlannedTimes({ ...walk, station_count: 3, station_stay_minutes: 120, station_stays_unknown: 0 })).toEqual({
      walkingMinutes: 45, breakMinutes: null, plannedTotalMinutes: 165, manuallyOverridden: false, atLeast: false,
      walk: { walkingMinutes: 45, stayMinutes: 120, unknownStays: 0, stations: 3, totalMinutes: 165, partial: false },
    })
    const partial = tourPlannedTimes({ ...walk, station_count: 3, station_stay_minutes: 90, station_stays_unknown: 1 })
    expect(partial).toMatchObject({ plannedTotalMinutes: 135, atLeast: true })
    // A total entered by hand is that total, whatever the stays say.
    expect(tourPlannedTimes({ ...walk, planned_duration_minutes: 200, station_count: 3, station_stay_minutes: 90, station_stays_unknown: 1 }))
      .toMatchObject({ plannedTotalMinutes: 200, manuallyOverridden: true, atLeast: false })
    // A list cached before the stays were listed: the walking time alone, and still no breaks.
    expect(tourPlannedTimes(walk)).toMatchObject({ breakMinutes: null, plannedTotalMinutes: 45, walk: null, atLeast: false })
    expect(tourPlannedTimes({ ...walk, station_stay_minutes: 30 }).walk).toMatchObject({ stations: 0, unknownStays: 0, totalMinutes: 75 })
  })

  it('CW-02: says a planned total as it is, at least that much, or as a badge with ≥', () => {
    const t = (key: string, params?: Record<string, unknown>) => `${key}:${String(params?.time)}`
    expect(plannedTotalText({ plannedTotalMinutes: null, atLeast: false }, t)).toBeNull()
    expect(plannedTotalText({ plannedTotalMinutes: 165, atLeast: false }, t)).toBe('2 h 45 min')
    expect(plannedTotalText({ plannedTotalMinutes: 165, atLeast: true }, t)).toBe('tours.walk.totalAtLeast:2 h 45 min')
    expect(plannedTotalText({ plannedTotalMinutes: 165, atLeast: true }, t, true)).toBe('≥ 2 h 45 min')
  })

  it('uses the source abstraction for TREK, GPX import, and wanderer badges', () => {
    const t = vi.fn((key: string) => key)

    expect(tourSource({ wanderer_ref: null })).toBe('trek')
    expect(hikeSourceBadgeLabel({ wanderer_ref: null }, t)).toBe('tours.badge.trek')
    expect(tourSource({ wanderer_ref: null, has_waypoints: false })).toBe('gpx')
    expect(hikeSourceBadgeLabel({ wanderer_ref: null, has_waypoints: false }, t)).toBe('tours.badge.gpx')
    expect(tourSource({ wanderer_ref: 'wanderer:123' })).toBe('wanderer')
    expect(hikeSourceBadgeLabel({ wanderer_ref: 'wanderer:123' }, t)).toBe('tours.badge.wanderer')
  })

  it('P2C-02: takes the origin the server recorded over the shape of the tour', () => {
    // An import planned over in place has waypoints, and is still an import.
    expect(tourSource({ wanderer_ref: null, has_waypoints: true, origin: 'gpx' })).toBe('gpx')
    expect(tourSource({ wanderer_ref: null, has_waypoints: false, origin: 'trek' })).toBe('trek')
    expect(tourSource({ wanderer_ref: 'w#1', origin: 'wanderer' })).toBe('wanderer')
  })

  it('filters tours by All, Unplanned and Planned, keeping their order', () => {
    const tours = [
      { id: 1, planned: true },
      { id: 2, planned: false },
      { id: 3, planned: true },
      { id: 4, planned: false },
    ]

    expect(filterTours(tours, 'all')).toEqual(tours)
    expect(filterTours(tours, 'all')).not.toBe(tours)
    expect(filterTours(tours, 'unplanned').map(tour => tour.id)).toEqual([2, 4])
    expect(filterTours(tours, 'planned').map(tour => tour.id)).toEqual([1, 3])
    expect(filterTours([], 'planned')).toEqual([])
  })
  it.each([
    ['https://www.komoot.com/tour/42', 'Komoot', 'komoot.com'],
    ['https://trail.alltrails.com/route/42', 'AllTrails', 'trail.alltrails.com'],
    ['https://www.outdooractive.de/route/42', 'Outdooractive', 'outdooractive.de'],
    ['https://demo.wanderer.to/trail/view/42', 'Wanderer', 'demo.wanderer.to'],
  ])('classifies %s by its hostname', (href, provider, domain) => {
    expect(tourWebsitePresentation(href)).toEqual({ href, provider, domain })
  })

  it('labels an unknown HTTPS host as an external website domain', () => {
    expect(tourWebsitePresentation('https://www.example.org/path')).toEqual({
      href: 'https://www.example.org/path',
      provider: null,
      domain: 'example.org',
    })
    expect(tourWebsitePresentation('https://komoot.com.evil.test/route')).toMatchObject({
      provider: null,
      domain: 'komoot.com.evil.test',
    })
  })

  it.each(['http://komoot.com/route', 'https://user:pass@komoot.com/route', 'javascript:alert(1)'])
    ('does not classify unsafe URL %s', value => {
      expect(tourWebsitePresentation(value)).toBeNull()
    })
})
