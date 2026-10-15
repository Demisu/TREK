import type { TourListItem } from '@trek/shared';
import { useCallback, useState } from 'react';
import { useTranslation } from '../../i18n';
import { tourRepo } from '../../repo/tourRepo';
import { useTripStore } from '../../store/tripStore';
import { getApiErrorMessage } from '../../utils/apiError';
import { useToast } from '../shared/Toast';

/** The server refuses anything larger; saying so first spares the upload. */
const MAX_TOUR_GPX_BYTES = 10 * 1024 * 1024;

const isGpxFile = (file: Pick<File, 'name'>) => file.name.toLowerCase().endsWith('.gpx');

interface TourGpxImportOptions {
  tripId: number;
  canEdit: boolean;
  /** The imported place ids, so lists can leave them out of the places at once. */
  onToursChanged?: (placeIds?: number[]) => void | Promise<void>;
  /** The new tours, once the trip has been read again with their places. */
  onImported?: (tours: TourListItem[]) => void;
}

/**
 * The one way a GPX file becomes a tour, whichever control it came through:
 * the import button's file picker or a file dropped onto the tours workspace.
 * Files are checked, uploaded one after the other and summed up in one set of
 * toasts: how many came in, how many were already in the trip, which file had
 * no track and which one failed.
 */
export function useTourGpxImport({ tripId, canEdit, onToursChanged, onImported }: TourGpxImportOptions) {
  const { t } = useTranslation();
  const toast = useToast();
  const refreshPlaces = useTripStore((state) => state.refreshPlaces);
  const [importing, setImporting] = useState(false);

  const importFiles = useCallback(
    async (files: readonly File[]) => {
      if (!canEdit || files.length === 0 || importing) return;
      const gpx = files.filter(isGpxFile);
      if (gpx.length < files.length) toast.error(t('tours.import.unsupported'));
      const fitting = gpx.filter((file) => file.size <= MAX_TOUR_GPX_BYTES);
      if (fitting.length < gpx.length)
        toast.error(t('places.importFileTooLarge', { maxMb: MAX_TOUR_GPX_BYTES / 1024 / 1024 }));
      if (fitting.length === 0) return;

      setImporting(true);
      const imported: TourListItem[] = [];
      let skipped = 0;
      let caution = false;
      try {
        for (const file of fitting) {
          try {
            const result = await tourRepo.importGpx(tripId, file);
            imported.push(...result.tours);
            skipped += result.skipped;
            caution ||= result.caution;
          } catch (error: unknown) {
            toast.error(
              getApiErrorMessage(error, '') === 'No track or route found in GPX file'
                ? t('tours.import.noTrackIn', { name: file.name })
                : t('tours.import.errorIn', { name: file.name })
            );
          }
        }
        if (imported.length > 0) {
          // The server's place:created skips this socket, so the places are read
          // again here for the new ones and their lines. Only the places: a whole
          // trip reload would blank the workspace and rebuild its map.
          await onToursChanged?.(imported.map((tour) => tour.place_id));
          await refreshPlaces(tripId);
          toast.success(t('tours.import.success', { count: imported.length }));
          if (caution) toast.info(t('tours.import.caution'));
          onImported?.(imported);
        }
        if (skipped > 0) {
          toast.warning(
            imported.length > 0 ? t('tours.import.skipped', { count: skipped }) : t('tours.import.allSkipped')
          );
        }
      } finally {
        setImporting(false);
      }
    },
    [canEdit, importing, onImported, onToursChanged, refreshPlaces, t, toast, tripId]
  );

  /** Opens the file picker; built per click, so no view carries a hidden input for it. */
  const pick = useCallback(() => {
    if (!canEdit || importing) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx';
    input.multiple = true;
    input.addEventListener('change', () => void importFiles(Array.from(input.files ?? [])), { once: true });
    input.click();
  }, [canEdit, importFiles, importing]);

  return { importing, importFiles, pick };
}

export type TourGpxImport = ReturnType<typeof useTourGpxImport>;
