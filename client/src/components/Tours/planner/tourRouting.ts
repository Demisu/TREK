import type { BikeProfile, HikingPreferences, RunProfile, TourFixedLeg } from '@trek/shared'
import type { Waypoint } from '../../../types'
import { valhallaBase, valhallaRun, valhallaTurn, type CostingOptions } from '../../Map/valhallaRoute'
import { hikingCosting, TOURS_MAX_HIKING_DIFFICULTY } from './hikingCosting'
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
  /** Null where no time is worked out at all: a ride (HOR-01). */
  durationSeconds: number | null
}

/** How fast a fixed leg is reckoned until the heights are in: a via ferrata climbs slowly, a free leg is walked. */
const FIXED_LEG_KM_PER_HOUR = { ferrata: 1.5, free: 4, portage: 2 } as const
/** A leg drawn by hand on a bike tour is reckoned at an easy riding pace: no router saw it. */
const FREE_LEG_RIDING_KM_PER_HOUR = 15

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
  return routeOnLand(waypoints, 'walking', hikingCosting(maxHikingDifficulty, preferences), signal)
}

/**
 * CW-01: a city walk, on foot between its stations. No hiking limit is sent,
 * so the router keeps to the ways it takes for walking anyway (T1), and no
 * route choice of a hike. Ferries are avoided: a walk is walked, and with the
 * router's default Venice was crossed on the vaporetto lines instead of the
 * bridges. Where no way on land exists the router still takes the ferry.
 */
export async function routeCityWalk(
  waypoints: LandWaypoint[],
  signal?: AbortSignal,
): Promise<TourRouteResult | TourRouteUnreachable | null> {
  return routeOnLand(waypoints, 'walking', CITY_WALK_COSTING, signal)
}

const CITY_WALK_COSTING: Readonly<CostingOptions> = { use_ferry: 0 }

/**
 * RUN-01, RUN-02: what each run profile asks Valhalla's pedestrian costing
 * for. A run is run, so a ferry only where no way on land exists
 * (`use_ferry` 0). Checked with trace_attributes against the public instance
 * on 20.10.2026 (shares of the length):
 * - running keeps to runnable, mostly paved ways: farm and forest tracks only
 *   where there is no other way (`use_tracks` 0), and no hiking limit, so the
 *   router keeps to the ways it takes for walking anyway (T1). Berlin S
 *   Grunewald into the forest went from 95 % tracks with 3 % paved to 67 %
 *   smooth paved paths over 3.58 km instead of 3.50 km; Munich Großhesseloher
 *   Brücke to Pullach from 79 % to 88 % smooth asphalt and no track left;
 *   Marienplatz to the Englischer Garten stayed as it was.
 * - trail takes tracks wherever they serve (`use_tracks` 1) and admits
 *   mountain paths up to T2 (`max_hiking_difficulty` 2), never T3 and above.
 *   Above Freiburg Günterstal up to the Schauinsland it went from 82 % roads
 *   and 83 % paved (running) to 78 % forest tracks and 81 % compacted, gravel
 *   and dirt over 9.57 km instead of 10.15 km; Rathen to the Bastei took 28 % of T2
 *   path that running leaves out; Heidelberg's old town, all streets, stayed
 *   as it was. Leaning on footways (`walkway_factor`) was tried and left out:
 *   along the Isar it moved the run onto paved footways, from 33 % to 18 %
 *   unpaved.
 * The router's own time is a walker's and is never used: a run's time is its
 * distance at the runner's pace, whatever the profile. Nothing here says a
 * way can be run.
 */
const RUN_COSTING: Record<RunProfile, Readonly<CostingOptions>> = {
  running: { use_tracks: 0, use_ferry: 0 },
  trail: { use_tracks: 1, use_ferry: 0, max_hiking_difficulty: 2 },
}

/** RUN-01, RUN-02: a run, on foot for its profile; a leg drawn by hand is kept as drawn. */
export async function routeRun(
  waypoints: LandWaypoint[],
  profile: RunProfile,
  signal?: AbortSignal,
): Promise<TourRouteResult | TourRouteUnreachable | null> {
  return routeOnLand(waypoints, 'walking', RUN_COSTING[profile], signal)
}

/** BIK-01: a bike tour, routed for its profile; a leg drawn by hand is kept as drawn. */
export async function routeBikeTour(
  waypoints: LandWaypoint[],
  profile: BikeProfile,
  signal?: AbortSignal,
): Promise<TourRouteResult | TourRouteUnreachable | null> {
  return routeOnLand(waypoints, 'cycling', BIKE_COSTING[profile], signal)
}

/**
 * HOR-01: a ride, put together from its legs as they are: a section of a horse
 * route keeps its own line, a leg drawn by hand is sampled along its length so
 * its heights follow the ground. No router is asked, nothing between the legs
 * is filled in, and no riding time is worked out. Null while a leg has no line
 * of its own, which a ride never keeps.
 */
export function rideTour(waypoints: LandWaypoint[]): TourRouteResult | null {
  const lines: TourRoutePart[] = []
  for (const point of waypoints.slice(0, -1)) {
    const leg = point.fixedLeg
    if (!leg) return null
    const drawn = leg.geometry.map(([lat, lng]): [number, number] => [lat, lng])
    const section = leg.kind === 'horse_route'
    lines.push({ coordinates: section ? drawn : densifyLine(drawn), free: !section })
  }
  if (lines.length === 0) return null
  const coordinates = lines.flatMap((line, index) => (index === 0 ? line.coordinates : line.coordinates.slice(1)))
  const distanceMeters = lines.reduce((sum, line) => sum + lineLengthM(line.coordinates), 0)
  return { coordinates, parts: mergeParts(lines), distanceMeters, durationSeconds: null }
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
    // A section of a horse route is a ride's (HOR-01), which no router plans and no clock times.
    if (leg.kind === 'horse_route') return null
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
