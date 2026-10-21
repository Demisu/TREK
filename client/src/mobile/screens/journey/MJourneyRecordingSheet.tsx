import { JourneyRecordingActions, JourneyRecordingReview } from '../../../components/Journey/JourneyRecordingReview';
import {
  useJourneyRecordingDay,
  type JourneyRecordingViewProps,
} from '../../../components/Journey/useJourneyRecordingDay';
import DawarichIcon from '../../../components/shared/DawarichIcon';
import { useTranslation } from '../../../i18n';
import MSheet from '../../components/MSheet';
import { FormSheetHeader } from '../trip/sheets/PlSheetChrome';

/**
 * Taking one day's recorded route from Dawarich into the journey (JRN-01), on
 * the phone: the same preview and the same buttons as the desktop dialog, in a
 * bottom sheet, for the day of the card the journey is showing.
 */
export default function MJourneyRecordingSheet({
  journeyTitle,
  date,
  stored,
  onClose,
  ...rest
}: JourneyRecordingViewProps) {
  const { t, locale } = useTranslation();
  const day = useJourneyRecordingDay({ date, onClose, ...rest });
  const title = new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <MSheet open onClose={onClose} variant="bottom" material="glass" ariaLabel={t('journey.recording.takeOver')}>
      <div className="flex max-h-[86dvh] min-h-0 flex-col">
        <FormSheetHeader
          leading={
            <span className="flex h-10 w-10 flex-none overflow-hidden rounded-[13px]">
              <DawarichIcon size={40} />
            </span>
          }
          title={title}
          subtitle={day.preview?.journey.title ?? journeyTitle}
          onClose={onClose}
          closeLabel={t('common.close')}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[18px] pb-4 pt-2">
          <p className="m-0 font-geist text-caption text-m-muted">{t('journey.recording.sub')}</p>
          <JourneyRecordingReview day={day} stored={stored} />
        </div>
        <div className="flex flex-none items-center gap-2 border-t border-edge-faint px-[18px] py-3">
          <JourneyRecordingActions day={day} stored={stored} onCancel={onClose} />
        </div>
      </div>
    </MSheet>
  );
}
