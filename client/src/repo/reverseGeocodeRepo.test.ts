import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mapsApi } from '../api/client';
import { isEffectivelyOffline } from '../sync/networkMode';
import { reverseGeocodeRepo } from './reverseGeocodeRepo';

vi.mock('../sync/networkMode', () => ({ isEffectivelyOffline: vi.fn(() => false) }));
vi.mock('../api/client', () => ({ mapsApi: { reverse: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  reverseGeocodeRepo.clear();
  vi.mocked(isEffectivelyOffline).mockReturnValue(false);
  vi.mocked(mapsApi.reverse).mockResolvedValue({ name: 'Zugspitze', address: 'Zugspitze, Grainau, Bayern' });
});

describe('reverse geocoded place names', () => {
  it('FE-REVERSE-GEOCODE-001: asks the maps route with the coordinate and the place language', async () => {
    await expect(reverseGeocodeRepo.placeName(47.42123, 10.98456, 'de')).resolves.toBe('Zugspitze');
    expect(mapsApi.reverse).toHaveBeenCalledWith(47.42123, 10.98456, 'de');
  });

  it('FE-REVERSE-GEOCODE-002: the same point twice is one request, another language or point is another', async () => {
    const first = reverseGeocodeRepo.placeName(47.4, 11.1, 'de');
    const again = reverseGeocodeRepo.placeName(47.400001, 11.100001, 'de');
    expect(await first).toBe(await again);
    expect(mapsApi.reverse).toHaveBeenCalledTimes(1);
    await reverseGeocodeRepo.placeName(47.4, 11.1, 'en');
    await reverseGeocodeRepo.placeName(47.41, 11.1, 'de');
    expect(mapsApi.reverse).toHaveBeenCalledTimes(3);
  });

  it('FE-REVERSE-GEOCODE-003: falls back to the first part of the address and to null', async () => {
    vi.mocked(mapsApi.reverse).mockResolvedValueOnce({ name: null, address: 'Höllentalanger, Grainau' });
    await expect(reverseGeocodeRepo.placeName(47.1, 11, 'de')).resolves.toBe('Höllentalanger');
    vi.mocked(mapsApi.reverse).mockResolvedValueOnce({ name: '  ', address: null });
    await expect(reverseGeocodeRepo.placeName(47.2, 11, 'de')).resolves.toBeNull();
  });

  it('FE-REVERSE-GEOCODE-004: a failed lookup is not cached, so the point is asked again', async () => {
    vi.mocked(mapsApi.reverse).mockRejectedValueOnce(new Error('boom'));
    await expect(reverseGeocodeRepo.placeName(47.3, 11, 'de')).rejects.toThrow('boom');
    await expect(reverseGeocodeRepo.placeName(47.3, 11, 'de')).resolves.toBe('Zugspitze');
    expect(mapsApi.reverse).toHaveBeenCalledTimes(2);
  });

  it('FE-REVERSE-GEOCODE-005: offline never reaches the network', async () => {
    vi.mocked(isEffectivelyOffline).mockReturnValue(true);
    await expect(reverseGeocodeRepo.placeName(47.5, 11, 'de')).rejects.toThrow('Offline');
    expect(mapsApi.reverse).not.toHaveBeenCalled();
  });

  it('FE-REVERSE-GEOCODE-006: runs at most two lookups at once and starts the rest as they finish', async () => {
    const resolvers: Array<(value: { name: string; address: null }) => void> = [];
    vi.mocked(mapsApi.reverse).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        })
    );
    const names = [1, 2, 3].map((n) => reverseGeocodeRepo.placeName(46 + n, 11, 'de'));
    expect(mapsApi.reverse).toHaveBeenCalledTimes(2);
    resolvers[0]({ name: 'One', address: null });
    await names[0];
    await vi.waitFor(() => expect(mapsApi.reverse).toHaveBeenCalledTimes(3));
    resolvers[1]({ name: 'Two', address: null });
    resolvers[2]({ name: 'Three', address: null });
    await expect(Promise.all(names)).resolves.toEqual(['One', 'Two', 'Three']);
  });
});
