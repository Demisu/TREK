import { ToursWinterActivity } from '../../../src/db/entities/Tours.entity';
import { WINTER_ACTIVITIES } from '@trek/shared';

import { describe, expect, it } from 'vitest';

/**
 * HIK-01: the winter label column holds a CHECK list (migration 045500) that
 * the entity carries as its enum, and the contract holds its own list. A label
 * one side knows and the other refuses would be a hike the planner can save
 * and the database cannot store.
 */
describe('winter activity column matches the contract', () => {
  it('knows the same winter activities as the tours contract', () => {
    expect(Object.values(ToursWinterActivity).sort()).toEqual([...WINTER_ACTIVITIES].sort());
  });
});
