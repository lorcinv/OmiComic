import { test, expect } from '@playwright/test';
import { installMock } from './mock';
import { expectReaderPixels } from './readerPixels';

for (const viewport of [{ width: 1920, height: 1040 }, { width: 1100, height: 820 }]) test.describe(`panorama at ${viewport.width}`, () => {
  test.use({ viewport, deviceScaleFactor: 1.25 });
  for (const flow of ['horizontal', 'vertical']) test(`slow ${flow} drag keeps a stable physical pixel phase`, async ({ page }) => {
    await page.addInitScript(installMock, { count: 24 });
    await page.addInitScript(() => {
      const api = window.omicomic, data = api.getAppData;
      api.getAppData = async () => { const result = await data(); if (result.ok) {
        Object.assign(result.data.settings, { readerMemoryCacheSizeMb: 4096, readerPreloadPages: 48, readerImageLoadConcurrency: 12 });
        result.data.recentOpened[0].currentPageIndex = 8;
      } return result; };
      const canvas = document.createElement('canvas'); canvas.width = 1062; canvas.height = 1500;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#eee'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#111'; for (let y = 0; y < 1500; y += 13) ctx.fillRect(0, y, 1062, 3);
      const url = canvas.toDataURL();
      api.getPageImage = async () => ({ ok: true, data: { url, width: 1062, height: 1500 } });
    });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto('/');
    await page.getByRole('button', { name: '继续上次阅读', exact: true }).click();
    await expectReaderPixels(page.locator('[data-reader-page-index="8"] img'));
    await page.getByRole('button', { name: '开启全景连环画', exact: true }).click();
    if (flow === 'vertical') await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
    await expect.poll(() => page.locator('.reader-page-spread img').evaluateAll(images => images.filter(img => (img as HTMLImageElement).complete).length)).toBeGreaterThan(5);
    const box = (await page.locator('.reader-stage').boundingBox())!;
    const x = box.x + box.width * .6, y = box.y + box.height * .6;
    await page.mouse.move(x, y); await page.mouse.down();
    const positions: number[] = [];
    for (let n = 0; n < 24; n++) {
      await page.mouse.move(x - (flow === 'horizontal' ? n * 3 : 0), y - (flow === 'vertical' ? n * 3 : 0));
      await page.waitForTimeout(20);
      positions.push(await page.locator('.is-panorama-strip').evaluate((element, flow) => {
        const matrix = new DOMMatrix(getComputedStyle(element).transform);
        return (flow === 'horizontal' ? matrix.m41 : matrix.m42) * devicePixelRatio;
      }, flow));
    }
    await page.mouse.up();
    expect(positions.every(value => Math.abs(value - Math.round(value)) < .002), JSON.stringify(positions)).toBe(true);
  });
});
