import type { PaddleLayout } from '@trek/shared';
import { useTranslation } from '../../../i18n';
import { useSettingsStore } from '../../../store/settingsStore';
import { formatDistance } from '../../../utils/units';
import { fs } from '../../shared/DialogShell';
import { Tooltip } from '../../shared/Tooltip';
import { PORTAGE_LINE_COLOR } from '../planner/tourRouteStyle';
import { PaddleGlyph } from './PaddleGlyph';

/** Water in the band and in the tiles that explain it: the info blue of the theme. */
export const WATER_COLOR = 'var(--info)';

/** The narrowest a stretch is drawn, in percent, so a short portage still shows. */
const MIN_SHARE = 1.5;

/**
 * A paddle tour from put-in to take-out as one band, to scale: water in the
 * planner's blue, portages in the earth brown the map draws them in, each lock
 * a mark at its place (struck through where a portage carries round it). It
 * stands where a hike shows its elevation profile; a paddle tour has none.
 */
export function PaddleRouteStrip({ layout, compact = false }: { layout: PaddleLayout; compact?: boolean }) {
  const { t } = useTranslation();
  const unit = useSettingsStore((state) => state.settings.distance_unit) ?? 'metric';
  const total = layout.totalM;
  if (total <= 0 || layout.stretches.length === 0) return null;
  const share = (m: number) => Math.max(MIN_SHARE, (m / total) * 100);
  const km = (m: number) => formatDistance(m / 1000, unit);
  return (
    <div data-testid="paddle-route-strip" className="min-w-0">
      <div className={`relative ${compact ? '' : 'py-[3px]'}`}>
        {!compact &&
          layout.locks.map((lock) => (
            <Tooltip key={`${lock.atM}-${lock.index ?? ''}`} label={`${t('tours.paddle.lock')} ${km(lock.atM)}`}>
              <span
                data-testid="paddle-route-strip-lock"
                className={`absolute top-1/2 z-10 grid h-4 w-4 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-surface-card text-content-secondary shadow-sm ring-1 ring-edge rtl:translate-x-1/2 ${lock.bypassed ? 'opacity-45' : ''}`}
                // rtl-lint-disable the band runs from the put-in, along the line, in both directions alike
                style={{ insetInlineStart: `${(lock.atM / total) * 100}%` }}
              >
                <PaddleGlyph kind="lock" size={10} strokeWidth={2.6} />
              </span>
            </Tooltip>
          ))}
        <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full">
          {layout.stretches.map((stretch) => {
            const land = stretch.kind === 'portage';
            const length = stretch.toM - stretch.fromM;
            return (
              <Tooltip
                key={`${stretch.kind}-${stretch.fromM}`}
                label={`${t(land ? 'tours.paddle.portage' : 'tours.paddle.time.water')} ${km(length)}`}
              >
                <span
                  data-stretch={stretch.kind}
                  className={`h-full min-w-[3px] ${land ? '' : 'bg-info'}`}
                  style={{
                    flexGrow: share(length),
                    flexBasis: 0,
                    ...(land ? { background: PORTAGE_LINE_COLOR } : {}),
                  }}
                />
              </Tooltip>
            );
          })}
        </div>
      </div>
      {!compact && (
        <div className="mt-1 flex justify-between font-geist tabular-nums text-content-faint" style={fs(10)}>
          <span>{km(0)}</span>
          <span>{km(total)}</span>
        </div>
      )}
    </div>
  );
}
