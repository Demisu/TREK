import { Check, Eye, MapPin, Ship, Unlink } from 'lucide-react';
import { useTranslation } from '../../../i18n';
import { useSettingsStore } from '../../../store/settingsStore';
import { formatDistance } from '../../../utils/units';
import { SoftPill } from '../../Planner/planParts';
import { Tooltip } from '../../shared/Tooltip';
import type { WalkFerryCrossing } from '../planner/tourRouting';
import type { TourPlannerController } from '../planner/useTourPlanner';
import { CardAction, TourNotice } from '../tourParts';
import { formatPlannedTourDuration } from '../tourPresentation';
import { ferryMinutesOf } from './walkFerry';
import { FERRY_CSS_COLOR } from './walkRoutePaint';

type Planner = Pick<
  TourPlannerController,
  'walkFerries' | 'waypoints' | 'setSelectedWaypointId' | 'canEdit' | 'isSaving'
>;
type Translate = ReturnType<typeof useTranslation>['t'];

function pointName(planner: Planner, index: number, t: Translate): string {
  return planner.waypoints[index]?.name?.trim() || t('tours.walk.stationNumbered', { number: index + 1 });
}

/** The crossing's length and time as badges; a time the router did not give says so, dimmed. */
function CrossingFacts({ crossing }: { crossing: WalkFerryCrossing }) {
  const { t } = useTranslation();
  const unit = useSettingsStore((state) => state.settings.distance_unit);
  const minutes = ferryMinutesOf(crossing);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <SoftPill icon={<Ship size={10} strokeWidth={2.2} className="flex-none" style={{ color: FERRY_CSS_COLOR }} />}>
        {formatDistance(crossing.metres / 1000, unit ?? 'metric')}
      </SoftPill>
      <Tooltip label={t('tours.walk.ferry.timeHint')}>
        <span data-testid="walk-ferry-time" className={`inline-flex ${minutes === null ? 'opacity-60' : ''}`}>
          <SoftPill>
            {minutes === null
              ? t('tours.walk.ferry.timeUnknown')
              : t('tours.walk.ferry.time', { time: formatPlannedTourDuration(minutes) })}
          </SoftPill>
        </span>
      </Tooltip>
    </span>
  );
}

function selectAction(planner: Planner, index: number, t: Translate) {
  const select = () => planner.setSelectedWaypointId(planner.waypoints[index]?.id ?? null);
  return (
    <CardAction icon={<MapPin size={12} strokeWidth={2} />} onClick={select}>
      {t('tours.walk.ferry.selectStop', { number: index + 1 })}
    </CardAction>
  );
}

/**
 * CW-12: a city walk's crossings by boat in the planner. One the router took
 * is named with its length and the boat's time, shown on the map on demand,
 * and holds the save until the travellers take it as a ferry leg or move a
 * stop; one taken is said once more, so the walk's time reads right. A leg no
 * way joins at all names its two stops; the route planned before stays,
 * greyed, until a way is found.
 */
export function WalkFerryNotice({ planner }: { planner: Planner }) {
  const { t } = useTranslation();
  const { gap, crossings, accept, show } = planner.walkFerries;
  const locked = !planner.canEdit || planner.isSaving;
  return (
    <>
      {gap && (
        <TourNotice tone="warning" icon={<Unlink size={13} strokeWidth={2} />}>
          <span className="flex flex-col items-start gap-1.5" data-testid="walk-ferry-gap">
            <span>
              {t('tours.walk.ferry.gap', {
                from: pointName(planner, gap.leg, t),
                to: pointName(planner, gap.leg + 1, t),
              })}
            </span>
            <span className="text-content-muted">{t('tours.walk.ferry.gapHint')}</span>
            {selectAction(planner, gap.leg + 1, t)}
          </span>
        </TourNotice>
      )}
      {crossings.map((crossing) => {
        const names = { from: pointName(planner, crossing.leg, t), to: pointName(planner, crossing.leg + 1, t) };
        return (
          <TourNotice
            key={`${crossing.leg}:${crossing.accepted ? 'kept' : 'open'}`}
            tone={crossing.accepted ? 'neutral' : 'warning'}
            icon={<Ship size={13} strokeWidth={2} />}
          >
            <span className="flex flex-col items-start gap-1.5" data-testid="walk-ferry">
              <span>{t(crossing.accepted ? 'tours.walk.ferry.accepted' : 'tours.walk.ferry.pending', names)}</span>
              <CrossingFacts crossing={crossing} />
              {!crossing.accepted && <span className="text-content-muted">{t('tours.walk.ferry.pendingHint')}</span>}
              <span className="flex flex-wrap gap-1.5">
                {!crossing.accepted && (
                  <CardAction
                    icon={<Check size={12} strokeWidth={2} />}
                    onClick={() => accept(crossing)}
                    disabled={locked}
                  >
                    {t('tours.walk.ferry.accept')}
                  </CardAction>
                )}
                <CardAction icon={<Eye size={12} strokeWidth={2} />} onClick={() => show(crossing)}>
                  {t('tours.walk.ferry.show')}
                </CardAction>
                {!crossing.accepted && selectAction(planner, crossing.leg + 1, t)}
              </span>
            </span>
          </TourNotice>
        );
      })}
    </>
  );
}
