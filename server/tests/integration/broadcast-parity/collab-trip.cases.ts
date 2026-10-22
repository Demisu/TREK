import type { CaseGroup, Scene } from './types';

/**
 * Working together on a trip: collab, the trip itself and its members, files,
 * and the account-wide settings, notifications and tags the planner reads.
 */
const TOKEN_ONLY = 'manages a link or feed token: nothing on any screen follows it live, so there is nothing to send';
const onTrip = (s: Scene) => ({ tripId: s.trip.id });
const noArgs = () => ({});

export const collabTrip: CaseGroup = {
  name: 'collab-trip',
  prefix: 'BCP-COLLAB',
  cases: [],
  exempt: [
    { tool: 'create_share_link', reason: TOKEN_ONLY, args: onTrip },
    { tool: 'delete_share_link', reason: TOKEN_ONLY, args: onTrip, first: { tool: 'create_share_link', args: onTrip } },
    { tool: 'create_trip_invite_link', reason: TOKEN_ONLY, args: onTrip },
    {
      tool: 'delete_trip_invite_link',
      reason: TOKEN_ONLY,
      args: onTrip,
      first: { tool: 'create_trip_invite_link', args: onTrip },
    },
    { tool: 'enable_trip_calendar_feed', reason: TOKEN_ONLY, args: onTrip },
    {
      tool: 'rotate_trip_calendar_feed',
      reason: TOKEN_ONLY,
      args: onTrip,
      first: { tool: 'enable_trip_calendar_feed', args: onTrip },
    },
    {
      tool: 'disable_trip_calendar_feed',
      reason: TOKEN_ONLY,
      args: onTrip,
      first: { tool: 'enable_trip_calendar_feed', args: onTrip },
    },
    { tool: 'enable_all_trips_calendar_feed', reason: TOKEN_ONLY, args: noArgs },
    {
      tool: 'rotate_all_trips_calendar_feed',
      reason: TOKEN_ONLY,
      args: noArgs,
      first: { tool: 'enable_all_trips_calendar_feed', args: noArgs },
    },
    {
      tool: 'disable_all_trips_calendar_feed',
      reason: TOKEN_ONLY,
      args: noArgs,
      first: { tool: 'enable_all_trips_calendar_feed', args: noArgs },
    },
  ],
  pending: [
    'create_collab_note',
    'update_collab_note',
    'delete_collab_note',
    'create_collab_poll',
    'vote_collab_poll',
    'close_collab_poll',
    'delete_collab_poll',
    'send_collab_message',
    'delete_collab_message',
    'react_collab_message',
    'sync_trip_documents',
    'upload_trip_file',
    'update_trip_file',
    'link_trip_file',
    'unlink_trip_file',
    'mark_notification_read',
    'mark_notification_unread',
    'mark_all_notifications_read',
    'update_display_settings',
    'create_tag',
    'update_tag',
    'delete_tag',
    'create_trip',
    'update_trip',
    'delete_trip',
    'add_trip_member',
    'remove_trip_member',
    'leave_trip',
    'create_trip_guest',
    'rename_trip_guest',
    'delete_trip_guest',
    'copy_trip',
  ],
};
