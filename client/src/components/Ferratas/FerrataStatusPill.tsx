import { Loader2, Mountain, TriangleAlert } from 'lucide-react';

import { useTranslation } from '../../i18n';
import { MAP_CONTROL_SHADOW } from '../Map/mapControlShadow';
import type { FerrataStatus } from './useTripFerratas';

/** The map controls' frosted glass, so the pill reads as part of the layer pill it sits beside. */
const GLASS = {
  background: 'var(--sidebar-bg)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  boxShadow: MAP_CONTROL_SHADOW,
};

/**
 * What the via ferrata layer is doing, as one small pill over the map, in the
 * row of the layer pill and at its height:
 * loading, how many it found, or why there are none (Overpass unreachable, the
 * area too large to ask for, the device offline). Nothing while the layer is
 * off. Polite live region, so a screen reader hears the count arrive without
 * being interrupted.
 */
export default function FerrataStatusPill({ status, count }: { status: FerrataStatus; count: number }) {
  const { t } = useTranslation();
  if (status === 'idle') return null;

  const problem = status === 'error' || status === 'offline';
  const label = labelOf(status, count, t);
  const Icon = status === 'loading' ? Loader2 : problem ? TriangleAlert : Mountain;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`${t('ferratas.layer')}: ${label}`}
      data-testid="ferrata-status-pill"
      className={`pointer-events-auto inline-flex h-[42px] flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-caption font-semibold ${
        problem ? 'text-danger' : 'text-content-secondary'
      }`}
      style={GLASS}
    >
      <Icon size={13} aria-hidden="true" className={status === 'loading' ? 'motion-safe:animate-spin' : undefined} />
      <span>{label}</span>
    </div>
  );
}

function labelOf(
  status: Exclude<FerrataStatus, 'idle'>,
  count: number,
  t: (key: string, params?: Record<string, string | number>) => string
) {
  switch (status) {
    case 'loading':
      return t('ferratas.loading');
    case 'error':
      return t('ferratas.error');
    case 'offline':
      return t('ferratas.offline');
    case 'tooLarge':
      return t('ferratas.zoomIn');
    case 'ready':
      return t('ferratas.count', { count });
  }
}
