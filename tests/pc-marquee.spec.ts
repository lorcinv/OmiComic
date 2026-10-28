import { test, expect } from '@playwright/test';
import { installMock } from './mock';

for (const view of ['directory', 'favorites']) test(`PC marquee retains offscreen selections in ${view}`, async ({ page }) => {
  await page.setViewportSize({ width: 1136, height: 900 });
  await page.addInitScript(installMock, { count: 240 });
  await page.addInitScript(async () => {
    const api = window.omicomic, loaded = await api.getAppData();
    if (!loaded.ok) throw new Error('Fixture data missing');
    const files = Array.from({ length: 240 }, (_, index) => ({ id: `/comics/Book${String(index).padStart(3, '0')}.cbz`, path: `/comics/Book${String(index).padStart(3, '0')}.cbz`, name: `Book${String(index).padStart(3, '0')}.cbz`, type: 'archive' as const, extension: 'cbz', size: 10, modifiedAt: index }));
    api.listDirectory = async path => ({ ok: true, data: { path, parentPath: null, items: files, total: files.length } });
    loaded.data.favorites = files.map(item => ({ resourceKey: `archive:${item.path}`, sourcePath: item.path, sourceType: 'archive' as const, title: item.name, tags: [], note: '', addedAt: 1, updatedAt: 1 }));
    api.getFavorites = async () => ({ ok: true, data: loaded.data.favorites });
    loaded.data.settings.cardScale = 60;
  });
  await page.goto('/'); await page.locator('.omi-home__library').click();
  if (view === 'favorites') await page.locator('.sidebar-primary-nav').getByRole('button', { name: /收藏/ }).click();
  const scroller = page.locator('.page-panel.is-visible .resource-list-scroll');
  const cards = scroller.locator('[data-selection-key]');
  await expect(cards.first()).toBeVisible();
  await page.getByRole('button', { name: '选择', exact: true }).click();
  const count = async () => Number((await page.locator('.selection-toolbar > span').textContent())!.match(/\d+/)![0]);
  const first = await cards.first().getAttribute('data-selection-key');
  const start = (await cards.first().boundingBox())!, viewport = (await scroller.boundingBox())!;
  await page.mouse.move(start.x + 8, start.y + 8); await page.mouse.down();
  await page.mouse.move(viewport.x + viewport.width - 180, viewport.y + viewport.height - 15, { steps: 6 });
  const initial = await count(); expect(initial).toBeGreaterThan(0);
  await scroller.evaluate(element => { element.scrollTop = 3200; });
  await expect(scroller.locator(`[data-selection-key="${first}"]`)).toHaveCount(0);
  await page.mouse.move(viewport.x + viewport.width - 181, viewport.y + viewport.height - 16);
  await expect.poll(count).toBeGreaterThan(initial);
  expect(await count()).toBeGreaterThan(await cards.count());
  // Shrinking the same gesture must remove rows outside the rectangle; this is
  // geometric selection, rather than permanently accumulating visited cards.
  await scroller.evaluate(element => { element.scrollTop = 0; });
  await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBe(0);
  await page.mouse.move(viewport.x + viewport.width - 180, start.y + start.height - 8);
  await expect.poll(count).toBeLessThan(initial);
  await page.mouse.up();
  const retained = await count(); expect(retained).toBeGreaterThan(0);
  await scroller.evaluate(element => { element.scrollTop = 3200; });
  await expect(scroller.locator(`[data-selection-key="${first}"]`)).toHaveCount(0);
  expect(await count()).toBe(retained);
  await scroller.evaluate(element => { element.scrollTop = 0; });
  await expect(scroller.locator(`[data-selection-key="${first}"]`)).toHaveClass(/is-selected/);
  expect(await count()).toBe(retained);
  const blank = await scroller.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left + element.clientLeft + 4, right: rect.left + element.clientLeft + element.clientWidth - 4, y: rect.top + 30 };
  });
  await page.mouse.click(blank.left, blank.y); await expect.poll(count).toBe(0);
  await scroller.locator(`[data-selection-key="${first}"]`).click(); await expect.poll(count).toBe(1);
  await page.mouse.click(blank.right, blank.y); await expect.poll(count).toBe(0);
});
