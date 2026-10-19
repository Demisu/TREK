/**
 * Handing a file to the system's share sheet (the Web Share API), where the
 * platform takes files of that kind. Chrome takes only an allow-list of file
 * types, Safari and the phones most, so whether a share is offered is asked
 * per file name and type, never assumed from `navigator.share` alone.
 */

/** Whether this browser would hand a file of this name and type to the share sheet. */
export function canShareFile(name: string, type: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
  if (typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([''], name, { type })] });
  } catch {
    // A browser that cannot even build the question cannot share the file either.
    return false;
  }
}

/**
 * How a share ended: `cancelled` when the sheet was closed without a target,
 * `needs-gesture` when the browser refused because the tap that asked lies too
 * far back (Safari, after the file had to be fetched first), `failed` otherwise.
 */
export type FileShareOutcome = 'shared' | 'cancelled' | 'needs-gesture' | 'failed';

/** Opens the share sheet with the file; call it straight from the tap that asks for it. */
export async function shareFile(file: File, title: string): Promise<FileShareOutcome> {
  try {
    await navigator.share({ files: [file], title });
    return 'shared';
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    if (error instanceof DOMException && error.name === 'NotAllowedError') return 'needs-gesture';
    return 'failed';
  }
}
