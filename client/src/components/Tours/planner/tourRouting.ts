import type { BikeProfile, HikingPreferences, TourFixedLeg } from '@trek/shared'
import type { Waypoint } from '../../../types'
import { valhallaBase, valhallaRun, valhallaTurn, type CostingOptions } from '../../Map/valhallaRoute'
import { densifyLine, lineLengthM } from './tourFixedLegs'
import { MAX_TOUR_SNAP_M, type TourRouteUnreachable } from './tourRouteOutcome'

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
/** A leg drawn by hand on a bike tour is reckoned at an easy riding pace: no router saw it. */
const FREE_LEG_RIDING_KM_PER_HOUR = 15

/**
 * MF-08, RTE-01: a hike's preferences as Valhalla's pedestrian costing
 * options. Each one was checked against the public instance before it was
 * offered, and is a weighting that gives way where there is no other path:
 * - avoid_climbs, `use_hills` 0.2: Freiburg Martinstor to the Schlossberg went
 *   from 1.64 km with a 37 % pitch and 30 m over 25 % to 1.73 km whose steepest
 *   stretch is 23 % (heights every 30 m). It weighs the grade, not the climb in
 *   sum: the same height is still gained. 0.1 and below sent Garmisch station
 *   to the Eckbauer round a 10 km detour with more steep metres, 0.25 and up
 *   left Freiburg as it was; 0.2 does neither.
 * - avoid_steps, `step_penalty` 600 s: Würzburg Altstadt to the Festung went
 *   from four flights of steps over 1.49 km to one over 2.67 km.
 * - avoid_ferries, `use_ferry` 0: Kiel Reventlou to Dietrichsdorf went from the
 *   Förde ferry (2.7 km) round the fjord on land (8.3 km); Hamburg
 *   Landungsbrücken to Steinwerder through the old Elbe tunnel instead of the ferry.
 * The router has no option for marked, paved or rough ways on foot.
 */
export function hikingCostingOptions(preferences: HikingPreferences | null | undefined): Record<string, number> {
  return {
    ...(preferences?.avoid_climbs ? { use_hills: 0.2 } : {}),
    ...(preferences?.avoid_steps ? { step_penalty: 600 } : {}),
    ...(preferences?.avoid_ferries ? { use_ferry: 0 } : {}),
  }
}

/**
 * BIK-01 to BIK-04: what each bike profile asks Valhalla's bicycle costing for.
 * Every one was checked against the public instance with trace_attributes over
 * the routes it gave, before it was offered (shares of the length):
 * - touring, Hybrid with bad surfaces avoided: Garmisch station to the Eckbauer
 *   92 % asphalt and no gravel, where gravel took 18 % gravel on farm tracks.
 * - road, Road at full surface avoidance: Herrsching to Andechs 100 % asphalt
 *   over 6.2 km, where touring took 4.98 km with 7 % dirt and 10 % compacted.
 * - gravel, Cross with surfaces barely avoided: Munich Marienplatz to the
 *   Englischer Garten 39 % compacted paths along the Isar, touring 9 %.
 * - mtb, Mountain with no surface avoidance and roads least wanted: Garmisch
 *   to the Eckbauer 63 % tracks and 38 % gravel.
 * `use_roads` and the bicycle type also set the router's riding speed, so the
 * time it gives is the profile's. None of it says a way is rideable or safe.
 */
const BIKE_COSTING: Record<BikeProfile, Readonly<CostingOptions>> = {
  touring: { bicycle_type: 'Hybrid', use_roads: 0.2, avoid_bad_surfaces: 1 },
  road: { bicycle_type: 'Road', use_roads: 0.5, avoid_bad_surfaces: 1 },
  gravel: { bicycle_type: 'Cross', use_roads: 0.1, avoid_bad_surfaces: 0.25 },
  mtb: { bicycle_type: 'Mountain', use_roads: 0, avoid_bad_surfaces: 0 },
}

type LandWaypoint = Pick<Waypoint, 'lat' | 'lng'> & { fixedLeg?: TourFixedLeg | null }

/**
 * Tours deliberately bypasses the OSRM-first RouteCalculator. A waypoint whose
 * leg is fixed (a via ferrata on the tour) hands its own line over for that
 * leg; the router only plans the runs between fixed legs, one request each.
 */
export async function routeWalkingTour(
  waypoints: LandWaypoint[],
  signal?: AbortSignal,
  maxHikingDifficulty = TOURS_MAX_HIKING_DIFFICULTY,
  preferences: HikingPreferences | null = null,
): Promise<TourRouteResult | TourRouteUnreachable | null> {
  return routeOnLand(waypoints, 'walking', {
    max_hiking_difficulty: maxHikingDifficulty,
    ...hikingCostingOptions(preferences),
  }, signal)
}

/**
 * CW-01: a city walk, on foot between its stations. No hiking limit is sent,
 * so the router keeps to the ways it takes for walking anyway (T1), and no
 * route choice of a hike.
 */
export async function routeCityWalk(
  waypoints: LandWaypoint[],
  signal?: AbortSignal,
): Promise<TourRouteResult | TourRouteUnreachable | null> {
  return routeOnLand(waypoints, 'walking', {}, signal)
}

/** BIK-01: a bike tour, routed for its profile; a leg drawn by hand is kept as drawn. */
export async function routeBikeTour(
  waypoints: LandWaypoint[],
  profile: BikeProfile,
  signal?: AbortSignal,
): Promise<TourRouteResult | TourRouteUnreachable | null> {
  return routeOnLand(waypoints, 'cycling', BIKE_COSTING[profile], signal)
}

async function routeOnLand(
  waypoints: LandWaypoint[],
  mode: 'walking' | 'cycling',
  costingOptions: Readonly<CostingOptions>,
  signal?: AbortSignal,
): Promise<TourRouteResult | TourRouteUnreachable | null> {
  const lines: TourRoutePart[] = []
  let distanceMeters = 0
  let durationSeconds = 0
  let unreachable: TourRouteUnreachable | null = null
  // `first`: where the run starts along the tour, so a point it cannot reach is named by its place in the tour.
  const routeRun = async (run: Array<Pick<Waypoint, 'lat' | 'lng'>>, first: number) => {
    if (run.length < 2) return true
    const routed = await valhallaRun(run.map(({ lat, lng }) => ({ lat, lng })), mode, [], signal, costingOptions)
    if (!routed) return false
    const far = routed.snapped.findIndex((point) => point.meters > MAX_TOUR_SNAP_M)
    if (far >= 0) {
      unreachable = { unreachable: first + far, snappedMeters: Math.round(routed.snapped[far].meters) }
      return false
    }
    lines.push({ coordinates: routed.total.coordinates, free: false })
    distanceMeters += routed.total.distance
    durationSeconds += routed.total.duration
    return true
  }

  let run: Array<Pick<Waypoint, 'lat' | 'lng'>> = waypoints.slice(0, 1)
  let runStart = 0
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const leg = waypoints[i].fixedLeg
    if (!leg) {
      run.push(waypoints[i + 1])
      continue
    }
    if (!(await routeRun(run, runStart))) return unreachable
    const drawn = leg.geometry.map(([lat, lng]): [number, number] => [lat, lng])
    // A hand-drawn leg is sampled along its length, so its heights follow the ground between its ends.
    const line = leg.kind === 'ferrata' ? drawn : densifyLine(drawn)
    const length = lineLengthM(line)
    const kmPerHour = mode === 'cycling' && leg.kind === 'free' ? FREE_LEG_RIDING_KM_PER_HOUR : FIXED_LEG_KM_PER_HOUR[leg.kind]
    lines.push({ coordinates: line, free: leg.kind !== 'ferrata', ...(leg.kind === 'portage' ? { land: true } : {}) })
    distanceMeters += length
    durationSeconds += (length / 1000 / kmPerHour) * 3600
    run = [waypoints[i + 1]]
    runStart = i + 1
  }
  if (!(await routeRun(run, runStart))) return unreachable
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
