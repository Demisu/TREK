import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachmentFilename } from '../../api/tourGpxExport';
import { TourGpxExportBarButton, TourGpxExportButton } from './TourGpxExportButton';
import { useTourGpxExport } from './useTourGpxExport';

const repo = vi.hoisted(() => ({ exportGpx: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
const download = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
const share = vi.hoisted(() => ({ canShareFile: vi.fn(() => false), shareFile: vi.fn() }));
vi.mock('../../repo/tourRepo', () => ({ tourRepo: repo }));
vi.mock('../shared/Toast', () => ({ useToast: () => toast }));
vi.mock('../../utils/fileDownload', () => download);
vi.mock('../../utils/fileShare', () => share);

const target = { tripId: 1, placeId: 7, name: 'Kramer' };
const blob = new Blob(['<gpx/>'], { type: 'application/gpx+xml' });

function refused(status: number) {
  const headers = new AxiosHeaders();
  return new AxiosError('refused', 'ERR', undefined, undefined, {
    status,
    statusText: '',
    headers,
    config: { headers },
    data: {},
  });
}

/** The server's file as handed on: the same bytes under its name, typed as GPX. */
const gpxFile = (name: string) => expect.objectContaining({ name, type: 'application/gpx+xml', size: blob.size });

beforeEach(() => {
  vi.clearAllMocks();
  share.canShareFile.mockReturnValue(false);
  repo.exportGpx.mockResolvedValue({ offline: false, blob, filename: 'Kramer-über.gpx' });
});

describe('attachmentFilename (PR1-06A)', () => {
  it('prefers the UTF-8 name, falls back to the plain one, and reads nothing from nothing', () => {
    expect(attachmentFilename(`attachment; filename="Kramer-_ber.gpx"; filename*=UTF-8''Kramer-%C3%BCber.gpx`)).toBe(
      'Kramer-über.gpx'
    );
    expect(attachmentFilename('attachment; filename="plain.gpx"')).toBe('plain.gpx');
    expect(attachmentFilename(`attachment; filename="safe.gpx"; filename*=UTF-8''%E0%A4%A`)).toBe('safe.gpx');
    expect(attachmentFilename('attachment')).toBeNull();
    expect(attachmentFilename(undefined)).toBeNull();
  });
});

describe('useTourGpxExport (PR1-06A)', () => {
  it('hands the server file to the browser under its own name', async () => {
    const { result } = renderHook(() => useTourGpxExport());
    await act(() => result.current.exportGpx(target));
    expect(repo.exportGpx).toHaveBeenCalledWith(1, 7, expect.any(AbortSignal));
    expect(download.downloadBlob).toHaveBeenCalledWith(gpxFile('Kramer-über.gpx'), 'Kramer-über.gpx');
    expect(result.current.exporting).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('names the file after the tour when the server gave no name', async () => {
    repo.exportGpx.mockResolvedValue({ offline: false, blob, filename: null });
    const { result } = renderHook(() => useTourGpxExport());
    await act(() => result.current.exportGpx({ ...target, name: '  ' }));
    expect(download.downloadBlob).toHaveBeenCalledWith(gpxFile('tour.gpx'), 'tour.gpx');
  });

  it('says why nothing came: offline, a tour without a route, or a failure', async () => {
    const { result } = renderHook(() => useTourGpxExport());
    repo.exportGpx.mockResolvedValueOnce({ offline: true });
    await act(() => result.current.exportGpx(target));
    expect(toast.info).toHaveBeenCalledWith('tours.gpxExport.offline');

    repo.exportGpx.mockRejectedValueOnce(refused(422));
    await act(() => result.current.exportGpx(target));
    expect(toast.error).toHaveBeenLastCalledWith('tours.gpxExport.noRoute');

    repo.exportGpx.mockRejectedValueOnce(new Error('network'));
    await act(() => result.current.exportGpx(target));
    expect(toast.error).toHaveBeenLastCalledWith('tours.gpxExport.failed');
    expect(download.downloadBlob).not.toHaveBeenCalled();
  });

  it('runs one export at a time, and a caller gone mid-download cancels it quietly', async () => {
    let finish: (value: unknown) => void = () => undefined;
    repo.exportGpx.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const { result, unmount } = renderHook(() => useTourGpxExport());
    act(() => {
      void result.current.exportGpx(target);
    });
    expect(result.current.exportingId).toBe(7);
    await act(() => result.current.exportGpx(target));
    expect(repo.exportGpx).toHaveBeenCalledTimes(1);

    const signal = repo.exportGpx.mock.calls[0][2] as AbortSignal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => finish({ offline: false, blob, filename: 'late.gpx' }));
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('useTourGpxExport, sharing (IO-01)', () => {
  it('asks the platform about a GPX file, not about sharing in general', () => {
    share.canShareFile.mockReturnValue(true);
    const { result } = renderHook(() => useTourGpxExport());
    expect(result.current.canShare).toBe(true);
    expect(share.canShareFile).toHaveBeenCalledWith('tour.gpx', 'application/gpx+xml');
  });

  it('hands the same file to the share sheet under the tour name, and a closed sheet says nothing', async () => {
    share.shareFile.mockResolvedValue('cancelled');
    const { result } = renderHook(() => useTourGpxExport());
    await act(() => result.current.shareGpx(target));
    expect(share.shareFile).toHaveBeenCalledWith(gpxFile('Kramer-über.gpx'), 'Kramer');
    expect(download.downloadBlob).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('keeps the file when the browser wants a fresh tap, and the next tap shares it without fetching again', async () => {
    share.shareFile.mockResolvedValueOnce('needs-gesture').mockResolvedValueOnce('shared');
    const { result } = renderHook(() => useTourGpxExport());
    await act(() => result.current.shareGpx(target));
    expect(toast.info).toHaveBeenCalledWith('tours.gpxExport.shareReady');
    await act(() => result.current.shareGpx(target));
    expect(repo.exportGpx).toHaveBeenCalledTimes(1);
    expect(share.shareFile).toHaveBeenCalledTimes(2);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('says a failed share leaves the download, and a refusal on the kept file is a failure too', async () => {
    share.shareFile.mockResolvedValueOnce('failed');
    const { result } = renderHook(() => useTourGpxExport());
    await act(() => result.current.shareGpx(target));
    expect(toast.error).toHaveBeenLastCalledWith('tours.gpxExport.shareFailed');

    share.shareFile.mockResolvedValueOnce('needs-gesture');
    await act(() => result.current.shareGpx(target));
    expect(repo.exportGpx).toHaveBeenCalledTimes(1);
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(2);
  });

  it('a second tap shares again from the kept file, as a fresh file, and says nothing', async () => {
    share.shareFile.mockResolvedValue('shared');
    const { result } = renderHook(() => useTourGpxExport());
    await act(() => result.current.shareGpx(target));
    await act(() => result.current.shareGpx(target));
    expect(repo.exportGpx).toHaveBeenCalledTimes(1);
    expect(share.shareFile).toHaveBeenCalledTimes(2);
    const [first, second] = share.shareFile.mock.calls.map((call) => call[0] as File);
    expect(second).not.toBe(first);
    expect(second).toEqual(gpxFile('Kramer-über.gpx'));
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('fetches the file ahead, so the tap opens the sheet before anything is awaited', async () => {
    share.canShareFile.mockReturnValue(true);
    share.shareFile.mockResolvedValue('shared');
    const { result } = renderHook(() => useTourGpxExport(target));
    await act(async () => undefined);
    expect(repo.exportGpx).toHaveBeenCalledWith(1, 7, expect.any(AbortSignal));
    act(() => {
      void result.current.shareGpx(target);
    });
    // Called in the same turn as the tap, not after a network round trip.
    expect(share.shareFile).toHaveBeenCalledWith(gpxFile('Kramer-über.gpx'), 'Kramer');
    expect(repo.exportGpx).toHaveBeenCalledTimes(1);
    await act(async () => undefined);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('lets a tap be while the sheet is still open, and a busy browser is no failure', async () => {
    let close: (value: unknown) => void = () => undefined;
    share.shareFile.mockImplementationOnce(() => new Promise((resolve) => (close = resolve)));
    const { result } = renderHook(() => useTourGpxExport());
    await act(async () => {
      void result.current.shareGpx(target);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(share.shareFile).toHaveBeenCalledTimes(1);
    await act(() => result.current.shareGpx(target));
    expect(share.shareFile).toHaveBeenCalledTimes(1);
    await act(async () => close('cancelled'));

    share.shareFile.mockResolvedValueOnce('busy');
    await act(() => result.current.shareGpx(target));
    expect(share.shareFile).toHaveBeenCalledTimes(2);
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('a failed fetch ahead is quiet, and the tap fetches itself and says why', async () => {
    share.canShareFile.mockReturnValue(true);
    repo.exportGpx.mockRejectedValueOnce(new Error('network')).mockRejectedValueOnce(refused(422));
    const { result } = renderHook(() => useTourGpxExport(target));
    await act(async () => undefined);
    expect(toast.error).not.toHaveBeenCalled();
    await act(() => result.current.shareGpx(target));
    expect(repo.exportGpx).toHaveBeenCalledTimes(2);
    expect(share.shareFile).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('tours.gpxExport.noRoute');
  });

  it('fetches nothing ahead without the share, and drops the kept file when the tour changes', async () => {
    const { unmount } = renderHook(() => useTourGpxExport(target));
    await act(async () => undefined);
    expect(repo.exportGpx).not.toHaveBeenCalled();
    unmount();

    share.canShareFile.mockReturnValue(true);
    share.shareFile.mockResolvedValue('shared');
    const { result, rerender } = renderHook(({ prefetch }) => useTourGpxExport(prefetch), {
      initialProps: { prefetch: target as typeof target | null },
    });
    await act(async () => undefined);
    rerender({ prefetch: null });
    const signal = repo.exportGpx.mock.calls[0][2] as AbortSignal;
    expect(signal.aborted).toBe(true);
    await act(() => result.current.shareGpx(target));
    expect(repo.exportGpx).toHaveBeenCalledTimes(2);
  });

  it('a saved change to the tour drops the file fetched ahead and fetches the new one (P2C-03)', async () => {
    share.canShareFile.mockReturnValue(true);
    share.shareFile.mockResolvedValue('shared');
    const saved = { ...target, revision: 3 };
    const { result, rerender } = renderHook(({ prefetch }) => useTourGpxExport(prefetch), {
      initialProps: { prefetch: saved },
    });
    await act(async () => undefined);
    expect(repo.exportGpx).toHaveBeenCalledTimes(1);

    // The same tour, saved elsewhere and arriving live: name and id unchanged, a new revision.
    const newer = new Blob(['<gpx>newer</gpx>'], { type: 'application/gpx+xml' });
    repo.exportGpx.mockResolvedValueOnce({ offline: false, blob: newer, filename: 'Kramer-über.gpx' });
    rerender({ prefetch: { ...saved, revision: 4 } });
    await act(async () => undefined);
    expect(repo.exportGpx).toHaveBeenCalledTimes(2);

    act(() => {
      void result.current.shareGpx({ ...saved, revision: 4 });
    });
    expect(repo.exportGpx).toHaveBeenCalledTimes(2);
    expect(share.shareFile).toHaveBeenCalledWith(expect.objectContaining({ size: newer.size }), 'Kramer');
    await act(async () => undefined);
  });

  it('a file a tap kept is not shared for a newer revision of the tour (P2C-03)', async () => {
    share.shareFile.mockResolvedValue('shared');
    const { result } = renderHook(() => useTourGpxExport());
    await act(() => result.current.shareGpx({ ...target, revision: 1 }));
    await act(() => result.current.shareGpx({ ...target, revision: 1 }));
    expect(repo.exportGpx).toHaveBeenCalledTimes(1);
    await act(() => result.current.shareGpx({ ...target, revision: 2 }));
    expect(repo.exportGpx).toHaveBeenCalledTimes(2);
    expect(share.shareFile).toHaveBeenCalledTimes(3);
  });

  it('a kept file belongs to its tour: another tour is fetched afresh', async () => {
    share.shareFile.mockResolvedValueOnce('needs-gesture').mockResolvedValueOnce('shared');
    const { result } = renderHook(() => useTourGpxExport());
    await act(() => result.current.shareGpx(target));
    await act(() => result.current.shareGpx({ ...target, placeId: 8 }));
    expect(repo.exportGpx).toHaveBeenCalledTimes(2);
  });

  it('shares nothing when there is no file to hand over', async () => {
    repo.exportGpx.mockResolvedValueOnce({ offline: true });
    const { result } = renderHook(() => useTourGpxExport());
    await act(() => result.current.shareGpx(target));
    expect(share.shareFile).not.toHaveBeenCalled();
    expect(toast.info).toHaveBeenCalledWith('tours.gpxExport.offline');
  });
});

describe('TourGpxExportButton (PR1-06A)', () => {
  it('exports from the footer, apart from the navigation', async () => {
    render(<TourGpxExportButton target={target} />);
    const button = screen.getByTestId('tour-gpx-export');
    expect(button).toHaveAccessibleName('tours.gpxExport.action');
    await act(async () => fireEvent.click(button));
    expect(repo.exportGpx).toHaveBeenCalledTimes(1);
  });

  it('offers the share beside the download only where the platform takes GPX files (IO-01)', async () => {
    const { unmount } = render(<TourGpxExportButton target={target} />);
    expect(screen.queryByTestId('tour-gpx-share')).toBeNull();
    unmount();
    share.canShareFile.mockReturnValue(true);
    share.shareFile.mockResolvedValue('shared');
    render(<TourGpxExportButton target={target} />);
    const button = screen.getByTestId('tour-gpx-share');
    expect(button).toHaveAccessibleName('tours.gpxExport.share');
    await act(async () => fireEvent.click(button));
    expect(share.shareFile).toHaveBeenCalledTimes(1);
  });

  it('the planner head shares too, and waits for the save like the download', () => {
    share.canShareFile.mockReturnValue(true);
    const { rerender } = render(<TourGpxExportBarButton target={target} unsaved />);
    expect(screen.getByRole('button', { name: 'tours.gpxExport.shareSaveFirst' })).toBeDisabled();
    rerender(<TourGpxExportBarButton target={target} unsaved={false} />);
    expect(screen.getByRole('button', { name: 'tours.gpxExport.share' })).toBeEnabled();
  });

  it('waits in the planner head while the tour has unsaved changes, and says so', () => {
    const { rerender } = render(<TourGpxExportBarButton target={target} unsaved />);
    expect(screen.getByRole('button', { name: 'tours.gpxExport.saveFirst' })).toBeDisabled();
    rerender(<TourGpxExportBarButton target={target} unsaved={false} />);
    const button = screen.getByRole('button', { name: 'tours.gpxExport.action' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(repo.exportGpx).toHaveBeenCalledTimes(1);
  });
});
