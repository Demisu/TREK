import { Collection, EntityRepositoryType, type Opt, type Ref, defineEntity, p } from '@mikro-orm/core';
import { AssistantThreadsRepository } from '../repositories/AssistantThreads.repository';
import { DbTimestampType } from '../types';
import { AssistantMessages } from './AssistantMessages.entity';
import { AssistantToolCalls } from './AssistantToolCalls.entity';
import { Trips } from './Trips.entity';
import { Users } from './Users.entity';

export class AssistantThreads {
  [EntityRepositoryType]?: AssistantThreadsRepository;
  id!: number & Opt;
  user!: Ref<Users>;
  user_id!: number;
  trip!: Ref<Trips>;
  trip_id!: number;
  title!: string;
  created_at!: string & Opt;
  last_message_at!: string & Opt;
  assistant_messages_collection = new Collection<AssistantMessages>(this);
  assistant_tool_calls_collection = new Collection<AssistantToolCalls>(this);
}

export const AssistantThreadsSchema = defineEntity({
  class: AssistantThreads,
  repository: () => AssistantThreadsRepository,
  indexes: [
    {
      name: 'idx_assistant_threads_user_trip',
      properties: ['user_id', 'trip_id', 'last_message_at'],
    },
  ],
  properties: {
    id: p.integer().primary(),
    user: () => p.manyToOne(Users).ref().deleteRule('cascade').hidden(),
    user_id: p.integer().persist(false),
    trip: () => p.manyToOne(Trips).ref().deleteRule('cascade').hidden().index('idx_assistant_threads_trip'),
    trip_id: p.integer().persist(false).index('idx_assistant_threads_trip'),
    title: p.text(),
    created_at: p.type(DbTimestampType).defaultRaw(`CURRENT_TIMESTAMP`),
    last_message_at: p.type(DbTimestampType).defaultRaw(`CURRENT_TIMESTAMP`),
    assistant_messages_collection: () => p.oneToMany(AssistantMessages).mappedBy('thread').hidden(),
    assistant_tool_calls_collection: () => p.oneToMany(AssistantToolCalls).mappedBy('thread').hidden(),
  },
});
