import { EntityRepositoryType, type Opt, type Ref, defineEntity, p } from '@mikro-orm/core';
import { TourWaypointsRepository } from '../repositories/TourWaypoints.repository';
import { Places } from './Places.entity';
import { Tours } from './Tours.entity';

export class TourWaypoints {
  [EntityRepositoryType]?: TourWaypointsRepository;
  id!: number & Opt;
  place!: Ref<Tours>;
  place_id!: number;
  lat!: number;
  lng!: number;
  role!: string;
  sequence!: number;
  fixed_leg?: string | null;
  lock?: string | null;
  shaping: number & Opt = 0;
  linkedPlace?: Ref<Places> | null;
  linked_place_id?: number | null;
}

export const TourWaypointsSchema = defineEntity({
  class: TourWaypoints,
  repository: () => TourWaypointsRepository,
  indexes: [
    {
      name: 'idx_tour_waypoints_linked_place',
      where: 'linked_place_id IS NOT NULL',
      properties: ['linked_place_id'],
    },
  ],
  uniques: [{ properties: ['place', 'sequence'] }],
  checks: [
    { name: 'tour_waypoints_shaping_check', expression: 'shaping IN (0, 1)' },
  ],
  properties: {
    id: p.integer().primary(),
    place: () => p.manyToOne(Tours).ref().name('place_id').deleteRule('cascade').hidden(),
    place_id: p.integer().persist(false),
    lat: p.double(),
    lng: p.double(),
    role: p.text(),
    sequence: p.integer(),
    fixed_leg: p.text().nullable(),
    lock: p.text().nullable(),
    shaping: p.integer().default(0),
    linkedPlace: () => p.manyToOne(Places).ref().nullable().hidden(),
    linked_place_id: p.integer().nullable().persist(false),
  },
});
