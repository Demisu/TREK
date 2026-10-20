import { ADDON_IDS } from '../../addons';
import { noAccess } from '../../mcp/tools/_shared';
import { McpController, Tool, TOOL_ANNOTATIONS_READONLY, errorResult, ok, type McpContext } from '../../nest-mcp';
import { addonGate } from '../addons/addon-gate';
import { AddonsService } from '../addons/addons.service';
import { McpToolGuardsService } from '../mcp-shared/mcp-tool-guards.service';
import { TripAccessService } from '../trip-membership/trip-access.service';
import { TourChangePreviewService } from './tour-change-preview.service';
import { NotFoundException } from '@nestjs/common';
import { idSchema, tourChangeRequestSchema, type TourChangeRequest } from '@trek/shared';

/**
 * MCP-T02: a change to a saved tour prepared for the traveller to review,
 * read only like propose_city_walk: nothing is saved while it is prepared,
 * and turning it down leaves the plan as it was. A change the rules of the
 * tour refuse is the service's DomainError, which the registry answers as an
 * error result naming every refused change and why. can_save tells the
 * assistant whether this traveller may save changes to the trip's places at
 * all, so a proposal is never offered as something they could apply when
 * they cannot.
 */
@McpController()
export class TourChangeMcp {
  constructor(
    private readonly preview: TourChangePreviewService,
    private readonly access: TripAccessService,
    private readonly guards: McpToolGuardsService,
    // Read by the addon gate of the tool here.
    readonly addons: AddonsService,
  ) {}

  @Tool({
    name: 'prepare_tour_change',
    description:
      "Prepare a change to a saved tour for the traveller to review, without saving anything: no tour, station, visit or day plan changes, and turning it down keeps the plan as it is. Read the tour with get_tour_plan first. A city walk (tour_type walk) takes changes so far; every other type, and a walk that is a recorded track without stations of its own, is refused with the reason. changes apply in order, each naming saved stations by their key: add (a new station after after_key; a spontaneous stop is an add after the station the traveller is at), remove, replace (a new station in the place of key) and move (key to after after_key). Stops put after the same station keep the order given. A station protected, or visited or skipped on any day of the walk, is never removed, replaced or moved, nothing is put before the last station already done, and a leg drawn by hand stays as drawn; such a change is refused, and so is the whole proposal, with every reason in the error. The answer: prepared_only (always true), base (the tour and the revision it was prepared on: a save has to name it, and a tour changed since is refused rather than overwritten, so prepare again), stations_after (each with its key, null for a new one, change kept, added, replaced or moved, by_change, was_position and what it replaces), removed, effects (walking: the whole way on foot before and after planned by TREK's router and the change in metres and minutes, the distance and walking time stored with the walk apart; stays: known minutes and unknown stays before and after; legs: each leg after, new ones marked), data_gaps (what could not be worked out and why: no way from the router, stays not known, no arrival times), warnings (a must station removed or replaced), for_later (each new station as create_place takes it, to keep it as a place of the trip instead) and waypoints_after. Show every change and its effects to the traveller and save nothing without their yes. can_save says whether they may change the trip's places.",
    inputSchema: {
      tripId: idSchema,
      placeId: idSchema.describe('The place id of the tour, as list_tours gives it'),
      changes: tourChangeRequestSchema.shape.changes,
    },
    annotations: TOOL_ANNOTATIONS_READONLY,
    when: addonGate(ADDON_IDS.TOURS),
    access: { group: 'trips', mode: 'read' },
  })
  async prepareTourChange(
    { tripId, placeId, changes }: { tripId: number; placeId: number } & TourChangeRequest,
    ctx: McpContext,
  ) {
    if (!(await this.access.findAccessible(tripId, ctx.userId))) return noAccess();
    try {
      const proposal = await this.preview.prepare(tripId, placeId, ctx.userId, { changes });
      const canSave = await this.guards.hasTripPermission('place_edit', tripId, ctx.userId);
      return ok({ ...proposal, can_save: canSave });
    } catch (err: unknown) {
      if (err instanceof NotFoundException) return errorResult('Tour not found.');
      throw err;
    }
  }
}
