import { type CardView, PENDING_VIEW } from '../cardTypes';

/**
 * How the kinds of the atlas draw in the chat; each one draws nothing until its
 * cards are built. This file only maps each kind to its view: the components
 * live in sibling files, since a file that exports anything besides components
 * breaks fast refresh, and lint:warnings holds
 * react-refresh/only-export-components at zero for a new file.
 */
export const ATLAS_VIEWS = {
  atlasPassport: PENDING_VIEW,
  atlasCountry: PENDING_VIEW,
  atlasBucket: PENDING_VIEW,
} satisfies { [K in 'atlasPassport' | 'atlasCountry' | 'atlasBucket']: CardView<K> };
