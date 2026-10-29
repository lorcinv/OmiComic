import { expect, type Locator } from '@playwright/test';

export async function expectReaderPixels(image: Locator, timeout?: number) {
  // A minified page keeps its decoded source for layout and shows the filtered
  // surface. Check whichever surface actually presents the pixels.
  await expect(image.locator('xpath=ancestor::figure[1]').locator(':is(.reader-image,.reader-processed-image,.reader-display-raster):visible').first()).toBeVisible({ timeout });
}
