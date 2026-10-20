import { SAC_SCALE_VALUES, sacStepOf, type SacScale, type TourTrailGrade } from '@trek/shared';
import { sharesBy, stretchesOf, type ClassShare, type RouteWayEdge, type RouteWays } from '../bike/routeWays';
import type { TrailGrades } from '../bike/useRouteWays';
import type { HikePaintKey } from './hikePaint';

/**
 * MAP-03: the SAC grades along a hike, read stretch by stretch from the
 * `sac_scale` OpenStreetMap gives the ways under it. Pure, so the classes,
 * their shares and their stretches are tested apart from the requests.
 *
 * A step (`t1` to `t6`) is only ever what OpenStreetMap wrote for that way.
 * Everything else is unknown, and the reason stays apart: the way has no
 * grade (`untagged`), a grade that names no single step (`unclear`), no way
 * clearly under the tour's line (`unmatched`), or OpenStreetMap could not be
 * asked this time (`unasked`). None of them is ever read as T1.
 */

type SacStepClass = 't1' | 't2' | 't3' | 't4' | 't5' | 't6';
type SacUnknownClass = 'untagged' | 'unclear' | 'unmatched' | 'unasked';
export type SacClass = SacStepClass | SacUnknownClass;

/** The order the card lists the classes in: the steps from easy to hard, then the unknown. */
const SAC_CLASSES: readonly SacClass[] = [
  't1',
  't2',
  't3',
  't4',
  't5',
  't6',
  'untagged',
  'unclear',
  'unmatched',
  'unasked',
];

export function isSacStep(key: SacClass): key is SacStepClass {
  return /^t[1-6]$/.test(key);
}

/** The step a class stands for, 1 to 6; null for the unknown. */
export function sacStepOfClass(key: SacClass): number | null {
  return isSacStep(key) ? Number(key.slice(1)) : null;
}

/** The `sac_scale` value OpenStreetMap writes for a step's class. */
export function sacTagOf(key: SacStepClass): SacScale {
  return SAC_SCALE_VALUES[Number(key.slice(1)) - 1];
}

/** The paint of a class: the step's own, and the grey of the unknown for every kind of unknown. */
export function sacPaintKey(key: SacClass): HikePaintKey | 'unknown' {
  return isSacStep(key) ? key : 'unknown';
}

function stepClassOf(grade: TourTrailGrade | undefined): SacClass {
  if (grade?.sac_scale) return `t${sacStepOf(grade.sac_scale)}`;
  return grade?.sac_scale_unclear ? 'unclear' : 'untagged';
}

/** How each stretch of the matched line reads, given the grades and the edges that stray from the tour's own line. */
export function sacClassifier(
  grades: Pick<TrailGrades, 'byWay' | 'unasked'>,
  strays: ReadonlySet<RouteWayEdge>
): (edge: RouteWayEdge) => SacClass {
  return (edge) => {
    if (edge.wayId === null || strays.has(edge)) return 'unmatched';
    if (grades.unasked.has(edge.wayId)) return 'unasked';
    return stepClassOf(grades.byWay.get(edge.wayId));
  };
}

/** The share of each class along the line, in the card's order; classes the line has none of are left out. */
export function sacShares(ways: RouteWays, classOf: (edge: RouteWayEdge) => SacClass): ClassShare<SacClass>[] {
  return sharesBy(ways, classOf).sort((a, b) => SAC_CLASSES.indexOf(a.key) - SAC_CLASSES.indexOf(b.key));
}

/** The grade's tags as OpenStreetMap wrote them where they name no single step, each once. */
export function unclearTags(
  ways: RouteWays,
  grades: Pick<TrailGrades, 'byWay'>,
  inClass: (edge: RouteWayEdge) => boolean
): string[] {
  const tags = new Set<string>();
  for (const edge of ways.edges) {
    const written = edge.wayId === null ? null : grades.byWay.get(edge.wayId)?.sac_scale_unclear;
    if (written && inClass(edge)) tags.add(written);
  }
  return [...tags];
}

/** The highest step known anywhere along the line, or null where none is. */
export function highestStep(rows: readonly ClassShare<SacClass>[]): number | null {
  const steps = rows.map((row) => sacStepOfClass(row.key)).filter((step): step is number => step !== null);
  return steps.length ? Math.max(...steps) : null;
}

interface SacOverlay {
  lines: [number, number][][];
  paints: (HikePaintKey | 'unknown')[];
}

/**
 * Every class's stretches with their paints, for drawing the grades along the
 * whole line at once; `only` draws one class alone.
 */
export function sacOverlay(
  ways: RouteWays,
  rows: readonly ClassShare<SacClass>[],
  classOf: (edge: RouteWayEdge) => SacClass,
  only: SacClass | null = null
): SacOverlay {
  const lines: [number, number][][] = [];
  const paints: (HikePaintKey | 'unknown')[] = [];
  for (const row of rows) {
    if (only && row.key !== only) continue;
    for (const line of stretchesOf(ways, (edge) => classOf(edge) === row.key)) {
      lines.push(line);
      paints.push(sacPaintKey(row.key));
    }
  }
  return { lines, paints };
}
