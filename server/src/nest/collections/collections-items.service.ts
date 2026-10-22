import { CollectionLabels } from '../../db/entities/CollectionLabels.entity';
import { Collections } from '../../db/entities/Collections.entity';
import { CollectionLabelsRepository } from '../../db/repositories/CollectionLabels.repository';
import { CollectionsRepository } from '../../db/repositories/Collections.repository';
import { DomainError } from '../common/domain-error';
import { CollectionsService } from './collections.service';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable } from '@nestjs/common';
import type { CollectionDetailResponse, CollectionItemsRequest, CollectionItemsResponse } from '@trek/shared';

/** The most lists one lookup opens: 50 places and 20 labels can sit in no more than 70. */
const MAX_LISTS = 70;

/**
 * Saved places and labels by their own ids, wherever they are filed (the
 * get_collection_items tool): what an assistant's card needs to name a place
 * a change touches, and what the model needs to read one place of a long list
 * without the whole list. Every list is read through the collections
 * service's own access check, so an id the caller cannot see is simply left
 * out, the same as one that does not exist.
 */
@Injectable()
export class CollectionsItemsService {
  constructor(
    private readonly collections: CollectionsService,
    @InjectRepository(Collections) private readonly collectionsRepo: CollectionsRepository,
    @InjectRepository(CollectionLabels) private readonly labels: CollectionLabelsRepository,
  ) {}

  async getItems(userId: number, request: CollectionItemsRequest): Promise<CollectionItemsResponse> {
    const placeIds = [...new Set(request.placeIds ?? [])];
    const labelIds = [...new Set(request.labelIds ?? [])];
    const listIds = new Set<number>();
    for (const placeId of placeIds) {
      const listId = await this.collectionsRepo.collectionIdOfPlace(placeId);
      if (listId !== undefined) listIds.add(listId);
    }
    for (const labelId of labelIds) {
      const listId = await this.labels.collectionIdOf(labelId);
      if (listId !== undefined) listIds.add(listId);
    }
    const read: Array<CollectionDetailResponse & { canDelete: boolean }> = [];
    for (const listId of [...listIds].slice(0, MAX_LISTS)) {
      const detail = await this.readable(userId, listId);
      if (!detail) continue;
      // Places leave a list only by its owner or an admin (assertCanDelete); an editor adds.
      const role = await this.collections.roleOf(userId, listId);
      read.push({ ...detail, canDelete: role === 'owner' || role === 'admin' });
    }
    const wantedPlaces = new Set(placeIds);
    const wantedLabels = new Set(labelIds);
    return {
      lists: read.map(({ collection, canDelete }) => ({
        id: collection.id,
        name: collection.name,
        color: collection.color ?? null,
        place_count: collection.place_count,
        is_owner: collection.is_owner,
        can_delete: canDelete,
        labels: collection.labels ?? [],
        members: (collection.members ?? []).map(({ user_id, username, status, role, is_owner }) => ({
          user_id,
          username,
          status,
          role,
          is_owner,
        })),
      })),
      places: read.flatMap(({ places }) => places.filter((place) => wantedPlaces.has(place.id))),
      labels: read.flatMap(({ collection }) => (collection.labels ?? []).filter((label) => wantedLabels.has(label.id))),
    };
  }

  /** One list as its members read it; null for one the user may not see or that is gone. */
  private async readable(userId: number, listId: number): Promise<CollectionDetailResponse | null> {
    try {
      return await this.collections.getCollection(userId, listId);
    } catch (err) {
      if (err instanceof DomainError) return null;
      throw err;
    }
  }
}
