import { useId } from 'react';
import { useTranslation } from '../../i18n';
import DawarichIcon from '../shared/DawarichIcon';
import { DialogFooter, DialogHeader, DialogShell, DialogTile, NEUTRAL_TINT } from '../shared/DialogShell';
import { JourneyRecordingActions, JourneyRecordingReview } from './JourneyRecordingReview';
import { useJourneyRecordingDay, type JourneyRecordingViewProps } from './useJourneyRecordingDay';

/**
 * Taking one day's recorded route from Dawarich into the journey (JRN-01),
 * on the desktop: the journey and the day in the head band, the preview in the
 * body, keeping it only on the button that says so.
 */
export default function JourneyRecordingDialog({
  journeyTitle,
  date,
  stored,
  onClose,
  ...rest
}: JourneyRecordingViewProps) {
  const { t, locale } = useTranslation();
  const labelId = useId();
  const day = useJourneyRecordingDay({ date, onClose, ...rest });
  const title = new Date(`${date}T00:00:00`).toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <DialogShell
      onClose={onClose}
      labelledBy={labelId}
      width="detail"
      align="top"
      header={
        <DialogHeader
          tile={
            <DialogTile>
              <DawarichIcon size={26} />
            </DialogTile>
          }
          tint={NEUTRAL_TINT}
          labelId={labelId}
          onClose={onClose}
          eyebrow={day.preview?.journey.title ?? journeyTitle}
          title={title}
          sub={t('journey.recording.sub')}
          subWraps
        />
      }
      footer={
        <DialogFooter>
          <JourneyRecordingActions day={day} stored={stored} onCancel={onClose} />
        </DialogFooter>
      }
    >
      <JourneyRecordingReview day={day} stored={stored} />
    </DialogShell>
  );
}
