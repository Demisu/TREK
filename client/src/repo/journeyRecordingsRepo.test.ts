import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRecordedDay, buildRecordingPreview } from '../../tests/helpers/journeyRecording';
import { journeyRecordingsApi } from '../api/journeyRecordings';
import { journeyRecordingsRepo } from './journeyRecordingsRepo';
import { OnlineOnlyError } from './onlineOnly';

// FE-REPO-JOURNEY-RECORDINGS-001 to FE-REPO-JOURNEY-RECORDINGS-003

const network = vi.hoisted(() => ({ offline: false }));
vi.mock('../sync/networkMode', () => ({ isEffectivelyOffline: () => network.offline }));

const HASH = 'a'.repeat(64);

beforeEach(() => {
  network.offline = false;
  vi.restoreAllMocks();
});

describe('journeyRecordingsRepo', () => {
  it('FE-REPO-JOURNEY-RECORDINGS-001: asks nothing offline, a journey keeps no offline copy of its recorded days', async () => {
    network.offline = true;
    const list = vi.spyOn(journeyRecordingsApi, 'list');
    await expect(journeyRecordingsRepo.list(7)).rejects.toBeInstanceOf(OnlineOnlyError);
    await expect(journeyRecordingsRepo.preview(7, { date: '2026-05-14', utcOffsetMinutes: 0 })).rejects.toBeInstanceOf(
      OnlineOnlyError
    );
    await expect(
      journeyRecordingsRepo.save(7, '2026-05-14', { utcOffsetMinutes: 0, expectedHash: HASH })
    ).rejects.toBeInstanceOf(OnlineOnlyError);
    await expect(journeyRecordingsRepo.remove(7, '2026-05-14')).rejects.toBeInstanceOf(OnlineOnlyError);
    expect(list).not.toHaveBeenCalled();
  });

  it('FE-REPO-JOURNEY-RECORDINGS-002: passes every call on and answers what the contract describes', async () => {
    const day = buildRecordedDay();
    vi.spyOn(journeyRecordingsApi, 'list').mockResolvedValue({ days: [day] });
    vi.spyOn(journeyRecordingsApi, 'preview').mockResolvedValue(buildRecordingPreview());
    const save = vi.spyOn(journeyRecordingsApi, 'save').mockResolvedValue({ day, outcome: 'created' });
    const remove = vi.spyOn(journeyRecordingsApi, 'remove').mockResolvedValue(undefined);

    expect(await journeyRecordingsRepo.list(7)).toEqual([day]);
    expect((await journeyRecordingsRepo.preview(7, { date: '2026-05-14', utcOffsetMinutes: 0 })).journey.title).toBe(
      'Venice'
    );
    expect(
      (await journeyRecordingsRepo.save(7, '2026-05-14', { utcOffsetMinutes: 120, expectedHash: HASH })).outcome
    ).toBe('created');
    await journeyRecordingsRepo.remove(7, '2026-05-14');
    expect(save).toHaveBeenCalledWith(7, '2026-05-14', { utcOffsetMinutes: 120, expectedHash: HASH });
    expect(remove).toHaveBeenCalledWith(7, '2026-05-14');
  });

  it('FE-REPO-JOURNEY-RECORDINGS-003: an answer the contract does not describe fails here, not on the map', async () => {
    vi.spyOn(journeyRecordingsApi, 'list').mockResolvedValue({ days: [{ date: '2026-05-14' }] } as never);
    await expect(journeyRecordingsRepo.list(7)).rejects.toThrow();
  });
});
