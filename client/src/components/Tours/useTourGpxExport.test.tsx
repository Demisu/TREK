import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { AxiosError, AxiosHeaders } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attachmentFilename } from '../../api/tourGpxExport';
import { TourGpxExportBarButton, TourGpxExportButton } from './TourGpxExportButton';
import { useTourGpxExport } from './useTourGpxExport';

const repo = vi.hoisted(() => ({ exportGpx: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
const download = vi.hoisted(() => ({ downloadBlob: vi.fn() }));
vi.mock('../../repo/tourRepo', () => ({ tourRepo: repo }));
vi.mock('../shared/Toast', () => ({ useToast: () => toast }));
vi.mock('../../utils/fileDownload', () => download);

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

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(download.downloadBlob).toHaveBeenCalledWith(blob, 'Kramer-über.gpx');
    expect(result.current.exporting).toBe(false);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('names the file after the tour when the server gave no name', async () => {
    repo.exportGpx.mockResolvedValue({ offline: false, blob, filename: null });
    const { result } = renderHook(() => useTourGpxExport());
    await act(() => result.current.exportGpx({ ...target, name: '  ' }));
    expect(download.downloadBlob).toHaveBeenCalledWith(blob, 'tour.gpx');
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

describe('TourGpxExportButton (PR1-06A)', () => {
  it('exports from the footer, apart from the navigation', async () => {
    render(<TourGpxExportButton target={target} />);
    const button = screen.getByTestId('tour-gpx-export');
    expect(button).toHaveAccessibleName('tours.gpxExport.action');
    await act(async () => fireEvent.click(button));
    expect(repo.exportGpx).toHaveBeenCalledTimes(1);
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
