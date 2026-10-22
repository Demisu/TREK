/**
 * FE-AI-LOOK-001 to FE-AI-LOOK-007
 *
 * The chat's merged look: every verb, tool and kind has its row with a
 * literal key, applied changes open what they opened before the cards came,
 * every kind has a view, the shapes the map hooks of a kind fill, the
 * layout and map sides read through each kind's look, and a verb or entity
 * this build does not know looks like its generic one.
 */
import {
  ASSISTANT_CHANGE_VERB_KEYS,
  type AssistantApplied,
  type AssistantChangeVerbKey,
  type TrekCardKind,
  trekCardSchema,
} from '@trek/shared';
import { describe, expect, it } from 'vitest';

import type { GhostPoint, RouteLineSpec, RouteUse } from '../../../types/assistantMap';
import {
  CARD_LOOKS,
  CARD_MAP_LOOK,
  CARD_RULES,
  ENTITY_LOOK,
  STEP_LOOKS,
  TOOL_LABELS,
  VERB_LOOK,
  entityLookOf,
  verbLookOf,
} from './cardLooks';
import type { CardLook } from './cardTypes';
import { CARD_VIEWS } from './cardViews';

const KINDS = trekCardSchema.options.map((option) => option.shape.kind.value) as TrekCardKind[];

describe('cardLooks', () => {
  it('FE-AI-LOOK-001: every verb is named by its own key', () => {
    for (const verb of ASSISTANT_CHANGE_VERB_KEYS) {
      expect(VERB_LOOK[verb].labelKey).toBe(`assistant.change.verb.${verb}`);
    }
  });

  it('FE-AI-LOOK-002: every tool label and step is a key of its own namespace', () => {
    for (const [tool, look] of Object.entries(TOOL_LABELS)) expect(look?.labelKey).toBe(`assistant.tool.${tool}`);
    for (const look of Object.values(STEP_LOOKS)) expect(look?.stepKey).toMatch(/^assistant\.step\./);
    expect(STEP_LOOKS.get_trip_summary?.stepKey).toBe('assistant.step.reading');
  });

  it('FE-AI-LOOK-003: only a place, a stop, a note and a booking show on the map, as before the cards', () => {
    const onMap = Object.entries(ENTITY_LOOK).flatMap(([entity, look]) => (look.onMap ? [entity] : []));
    expect(onMap.sort()).toEqual(['assignment', 'day_note', 'place', 'reservation']);
    expect(Object.values(ENTITY_LOOK).every((look) => !look.open)).toBe(true);
  });

  it('FE-AI-LOOK-004: every kind has a look and a view; a pending view groups by kind and gives way to nothing', () => {
    expect(Object.keys(CARD_LOOKS).sort()).toEqual([...KINDS].sort());
    expect(Object.keys(CARD_VIEWS).sort()).toEqual([...KINDS].sort());
    expect(CARD_RULES.group({ kind: 'vacay' })).toBe('vacay');
    expect(CARD_RULES.yieldsToChange({ kind: 'expenses' }, { kind: 'payments' })).toBe(false);
  });

  it('FE-AI-LOOK-005: a kind draws its lines and points on the map through its look', () => {
    const look: CardLook<'dayRoute'> = {
      lines: (_card, use: RouteUse): RouteLineSpec[] => [
        { id: `day:${use}`, lines: [[[45.1, 7.2]]], color: 'var(--accent)', dashed: use !== 'pending' },
      ],
      ghosts: (): GhostPoint[] => [{ id: 'via', lat: 45.1, lng: 7.2, name: 'Col', variant: 'point' }],
    };
    expect(look.lines?.({ kind: 'dayRoute' }, 'before')).toEqual([
      { id: 'day:before', lines: [[[45.1, 7.2]]], color: 'var(--accent)', dashed: true },
    ]);
    expect(look.ghosts?.({ kind: 'dayRoute' })[0]?.variant).toBe('point');
  });

  it("FE-AI-LOOK-006: the layout rules and the map read a kind's look, nothing for one that says nothing", () => {
    const route = CARD_LOOKS.dayRoute;
    route.group = () => 'routes';
    route.yieldsToChange = (_answer, change) => change.kind === 'dayRoute';
    route.lines = (_card, use) => [{ id: `day:${use}`, lines: [], color: 'var(--accent)' }];
    try {
      expect(CARD_RULES.group({ kind: 'dayRoute' })).toBe('routes');
      expect(CARD_RULES.yieldsToChange({ kind: 'dayRoute' }, { kind: 'dayRoute' })).toBe(true);
      expect(CARD_MAP_LOOK.lines({ kind: 'dayRoute' }, 'look')).toEqual([
        { id: 'day:look', lines: [], color: 'var(--accent)' },
      ]);
    } finally {
      delete route.group;
      delete route.yieldsToChange;
      delete route.lines;
    }
    expect(CARD_MAP_LOOK.lines({ kind: 'dayRoute' }, 'look')).toEqual([]);
    expect(CARD_MAP_LOOK.ghosts({ kind: 'vacay' })).toEqual([]);
    expect(CARD_MAP_LOOK.hidesEffectGhost({ kind: 'vacay' })).toBe(false);
  });

  it('FE-AI-LOOK-007: a verb or entity only a newer server knows looks like a plain update or an other', () => {
    expect(verbLookOf('laterVerb' as AssistantChangeVerbKey)).toBe(VERB_LOOK.genericUpdate);
    expect(entityLookOf('later_entity' as AssistantApplied['entity'])).toBe(ENTITY_LOOK.other);
    expect(verbLookOf('addPlace')).toBe(VERB_LOOK.addPlace);
    expect(entityLookOf('place')).toBe(ENTITY_LOOK.place);
  });
});
