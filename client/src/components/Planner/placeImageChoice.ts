import type { TripFile } from '../../types';

const PICKABLE = /^image\/(jpeg|png|gif|webp)$/;

/** The images among a place's files that can stand as its picture (#1242). */
export function pickableImages(files: readonly TripFile[]): TripFile[] {
  return files.filter((f) => PICKABLE.test(f.mime_type || ''));
}

/**
 * A picture the form will make the place's own once it is saved: a file from
 * the device, or an image already attached to the place. Nothing is sent
 * before the save, so cancelling the form leaves the picture as it was, and a
 * new place can get one too.
 */
export type PendingPlaceImage = { kind: 'upload'; file: File; preview: string } | { kind: 'attached'; file: TripFile };

/** What the picker shows as chosen: the tile that stands for what the save will do. */
export type ChosenImage =
  | { kind: 'current' }
  | { kind: 'none' }
  | { kind: 'url'; url: string }
  | { kind: 'upload' }
  | { kind: 'attached'; fileId: number };

/**
 * The choice the form holds, read as a tile. `imageUrl` is the form's field:
 * undefined keeps the place's picture, null drops it, a URL takes a source's
 * photo. A waiting picture wins over all of them.
 */
export function chosenImage(
  imageUrl: string | null | undefined,
  pending: PendingPlaceImage | null,
  currentUrl: string | null | undefined
): ChosenImage {
  if (pending) return pending.kind === 'upload' ? { kind: 'upload' } : { kind: 'attached', fileId: pending.file.id };
  if (imageUrl === null) return { kind: 'none' };
  if (imageUrl) return imageUrl === currentUrl ? { kind: 'current' } : { kind: 'url', url: imageUrl };
  return currentUrl ? { kind: 'current' } : { kind: 'none' };
}

/** What travels with the save to put a waiting picture in place: the file, or the attached file's id. */
export type PendingImagePayload = File | { fileId: number };

export function pendingImagePayload(pending: PendingPlaceImage | null): PendingImagePayload | undefined {
  if (!pending) return undefined;
  return pending.kind === 'upload' ? pending.file : { fileId: pending.file.id };
}
