import { isAxiosError } from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../i18n';
import { tourRepo } from '../../repo/tourRepo';
import { downloadBlob } from '../../utils/fileDownload';
import { useToast } from '../shared/Toast';

/** What a tour's GPX export needs to know about the tour. */
export interface TourGpxExportTarget {
  tripId: number | string;
  placeId: number;
  name: string;
}

/**
 * PR1-06A: a saved tour handed over as a GPX file, started on purpose. The
 * file is the server's (the saved line, as saved), so an unsaved edit in the
 * planner is not in it. One export at a time per caller; a dialog closed
 * mid-download cancels it. Nothing about the tour changes either way.
 */
export function useTourGpxExport() {
  const { t } = useTranslation();
  const toast = useToast();
  const [exportingId, setExportingId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const exportGpx = useCallback(
    async ({ tripId, placeId, name }: TourGpxExportTarget) => {
      if (abortRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      setExportingId(placeId);
      try {
        const result = await tourRepo.exportGpx(tripId, placeId, controller.signal);
        if (!('blob' in result)) {
          toast.info(t('tours.gpxExport.offline'));
          return;
        }
        downloadBlob(result.blob, result.filename ?? `${name.trim() || 'tour'}.gpx`);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        const noRoute = isAxiosError(error) && error.response?.status === 422;
        toast.error(t(noRoute ? 'tours.gpxExport.noRoute' : 'tours.gpxExport.failed'));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!controller.signal.aborted) setExportingId(null);
      }
    },
    [t, toast]
  );

  return { exportGpx, exportingId, exporting: exportingId !== null };
}
