import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import { tourRepo } from '../../repo/tourRepo';
import { downloadBlob } from '../../utils/fileDownload';
import { canShareFile, shareFile } from '../../utils/fileShare';
import { useToast } from '../shared/Toast';

const GPX_TYPE = 'application/gpx+xml';

/** What a tour's GPX export needs to know about the tour. */
export interface TourGpxExportTarget {
  tripId: number | string;
  placeId: number;
  name: string;
}

/**
 * PR1-06A, IO-01: a saved tour handed over as a GPX file, started on purpose:
 * downloaded, or given to the system's share sheet where the platform takes
 * GPX files. Both use the same file, the server's (the saved line, as saved),
 * so an unsaved edit in the planner is not in it. One export at a time per
 * caller; a dialog closed mid-download cancels it. Nothing about the tour
 * changes either way.
 */
export function useTourGpxExport() {
  const { t } = useTranslation();
  const toast = useToast();
  const [exportingId, setExportingId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // A file fetched for a share the browser then refused for want of a fresh tap, kept for the next one.
  const readyRef = useRef<{ placeId: number; file: File } | null>(null);
  const [canShare] = useState(() => canShareFile('tour.gpx', GPX_TYPE));

  useEffect(() => () => abortRef.current?.abort(), []);

  /** The tour's file from the server, or null when there is none to hand over, said in a toast. */
  const fetchFile = useCallback(
    async ({ tripId, placeId, name }: TourGpxExportTarget): Promise<File | null> => {
      if (abortRef.current) return null;
      const controller = new AbortController();
      abortRef.current = controller;
      setExportingId(placeId);
      try {
        const result = await tourRepo.exportGpx(tripId, placeId, controller.signal);
        if (!('blob' in result)) {
          toast.info(t('tours.gpxExport.offline'));
          return null;
        }
        return new File([result.blob], result.filename ?? `${name.trim() || 'tour'}.gpx`, { type: GPX_TYPE });
      } catch (error: unknown) {
        if (controller.signal.aborted) return null;
        const noRoute = isAxiosError(error) && error.response?.status === 422;
        toast.error(t(noRoute ? 'tours.gpxExport.noRoute' : 'tours.gpxExport.failed'));
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!controller.signal.aborted) setExportingId(null);
      }
    },
    [t, toast]
  );

  const exportGpx = useCallback(
    async (target: TourGpxExportTarget) => {
      const file = await fetchFile(target);
      if (file) downloadBlob(file, file.name);
    },
    [fetchFile]
  );

  const shareGpx = useCallback(
    async (target: TourGpxExportTarget) => {
      const ready = readyRef.current?.placeId === target.placeId ? readyRef.current.file : null;
      readyRef.current = null;
      // A file at hand goes to the sheet before anything is awaited, inside the tap that asked.
      const file = ready ?? (await fetchFile(target));
      if (!file) return;
      const outcome = await shareFile(file, target.name);
      if (outcome === 'needs-gesture' && !ready) {
        readyRef.current = { placeId: target.placeId, file };
        toast.info(t('tours.gpxExport.shareReady'));
      } else if (outcome === 'failed' || outcome === 'needs-gesture') {
        toast.error(t('tours.gpxExport.shareFailed'));
      }
    },
    [fetchFile, t, toast]
  );

  return { exportGpx, shareGpx, canShare, exportingId, exporting: exportingId !== null };
}
