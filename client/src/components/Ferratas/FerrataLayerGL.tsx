import type { Map } from 'mapbox-gl';

import type { Ferrata } from '@trek/shared';

import { type FerrataSelectHandler, useFerrataLayerGL } from './useFerrataLayerGL';

/**
 * The via ferrata layer as a mountable piece for a GL map view: it renders
 * nothing itself, the lines live on `map`. See useFerrataLayerGL for the
 * layering and the click handling.
 */
export default function FerrataLayerGL({
  map,
  ferratas,
  onSelect,
}: {
  map: Map | null;
  ferratas: readonly Ferrata[];
  onSelect: FerrataSelectHandler;
}) {
  useFerrataLayerGL(map, ferratas, onSelect);
  return null;
}
