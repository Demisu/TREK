import type { CollectionTourItem } from '@trek/shared';
import { create } from 'zustand';
import { addListener, removeListener } from '../api/websocket';
import { collectionToursRepo } from '../repo/collectionToursRepo';
import { OnlineOnlyError } from '../repo/onlineOnly';
import type { WebSocketEvent } from '../types';

/** How far the open collection's tours are: asked for, there, or not to be had right now. */
type CollectionTourStatus = 'idle' | 'loading' | 'ready' | 'error' | 'offline';

interface CollectionTourState {
  /** The collection the tours are read for. */
  collectionId: number | null;
  tours: CollectionTourItem[];
  status: CollectionTourStatus;
  load: (collectionId: number) => Promise<void>;
  /** Removes one kept tour; a refusal puts it back and throws. */
  remove: (collectionId: number, tourId: number) => Promise<void>;
  clear: () => void;
}

/**
 * LIB-03: the whole tours kept in the collection that is open. Read when it
 * opens, again when another member keeps or removes one (watchCollectionTours),
 * and never shown under another collection, not even while that one loads.
 */
export const useCollectionTourStore = create<CollectionTourState>((set, get) => ({
  collectionId: null,
  tours: [],
  status: 'idle',
  load: async (collectionId) => {
    // Another collection's tours never show under this one.
    if (get().collectionId !== collectionId) set({ collectionId, tours: [], status: 'loading' });
    try {
      const { tours } = await collectionToursRepo.list(collectionId);
      if (get().collectionId === collectionId) set({ tours, status: 'ready' });
    } catch (err: unknown) {
      if (get().collectionId === collectionId) set({ status: err instanceof OnlineOnlyError ? 'offline' : 'error' });
    }
  },
  remove: async (collectionId, tourId) => {
    const before = get().tours;
    if (get().collectionId === collectionId) set({ tours: before.filter((tour) => tour.id !== tourId) });
    try {
      await collectionToursRepo.remove(collectionId, tourId);
    } catch (err) {
      if (get().collectionId === collectionId) set({ tours: before });
      throw err;
    }
  },
  clear: () => set({ collectionId: null, tours: [], status: 'idle' }),
}));

/**
 * Keeps the open collection's tours current while its members work on it: a
 * `collections:updated` for that collection reads them again. Returns the
 * function that stops listening.
 */
export function watchCollectionTours(): () => void {
  const onEvent = (event: WebSocketEvent) => {
    const { collectionId } = useCollectionTourStore.getState();
    if (event?.type !== 'collections:updated' || collectionId === null || event.collectionId !== collectionId) return;
    void useCollectionTourStore.getState().load(collectionId);
  };
  addListener(onEvent);
  return () => removeListener(onEvent);
}
