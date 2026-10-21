/**
 * FE-AI-REPO-001 to FE-AI-REPO-005
 *
 * The assistant is online-only on purpose (there is no model on the device
 * and no cached chats), so the repo makes two promises: nothing is sent while
 * offline, the manual offline switch included, and answers are parsed against
 * the shared contract instead of cast.
 */
import type { AssistantThreadResponse } from '@trek/shared';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../../tests/helpers/msw/server';
import { assistantApi } from '../api/assistant';
import { _resetNetworkMode, setForcedOffline } from '../sync/networkMode';
import { assistantRepo } from './assistantRepo';
import { OnlineOnlyError } from './onlineOnly';

const BASE = '/api/trips/4/assistant';

const THREAD: AssistantThreadResponse = {
  thread: { id: 7, title: 'Kyoto', lastMessageAt: '2026-10-21T08:00:00.000Z' },
  messages: [
    {
      id: '12',
      role: 'user',
      parts: [{ type: 'text', text: 'Plan Friday' }],
      status: 'complete',
      createdAt: '2026-10-21T08:00:00.000Z',
    },
  ],
};

beforeEach(() => _resetNetworkMode());
afterEach(() => {
  _resetNetworkMode();
  vi.restoreAllMocks();
});

describe('assistantRepo', () => {
  it('FE-AI-REPO-001: reads the thread list and a thread', async () => {
    server.use(
      http.get(`${BASE}/threads`, () => HttpResponse.json({ threads: [THREAD.thread] })),
      http.get(`${BASE}/threads/7`, () => HttpResponse.json(THREAD))
    );
    await expect(assistantRepo.threads(4)).resolves.toEqual([THREAD.thread]);
    await expect(assistantRepo.thread(4, 7)).resolves.toEqual(THREAD);
  });

  it('FE-AI-REPO-002: an answer outside the contract fails here', async () => {
    server.use(http.get(`${BASE}/threads`, () => HttpResponse.json({ threads: [{ id: 'seven' }] })));
    await expect(assistantRepo.threads(4)).rejects.toThrow();
  });

  it('FE-AI-REPO-003: deletes, undoes and stops through the API', async () => {
    const hits: string[] = [];
    server.use(
      http.delete(`${BASE}/threads/7`, () => {
        hits.push('delete');
        return HttpResponse.json({ success: true });
      }),
      http.post(`${BASE}/tool-calls/c1/undo`, () => {
        hits.push('undo');
        return HttpResponse.json({ undone: true });
      }),
      http.post(`${BASE}/stop`, () => {
        hits.push('stop');
        return HttpResponse.json({ success: true });
      })
    );
    await assistantRepo.deleteThread(4, 7);
    await assistantRepo.undo(4, 'c1');
    await assistantRepo.stop(4);
    expect(hits).toEqual(['delete', 'undo', 'stop']);
  });

  it('FE-AI-REPO-004: send and decide hand back the stream the API opened', async () => {
    const stream = (async function* () {})();
    const chat = vi.spyOn(assistantApi, 'chat').mockResolvedValue(stream);
    const decide = vi.spyOn(assistantApi, 'decide').mockResolvedValue(stream);
    const signal = new AbortController().signal;
    const ctx = { locale: 'en', timeZone: 'UTC' };

    await expect(assistantRepo.send(4, { ...ctx, threadId: null, text: 'Hi' }, signal)).resolves.toBe(stream);
    await expect(
      assistantRepo.decide(4, 7, { ...ctx, decisions: [{ toolCallId: 'c1', approved: false }] }, signal)
    ).resolves.toBe(stream);
    expect(chat).toHaveBeenCalledWith(4, { ...ctx, threadId: null, text: 'Hi' }, signal);
    expect(decide).toHaveBeenCalledWith(4, 7, { ...ctx, decisions: [{ toolCallId: 'c1', approved: false }] }, signal);
  });

  it('FE-AI-REPO-005: while offline (the manual switch too) every call refuses before a request', async () => {
    setForcedOffline(true);
    const chat = vi.spyOn(assistantApi, 'chat');
    const threads = vi.spyOn(assistantApi, 'threads');
    const signal = new AbortController().signal;

    await expect(assistantRepo.threads(4)).rejects.toBeInstanceOf(OnlineOnlyError);
    await expect(assistantRepo.thread(4, 7)).rejects.toBeInstanceOf(OnlineOnlyError);
    await expect(assistantRepo.deleteThread(4, 7)).rejects.toBeInstanceOf(OnlineOnlyError);
    await expect(
      assistantRepo.send(4, { locale: 'en', timeZone: 'UTC', threadId: null, text: 'Hi' }, signal)
    ).rejects.toBeInstanceOf(OnlineOnlyError);
    await expect(assistantRepo.undo(4, 'c1')).rejects.toBeInstanceOf(OnlineOnlyError);
    await expect(assistantRepo.stop(4)).rejects.toBeInstanceOf(OnlineOnlyError);
    expect(chat).not.toHaveBeenCalled();
    expect(threads).not.toHaveBeenCalled();
  });
});
