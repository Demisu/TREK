import type { HikingPreferences, TourFixedLeg } from '@trek/shared'
import type { Waypoint } from '../../../types'
import { valhallaBase, valhallaRun, valhallaTurn } from '../../Map/valhallaRoute'
import { densifyLine, lineLengthM } from './tourFixedLegs'

export interface TourRoutePart {
  coordinates: [number, number][]
  /** Drawn by hand: no router planned or checked it. */
  free: boolean
  /** PAD-03: carried over land, a portage of a paddle tour; absent on water and on a hike. */
  land?: boolean
  /**
   * PAD-11: on a routed paddle tour, a stretch the paddler should look at:
   * whitewater or a boat pass, a gap in the data the router bridged, or a leg
   * it could not plan (drawn straight, and nothing checked it).
   */
  mark?: 'rapids' | 'gap' | 'unrouted'
}

export interface TourRouteResult {
  coordinates: [number, number][]
  /** The same line cut where it changes between routed and hand-drawn, for the map to tell them apart. */
  parts: TourRoutePart[]
  distanceMeters: number
  durationSeconds: number
}

/**
 * Defensive fallback only. Normal planner calls pass the persisted/draft value.
 * TREK exposes 1..6 and never exposes Valhalla's internal 0.
 */
const TOURS_MAX_HIKING_DIFFICULTY = 2

/** How fast a fixed leg is reckoned until the heights are in: a via ferrata climbs slowly, a free leg is walked. */
const FIXED_LEG_KM_PER_HOUR = { ferrata: 1.5, free: 4, portage: 2 } as const

/**
 * MF-08: a hike's preferences as Valhalla's pedestrian costing options. Each
 * one was checked against the public instance before it was offered, and is a
 * weighting that gives way where there is no other path:
 * - avoid_steps, `step_penalty` 600 s: Würzburg Altstadt to the Festung went
 *   from four flights of steps over 1.49 km to one over 2.67 km.
 * - avoid_ferries, `use_ferry` 0: Kiel Reventlou to Dietrichsdorf went from the
 *   Förde ferry (2.7 km) round the fjord on land (8.3 km); Hamburg
 *   Landungsbrücken to Steinwerder through the old Elbe tunnel instead of the ferry.
 * - prefer_paths, `walkway_factor` 0.5: footpaths of their own weigh half of a
 *   road, which moved Garmisch station to the Partnachklamm onto the paths.
 * - shortest, `shortest`: the way by its length, not its time (Garmisch to the
 *   Eckbauer 5.09 km to 4.96 km); it still honours the penalties above.
 * Left out because the router showed no effect on foot: `use_hills` and
 * `use_tracks`; nor has it any option for marked, paved or rough ways.
 */
export function hikingCostingOptions(preferences: HikingPreferences | null | undefined): Record<string, number | boolean> {
  return {
    ...(preferences?.avoid_steps ? { step_penalty: 600 } : {}),
    ...(preferences?.avoid_ferries ? { use_ferry: 0 } : {}),
    ...(preferences?.prefer_paths ? { walkway_factor: 0.5 } : {}),
    ...(preferences?.shortest ? { shortest: true } : {}),
  }
}

/**
 * Tours deliberately bypasses the OSRM-first RouteCalculator. A waypoint whose
 * leg is fixed (a via ferrata on the tour) hands its own line over for that
 * leg; the router only plans the runs between fixed legs, one request each.
 */
export async function routeWalkingTour(
  waypoints: Array<Pick<Waypoint, 'lat' | 'lng'> & { fixedLeg?: TourFixedLeg | null }>,
  signal?: AbortSignal,
  maxHikingDifficulty = TOURS_MAX_HIKING_DIFFICULTY,
  preferences: HikingPreferences | null = null,
): Promise<TourRouteResult | null> {
  const lines: TourRoutePart[] = []
  let distanceMeters = 0
  let durationSeconds = 0
  const routeRun = async (run: Array<Pick<Waypoint, 'lat' | 'lng'>>) => {
    if (run.length < 2) return true
    const routed = await valhallaRun(run.map(({ lat, lng }) => ({ lat, lng })), 'walking', [], signal, {
      max_hiking_difficulty: maxHikingDifficulty,
      ...hikingCostingOptions(preferences),
    })
    if (!routed) return false
    lines.push({ coordinates: routed.total.coordinates, free: false })
    distanceMeters += routed.total.distance
    durationSeconds += routed.total.duration
    return true
  }

  let run: Array<Pick<Waypoint, 'lat' | 'lng'>> = waypoints.slice(0, 1)
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const leg = waypoints[i].fixedLeg
    if (!leg) {
      run.push(waypoints[i + 1])
      continue
    }
    if (!(await routeRun(run))) return null
    const drawn = leg.geometry.map(([lat, lng]): [number, number] => [lat, lng])
    // A hand-drawn leg is sampled along its length, so its heights follow the ground between its ends.
    const line = leg.kind === 'ferrata' ? drawn : densifyLine(drawn)
    const length = lineLengthM(line)
    lines.push({ coordinates: line, free: leg.kind !== 'ferrata', ...(leg.kind === 'portage' ? { land: true } : {}) })
    distanceMeters += length
    durationSeconds += (length / 1000 / FIXED_LEG_KM_PER_HOUR[leg.kind]) * 3600
    run = [waypoints[i + 1]]
  }
  if (!(await routeRun(run))) return null
  if (lines.length === 0) return null

  // One line: each part after the first starts where the one before it ended, so its first point goes.
  const coordinates = lines.flatMap((line, index) => (index === 0 ? line.coordinates : line.coordinates.slice(1)))
  return { coordinates, parts: mergeParts(lines), distanceMeters, durationSeconds }
}

/** Neighbouring parts of the same kind as one, so a run of hand-drawn legs is one dotted line and a portage one line on land. */
function mergeParts(parts: TourRoutePart[]): TourRoutePart[] {
  const merged: TourRoutePart[] = []
  for (const part of parts) {
    const previous = merged[merged.length - 1]
    if (previous && previous.free === part.free && !!previous.land === !!part.land) {
      previous.coordinates = [...previous.coordinates, ...part.coordinates.slice(1)]
    } else {
      merged.push({ coordinates: [...part.coordinates], free: part.free, ...(part.land ? { land: true } : {}) })
    }
  }
  return merged
}

const HEIGHT_CHUNK_SIZE = 500

export type TourElevationPoint = [number, number] | [number, number, number]

type HeightResponse = {
  range_height?: unknown
}

export function parseValhallaElevation(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseElevations(data: HeightResponse, expected: number): (number | null)[] | null {
  if (!Array.isArray(data.range_height) || data.range_height.length !== expected) return null
  return data.range_height.map(entry => {
    if (!Array.isArray(entry) || entry.length < 2) return null
    return parseValhallaElevation(entry[1])
  })
}

/**
 * Ask Valhalla's independent /height stage for every routed vertex. Chunks
 * overlap by one point so full route resolution is retained without inventing
 * elevations when a host rejects a large request.
 */
export async function enrichTourElevations(
  coordinates: [number, number][],
  signal?: AbortSignal,
): Promise<TourElevationPoint[] | null> {
  const base = valhallaBase()
  if (!base || coordinates.length < 2) return null

  const elevations: (number | null)[] = Array(coordinates.length).fill(null)
  for (let offset = 0; offset < coordinates.length; offset += HEIGHT_CHUNK_SIZE - 1) {
    if (signal?.aborted) return null
    const chunk = coordinates.slice(offset, offset + HEIGHT_CHUNK_SIZE)
    if (chunk.length === 1 && offset > 0) break
    try {
      // The route came from the same host a moment ago, and the public one allows a
      // request a second: without the wait the first height question is refused and
      // the tour cannot be saved for want of elevation.
      await valhallaTurn(base, signal)
      if (signal?.aborted) return null
      const response = await fetch(`${base}/height`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'trek' },
        body: JSON.stringify({
          shape: chunk.map(([lat, lng]) => ({ lat, lon: lng })),
          range: true,
        }),
        signal,
      })
      if (!response.ok) break
      const chunkElevations = parseElevations(await response.json() as HeightResponse, chunk.length)
      if (!chunkElevations) break
      chunkElevations.forEach((elevation, index) => {
        const routeIndex = offset + index
        if (offset > 0 && index === 0 && elevations[routeIndex] !== null) return
        elevations[routeIndex] = elevation
      })
    } catch {
      if (signal?.aborted) return null
      break
    }
  }

  return coordinates.map(([lat, lng], index) => {
    const elevation = elevations[index]
    return elevation === null ? [lat, lng] : [lat, lng, elevation]
  })
}
