import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function fixture(page: Page) {
  await page.addInitScript(installMock, { count: 2 });
  await page.addInitScript(() => {
    const api = window.omicomic, get = api.getAppData, pages = api.getResourcePages;
    const recent = [4, 1, 3, 2].map(n => ({ resourceKey: `folder:/series/Vol ${n}`, sourcePath: `/series/Vol ${n}`, sourceType: 'folder', title: `Vol ${n}`, currentPageIndex: 1, totalPages: 2, updatedAt: Date.now() - n }));
    api.getAppData = async () => { const result = await get(); if (result.ok) { result.data.recentOpened = recent as any; result.data.settings.readerDefaultFitMode = 'fit-window'; } return result; };
    api.getRecentOpened = async () => ({ ok: true, data: recent as any });
    api.getReadingProgress = async () => ({ ok: true, data: null });
    api.getResourcePages = async input => {
      const result = await pages(input);
      if (result.ok) Object.assign(result.data, { resourceKey: `folder:${input.path}`, key: `folder:${input.path}`, title: input.path.split('/').pop(), sourcePath: input.path });
      return result;
    };
    const list = api.listDirectory;
    api.listDirectory = async (path, options) => path === '/series' ? { ok: true, data: { path, parentPath: '/', total: 5, items: [5, 4, 2, 3, 1].map(n => ({ id: `/series/Vol ${n}`, path: `/series/Vol ${n}`, name: `Vol ${n}`, type: 'folder', extension: '', containsImages: true })) } } : list(path, options);
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
}

for (const mobile of [false, true]) test.describe(mobile ? 'mobile original directory' : 'desktop original directory', () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 960 } });
  for (const volume of (mobile ? [1, 2, 3, 4] : [1, 2, 3])) test(`home card Vol ${volume} continues in its source directory`, async ({ page }) => {
    await fixture(page);
    const card = page.locator('.omi-home__book').filter({ has: page.locator('.omi-home__book-title', { hasText: new RegExp(`^Vol ${volume}$`) }) });
    if (mobile) await card.click(); else await card.dblclick();
    await expect(page.locator('.reader-stage')).toBeVisible();
    await page.keyboard.press('End');
    const next = page.getByRole('button', { name: `下一本：Vol ${volume + 1}`, exact: true });
    await expect(async () => { await page.keyboard.press('ArrowRight'); await expect(next).toBeVisible(); }).toPass({ timeout: 7000 });
    await next.click();
    await expect(page.locator(mobile ? '.mobile-reader-title' : '#reader-title')).toContainText(`Vol ${volume + 1}`);
  });
  test('recent reading continues to an unread sibling outside the four history entries', async ({ page }) => {
    await fixture(page);
    await page.getByRole('button', { name: '打开资源库', exact: true }).click();
    await page.locator('.sidebar-primary-nav').getByRole('button', { name: /最近阅读/ }).click();
    const card = page.locator('.resource-card[data-selection-key="folder:/series/Vol 4"]');
    if (mobile) await card.click(); else await card.dblclick();
    await expect(page.locator('.reader-stage')).toBeVisible();
    await page.keyboard.press('End');
    const next = page.getByRole('button', { name: '下一本：Vol 5', exact: true });
    await expect(async () => { await page.keyboard.press('ArrowRight'); await expect(next).toBeVisible(); }).toPass({ timeout: 7000 });
    await next.click();
    await expect(page.locator(mobile ? '.mobile-reader-title' : '#reader-title')).toContainText('Vol 5');
  });
});
