// FE-REPO-FERRATA-001 to FE-REPO-FERRATA-003: the online-only read behind the via ferrata layer.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ferratasApi } from '../api/ferratas';
import { isEffectivelyOffline } from '../sync/networkMode';
import { ferrataRepo } from './ferrataRepo';

vi.mock('../sync/networkMode', () => ({ isEffectivelyOffline: vi.fn(() => false) }));
vi.mock('../api/ferratas', () => ({ ferratasApi: { list: vi.fn() } }));

const BBOX = '46.500,11.700,46.600,11.900';
const reply = {
  ferratas: [
    {
      id: 'way/42',
      name: 'Via delle Trincee',
      grade: { raw: '4', level: 4, plus: null },
      routeName: null,
      geometry: [
        [46.52, 11.8],
        [46.53, 11.81],
      ],
      osmUrl: 'https://www.openstreetmap.org/way/42',
    },
  ],
  truncated: false,
  source: 'openstreetmap',
  attribution: '© OpenStreetMap contributors',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isEffectivelyOffline).mockReturnValue(false);
  vi.mocked(ferratasApi.list).mockResolvedValue(reply);
});

describe('ferrataRepo.list', () => {
  it('FE-REPO-FERRATA-001: asks the api for the trip and box with the signal and returns the parsed answer', async () => {
    const signal = new AbortController().signal;
    await expect(ferrataRepo.list(7, BBOX, signal)).resolves.toEqual(reply);
    expect(ferratasApi.list).toHaveBeenCalledWith(7, BBOX, signal);
  });

  it('FE-REPO-FERRATA-002: offline it refuses without making the request', async () => {
    vi.mocked(isEffectivelyOffline).mockReturnValue(true);
    await expect(ferrataRepo.list(7, BBOX, new AbortController().signal)).rejects.toThrow('connection');
    expect(ferratasApi.list).not.toHaveBeenCalled();
  });

  it('FE-REPO-FERRATA-003: an answer off the contract is rejected, not drawn', async () => {
    vi.mocked(ferratasApi.list).mockResolvedValue({ ...reply, ferratas: [{ ...reply.ferratas[0], id: 'node/1' }] });
    await expect(ferrataRepo.list(7, BBOX, new AbortController().signal)).rejects.toThrow();
    vi.mocked(ferratasApi.list).mockResolvedValue({
      ...reply,
      ferratas: [{ ...reply.ferratas[0], geometry: [[46.5, 11.7]] }],
    });
    await expect(ferrataRepo.list(7, BBOX, new AbortController().signal)).rejects.toThrow();
  });
});
