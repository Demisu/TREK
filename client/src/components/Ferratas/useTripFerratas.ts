import { useEffect, useState } from 'react';

import type { Ferrata, FerrataBbox, FerratasResponse } from '@trek/shared';

import { useNetworkMode } from '../../hooks/useNetworkMode';
import { ferrataRepo } from '../../repo/ferrataRepo';
import { ferrataBboxFits, ferrataBboxParam, roundFerrataBbox } from './ferrataModel';

/**
 * Where the layer stands. `tooLarge` and `offline` are answers to "why are
 * there no lines" that need no request at all: the server refuses a box wider
 * than its limit, and an offline device should not fire one.
 */
export type FerrataStatus = 'idle' | 'loading' | 'ready' | 'error' | 'tooLarge' | 'offline';

/** Long enough that a pan or a zoom gesture settles before the request goes out. */
const DEBOUNCE_MS = 400;

/**
 * How long the layer waits before asking again for the same area after the
 * mirrors failed it. Past the last step it stays on the error until the map
 * moves or the layer is switched off and on.
 */
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000];

const NO_FERRATAS: Ferrata[] = [];

/**
 * What came back: the answer, a 400 (`refused`: the server would not take the
 * box, which reads as "zoom in" rather than as an outage) or anything else
 * (`unavailable`: the Overpass mirrors, worth another try).
 */
type Outcome = FerratasResponse | 'refused' | 'unavailable';

interface Answer {
  key: string;
  outcome: Outcome;
}

function failureOf(error: unknown): 'refused' | 'unavailable' {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return status === 400 ? 'refused' : 'unavailable';
}

/** `current` is the outcome for the area on screen, or null while that one is still on its way. */
function statusOf(active: boolean, offline: boolean, fits: boolean, current: Outcome | null): FerrataStatus {
  if (!active) return 'idle';
  if (offline) return 'offline';
  if (!fits || current === 'refused') return 'tooLarge';
  if (!current) return 'loading';
  return current === 'unavailable' ? 'error' : 'ready';
}

/** The area on screen as the request grid sees it, and the request it makes (null: none). */
function requestOf(tripId: number | null | undefined, bbox: FerrataBbox | null, enabled: boolean, offline: boolean) {
  const area = bbox ? roundFerrataBbox(bbox) : null;
  const fits = !!area && ferrataBboxFits(area);
  const active = enabled && !!tripId && !!area;
  const param = active && fits && !offline && area ? ferrataBboxParam(area) : null;
  return { fits, active, param, key: param ? `${tripId}:${param}` : null };
}

/** The answer that speaks for this attempt; while a retry is in flight, the failure it follows keeps the error up. */
function answerFor(answer: Answer | null, key: string | null, attempt: number): Answer | null {
  if (!answer || !key) return null;
  if (answer.key === `${key}#${attempt}`) return answer;
  return attempt > 0 && answer.key === `${key}#${attempt - 1}` ? answer : null;
}

function view(answer: Answer | null, status: FerrataStatus) {
  // The last good answer stays up while the next area loads; any other state draws nothing.
  const last = answer && typeof answer.outcome === 'object' ? answer.outcome : null;
  const shown = status === 'ready' || status === 'loading' ? last : null;
  return {
    ferratas: shown?.ferratas ?? NO_FERRATAS,
    status,
    truncated: shown?.truncated ?? false,
    attribution: shown?.attribution ?? null,
  };
}

/**
 * The via ferratas inside the visible map area of a trip, for the map layer.
 *
 * Online only (see repo/ferrataRepo.ts). Nothing is requested while the layer is
 * off. A new area waits DEBOUNCE_MS before it is asked for, and a newer area,
 * a closed layer or an unmount aborts the request in flight, so a fast pan
 * across the Alps ends in one request for where the map stopped. While the
 * next area loads, the lines of the last one stay drawn instead of blinking out.
 * When the mirrors fail an area, it is asked for again after each of
 * RETRY_DELAYS_MS; a 400 is not retried, it reads as "zoom in".
 */
export function useTripFerratas(tripId: number | null | undefined, bbox: FerrataBbox | null, enabled: boolean) {
  const { offline } = useNetworkMode();
  const { fits, active, param, key } = requestOf(tripId, bbox, enabled, offline);
  const [answer, setAnswer] = useState<Answer | null>(null);
  // Retries count per area: a new area starts again at zero without a reset.
  const [retry, setRetry] = useState<{ key: string | null; attempt: number }>({ key: null, attempt: 0 });
  const attempt = retry.key === key ? retry.attempt : 0;
  const requestKey = key ? `${key}#${attempt}` : null;

  useEffect(() => {
    if (!tripId || !param || !requestKey) return;
    const areaKey = `${tripId}:${param}`;
    const controller = new AbortController();
    let retryTimer: number | undefined;
    const timer = window.setTimeout(() => {
      ferrataRepo.list(tripId, param, controller.signal).then(
        (reply) => {
          if (!controller.signal.aborted) setAnswer({ key: requestKey, outcome: reply });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          // The pill reports it ("Overpass unreachable" or "zoom in"); the error
          // itself carries nothing more the user could act on.
          const failure = failureOf(error);
          setAnswer({ key: requestKey, outcome: failure });
          const delay = RETRY_DELAYS_MS[attempt];
          if (failure === 'unavailable' && delay !== undefined) {
            retryTimer = window.setTimeout(() => setRetry({ key: areaKey, attempt: attempt + 1 }), delay);
          }
        }
      );
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(retryTimer);
      controller.abort();
    };
  }, [tripId, param, requestKey, attempt]);

  const status = statusOf(active, offline, fits, answerFor(answer, key, attempt)?.outcome ?? null);
  return view(answer, status);
}
