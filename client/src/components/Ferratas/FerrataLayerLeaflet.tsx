import { useMemo } from 'react';
import { Polyline, Tooltip } from 'react-leaflet';

import type { Ferrata } from '@trek/shared';

import { useTranslation } from '../../i18n';
import { ferrataGradeLabel, ferrataGradeTone, ferrataPositions } from './ferrataModel';
import type { FerrataSelectHandler } from './useFerrataLayerGL';
import type { FerrataMapLayer } from './useFerrataMapLayer';
import { useFerrataPaint } from './useFerrataPaint';

/**
 * The via ferrata layer on the Leaflet renderer: per ferrata a casing and the
 * dashed line coloured by difficulty band, the same construction as the GL
 * layer, with a sticky tooltip naming the route and its grade. A click hands
 * the ferrata to `onSelect`, like a click on the GL layer does.
 */
export default function FerrataLayerLeaflet({
  ferratas,
  onSelect,
}: {
  ferratas: readonly Ferrata[];
  onSelect: FerrataSelectHandler;
}) {
  const { t } = useTranslation();
  const paint = useFerrataPaint();
  // Rebuilt per set of ferratas and per theme: pathOptions only reach Leaflet when their reference changes.
  const lines = useMemo(
    () =>
      ferratas.map((ferrata) => ({
        ferrata,
        positions: ferrataPositions(ferrata),
        casing: { color: paint.casing, weight: 6, opacity: 0.75, lineCap: 'round', lineJoin: 'round' } as const,
        line: {
          color: paint.tone[ferrataGradeTone(ferrata.grade)],
          weight: 3,
          opacity: 0.95,
          dashArray: '6 5',
          lineCap: 'round',
          lineJoin: 'round',
        } as const,
        hit: { color: paint.casing, weight: 16, opacity: 0 } as const,
      })),
    [ferratas, paint]
  );

  if (lines.length === 0) return null;
  return (
    <>
      {lines.map(({ ferrata, positions, casing }) => (
        <Polyline key={`${ferrata.id}-casing`} positions={positions} pathOptions={casing} interactive={false} />
      ))}
      {lines.map(({ ferrata, positions, line }) => (
        <Polyline key={`${ferrata.id}-line`} positions={positions} pathOptions={line} interactive={false} />
      ))}
      {/* A wide, invisible line on top carries the tooltip and the click, so a thin
          dashed route is still easy to hit with a finger. The click stops here: it
          opens the ferrata's card and must not also drop a control point under it. */}
      {lines.map(({ ferrata, positions, hit }) => {
        const name = ferrata.name ?? ferrata.routeName ?? t('ferratas.unnamed');
        const grade = ferrataGradeLabel(ferrata.grade);
        return (
          <Polyline
            key={`${ferrata.id}-hit`}
            positions={positions}
            pathOptions={hit}
            bubblingMouseEvents={false}
            eventHandlers={{ click: (event) => onSelect(ferrata, { lng: event.latlng.lng, lat: event.latlng.lat }) }}
          >
            <Tooltip sticky>
              {name}
              {grade && <span className="ms-1.5 font-semibold">{grade}</span>}
            </Tooltip>
          </Polyline>
        );
      })}
    </>
  );
}

/** The layer as the Leaflet map view mounts it from a `FerrataMapLayer`: drawn only while it is switched on. */
export function FerrataMapLayerLeaflet({ layer }: { layer: FerrataMapLayer | undefined }) {
  if (!layer?.active) return null;
  return <FerrataLayerLeaflet ferratas={layer.ferratas} onSelect={layer.onSelect} />;
}
