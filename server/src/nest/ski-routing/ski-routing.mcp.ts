import { ADDON_IDS } from '../../addons';
import { noAccess } from '../../mcp/tools/_shared';
import { McpController, Tool, TOOL_ANNOTATIONS_READONLY, ok, type McpContext } from '../../nest-mcp';
import { addonGate } from '../addons/addon-gate';
import { AddonsService } from '../addons/addons.service';
import { TripAccessService } from '../trip-membership/trip-access.service';
import { SkiRoutingService } from './ski-routing.service';
import { idSchema, skiRouteRequestSchema, type SkiRouteInput, type SkiRouteLeg } from '@trek/shared';

/** A planned leg as a client reads it: its measures and its stretches, not its thousands of points. */
function summary(leg: SkiRouteLeg) {
  if (leg.status === 'failed') return leg;
  return {
    status: leg.status,
    distance_m: leg.distance_m,
    climb_m: leg.climb_m,
    descent_m: leg.descent_m,
    seconds: leg.seconds,
    snapped_m: leg.snapped_m,
    points: leg.geometry.length,
    segments: leg.segments.map(({ from: _from, to: _to, grooming: _grooming, osm_way: _way, ...segment }) => segment),
    why: leg.why,
    alternatives: leg.alternatives.length,
  };
}

/**
 * The piste router for a client, read only and with the REST route's rules:
 * the caller must see the trip, Tours must be on, and the request is the same
 * contract, planned by the same service. It plans and answers; nothing is
 * saved, and no clicked point leaves the server.
 */
@McpController()
export class SkiRoutingMcp {
  constructor(
    private readonly routing: SkiRoutingService,
    private readonly access: TripAccessService,
    // Read by the addon gate.
    readonly addons: AddonsService,
  ) {}

  @Tool({
    name: 'plan_ski_route',
    description:
      'Plan the legs of a ski and winter tour on the runs, lifts, cross-country trails, ski touring and winter paths of OpenStreetMap, for a discipline (alpine, snowboard, cross_country with a technique of classic, skating or unknown, touring, snowshoe, winter_hike) and its options (max_difficulty from novice to expert, allow_freeride, avoid_lifts by class, allow_lift_down, priority fastest, most_skiing or easiest, pace, groomed_only and lit_only for cross-country, touring_uphill_on_pistes, use_lifts, avoid_inferred_links). Each leg (from, to) answers its length, climb and descent, its time split into skiing, lifts, waiting at lifts and walking, how far its ends were moved onto the network, its stretches (run with difficulty, lift with type, link the map data does not hold, and so on) and notes on what it rests on; a leg that cannot be planned says why (not_on_piste, no_area, cross_area, disconnected, blocked_by_difficulty with the level it needs, blocked_by_lift_avoid, blocked_by_technique, needs_ride_down, uphill_only, loading while an area downloads, places_unavailable, disabled). Times are estimates from the run difficulties and lift types, waits are guesses, and nothing says what is open, groomed or safe today; nothing is saved.',
    inputSchema: { tripId: idSchema, ...skiRouteRequestSchema.shape },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: addonGate(ADDON_IDS.TOURS),
    access: { group: 'trips', mode: 'read' },
  })
  async planSkiRoute({ tripId, ...request }: SkiRouteInput & { tripId: number }, ctx: McpContext) {
    if (!(await this.access.findAccessible(tripId, ctx.userId))) return noAccess();
    const planned = await this.routing.route(skiRouteRequestSchema.parse(request));
    return ok({
      legs: planned.legs.map(summary),
      build: planned.build,
      stale: planned.stale,
      area_names: planned.area_names,
      colour_scheme: planned.colour_scheme,
      attribution: planned.attribution,
    });
  }
}
