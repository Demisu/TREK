import { WINTER_ACTIVITIES, type WinterActivity } from '@trek/shared';
import { Snowflake } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { BOX } from '../../Planner/bookings/bookingParts';
import ToggleSwitch from '../../Settings/ToggleSwitch';
import { Segmented } from '../../shared/dialogParts';
import { fs } from '../../shared/DialogShell';
import { InfoDot } from '../tourParts';
import { WINTER_ACTIVITY_ICON } from '../winter/winterMarks';
import type { TourPlannerController } from './useTourPlanner';

/**
 * HIK-01: a hike marked as one done in winter, off by default among the
 * details, so a hike asks for nothing more. Switched on, it is winter hiking
 * until snowshoeing is picked; switched off, the label goes and the route and
 * the days stay. The choice stays in sight but dimmed while the switch is off,
 * and comes back as it was when it is switched on again. The planner keeps
 * that choice with the tour, so a tour saved, closed or opened after a
 * snowshoe hike starts again from winter hiking. The info dot says it is a
 * label only: it plans and times nothing differently.
 */
export function WinterActivityField({
  planner,
  locked,
}: {
  planner: Pick<TourPlannerController, 'winterActivity' | 'setWinterActivity' | 'winterActivityChoice'>;
  locked: boolean;
}) {
  const { t } = useTranslation();
  const current = planner.winterActivity ?? null;
  const on = current !== null;
  const toggle = () => {
    if (locked) return;
    planner.setWinterActivity(on ? null : planner.winterActivityChoice);
  };
  const choose = (next: WinterActivity) => {
    if (locked || !on) return;
    planner.setWinterActivity(next);
  };
  return (
    <div data-testid="tour-winter-activity" className={`${BOX} min-w-0`}>
      <div className="flex items-center gap-2.5 px-3 py-2">
        <span
          aria-hidden="true"
          className={`grid h-7 w-7 flex-none place-items-center rounded-full transition-colors ${on ? 'bg-info-soft text-info' : 'bg-surface-tertiary text-content-faint'}`}
        >
          <Snowflake size={14} strokeWidth={2} />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1">
          <span className="min-w-0 truncate font-semibold text-content" style={fs(12.5, 'body')}>
            {t('tours.winter.title')}
          </span>
          <InfoDot label={t('tours.winter.infoLabel')} description={t('tours.winter.info')} />
        </span>
        <span className={locked ? 'pointer-events-none opacity-50' : undefined}>
          <ToggleSwitch on={on} onToggle={toggle} label={t('tours.winter.title')} />
        </span>
      </div>
      <fieldset
        data-testid="tour-winter-kind"
        disabled={locked || !on}
        className={`m-0 min-w-0 border-0 border-t border-solid border-edge-faint px-3 py-2 transition-opacity ${on ? '' : 'opacity-50'}`}
      >
        <Segmented<WinterActivity>
          value={current ?? planner.winterActivityChoice}
          onChange={choose}
          label={t('tours.winter.kind')}
          fill
          options={WINTER_ACTIVITIES.map((activity) => {
            const Icon = WINTER_ACTIVITY_ICON[activity];
            return {
              value: activity,
              label: t(`tours.winter.activity.${activity}`),
              icon: <Icon size={13} strokeWidth={2} aria-hidden="true" />,
            };
          })}
        />
      </fieldset>
    </div>
  );
}
