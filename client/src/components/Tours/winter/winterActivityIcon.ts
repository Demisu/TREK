import type { WinterActivity } from '@trek/shared';
import { Footprints, Snowflake, type LucideIcon } from 'lucide-react';

/** HIK-01: the icon each winter label goes by, a snowflake for winter hiking and footprints in the snow for snowshoes. */
export const WINTER_ACTIVITY_ICON: Record<WinterActivity, LucideIcon> = {
  winter_hike: Snowflake,
  snowshoe: Footprints,
};
