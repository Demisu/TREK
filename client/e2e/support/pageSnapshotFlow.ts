import { expect, type Page } from '@playwright/test';

import type { SeededSnapshot } from './pageSnapshotHarness';

/**
 * The page snapshot the Studio sends the assistant, taken in a real browser
 * (journey-studio.md 3.1): the harness module is loaded into the running app
 * through the dev server, draws a seeded spread with the editor's SpreadView
 * and rasterises it with modern-screenshot. The image has to be a non-empty
 * JPEG at the size the Studio promises the server, and the map tile from
 * another server on the sheet must never have been fetched for it.
 */
export async function checkPageSnapshot(page: Page): Promise<void> {
  await page.goto('/dashboard');
  const shot = await page.evaluate(async (harness: string): Promise<SeededSnapshot | null> => {
    const mod = (await import(/* @vite-ignore */ harness)) as {
      snapshotSeededSpread: () => Promise<SeededSnapshot | null>;
    };
    return mod.snapshotSeededSpread();
  }, '/e2e/support/pageSnapshotHarness.ts');

  expect(shot, 'the spread was drawn and came out under the size limit').not.toBeNull();
  if (!shot) return;
  expect(shot.type).toBe('image/jpeg');
  expect(shot.head).toEqual([0xff, 0xd8, 0xff]);
  expect(shot.bytes).toBeGreaterThan(1_000);
  // A double spread at 1280 pixels on its long edge, and the file says so too.
  expect(shot.width).toBe(1280);
  expect(shot.height).toBe(640);
  expect(shot.decodedWidth).toBe(1280);
  expect(shot.decodedHeight).toBe(640);
  expect(shot.drawnPhotoIds).toEqual([]);
  expect(shot.tileRequested, 'the tile from another server is left out before anything is fetched').toBe(false);
}
