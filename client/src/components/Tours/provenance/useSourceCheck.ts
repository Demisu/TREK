import type { TourListItem, TourSourceCheckResponse } from '@trek/shared';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../../../i18n';
import { wandererErrorCode, wandererRepo } from '../../../repo/wandererRepo';
import { useToast } from '../../shared/Toast';
import { wandererErrorText } from '../wanderer/wandererErrors';

interface SourceCheckOptions {
  tripId: number;
  placeId: number;
  /** The new snapshot a confirmed reimport brought in, for the lists and the map to take it in. */
  onReimported?: (tour: TourListItem) => Promise<void> | void;
}

/**
 * MF-03: asking the source of a wanderer snapshot, on purpose, whether the
 * trail changed since it came in. The check only reads; nothing in the trip
 * changes until the user confirms a reimport, which goes the way every
 * wanderer import goes and comes in as a new snapshot beside this one.
 */
export function useSourceCheck({ tripId, placeId, onReimported }: SourceCheckOptions) {
  const { t } = useTranslation();
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<TourSourceCheckResponse | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [reimporting, setReimporting] = useState(false);

  // Another tour shown in the same dialog starts unchecked.
  useEffect(() => {
    setResult(null);
    setConfirming(false);
  }, [placeId]);

  const check = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      setResult(await wandererRepo.checkSource(tripId, placeId));
    } catch (error: unknown) {
      setResult(null);
      toast.error(wandererErrorText(t, wandererErrorCode(error)));
    } finally {
      setChecking(false);
    }
  }, [checking, placeId, t, toast, tripId]);

  const reimport = useCallback(async () => {
    const payload = result?.reimport;
    if (!payload || reimporting) return;
    setReimporting(true);
    try {
      const { tour } = await wandererRepo.importTrail(tripId, payload);
      setConfirming(false);
      setResult(null);
      await onReimported?.(tour);
      toast.success(t('tours.provenance.reimported'));
    } catch (error: unknown) {
      setConfirming(false);
      toast.error(wandererErrorText(t, wandererErrorCode(error)));
    } finally {
      setReimporting(false);
    }
  }, [onReimported, reimporting, result, t, toast, tripId]);

  return {
    checking,
    result,
    check,
    /** A reimport can be offered: the trail was read and differs, and someone takes the new snapshot in. */
    canReimport: !!result?.reimport && !!onReimported,
    confirming,
    askReimport: useCallback(() => setConfirming(true), []),
    cancelReimport: useCallback(() => setConfirming(false), []),
    reimporting,
    reimport,
  };
}

export type SourceCheck = ReturnType<typeof useSourceCheck>;
