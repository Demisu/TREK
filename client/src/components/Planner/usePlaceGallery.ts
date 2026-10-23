import type { PlacePhotoCandidate } from '@trek/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mapsApi } from '../../api/client';
import { translateApiError, useTranslation } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import type { Place } from '../../types';
import { useToast } from '../shared/Toast';
import { readCachedEnrichment, storeEnrichment, type PlaceDetailsSelection } from './placeEnrichment';
import { photoCaption } from './placePhotoCredit';

/** What the lightbox renders; mirrors Journey/PhotoLightbox's private photo shape. */
export interface GalleryPhoto {
  id: string;
  src: string;
  caption: string | null;
  /** The photo's source page, which the credit links to. */
  captionHref: string | null;
}

interface UsePlaceGallery {
  photos: GalleryPhoto[];
  open: () => void;
  close: () => void;
  isOpen: boolean;
  /** Loading enrichment; the trigger can show a spinner while it waits. */
  loading: boolean;
  /** False when there is no picture and nobody who could supply one. */
  canOpen: boolean;
}

/**
 * The pictures of one place, for the full-screen view-mode gallery.
 *
 * The custom image (if any) leads, then the provider candidates the editor's
 * details column already uses. Enrichment is fetched lazily on open: fanning
 * out to Google/Wikimedia for every place a user merely selects is not worth
 * it, and the shared session cache makes a second open instant.
 */
export function usePlaceGallery(place: Place, language: string): UsePlaceGallery {
  const placesEnrichEnabled = useAuthStore((s) => s.placesEnrichEnabled);
  const { t } = useTranslation();
  const toast = useToast();
  const [candidates, setCandidates] = useState<PlacePhotoCandidate[] | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // The place a request was made for: an answer that comes back after the user
  // moved on to another place is dropped instead of opening over it.
  const requestRef = useRef(0);

  const selection = useMemo<PlaceDetailsSelection | null>(() => {
    if (place.lat == null || place.lng == null) return null;
    const lat = Number(place.lat);
    const lng = Number(place.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return {
      placeId: place.google_place_id || place.amap_poi_id || place.osm_id || undefined,
      lat,
      lng,
      name: place.name || '',
    };
  }, [place.google_place_id, place.amap_poi_id, place.osm_id, place.lat, place.lng, place.name]);

  // A different place owns different pictures: drop the previous answer so the
  // next open never flashes them.
  useEffect(() => {
    requestRef.current += 1;
    setCandidates(null);
    setIsOpen(false);
    setLoading(false);
  }, [place.id]);

  const photos = useMemo<GalleryPhoto[]>(() => {
    const list: GalleryPhoto[] = [];
    if (place.image_url) list.push({ id: 'custom', src: place.image_url, caption: null, captionHref: null });
    for (const candidate of candidates ?? []) {
      if (list.some((p) => p.src === candidate.url)) continue;
      list.push({
        id: candidate.key,
        src: candidate.url,
        caption: photoCaption(candidate),
        captionHref: candidate.sourceUrl ?? null,
      });
    }
    return list;
  }, [place.image_url, candidates]);

  const canOpen = !!place.image_url || (placesEnrichEnabled && !!selection);

  const close = useCallback(() => setIsOpen(false), []);

  const open = useCallback(() => {
    // The custom image is already on screen — open now and let any provider
    // pictures join it as they arrive.
    if (place.image_url) setIsOpen(true);

    if (!placesEnrichEnabled || !selection) {
      if (!place.image_url) toast.info(t('places.details.noPhotos'));
      return;
    }
    if (candidates !== null) {
      if (place.image_url || candidates.length) setIsOpen(true);
      else toast.info(t('places.details.noPhotos'));
      return;
    }

    const apply = (list: PlacePhotoCandidate[]) => {
      setCandidates(list);
      if (place.image_url || list.length) setIsOpen(true);
      else toast.info(t('places.details.noPhotos'));
    };

    const cached = readCachedEnrichment(selection, language);
    if (cached) {
      apply(cached.photos);
      return;
    }

    const request = ++requestRef.current;
    const current = () => request === requestRef.current;
    setLoading(true);
    mapsApi
      .placeEnrichment({ ...selection, lang: language })
      .then((result) => {
        storeEnrichment(selection, language, result);
        if (current()) apply(result.photos);
      })
      .catch((err: unknown) => {
        if (current() && !place.image_url) toast.error(translateApiError(t, err, 'places.details.error'));
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
  }, [place.image_url, placesEnrichEnabled, selection, candidates, language, t, toast]);

  return { photos, open, close, isOpen, loading, canOpen };
}
