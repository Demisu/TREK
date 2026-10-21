import type { TourFixedLeg } from './tours.schema';

type LinePoint = readonly [number, number, ...number[]];

/** Closer than this, in degrees, a point of the saved line is the point of a leg it was built from. */
const SAME_POINT_DEG = 1e-6;

/** CW-12: the boat part of each ferry leg of a city walk, in the order of the legs. */
export function ferryCrossingsOf(
  points: ReadonlyArray<{ fixed_leg?: TourFixedLeg | null }>,
): Array<Array<[number, number]>> {
  return points.flatMap((point) => {
    const leg = point.fixed_leg;
    if (leg?.kind !== 'ferry') return [];
    return [leg.geometry.slice(leg.crossing[0], leg.crossing[1] + 1).map(([lat, lng]): [number, number] => [lat, lng])];
  });
}

function indexOfPoint(line: ReadonlyArray<LinePoint>, point: readonly [number, number], from: number): number {
  for (let index = from; index < line.length; index += 1) {
    const at = line[index];
    if (at && Math.abs(at[0] - point[0]) < SAME_POINT_DEG && Math.abs(at[1] - point[1]) < SAME_POINT_DEG) return index;
  }
  return -1;
}

/**
 * Where on a walk's saved line its crossings by boat run, as the indices of the
 * points the boat leaves from and lands at. The line was put together from the
 * legs as they are, so each crossing is found by its own points in turn; one
 * that cannot be found is left out rather than guessed.
 */
export function boatSpansOf(
  line: ReadonlyArray<LinePoint>,
  crossings: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let from = 0;
  for (const crossing of crossings) {
    const first = crossing[0];
    const last = crossing[crossing.length - 1];
    if (!first || !last || crossing.length < 2) continue;
    const start = indexOfPoint(line, first, from);
    const end = start < 0 ? -1 : indexOfPoint(line, last, start + 1);
    if (end < 0) continue;
    spans.push([start, end]);
    from = end;
  }
  return spans;
}
