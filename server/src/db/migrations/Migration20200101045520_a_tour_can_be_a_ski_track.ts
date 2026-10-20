import { Migration } from '@mikro-orm/migrations';

/**
 * SKI-02: a tour can be a ski and winter tour, planned in the planner or
 * imported from a GPX file. The `ski` key has been in `tour_types`, disabled
 * and without a routing profile, since every contract type was seeded; it is
 * switched on here and keeps no routing profile: the planner draws its legs
 * itself. The discipline (alpine, snowboard, cross-country, ski touring,
 * snowshoe or winter hike) and, for cross-country, the technique are columns
 * of the tour, NULL on every other type, so no existing tour changes its
 * meaning.
 */
export class Migration20200101045520_a_tour_can_be_a_ski_track extends Migration {
  override name = 'Migration20200101045520_a_tour_can_be_a_ski_track';

  override up(): void {
    this.addSql(
      "ALTER TABLE tours ADD COLUMN ski_discipline TEXT CHECK (ski_discipline IS NULL OR ski_discipline IN ('alpine', 'snowboard', 'cross_country', 'touring', 'snowshoe', 'winter_hike'))",
    );
    this.addSql(
      "ALTER TABLE tours ADD COLUMN ski_technique TEXT CHECK (ski_technique IS NULL OR ski_technique IN ('classic', 'skating', 'unknown'))",
    );
    this.addSql("UPDATE tour_types SET enabled = 1 WHERE key = 'ski'");
  }
}
