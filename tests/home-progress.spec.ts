import { test, expect } from '@playwright/test';
import { installMock } from './mock';

for (const width of [1440, 960]) {
  test(`home progress remains visible for image, PDF and EPUB covers at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 960 ? 640 : 900 });
    await page.addInitScript(installMock, { count: 208 });
    await page.addInitScript(() => {
      const api = (window as any).omicomic;
      const getAppData = api.getAppData;
      api.getAppData = async () => {
        const result = await getAppData();
        result.data.recentOpened = [
          { sourceType: 'folder', title: '图片漫画', totalPages: 208, currentPageIndex: 0 },
          { sourceType: 'pdf', title: 'PDF 文档', totalPages: 147, currentPageIndex: 86 },
          { sourceType: 'epub', title: 'EPUB 书籍', totalPages: 10, currentPageIndex: 9 },
        ].map((item, index) => ({ ...item, sourcePath: `/comics/${item.title}`, resourceKey: `${item.sourceType}:/comics/${item.title}`, updatedAt: 100 - index }));
        return result;
      };
      api.getThumbnail = async ({ type }: { type: string }) => {
        if (type !== 'folder') return { ok: true, data: { url: null } };
        await new Promise<void>(resolve => { (window as any).__releaseHomeCover = resolve; });
        return { ok: true, data: { url: 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="700"><rect width="200" height="700" fill="#476184"/><rect y="560" width="200" height="140" fill="white"/></svg>') } };
      };
    });
    await page.goto('/');
    const books = page.locator('.omi-home__book');
    const tracks = page.locator('.omi-home__progress-track');
    await expect(books).toHaveCount(3);

    async function checkBars() {
      const measurements = await books.evaluateAll(items => items.map(item => {
        const cover = item.querySelector('.omi-home__cover')!.getBoundingClientRect();
        const track = item.querySelector('.omi-home__progress-track')!;
        const bounds = track.getBoundingClientRect();
        const fill = track.firstElementChild!.getBoundingClientRect();
        const painted = document.elementFromPoint(bounds.left + Math.max(1, fill.width / 2), bounds.top + bounds.height / 2);
        return { width: bounds.width, height: bounds.height, fill: fill.width, gap: bounds.top - cover.bottom, visible: track === painted || track.contains(painted) };
      }));
      for (const item of measurements) {
        expect(item.height).toBeGreaterThanOrEqual(2);
        expect(item.gap).toBeGreaterThanOrEqual(4);
        expect(item.visible).toBe(true);
        expect(item.fill).toBeGreaterThanOrEqual(2);
      }
      expect(measurements[1].fill / measurements[1].width).toBeCloseTo(87 / 147, 2);
      expect(measurements[2].fill).toBeCloseTo(measurements[2].width, 0);
      await expect(tracks).toHaveCount(3);
    }

    await checkBars();
    await page.evaluate(() => (window as any).__releaseHomeCover());
    await expect.poll(() => books.first().locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await checkBars();
    await books.first().hover();
    await expect(books.first().locator('.omi-home__cover-action')).toHaveCSS('opacity', '1');
    await checkBars();
    await page.mouse.move(900, 30);
    await expect(books.first().locator('.omi-home__cover-action')).toHaveCSS('opacity', '0');
    await expect(books.first()).toHaveCSS('transform', 'none');
    await page.screenshot({ path: `test-results/home-progress-${width}.png` });
    await expect(books.nth(0).locator('.omi-home__book-progress')).toContainText('1 / 208 页');
    await expect(books.nth(0).locator('.omi-home__book-progress')).toContainText('<1%');
    await expect(books.nth(1).locator('.omi-home__book-progress')).toContainText('87 / 147 页');
    await expect(books.nth(2).locator('.omi-home__book-progress')).toContainText('10 / 10 章');
    await books.first().locator('img').dispatchEvent('error');
    await expect(books.first().locator('.omi-home__cover-placeholder')).toBeVisible();
    await checkBars();
  });
}
