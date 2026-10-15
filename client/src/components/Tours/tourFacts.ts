import type { DistanceUnit } from '../../types';
import type { RouteGeometryAnalysis } from '../../utils/routeGeometry';
import { formatDistance, formatElevation } from '../../utils/units';
import type { TourMetricField } from './tourParts';

/** A line's measures as label and value: distance, the extras, lowest and highest point, ascent, descent. */
export function tourMetricFacts(
  analysis: Pick<RouteGeometryAnalysis, 'distanceKm' | 'minEle' | 'maxEle' | 'gain' | 'loss'> | null,
  unitSetting: DistanceUnit | undefined,
  t: (key: string, params?: Record<string, unknown>) => string,
  extra: readonly TourMetricField[] = []
): TourMetricField[] {
  // The setting is unset until the user picks one; metric is what the app shows then.
  const unit = unitSetting ?? 'metric';
  const fields: TourMetricField[] = [
    { label: t('tours.detail.distance'), value: analysis ? formatDistance(analysis.distanceKm, unit) : '-' },
    ...extra,
  ];
  if (analysis?.minEle != null)
    fields.push({ label: t('tours.detail.minAltitude'), value: formatElevation(analysis.minEle, unit) });
  if (analysis?.maxEle != null)
    fields.push({ label: t('tours.detail.maxAltitude'), value: formatElevation(analysis.maxEle, unit) });
  if (analysis?.gain != null)
    fields.push({ label: t('tours.detail.ascent'), value: formatElevation(analysis.gain, unit) });
  if (analysis?.loss != null)
    fields.push({ label: t('tours.detail.descent'), value: formatElevation(analysis.loss, unit) });
  return fields;
}
