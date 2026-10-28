import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function open(page: Page, count = 1000) {
  await page.addInitScript(installMock, { count });
  await page.addInitScript(() => {
    const api = window.omicomic;
    const stats = (window as any).__repair = { scans: 0, checks: 0, covers: 0, release: false, batch: 0 };
    const files = Array.from({ length: 180 }, (_, index) => ({ id: '/comics/Known ' + index + '.cbz', path: '/comics/Known ' + index + '.cbz',
      name: 'Known ' + index + '.cbz', type: 'folder' as const, containsImages: true, extension: '', size: 10, modifiedAt: index + 1 }));
    api.listDirectory = async path => ({ ok: true, data: { path, parentPath: null, items: files.slice(0, 10), total: 10 } });
    api.scanLibrary = async () => {
      stats.scans++;
      const batch = stats.batch++;
      if (batch > 0) while (!stats.release) await new Promise(resolve => setTimeout(resolve, 10));
      return { ok: true, data: { items: files.slice(batch * 90, batch * 90 + 90), directories: batch + 1, skipped: 0, scannedAt: Date.now(), complete: batch > 0 } };
    };
    const cover = api.getThumbnail, check = api.checkResourcePath;
    api.getThumbnail = async request => { stats.covers++; return cover(request); };
    api.checkResourcePath = async request => { stats.checks++; return check(request); };
  });
  await page.goto('/'); await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('.resource-card')).toHaveCount(10);
}

test('partial search stays usable, cancellation retains metadata, and redraw never initiates discovery or path checks', async ({ page }) => {
  await open(page);
  const search = page.getByRole('textbox', { name: '搜索当前资源库', exact: true });
  await search.fill('Known'); await expect(page.locator('.resource-card').first()).toContainText('Known');
  await expect(page.locator('.library-opening-status')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__repair.scans)).toBe(2);
  await search.fill('Known 8'); await expect(page.locator('.resource-card').first()).toContainText('Known 8');
  await search.fill(''); await expect(page.locator('.resource-card')).toHaveCount(10);
  await page.evaluate(() => { (window as any).__repair.release = true; });
  await search.fill('Known'); await expect(page.locator('.library-opening-status')).toHaveCount(0);
  const before = await page.evaluate(() => ({ ...(window as any).__repair }));
  await page.getByRole('switch', { name: '随机阅读', exact: true }).click();
  await expect(page.locator('.pagination-bar')).toHaveCount(0);
  const names = await page.locator('.resource-card strong').allTextContents();
  await page.waitForTimeout(150); // Cross the former independent candidate-preparation start.
  await expect(page.locator('.resource-card strong')).toHaveText(names);
  const ready = await page.evaluate(() => ({ ...(window as any).__repair }));
  expect(ready.scans).toBe(before.scans);
  await page.getByRole('button', { name: '重随机', exact: true }).click();
  const after = await page.evaluate(() => ({ ...(window as any).__repair }));
  expect(after.scans).toBe(ready.scans);
  // Ordinary visible-path verification is bounded by the viewport; no full-pool sweep.
  expect(after.checks - ready.checks).toBeLessThan(60);
  await expect(page.getByRole('combobox', { name: '排序方式', exact: true })).toContainText('随机排序');
  await page.getByRole('combobox', { name: '排序方式', exact: true }).click();
  await page.getByRole('option', { name: '名称升序', exact: true }).click();
  await expect(page.getByRole('switch', { name: '随机阅读', exact: true })).toHaveAttribute('aria-checked', 'false');
});

test('logical capacity 50 through 500 keeps the DOM and cover demand within the same viewport budget', async ({ page }) => {
  await page.addInitScript(installMock, { count: 1200 }); await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('.resource-card').first()).toBeVisible();
  const counts = [];
  for (const size of [50, 100, 150, 200, 500]) {
    await page.getByRole('combobox', { name: '每页数量', exact: true }).click();
    await page.getByRole('option', { name: String(size), exact: true }).click();
    counts.push({ size, mounted: await page.locator('.resource-card').count() });
  }
  expect(Math.max(...counts.map(item => item.mounted))).toBeLessThan(100);
  expect(new Set(counts.map(item => item.mounted)).size).toBe(1);
  await test.info().attach('page-capacity', { body: JSON.stringify(counts), contentType: 'application/json' });
});

for (const theme of ['mist', 'nord', 'sand', 'night']) test('menu surfaces and opaque floating controls in ' + theme, async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.addInitScript(installMock, { count: 600 });
  await page.addInitScript(async theme => { const data = await window.omicomic.getAppData(); if (data.ok) data.data.settings.colorTheme = theme as any; }, theme);
  await page.goto('/'); await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('.resource-card').first()).toBeVisible();
  const surfaces: string[][] = [];
  const sample = (element: Element) => { const css = getComputedStyle(element); return [css.backgroundColor, css.backdropFilter, css.borderRadius, css.borderColor]; };
  await page.getByRole('button', { name: '切换资源目录', exact: true }).click();
  surfaces.push(await page.locator('.root-library-options').evaluate(sample));
  await page.getByRole('button', { name: '切换资源目录', exact: true }).click();
  await page.getByRole('combobox', { name: '排序方式', exact: true }).click(); surfaces.push(await page.getByRole('listbox').evaluate(sample));
  await page.keyboard.press('Escape'); await page.locator('.view-options-menu summary').click();
  surfaces.push(await page.locator('.view-options-popover').evaluate(sample));
  expect(surfaces[1]).toEqual(surfaces[0]); expect(surfaces[2]).toEqual(surfaces[0]);
  // Equal surface values alone miss a nested backdrop root: the actual View
  // pixels must sample the cards, rather than stop at the toolbar's bounds.
  expect(await page.locator('.view-options-popover').evaluate(element => {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).backdropFilter !== 'none') return parent.className;
    }
    return null;
  })).toBeNull();
  const float = page.locator('.desktop-library-float'); await expect(float).toBeVisible();
  for (const button of await float.locator('button').all()) await expect(button).toHaveCSS('opacity', '1');
  for (const circle of await float.locator('button > i').all()) expect((await circle.evaluate(sample))[0]).not.toMatch(/rgba\([^)]*,\s*0\./);
  for (const surface of await float.locator('button > span,button > i').all()) {
    await expect(surface).toHaveCSS('border-top-width', '1px');
    await expect(surface).toHaveCSS('border-top-style', 'solid');
  }
  await page.screenshot({ path: 'output/repair-1142/theme-' + theme + '.png' });
});

test('shuffle icon remains balanced at the requested sizes and display scales', async ({ page, browser }) => {
  await open(page); await page.getByRole('switch', { name: '随机阅读', exact: true }).click();
  const svg = await page.locator('.random-redraw-button svg').evaluate(element => element.outerHTML);
  for (const scale of [1, 1.25, 1.5]) {
    const context = await browser.newContext({ viewport: { width: 500, height: 180 }, deviceScaleFactor: scale });
    const preview = await context.newPage();
    await preview.setContent('<body style="margin:0;background:#f7f9fc;color:#46596b;font:14px sans-serif;display:flex;align-items:center;justify-content:space-around;height:180px">'
      + [20,24,32,44].map(size => '<div style="text-align:center"><div style="height:60px;display:grid;place-items:center">'+svg.replace('<svg ', '<svg style="width:'+size+'px;height:'+size+'px" ')+'</div><p>'+size+' px</p></div>').join('')+'</body>');
    await preview.screenshot({ path: 'output/repair-1142/shuffle-' + scale + '.png' });
    await context.close();
  }
});
