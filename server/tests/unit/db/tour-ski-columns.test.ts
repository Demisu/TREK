/**
 * SKI-02: `Migration20200101045520_a_tour_can_be_a_ski_track` switches the ski
 * type on, without a routing profile, and gives a tour its ski discipline (six
 * of them, snowshoeing and winter hiking among them) and cross-country
 * technique. Both columns hold a CHECK list the entity carries
 * as its enum and the contract holds too: a value one side takes and the
 * other refuses would be a ski track the import accepts and the database
 * cannot store.
 */
import { ToursSkiDiscipline, ToursSkiTechnique } from '../../../src/db/entities/Tours.entity';
import { createMigrationOrm, migrateTo, pendingNames, rawExec, rawQuery } from '../../helpers/migration-step';
import type { MikroORM } from '@mikro-orm/sqlite';
import { SKI_DISCIPLINES, SKI_TECHNIQUES } from '@trek/shared';

import { describe, expect, it } from 'vitest';

const TARGET = 'Migration20200101045520_a_tour_can_be_a_ski_track';

async function ormBeforeTarget(): Promise<MikroORM> {
  const orm = await createMigrationOrm();
  const names = await pendingNames(orm);
  const idx = names.indexOf(TARGET);
  expect(idx).toBeGreaterThan(0);
  await migrateTo(orm, names[idx - 1]);
  return orm;
}

describe('ski columns match the contract', () => {
  it('TOURSKIMIG-001: stores exactly the disciplines and techniques the contract knows', () => {
    expect([...Object.values(ToursSkiDiscipline)].sort()).toEqual([...SKI_DISCIPLINES].sort());
    expect([...Object.values(ToursSkiTechnique)].sort()).toEqual([...SKI_TECHNIQUES].sort());
  });

  it('TOURSKIMIG-002: switches the ski type on without a router, leaves every tour as it was and refuses an unknown value', async () => {
    const orm = await ormBeforeTarget();
    try {
      await rawExec(
        orm,
        "INSERT INTO users (id, username, email, password_hash) VALUES (1, 'owner', 'owner@test', 'x')",
      );
      await rawExec(orm, "INSERT INTO trips (id, user_id, title) VALUES (10, 1, 'Alps')");
      await rawExec(
        orm,
        "INSERT INTO places (id, trip_id, name) VALUES (100, 10, 'Ridge walk'), (101, 10, 'Up to the hut')",
      );
      await rawExec(orm, "INSERT INTO tours (place_id, tour_type, distance) VALUES (100, 'hike', 12.5)");

      await migrateTo(orm, TARGET);

      expect(await rawQuery(orm, "SELECT enabled, routing_profile FROM tour_types WHERE key = 'ski'")).toEqual([
        { enabled: 1, routing_profile: null },
      ]);
      expect(await rawQuery(orm, 'SELECT ski_discipline, ski_technique FROM tours')).toEqual([
        { ski_discipline: null, ski_technique: null },
      ]);
      await rawExec(
        orm,
        "INSERT INTO tours (place_id, tour_type, ski_discipline, ski_technique) VALUES (101, 'ski', 'cross_country', 'unknown')",
      );
      // Snowshoeing and winter hiking are disciplines of a ski tour, never labels of a hike.
      await rawExec(orm, "UPDATE tours SET ski_discipline = 'snowshoe', ski_technique = NULL WHERE place_id = 101");
      await rawExec(orm, "UPDATE tours SET ski_discipline = 'winter_hike' WHERE place_id = 101");
      await expect(rawExec(orm, "UPDATE tours SET ski_discipline = 'freeride' WHERE place_id = 101")).rejects.toThrow(
        /CHECK/,
      );
      await expect(rawExec(orm, "UPDATE tours SET ski_technique = 'diagonal' WHERE place_id = 101")).rejects.toThrow(
        /CHECK/,
      );
    } finally {
      await orm.close(true);
    }
  }, 30000);
});
