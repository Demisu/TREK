import { devices, test } from '@playwright/test';

import { checkPageSnapshot } from './support/pageSnapshotFlow';

// The Studio's page image for the assistant, drawn in WebKit. playwright.config.ts
// has no WebKit project; the engine comes from this file-level device, as in
// e2e/urlbar-scroll-1809.spec.ts. Safari is why the rasteriser is
// modern-screenshot: it decodes images in a foreignObject late, and a page
// drawn too early comes out blank.
test.use({ ...devices['Desktop Safari'] });

test('Studio page snapshot: WebKit draws a seeded spread to a JPEG', async ({ page }) => {
  await checkPageSnapshot(page);
});
