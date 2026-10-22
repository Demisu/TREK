import { idSchema } from '../common/primitives.schema';
import { BOOK_DESIGN_ICONS } from './book-icons';
import { bookElementIdSchema, bookGridIdSchema, bookSpreadIdSchema } from './book-op-ids';
import {
  BOOK_BADGES,
  BOOK_METRICS,
  BOOK_SHAPES,
  MAX_BOOK_COUNTRIES,
  bookBadgeElementSchema,
  bookCountriesElementSchema,
  bookIconElementSchema,
  bookListElementSchema,
  bookMapElementSchema,
  bookPhotoElementSchema,
  bookShapeElementSchema,
  bookStatsElementSchema,
  bookTextElementSchema,
} from './book.schema';

import { z } from 'zod';

/**
 * The element operations of a book page: create any of the nine kinds, style
 * one, arrange, align, distribute, lock, duplicate, fill, copy from another
 * page, refresh the travel figures, drop in a photo grid. They join the page
 * operations of book-ops.schema.ts, so `edit_book_page` takes them and the one
 * engine (`applyBookOps`) runs them; nothing else implements them.
 *
 * Same rules as the other operations: strict objects, the fields taken from the
 * document's own shapes with their defaults removed (an omitted field leaves
 * the element as it is), every string, array and number bounded.
 */

/** A position in millimetres, inside the bounds the document takes. */
const mmIn = z.number().finite().min(-10000).max(10000);
/** A size the document keeps after rounding to hundredths. */
const sizeIn = z.number().finite().min(0.01).max(10000);
const unit01 = z.number().min(0).max(1);
const ids30 = z.array(bookElementIdSchema).min(1).max(30);

export const bookFrameInSchema = z.strictObject({ x: mmIn, y: mmIn, w: sizeIn, h: sizeIn });

const photo = bookPhotoElementSchema.shape;
const text = bookTextElementSchema.shape;
const shape = bookShapeElementSchema.shape;
const icon = bookIconElementSchema.shape;
const map = bookMapElementSchema.shape;
const stats = bookStatsElementSchema.shape;
const countries = bookCountriesElementSchema.shape;
const badge = bookBadgeElementSchema.shape;
const list = bookListElementSchema.shape;

/** What every kind has: how see-through it is. */
const COMMON = { opacity: unit01.optional() };

/** What the travel kinds share with text: they are typeset. */
const TYPESET = {
  font: map.font.unwrap().optional(),
  color: map.color.unwrap().optional(),
  accent: map.accent.unwrap().optional(),
  textScale: map.textScale.unwrap().optional(),
  weight: map.weight.unwrap().optional(),
};

const PHOTO_PROPS = {
  ...COMMON,
  fit: photo.fit.unwrap().optional(),
  focalX: unit01.optional(),
  focalY: unit01.optional(),
  mask: photo.mask.unwrap().optional(),
  frameStyle: photo.frameStyle.unwrap().optional(),
  filter: photo.filter.unwrap().optional(),
  radius: z.number().finite().min(0).max(500).optional(),
};
const TEXT_PROPS = {
  ...COMMON,
  font: text.font.unwrap().optional(),
  size: text.size.unwrap().optional(),
  weight: text.weight.unwrap().optional(),
  italic: text.italic.unwrap().optional(),
  align: text.align.unwrap().optional(),
  leading: text.leading.unwrap().optional(),
  tracking: text.tracking.unwrap().optional(),
  color: text.color.unwrap().optional(),
};
const SHAPE_PROPS = {
  ...COMMON,
  fill: shape.fill.unwrap().optional(),
  gradient: shape.gradient.unwrap().optional(),
  stroke: shape.stroke.unwrap().optional(),
  strokeWidth: z.number().finite().min(0).max(20).optional(),
  strokeStyle: shape.strokeStyle.unwrap().optional(),
  radius: z.number().finite().min(0).max(500).optional(),
};
const ICON_PROPS = {
  ...COMMON,
  color: icon.color.unwrap().optional(),
  lineWidth: icon.lineWidth.unwrap().optional(),
};
const MAP_PROPS = {
  ...COMMON,
  ...TYPESET,
  style: map.style.unwrap().optional(),
  showLand: map.showLand.unwrap().optional(),
  showRoute: map.showRoute.unwrap().optional(),
  showPins: map.showPins.unwrap().optional(),
  showLabels: map.showLabels.unwrap().optional(),
  routeStyle: map.routeStyle.unwrap().optional(),
  routeArc: map.routeArc.unwrap().optional(),
  routeDash: map.routeDash.unwrap().optional(),
  pinStyle: map.pinStyle.unwrap().optional(),
  clip: map.clip.unwrap().optional(),
  fitPadding: map.fitPadding.unwrap().optional(),
  fitToCountries: map.fitToCountries.unwrap().optional(),
};
const STATS_PROPS = {
  ...COMMON,
  ...TYPESET,
  layout: stats.layout.unwrap().optional(),
  showIcons: stats.showIcons.unwrap().optional(),
  units: stats.units.unwrap().optional(),
};
const COUNTRIES_PROPS = {
  ...COMMON,
  ...TYPESET,
  layout: countries.layout.unwrap().optional(),
  showOutline: countries.showOutline.unwrap().optional(),
  showFlag: countries.showFlag.unwrap().optional(),
  showName: countries.showName.unwrap().optional(),
  align: countries.align.unwrap().optional(),
};
const BADGE_PROPS = {
  ...COMMON,
  ...TYPESET,
  style: badge.style.unwrap().optional(),
  showIcon: badge.showIcon.unwrap().optional(),
  showLabel: badge.showLabel.unwrap().optional(),
  autoColor: badge.autoColor.unwrap().optional(),
  autoIconColor: badge.autoIconColor.unwrap().optional(),
  iconColor: badge.iconColor.unwrap().optional(),
};
const LIST_PROPS = {
  ...COMMON,
  ...TYPESET,
  layout: list.layout.unwrap().optional(),
  showMarks: list.showMarks.unwrap().optional(),
  proLabel: z.string().max(80).optional(),
  conLabel: z.string().max(80).optional(),
};
const metric = z.enum(BOOK_METRICS);
const METRICS = z.array(metric).min(1).max(7);

/**
 * The look of an element, per kind, for `style`. Values the journey owns (a
 * map's stops, a stat's figures, a country's name) are not props: the engine
 * resolves them from the journey, exactly as the Travel panel does.
 */
export const bookElementPropsSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('photo'), ...PHOTO_PROPS }),
  z.strictObject({ kind: z.literal('text'), ...TEXT_PROPS }),
  z.strictObject({ kind: z.literal('shape'), shape: z.enum(BOOK_SHAPES).optional(), ...SHAPE_PROPS }),
  z.strictObject({ kind: z.literal('icon'), ...ICON_PROPS }),
  z.strictObject({ kind: z.literal('map'), ...MAP_PROPS }),
  z.strictObject({ kind: z.literal('stats'), metrics: METRICS.optional(), ...STATS_PROPS }),
  z.strictObject({ kind: z.literal('countries'), ...COUNTRIES_PROPS }),
  z.strictObject({ kind: z.literal('badge'), ...BADGE_PROPS }),
  z.strictObject({ kind: z.literal('list'), ...LIST_PROPS }),
]);
export type BookElementProps = z.infer<typeof bookElementPropsSchema>;

/** The Studio's text presets: heading, subheading, body, caption and the large quotation mark. */
export const BOOK_TEXT_PRESETS = ['heading', 'subheading', 'body', 'caption', 'quote'] as const;

/**
 * An entry's words need the entry and a photo's caption needs the photo: a
 * binding that names neither reads nothing, and the ids it names are checked
 * against the journey when the engine runs. The `text` op and `add` text share it.
 */
export function bindingNamesItsSource(
  b: { source: string; entryId?: number; photoId?: number } | null | undefined,
): boolean {
  if (!b) return true;
  if (b.source.startsWith('entry.') && b.entryId === undefined) return false;
  return b.source !== 'photo.caption' || b.photoId !== undefined;
}

/** A binding that names its own source: an entry's words carry the entry id, a caption the photo id. */
const bindingIn = text.binding
  .unwrap()
  .unwrap()
  .refine(bindingNamesItsSource, { message: 'an entry binding needs its entryId, a photo binding its photoId' });
const iso2 = z.string().regex(/^[A-Za-z]{2}$/);
const listItem = z.strictObject({ text: z.string().max(400), tone: z.enum(['pro', 'con', 'plain']) });

/**
 * Where a map is of: the whole journey or one trip, the two scopes a stored map
 * can say (its `tripId`). A map of some entries' stops would be stale the moment
 * it was placed and widened to the journey by the first refresh.
 */
const mapScope = z.union([z.literal('journey'), z.strictObject({ tripId: idSchema })]);

/**
 * What to create: the kind, where its content comes from, and its look. A text
 * needs its words or a binding (the engine has no translated sample words); a
 * list needs an entry (its pros and cons) or its lines.
 */
export const bookNewElementSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('photo'), photoId: idSchema.optional(), ...PHOTO_PROPS }),
  z
    .strictObject({
      kind: z.literal('text'),
      preset: z.enum(BOOK_TEXT_PRESETS).optional(),
      text: z.string().max(2000).optional(),
      binding: bindingIn.optional(),
      ...TEXT_PROPS,
    })
    .refine((v) => v.text !== undefined || v.binding !== undefined, { message: 'give the words or a binding' }),
  z.strictObject({ kind: z.literal('shape'), shape: z.enum(BOOK_SHAPES), ...SHAPE_PROPS }),
  z.strictObject({ kind: z.literal('icon'), name: z.enum(BOOK_DESIGN_ICONS), ...ICON_PROPS }),
  z.strictObject({
    kind: z.literal('map'),
    scope: mapScope,
    source: z.enum(['vector', 'relief', 'satellite']).optional(),
    ...MAP_PROPS,
  }),
  z.strictObject({ kind: z.literal('stats'), metrics: METRICS, ...STATS_PROPS }),
  z.strictObject({
    kind: z.literal('countries'),
    codes: z.array(iso2).max(MAX_BOOK_COUNTRIES).optional(),
    ...COUNTRIES_PROPS,
  }),
  z.strictObject({
    kind: z.literal('badge'),
    variant: z.enum(BOOK_BADGES),
    entryId: idSchema.optional(),
    code: z.string().max(24).optional(),
    text: z.string().max(200).optional(),
    sub: z.string().max(200).optional(),
    ...BADGE_PROPS,
  }),
  z
    .strictObject({
      kind: z.literal('list'),
      entryId: idSchema.optional(),
      items: z.array(listItem).max(60).optional(),
      ...LIST_PROPS,
    })
    .refine((v) => (v.entryId === undefined) !== (v.items === undefined), {
      message: 'give an entryId or the items, not both',
    }),
]);
export type BookNewElement = z.infer<typeof bookNewElementSchema>;

const hasProps = (set: Record<string, unknown>) => Object.keys(set).some((k) => k !== 'kind' && set[k] !== undefined);

/**
 * The new page operations, joined into `bookPageOpSchema` (book-ops.schema.ts
 * spreads them into its union).
 */
export const BOOK_ELEMENT_OP_SCHEMAS = [
  /** Create an element; the frame defaults to the Studio panel's size, centred on the page. */
  z.strictObject({
    op: z.literal('add'),
    element: bookNewElementSchema,
    frame: bookFrameInSchema.optional(),
    rotation: z.number().finite().min(-360).max(360).optional(),
  }),
  /** Restyle an element; `set.kind` must be the element's kind. */
  z
    .strictObject({ op: z.literal('style'), elementId: bookElementIdSchema, set: bookElementPropsSchema })
    .refine((v) => hasProps(v.set), { message: 'name at least one field to set', path: ['set'] }),
  /** Move elements in the paint order, keeping their order among themselves. */
  z.strictObject({
    op: z.literal('arrange'),
    elementIds: ids30,
    to: z.enum(['front', 'forward', 'backward', 'back']),
  }),
  /** Line elements up on an edge or a centre line of the selection, their page, or its safe area. */
  z.strictObject({
    op: z.literal('align'),
    elementIds: ids30,
    edge: z.enum(['left', 'center', 'right', 'top', 'middle', 'bottom']),
    to: z.enum(['selection', 'page', 'safe']).default('selection'),
  }),
  /** Space three or more elements evenly, or by a fixed gap in millimetres. */
  z.strictObject({
    op: z.literal('distribute'),
    elementIds: z.array(bookElementIdSchema).min(3).max(30),
    axis: z.enum(['horizontal', 'vertical']),
    gap: z.number().finite().min(0).max(200).optional(),
  }),
  /** Lock or unlock elements: the one operation a locked element accepts. */
  z.strictObject({ op: z.literal('lock'), elementIds: ids30, locked: z.boolean() }),
  /** Copies with new ids, offset by `dx`/`dy` millimetres (4 each by default), painted on top. */
  z.strictObject({
    op: z.literal('duplicate'),
    elementIds: ids30,
    dx: z.number().finite().min(-500).max(500).optional(),
    dy: z.number().finite().min(-500).max(500).optional(),
  }),
  /** The Studio's fill: a photo to the bleed of its page or the spread, unturned, cover, at the back. */
  z.strictObject({ op: z.literal('fill'), elementId: bookElementIdSchema, scope: z.enum(['page', 'spread']) }),
  /** Copy elements of another page onto this one, with new ids; photos are checked against the gallery. */
  z.strictObject({ op: z.literal('copy_from'), spreadId: bookSpreadIdSchema, elementIds: ids30 }),
  /** Bring travel figures up to date with the journey: the named elements, or every one on the page. */
  z.strictObject({ op: z.literal('refresh_travel'), elementIds: ids30.optional() }),
  /** A photo grid as empty frames in a box, the page's safe area by default. */
  z.strictObject({ op: z.literal('add_grid'), grid: bookGridIdSchema, box: bookFrameInSchema.optional() }),
] as const;
