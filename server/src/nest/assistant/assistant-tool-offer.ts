import type { McpRegistryListing } from '../../nest-mcp';
import type { AiToolSpec } from '../ai-connections/ai-chat-client.interface';

/**
 * Which of TREK's MCP tools the assistant is offered, and how. Every tool the
 * registry holds is offered, except the few below that no approval makes
 * safe; the scopes in ASSISTANT_SCOPES hide the rest of what must never run
 * (deleting a trip, share and invite links, file contents, plugins). A tool
 * annotated read-only runs at once, every other one waits as a change card.
 *
 * Offering all of them in every step would cost a lot of tokens and runs past
 * what some providers take in one request, so a turn starts with the core of
 * a trip (days, places, bookings, packing, to-dos, budget, weather, search)
 * and the model loads an addon's tools when it needs them (USE_TOOLS_TOOL).
 */

/** Never offered, whatever the user approves, each for the reason beside it. */
export const ASSISTANT_DENIED_TOOLS: Readonly<Record<string, string>> = {
  delete_trip: 'irreversible, and it takes the conversation with it',
  copy_trip: 'makes a trip outside the conversation',
  create_trip: 'makes a trip outside the conversation',
  leave_trip: 'changes who can see the trip',
  add_trip_member: 'changes who can see the trip',
  remove_trip_member: 'changes who can see the trip',
  leave_collection: 'changes who can see the collection',
  set_collection_member_role: 'changes who can see the collection',
  remove_collection_member: 'changes who can see the collection',
  add_journey_contributor: 'changes who can see the journey',
  update_journey_contributor_role: 'changes who can see the journey',
  remove_journey_contributor: 'changes who can see the journey',
  invite_to_collection: 'invites a person; the model could pick whom',
  send_vacay_invite: 'invites a person; the model could pick whom',
  share_vacay_calendar: 'shares a calendar with a person',
  create_share_link: 'mints a public link, whose token would reach the AI provider',
  get_share_link: 'reads a public link token',
  delete_share_link: 'belongs with the share links above',
  get_trip_invite_link: 'reads an invite token',
  create_trip_invite_link: 'mints an invite token',
  delete_trip_invite_link: 'belongs with the invite links above',
  get_journey_share_link: 'reads a public link token',
  create_journey_share_link: 'mints a public link token',
  delete_journey_share_link: 'belongs with the share links above',
  get_trip_calendar_feed: 'reads a calendar feed token',
  enable_trip_calendar_feed: 'mints a calendar feed token',
  rotate_trip_calendar_feed: 'mints a calendar feed token',
  disable_trip_calendar_feed: 'belongs with the feeds above',
  get_all_trips_calendar_feed: 'reads a calendar feed token',
  enable_all_trips_calendar_feed: 'mints a calendar feed token',
  rotate_all_trips_calendar_feed: 'mints a calendar feed token',
  disable_all_trips_calendar_feed: 'belongs with the feeds above',
  import_places_from_url: 'fetches an address the model chooses',
  read_trip_file: 'would send documents such as passports to the AI provider',
  upload_trip_file: 'writes a file the model made up',
  create_category: 'changes the categories of every user',
  update_category: 'changes the categories of every user',
  delete_category: 'changes the categories of every user',
  create_manual_school_holiday_country: 'changes the holidays of every user',
  create_manual_school_holiday_region: 'changes the holidays of every user',
  update_manual_school_holiday_region: 'changes the holidays of every user',
  delete_manual_school_holiday_region: 'changes the holidays of every user',
  delete_manual_school_holiday_country: 'changes the holidays of every user',
};

/**
 * Names that read like sharing but only list or take back what the user
 * shared already. Any other name that shares, invites or publishes a feed
 * must be denied above; the boot check holds the two apart.
 */
const SHARE_LIKE_SAFE: ReadonlySet<string> = new Set([
  'set_packing_item_sharing',
  'list_vacay_shares',
  'get_shareable_vacay_users',
  'get_shared_vacay_calendars',
  'unshare_vacay_calendar',
  'cancel_vacay_invite',
  'accept_vacay_invite',
  'decline_vacay_invite',
  'cancel_collection_invite',
  'accept_collection_invite',
  'decline_collection_invite',
]);
const SHARE_LIKE = /share|invite|feed/;

/** Read-only tools that still wait for the user: they fetch an address that came from the web or a message. */
export const HELD_READS: ReadonlySet<string> = new Set([
  'resolve_maps_url',
  'preview_google_maps_route',
  'preview_google_maps_walk',
]);

export function isOfferedTool(name: string): boolean {
  return !(name in ASSISTANT_DENIED_TOOLS);
}

/** What is wrong with the denylist against the registry: a sharing tool that slipped through. */
export function checkDenylist(names: Iterable<string>): string[] {
  const problems: string[] = [];
  for (const name of names) {
    if (SHARE_LIKE.test(name) && isOfferedTool(name) && !SHARE_LIKE_SAFE.has(name)) {
      problems.push(`"${name}" shares, invites or publishes; deny it or list it as safe`);
    }
  }
  return problems;
}

/**
 * The tool groups a turn can load, by the MCP controller that registers the
 * tools, each with the words the model reads to pick it. A controller not
 * listed here belongs to the core, which every step offers.
 */
export const ASSISTANT_TOOL_GROUPS: Readonly<Record<string, { about: string; controllers: readonly string[] }>> = {
  tours: {
    about:
      'Tours: hikes, bike tours, city walks, paddling and ski routes; plan, create, change and export them ' +
      '(hikes with their heights and SAC grades), their packing, the tour library and imports from GPX files ' +
      'and Google Maps.',
    controllers: [
      'ToursMcp',
      'CityWalkMcp',
      'HikePlanMcp',
      'TourChangeMcp',
      'TourChangeUndoMcp',
      'TourLibraryMcp',
      'TourPackingMcp',
      'TourActivitiesMcp',
      'TourActivityStatsMcp',
      'TourWalkImportMcp',
      'CollectionToursMcp',
      'PaddleRoutingMcp',
      'SkiRoutingMcp',
      'GoogleRouteMcp',
    ],
  },
  roadtrip: {
    about: 'Road trips and transit: the driving route and its stops, charging, hazards, public transport journeys.',
    controllers: [
      'RoadtripMcp',
      'RoadtripPlanningMcp',
      'RoadtripPreferencesMcp',
      'RoadtripHazardsMcp',
      'ChargingMcp',
      'TransitMcp',
    ],
  },
  journey: {
    about: 'Journeys (the travel journal): entries, photos, the journal linked to this trip, location history.',
    controllers: ['JourneyMcp', 'TripJournalLinkMcp', 'MemoriesMcp', 'DawarichMcp'],
  },
  vacay: {
    about: 'Vacation planner: vacation days per year, public and school holidays, shared calendars.',
    controllers: ['VacayMcp', 'SchoolHolidaysMcp'],
  },
  atlas: { about: 'Atlas: visited countries and regions, the bucket list.', controllers: ['AtlasMcp'] },
  collections: {
    about: 'Collections: saved places across trips, their labels and ratings.',
    controllers: ['CollectionsMcp'],
  },
  collab: { about: 'Trip chat: notes, polls and messages to the people on the trip.', controllers: ['CollabMcp'] },
  files: {
    about: 'Files and imports: the trip files, document sync, flights from AirTrail.',
    controllers: ['FilesMcp', 'DocSyncMcp', 'ReservationImportMcp', 'AirtrailMcp'],
  },
  account: {
    about: 'The user: notifications and display settings.',
    controllers: ['NotificationsMcp', 'SettingsMcp'],
  },
  plugins: {
    about: 'Places and points of interest from installed plugins.',
    controllers: ['PluginPoisMcp', 'PluginSearchMcp'],
  },
};

const GROUP_OF_CONTROLLER = new Map(
  Object.entries(ASSISTANT_TOOL_GROUPS).flatMap(([group, { controllers }]) =>
    controllers.map((controller) => [controller, group] as const),
  ),
);

/** The group a registered tool loads with; null for the core. */
export function groupOf(entry: Pick<McpRegistryListing, 'className'>): string | null {
  return GROUP_OF_CONTROLLER.get(entry.className) ?? null;
}

/** The server's own step that loads a group's tools for the rest of the turn. */
export const USE_TOOLS_TOOL = 'use_addon_tools';

export const USE_TOOLS_SPEC: AiToolSpec = {
  name: USE_TOOLS_TOOL,
  description:
    'Load the tools of more parts of TREK for the rest of this turn. Call it before working with any of: ' +
    Object.entries(ASSISTANT_TOOL_GROUPS)
      .map(([group, { about }]) => `"${group}" (${about})`)
      .join('; ') +
    '. The trip itself (days, places, bookings, packing, to-dos, budget, weather, search) needs nothing loaded.',
  parameters: {
    type: 'object',
    properties: {
      groups: {
        type: 'array',
        items: { type: 'string', enum: Object.keys(ASSISTANT_TOOL_GROUPS) },
        minItems: 1,
      },
    },
    required: ['groups'],
    additionalProperties: false,
  },
};
