// FE-API-JOURNEY-RECORDINGS-001
//
// JRN-01: every method pins its verb, its path and its body, and hands back what
// the server answered.
import { http, HttpResponse, type JsonBodyType } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../tests/helpers/msw/server';
import { journeyRecordingsApi } from './journeyRecordings';

const BASE = '/api/journeys/7/recordings';
const HASH = 'a'.repeat(64);

let calls: Array<{ method: string; path: string; body: unknown }> = [];

beforeEach(() => {
  calls = [];
});

function record(data: JsonBodyType) {
  return async ({ request }: { request: Request }) => {
    const text = await request.text();
    calls.push({ method: request.method, path: new URL(request.url).pathname, body: text ? JSON.parse(text) : null });
    return HttpResponse.json(data);
  };
}

describe('journeyRecordingsApi', () => {
  it('FE-API-JOURNEY-RECORDINGS-001: lists, previews, keeps and removes the recorded days of a journey', async () => {
    server.use(
      http.get(BASE, record({ days: [] })),
      http.post(`${BASE}/preview`, record({ date: '2026-05-14' })),
      http.put(`${BASE}/2026-05-14`, record({ outcome: 'created' })),
      http.delete(`${BASE}/2026-05-14`, record({ success: true }))
    );
    expect(await journeyRecordingsApi.list(7)).toEqual({ days: [] });
    expect(
      await journeyRecordingsApi.preview(7, { date: '2026-05-14', utcOffsetMinutes: 120, useSourceOffset: true })
    ).toEqual({ date: '2026-05-14' });
    expect(await journeyRecordingsApi.save(7, '2026-05-14', { utcOffsetMinutes: 120, expectedHash: HASH })).toEqual({
      outcome: 'created',
    });
    expect(await journeyRecordingsApi.remove(7, '2026-05-14')).toBeUndefined();
    expect(calls).toEqual([
      { method: 'GET', path: BASE, body: null },
      {
        method: 'POST',
        path: `${BASE}/preview`,
        body: { date: '2026-05-14', utcOffsetMinutes: 120, useSourceOffset: true },
      },
      { method: 'PUT', path: `${BASE}/2026-05-14`, body: { utcOffsetMinutes: 120, expectedHash: HASH } },
      { method: 'DELETE', path: `${BASE}/2026-05-14`, body: null },
    ]);
  });
});
