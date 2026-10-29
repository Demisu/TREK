// FE-JRN-PUBHOOK-001 to FE-JRN-PUBHOOK-002
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../../../tests/helpers/msw/server';
import { renderHook, waitFor } from '../../../tests/helpers/render';
import type { PublicEntry } from './journeyPublicModel';
import { useJourneyPublic } from './useJourneyPublic';

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return { ...actual, useParams: () => ({ token: 'tok-1' }) };
});

vi.mock('../../hooks/useIsMobile', () => ({ useIsMobile: () => false }));

function buildEntry(over: Partial<PublicEntry> & { id: number }): PublicEntry {
  return {
    title: 'Stop',
    story: null,
    entry_date: '2026-10-23',
    entry_time: null,
    type: 'entry',
    sort_order: 0,
    location_name: 'Kyoto',
    location_lat: 35,
    location_lng: 135.7,
    mood: null,
    weather: null,
    pros_cons: null,
    photos: [],
    ...over,
  };
}

function serveShare(entries: PublicEntry[]): void {
  server.use(
    http.get('/api/public/journey/tok-1', () =>
      HttpResponse.json({
        journey: { title: 'Japan' },
        entries,
        gallery: [],
        permissions: { share_timeline: true, share_gallery: true, share_map: false },
        stats: {},
      })
    )
  );
}

describe('useJourneyPublic', () => {
  it('FE-JRN-PUBHOOK-001: the map and the timeline count the stops through the whole journey', async () => {
    serveShare([
      buildEntry({ id: 1 }),
      buildEntry({ id: 2, sort_order: 1 }),
      buildEntry({ id: 3, sort_order: 2 }),
      buildEntry({ id: 4, entry_date: '2026-10-24' }),
      buildEntry({ id: 5, entry_date: '2026-10-24', sort_order: 1 }),
    ]);
    const { result } = renderHook(() => useJourneyPublic());

    await waitFor(() => expect(result.current.sidebarMapItems).toHaveLength(5));
    expect(result.current.sidebarMapItems.map((m) => [m.id, m.dayLabel])).toEqual([
      ['1', 1],
      ['2', 2],
      ['3', 3],
      ['4', 4],
      ['5', 5],
    ]);
    expect([...result.current.stopNumberById]).toEqual([
      ['1', 1],
      ['2', 2],
      ['3', 3],
      ['4', 4],
      ['5', 5],
    ]);
  });

  it('FE-JRN-PUBHOOK-002: entries sharing a sort_order are numbered by id, as the owner journal numbers them', async () => {
    serveShare([
      buildEntry({ id: 8 }),
      buildEntry({ id: 6 }),
      buildEntry({ id: 7, location_lat: null, location_lng: null }),
      buildEntry({ id: 9, entry_date: '2026-10-24' }),
    ]);
    const { result } = renderHook(() => useJourneyPublic());

    await waitFor(() => expect(result.current.sidebarMapItems).toHaveLength(3));
    expect(result.current.sidebarMapItems.map((m) => [m.id, m.dayLabel])).toEqual([
      ['6', 1],
      ['8', 2],
      ['9', 3],
    ]);
    expect(result.current.stopNumberById.has('7')).toBe(false);
  });
});
