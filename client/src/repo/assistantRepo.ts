import {
  assistantAddFoundPlaceResponseSchema,
  assistantThreadListResponseSchema,
  assistantThreadResponseSchema,
  collabMessageResponseSchema,
  type AssistantAddFoundPlaceRequest,
  type AssistantChatRequest,
  type AssistantDecisionsRequest,
  type AssistantShareRequest,
} from '@trek/shared';
import { assistantApi } from '../api/assistant';
import { requireOnline } from './onlineOnly';

/**
 * The trip assistant's conversations.
 *
 * **Deliberately online-only, and no Dexie table.** Every answer comes from a
 * model on the other side of the server, so there is nothing to do offline,
 * and a cached copy of a chat would be one more place the trip data the model
 * read lives on the device. Each call refuses with `OnlineOnlyError` before a
 * request is made; the view says why instead of hanging on a timeout.
 *
 * The planner learns about applied changes the normal way, through the
 * WebSocket broadcast the tools send, so nothing here touches trip data.
 */
export const assistantRepo = {
  async threads(tripId: number) {
    requireOnline();
    return assistantThreadListResponseSchema.parse(await assistantApi.threads(tripId)).threads;
  },

  async thread(tripId: number, threadId: number) {
    requireOnline();
    return assistantThreadResponseSchema.parse(await assistantApi.thread(tripId, threadId));
  },

  async deleteThread(tripId: number, threadId: number): Promise<void> {
    requireOnline();
    await assistantApi.deleteThread(tripId, threadId);
  },

  /** A new message; resolves once the server accepted it, with the stream of the answer. */
  async send(tripId: number, body: AssistantChatRequest, signal: AbortSignal) {
    requireOnline();
    return assistantApi.chat(tripId, body, signal);
  },

  /** The decisions on the changes a step holds; the stream carries their results and the rest of the turn. */
  async decide(tripId: number, threadId: number, body: AssistantDecisionsRequest, signal: AbortSignal) {
    requireOnline();
    return assistantApi.decide(tripId, threadId, body, signal);
  },

  /** A booking file for the chat to read; the stream proposes each booking found in it. */
  async attach(
    tripId: number,
    file: File,
    fields: { threadId: number | null; locale: string; timeZone: string },
    signal: AbortSignal
  ) {
    requireOnline();
    const form = new FormData();
    form.append('file', file);
    if (fields.threadId !== null) form.append('threadId', String(fields.threadId));
    form.append('locale', fields.locale);
    form.append('timeZone', fields.timeZone);
    return assistantApi.attach(tripId, form, signal);
  },

  async undo(tripId: number, toolCallId: string): Promise<void> {
    requireOnline();
    await assistantApi.undo(tripId, toolCallId);
  },

  /** A place a search found, held as a change for a day; no model runs for it. */
  async addFoundPlace(tripId: number, threadId: number, body: AssistantAddFoundPlaceRequest) {
    requireOnline();
    return assistantAddFoundPlaceResponseSchema.parse(await assistantApi.addFoundPlace(tripId, threadId, body));
  },

  /**
   * An answer posted to the trip chat, as the preview showed it. Online only
   * like the rest: a chat message sent later would land out of order between
   * the live ones.
   */
  async share(tripId: number, threadId: number, messageId: string, body: AssistantShareRequest) {
    requireOnline();
    return collabMessageResponseSchema.parse(await assistantApi.share(tripId, threadId, messageId, body));
  },

  async stop(tripId: number): Promise<void> {
    requireOnline();
    await assistantApi.stop(tripId);
  },
};
