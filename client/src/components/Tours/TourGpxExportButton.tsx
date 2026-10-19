import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from '../../i18n';
import { BarButton } from '../Planner/planParts';
import { DialogButton } from '../shared/DialogShell';
import { Tooltip } from '../shared/Tooltip';
import { useTourGpxExport, type TourGpxExportTarget } from './useTourGpxExport';

/**
 * PR1-06A in a footer: the saved tour as a GPX file, its own action beside
 * the navigation, which only leads to the start. "GPX" says the format, the
 * tooltip what the file holds.
 */
export function TourGpxExportButton({ target }: { target: TourGpxExportTarget }) {
  const { t } = useTranslation();
  const { exportGpx, exporting } = useTourGpxExport();
  return (
    <Tooltip label={t('tours.gpxExport.hint')}>
      <span className="inline-flex">
        <DialogButton
          onClick={() => void exportGpx(target)}
          disabled={exporting}
          aria-label={t('tours.gpxExport.action')}
          data-testid="tour-gpx-export"
          icon={exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} strokeWidth={2} />}
        >
          <span className="max-sm:hidden">GPX</span>
        </DialogButton>
      </span>
    </Tooltip>
  );
}

/**
 * The same export in the planner's head. While the tour has unsaved changes
 * the file would not hold them, so the button waits for the save and says so.
 */
export function TourGpxExportBarButton({ target, unsaved }: { target: TourGpxExportTarget; unsaved: boolean }) {
  const { t } = useTranslation();
  const { exportGpx, exporting } = useTourGpxExport();
  return (
    <BarButton
      label={t(unsaved ? 'tours.gpxExport.saveFirst' : 'tours.gpxExport.action')}
      onClick={() => void exportGpx(target)}
      disabled={unsaved || exporting}
    >
      {exporting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} strokeWidth={2} />}
    </BarButton>
  );
}
