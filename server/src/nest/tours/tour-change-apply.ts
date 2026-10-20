/**
 * MCP-T02: a prepared change laid onto the saved points of a tour, by the
 * rules of its type, without writing anything. The changes apply one after
 * the other, each naming the stations it touches by their keys, and the
 * answer is either the points as they would be or every change refused and
 * why: a proposal is shown whole or not at all, never half applied.
 *
 * A city walk is the first type that takes changes. What its travellers have
 * already done stays as it is: a station visited or skipped on any of its days
 * is neither removed, replaced nor moved, nothing new goes before it, and a
 * protected station (CW-10) keeps its place. A leg drawn by hand is kept as
 * drawn, so neither of its ends changes and nothing is put into it; the
 * closing leg of a loop counts as the leg into its first station.
 *
 * A leg runs from one station to the next through the shaping points that
 * steer it. Once a change takes a station out of a leg or puts one into it,
 * that leg is not the one its shaping points were set for, so they go with
 * it and the answer names them: the way after the change is routed through
 * the stations as they are, never past points steering a leg that is gone.
 * The ends of the walk therefore stay stations.
 */
import {
  CITY_WALK_MAX_STATIONS,
  isClosedLoop,
  type CityWalkStation,
  type TourChange,
  type TourChangeOp,
  type TourWaypoint,
} from '@trek/shared';

/**
 * The types of tour a proposal can change, each with every change. A hike, a
 * bike or a paddle tour plans its way in the planner with routing of its own
 * that a proposal cannot run, so it takes none yet rather than a way guessed.
 */
const CHANGEABLE_TYPES: ReadonlySet<string> = new Set(['walk']);

/** How a point of the changed plan came to be: kept from the saved tour, or brought in by a change. */
type DraftOrigin = 'saved' | 'added' | 'replacing' | 'moved';

/** A point of the plan as the changes leave it. */
export type DraftPoint = TourWaypoint & {
  /**
   * Its key where it is a saved point that has one; `saved:<sequence>` for one
   * saved before keys existed and `new:<change>` for a station a change brings
   * in, neither of which a key can spell.
   */
  ref: string;
  origin: DraftOrigin;
  /** The change (from 1) that brought it in or moved it; null for a point no change touched. */
  change: number | null;
  /** The saved station it was put after, so stops put after the same one keep the order they were given in. */
  after: string | null;
  /** The saved station a replacing one stands in for. */
  replaces: string | null;
};

/** A day the travellers marked a station on, and how. */
export interface StationDone {
  day_id: number;
  status: 'visited' | 'skipped';
}

type RefusalReason =
  | 'type_not_supported'
  | 'recorded_track'
  | 'unknown_station'
  | 'already_changed'
  | 'anchor_is_station'
  | 'protected'
  | 'done'
  | 'before_done'
  | 'fixed_leg'
  | 'place_not_linkable'
  | 'too_few_stations'
  | 'too_many_stations';

/** Why a change, or the whole proposal (change null), cannot be prepared. */
interface ChangeRefusal {
  change: number | null;
  op: TourChangeOp | null;
  key: string | null;
  reason: RefusalReason;
  /** For a station already done: the days it was visited or skipped on. */
  days?: StationDone[];
}

/** What the changes are laid onto: the saved tour as read, and what its travellers already did. */
export interface ChangeBasis {
  tourType: string;
  /** The tour stores no control points of its own: its points are the ends of a recorded track. */
  recorded: boolean;
  points: readonly TourWaypoint[];
  /** The stations visited or skipped on any day of the walk, by key. */
  done: ReadonlyMap<string, readonly StationDone[]>;
  /** The places of this trip a new station may stand for: no tour, none of another trip. */
  linkable: ReadonlySet<number>;
}

type ChangeOutcome =
  | {
      kind: 'ready';
      points: DraftPoint[];
      /** The saved stations a remove took out, and those a replace stands in for. */
      removed: DraftPoint[];
      replaced: DraftPoint[];
      /** The shaping points dropped with a leg a change took apart, each with that change. */
      shapingDropped: DraftPoint[];
    }
  | { kind: 'refused'; refused: ChangeRefusal[] };

/** A saved point as the changes start from it. */
export function savedPoint(point: TourWaypoint): DraftPoint {
  const ref = point.key ?? `saved:${point.sequence}`;
  return { ...point, ref, origin: 'saved', change: null, after: null, replaces: null };
}

function newStation(station: CityWalkStation, change: number): DraftPoint {
  return {
    ...station,
    role: 'via',
    sequence: 0,
    ref: `new:${change}`,
    origin: 'added',
    change,
    after: null,
    replaces: null,
  };
}

/** The work in progress: the points without the way back of a loop, and what the changes did so far. */
class ChangeRun {
  readonly body: DraftPoint[];
  readonly removed: DraftPoint[] = [];
  readonly replaced: DraftPoint[] = [];
  readonly shapingDropped: DraftPoint[] = [];
  readonly refused: ChangeRefusal[] = [];
  /** The saved stations a change removed or replaced, which no later change can name. */
  private readonly gone = new Set<string>();

  constructor(
    private readonly basis: ChangeBasis,
    private readonly loop: boolean,
  ) {
    const points = basis.points.map(savedPoint);
    this.body = loop ? points.slice(0, -1) : points;
  }

  apply(change: TourChange, index: number): void {
    const number = index + 1;
    const refuse = (reason: RefusalReason, key: string | null, days?: StationDone[]) =>
      this.refused.push({ change: number, op: change.op, key, reason, ...(days ? { days } : {}) });
    const before = this.refused.length;
    if ('station' in change) this.checkLink(change.station, (reason) => refuse(reason, null));
    if (change.op === 'add') {
      if (!this.slotAfter(change.after_key, null, refuse) || this.refused.length > before) return;
      const at = this.openSlot(change.after_key, number);
      this.body.splice(at, 0, { ...newStation(change.station, number), after: change.after_key });
      return;
    }
    const station = this.station(change.key, refuse);
    if (station === null) return;
    if (change.op === 'move' && !this.slotAfter(change.after_key, change.key, refuse)) return;
    if (this.refused.length > before) return;
    const { point, at } = this.takeOut(station, number);
    if (change.op === 'move') {
      const slot = this.openSlot(change.after_key, number);
      this.body.splice(slot, 0, { ...point, origin: 'moved', change: number, after: change.after_key });
      return;
    }
    this.gone.add(change.key);
    if (change.op === 'replace') this.body.splice(at, 0, this.replacing(change.station, number, change.key));
    (change.op === 'remove' ? this.removed : this.replaced).push({ ...point, change: number });
  }

  private replacing(station: CityWalkStation, change: number, key: string): DraftPoint {
    return { ...newStation(station, change), origin: 'replacing', replaces: key };
  }

  /** The index of the saved station a change touches, once its rules allow it; null when they do not. */
  private station(key: string, refuse: (reason: RefusalReason, key: string, days?: StationDone[]) => void) {
    const index = this.indexOfStation(key, refuse);
    if (index === null) return null;
    const point = this.body[index] as DraftPoint;
    const done = this.basis.done.get(key);
    if (point.protected === true) refuse('protected', key);
    if (done && done.length > 0) refuse('done', key, [...done]);
    if (this.anyFixed([...this.legInto(index), ...this.legOutOf(index)])) refuse('fixed_leg', key);
    return index;
  }

  /**
   * The points whose legs run into the station at `index`: the station before
   * it and the shaping points between. The first station of a loop is reached
   * by the closing leg, from the last station through the way back.
   */
  private legInto(index: number): number[] {
    let from = index - 1;
    while (from >= 0 && this.body[from]?.shaping) from -= 1;
    if (from >= 0) return range(from, index);
    if (!this.loop || index !== 0) return [];
    let last = this.body.length - 1;
    while (last > 0 && this.body[last]?.shaping) last -= 1;
    return last > 0 ? range(last, this.body.length) : [];
  }

  /** The points whose legs run out of the point at `index` to the next station: it and the shaping points after it. */
  private legOutOf(index: number): number[] {
    let to = index + 1;
    while (this.body[to]?.shaping) to += 1;
    return range(index, to);
  }

  private anyFixed(indexes: readonly number[]): boolean {
    return indexes.some((index) => this.body[index]?.fixed_leg);
  }

  /** The shaping points among these indexes taken out with the leg they steered, each recorded with the change. */
  private dropShaping(indexes: readonly number[], change: number): void {
    const shaping = [...new Set(indexes)].filter((index) => this.body[index]?.shaping).sort((a, b) => a - b);
    const dropped = shaping.map((index) => ({ ...(this.body[index] as DraftPoint), change }));
    for (const index of [...shaping].reverse()) this.body.splice(index, 1);
    this.shapingDropped.push(...dropped);
  }

  /** The station at `index` taken out with the shaping points of its legs, and where it stood once they are gone. */
  private takeOut(index: number, change: number): { point: DraftPoint; at: number } {
    const point = this.body[index] as DraftPoint;
    this.dropShaping([...this.legInto(index), ...this.legOutOf(index)], change);
    const at = this.body.indexOf(point);
    this.body.splice(at, 1);
    return { point, at };
  }

  /** Where a stop put after `anchor` goes, once the shaping points of the leg it splits are gone. */
  private openSlot(anchor: string, change: number): number {
    const at = this.slotIndex(this.body.findIndex((point) => point.ref === anchor && !point.shaping));
    this.dropShaping(this.legOutOf(at - 1), change);
    return at;
  }

  /** Right after the station at `index` and the stops already put after it, stopping at the one being moved. */
  private slotIndex(index: number, moving: string | null = null): number {
    const anchor = this.body[index]?.ref;
    let at = index + 1;
    while (this.body[at]?.after === anchor && this.body[at]?.ref !== moving) at += 1;
    return at;
  }

  /** Where a saved station stands now, or why it cannot be named. */
  private indexOfStation(key: string, refuse: (reason: RefusalReason, key: string) => void): number | null {
    const index = this.body.findIndex((point) => point.ref === key && !point.shaping);
    if (index >= 0) return index;
    refuse(this.gone.has(key) ? 'already_changed' : 'unknown_station', key);
    return null;
  }

  /**
   * Whether something may be put after a saved station: it goes right after
   * it and after the stops already put there, never into a hand-drawn leg and
   * never before a station the travellers already did. False when the anchor
   * cannot be named at all.
   */
  private slotAfter(
    anchor: string,
    moving: string | null,
    refuse: (reason: RefusalReason, key: string) => void,
  ): boolean {
    if (anchor === moving) {
      refuse('anchor_is_station', anchor);
      return false;
    }
    const index = this.indexOfStation(anchor, refuse);
    if (index === null) return false;
    const at = this.slotIndex(index, moving);
    if (this.anyFixed(this.legOutOf(at - 1))) refuse('fixed_leg', anchor);
    if (at <= this.lastDoneIndex()) refuse('before_done', anchor);
    return true;
  }

  private lastDoneIndex(): number {
    let last = -1;
    this.body.forEach((point, index) => {
      if ((this.basis.done.get(point.ref)?.length ?? 0) > 0) last = index;
    });
    return last;
  }

  private checkLink(station: { linked_place_id?: number | null }, refuse: (reason: RefusalReason) => void): void {
    const id = station.linked_place_id;
    if (id != null && !this.basis.linkable.has(id)) refuse('place_not_linkable');
  }

  /** The changed points in order with their roles and sequence, the way back of a loop at its start again. */
  finished(): DraftPoint[] {
    const first = this.body[0];
    const last = this.basis.points[this.basis.points.length - 1];
    const back = this.loop && first && last ? [{ ...savedPoint(last), lat: first.lat, lng: first.lng }] : [];
    const points = [...this.body, ...back];
    const end = points.length - 1;
    return points.map((point, sequence): DraftPoint => ({
      ...point,
      sequence,
      role: sequence === 0 ? 'start' : sequence === end ? 'end' : 'via',
    }));
  }
}

/** The whole numbers from `from` up to, not including, `to`. */
function range(from: number, to: number): number[] {
  return Array.from({ length: Math.max(0, to - from) }, (_, offset) => from + offset);
}

function stationCount(points: readonly DraftPoint[], loop: boolean): number {
  return (loop ? points.slice(0, -1) : points).filter((point) => !point.shaping).length;
}

/** The changes laid onto the saved points, or every reason they cannot be. */
export function applyChanges(basis: ChangeBasis, changes: readonly TourChange[]): ChangeOutcome {
  const whole = (reason: RefusalReason): ChangeOutcome => ({
    kind: 'refused',
    refused: [{ change: null, op: null, key: null, reason }],
  });
  if (!CHANGEABLE_TYPES.has(basis.tourType)) return whole('type_not_supported');
  if (basis.recorded) return whole('recorded_track');
  const loop = isClosedLoop(basis.points);
  const run = new ChangeRun(basis, loop);
  changes.forEach((change, index) => run.apply(change, index));
  if (run.refused.length > 0) return { kind: 'refused', refused: run.refused };
  const points = run.finished();
  const count = stationCount(points, loop);
  if (count < 2) return whole('too_few_stations');
  if (count > CITY_WALK_MAX_STATIONS && count > stationCount(basis.points.map(savedPoint), loop)) {
    return whole('too_many_stations');
  }
  return {
    kind: 'ready',
    points,
    removed: run.removed,
    replaced: run.replaced,
    shapingDropped: run.shapingDropped,
  };
}

const REFUSAL_TEXT: Record<RefusalReason, string> = {
  type_not_supported:
    'only a city walk takes prepared changes so far; this type plans its way with routing of its own in the planner',
  recorded_track:
    'this walk is a recorded track without stations of its own; open it in the planner to plan stations onto it',
  unknown_station: 'no station of the saved walk has this key (a shaping point or the way back of a loop is none)',
  already_changed: 'an earlier change of this proposal already removed or replaced this station',
  anchor_is_station: 'a station cannot be moved after itself',
  protected: 'this station is protected: it keeps its place, and only the travellers can change it in the app',
  done: 'the travellers already visited or skipped this station on a day of the walk; what was done stays as it is',
  before_done:
    'this would put a station before one the travellers already visited or skipped; add it after the last of those',
  fixed_leg:
    'a leg drawn by hand in the planner starts or ends here (for the first station of a loop, its closing leg too) and stays as drawn; change it in the planner',
  place_not_linkable: 'the new station names a place that is not a place of this trip, or is a tour',
  too_few_stations: 'a city walk keeps at least two stations',
  too_many_stations: `a city walk holds at most ${CITY_WALK_MAX_STATIONS} stations`,
};

/** One refusal as a sentence the assistant can pass on. */
function refusalLine(refusal: ChangeRefusal): string {
  const about =
    refusal.change === null ? 'The proposal' : `Change ${refusal.change} (${refusal.op} ${refusal.key ?? 'station'})`;
  const days = refusal.days ? `, day ids ${refusal.days.map((day) => `${day.day_id} ${day.status}`).join(', ')}` : '';
  return `${about}: ${REFUSAL_TEXT[refusal.reason]}${days}.`;
}

/** What a refused proposal was asked for: prepared for review, or saved once the traveller confirmed it. */
export type RefusedAction = 'prepared' | 'saved';

/** Every refusal of a proposal, one per line, under a line saying it was not prepared, or not saved. */
export function refusalText(refused: readonly ChangeRefusal[], action: RefusedAction): string {
  return [`Nothing was ${action} and nothing changed.`, ...refused.map(refusalLine)].join('\n');
}
