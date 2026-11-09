import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function fixture(page: Page, sortMode: 'name-asc' | 'name-desc' | 'time-desc' = 'name-asc', rtl = false, panorama = false, flow = 'horizontal', double = false, barriers = false) {
  await page.addInitScript(installMock, { count: 2 });
  await page.addInitScript(({ sortMode, rtl, panorama, flow, double, barriers }) => {
    const api = window.omicomic, get = api.getAppData, pages = api.getResourcePages;
    const recent = [4, 1, 3, 2].map(n => ({ resourceKey: `folder:/series/Vol ${n}`, sourcePath: `/series/Vol ${n}`, sourceType: 'folder', title: `Vol ${n}`, currentPageIndex: 1, totalPages: 2, updatedAt: Date.now() - n }));
    api.getAppData = async () => { const result = await get(); if (result.ok) { result.data.recentOpened = recent as any; result.data.settings.readerDefaultFitMode = 'fit-window'; result.data.settings.sortMode = sortMode; Object.assign(result.data.settings, { readerDefaultPanorama: panorama, readerDefaultFlow: flow, readerPageMode: double ? 'double' : 'single', doublePageFirstSingle: false }); result.data.settings.doublePageDirection = rtl ? 'right-to-left' : 'left-to-right'; } return result; };
    api.getRecentOpened = async () => ({ ok: true, data: recent as any });
    api.getReadingProgress = async () => ({ ok: true, data: null });
    api.getResourcePages = async input => {
      if (/Vol [12]\.[56]$/.test(input.path)) throw new Error('An organising folder must not be opened as a comic');
      const result = await pages(input);
      if (result.ok) Object.assign(result.data, { resourceKey: `folder:${input.path}`, key: `folder:${input.path}`, title: input.path.split('/').pop(), sourcePath: input.path });
      return result;
    };
    const list = api.listDirectory;
    api.listDirectory = async (path, options) => path === '/series' ? { ok: true, data: { path, parentPath: '/', total: 5, items: [5, 4, 2, 3, 1].map(n => ({ id: `/series/Vol ${n}`, path: `/series/Vol ${n}`, name: `Vol ${n}`, type: 'folder', extension: '', containsImages: true, modifiedAt: [0, 10, 40, 30, 50, 20][n] })).concat(barriers ? ['Vol 1.5', 'Vol 2.5', 'Vol 2.6'].map(name => ({ id: '/series/'+name, path: '/series/'+name, name, type: 'folder', extension: '' })) as any : []) } } : /^\/series\/Vol \d+$/.test(path) ? { ok: true, data: { path, parentPath: '/series', total: 2, items: [0, 1].map(n => ({ id: path+'/'+n+'.png', path: path+'/'+n+'.png', name: n+'.png', type: 'image', extension: 'png' })) } } : list(path, options);
  }, { sortMode, rtl, panorama, flow, double, barriers });
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
  for (const [mode, nextVolume] of [['name-desc', 2], ['time-desc', 5]] as const) test(`recent entry starts at the current book within ${mode} directory order`, async ({ page }) => {
    await fixture(page, mode);
    await page.getByRole('button', { name: '打开资源库', exact: true }).click();
    await page.locator('.sidebar-primary-nav').getByRole('button', { name: /最近阅读/ }).click();
    const card = page.locator('.resource-card[data-selection-key="folder:/series/Vol 3"]');
    if (mobile) await card.click(); else await card.dblclick();
    await expect(page.locator('.reader-stage')).toBeVisible();
    await page.keyboard.press('End');
    const next = page.getByRole('button', { name: `下一本：Vol ${nextVolume}`, exact: true });
    await expect(async () => { await page.keyboard.press('ArrowRight'); await expect(next).toBeVisible(); }).toPass({ timeout: 7000 });
    await next.click();
    await expect(page.locator(mobile ? '.mobile-reader-title' : '#reader-title')).toContainText(`Vol ${nextVolume}`);
  });

});


test.describe('touch book boundary', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const previous of [false, true]) test(`visible ${previous ? 'previous' : 'next'}-book button works on the first tap while progress previews are open`, async ({ page }) => {
    await fixture(page);
    await page.evaluate(() => document.documentElement.dataset.platform = 'android');
    await page.locator('.omi-home__book').filter({ has: page.locator('.omi-home__book-title', { hasText: /^Vol 2$/ }) }).tap();
    await expect(page.locator('.reader-layout')).toHaveAttribute('aria-busy', 'false');
    await page.locator('.reader-stage').tap();
    const rail = page.locator('.reader-progress-rail');
    await expect(rail).toBeVisible();
    const box = (await rail.boundingBox())!;
    await page.touchscreen.tap(box.x + (previous ? 2 : box.width - 2), box.y + box.height / 2);
    await expect(page.locator('.mobile-reader-previews')).toBeVisible();
    await page.keyboard.press(previous ? 'ArrowLeft' : 'ArrowRight');
    const next = page.getByRole('button', { name: previous ? '上一本：Vol 1' : '下一本：Vol 3', exact: true });
    await expect(next).toBeVisible();
    await next.tap();
    await expect(page.locator('.mobile-reader-title')).toHaveText(previous ? 'Vol 1' : 'Vol 3');
    await expect(page.locator('.mobile-reader-previews')).toHaveCount(0);
  });
  for (const rtl of [false, true]) test(`swiping at the end reveals next book and ordinary page swipes still work (${rtl ? 'RTL' : 'LTR'})`, async ({ page, context }) => {
    await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => document.documentElement.dataset.platform = 'android'); });
    await fixture(page, 'name-asc', rtl);
    await page.locator('.omi-home__book').filter({ has: page.locator('.omi-home__book-title', { hasText: /^Vol 2$/ }) }).click();
    await expect(page.locator('.reader-stage')).toBeVisible();
    const cdp = await context.newCDPSession(page), r = (await page.locator('.reader-stage').boundingBox())!;
    const x = r.x + r.width * (rtl ? .2 : .8), y = r.y + r.height / 2, direction = rtl ? 1 : -1;
    const touch = (type: string, dx = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: x + direction * dx, y, id: 1 }] });
    const next = page.getByRole('button', { name: '下一本：Vol 3', exact: true });
    await touch('touchStart'); await touch('touchMove', 18); await page.waitForTimeout(220); await touch('touchEnd');
    await page.waitForTimeout(400); await expect(next).toHaveCount(0);
    await touch('touchStart'); await touch('touchMove', 150); await touch('touchCancel');
    await page.waitForTimeout(400); await expect(next).toHaveCount(0);
    await touch('touchStart'); await touch('touchMove', 40); await touch('touchMove', 200); await touch('touchEnd');
    await expect(next).toBeVisible(); await next.tap();
    await expect(page.locator('.mobile-reader-title')).toHaveText('Vol 3');
    await expect(page.locator('.reader-stage [data-reader-page-index="0"]').first()).toBeVisible();
    await touch('touchStart'); await touch('touchMove', 40); await touch('touchMove', 200); await touch('touchEnd');
    await expect(page.locator('.reader-stage [data-reader-page-index="1"]').first()).toBeVisible();
  });
});


test.describe('both book boundaries and reading directions', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const mode of ['single', 'double', 'single-vertical', 'double-vertical', 'horizontal', 'rtl', 'vertical', 'vertical-controls']) for (const previous of [false, true])
    test(`${mode}: swipe then one tap ${previous ? 'previous' : 'next'}`, async ({ page, context }) => {
      const panorama = !mode.startsWith('single') && !mode.startsWith('double'), vertical = mode.includes('vertical'), rtl = mode === 'rtl';
      await fixture(page, 'name-asc', rtl, panorama, vertical ? 'vertical' : 'horizontal', mode.startsWith('double'));
      await page.evaluate(() => document.documentElement.dataset.platform = 'android');
      await page.locator('.omi-home__book').filter({ has: page.locator('.omi-home__book-title', { hasText: /^Vol 2$/ }) }).tap();
      await expect(page.locator('.reader-layout')).toHaveAttribute('aria-busy', 'false');
      await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
      await page.keyboard.press(previous ? 'Home' : 'End');
      await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow', previous && !mode.startsWith('double') ? '1' : '2');
      await page.waitForTimeout(100);
      const stage = page.locator('.reader-stage');
      if (panorama) await expect(stage).toHaveClass(/is-panorama/);
      if (mode === 'vertical-controls') { await stage.tap(); await expect(page.locator('.reader-layout')).toHaveClass(/is-mobile-chrome-visible/); }
      const cdp = await context.newCDPSession(page), box = (await stage.boundingBox())!;
      const sign = (previous ? 1 : -1) * (rtl ? -1 : 1);
      const x = box.x + box.width * (panorama && vertical ? .5 : sign > 0 ? .2 : .8), y = box.y + box.height * (!(panorama && vertical) ? .5 : sign > 0 ? .2 : .8);
      const touch = (type: string, distance = 0) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x: x + (panorama && vertical ? 0 : sign * distance), y: y + (panorama && vertical ? sign * distance : 0), id: 1 }] });
      await touch('touchStart'); await touch('touchMove', 30); await touch('touchMove', (panorama && vertical ? box.height : box.width) * .6); await touch('touchEnd');
      const button = page.getByRole('button', { name: previous ? '上一本：Vol 1' : '下一本：Vol 3', exact: true });
      await expect(button).toBeVisible();
      const direction = panorama && vertical ? previous ? 'up' : 'down' : previous !== rtl ? 'left' : 'right';
      await expect(button).toHaveClass(new RegExp(`reader-book-switch-${direction}`));
      const rect = (await button.boundingBox())!;
      if (panorama && vertical) { expect(Math.abs(rect.x + rect.width / 2 - (box.x + box.width / 2))).toBeLessThan(2); if (mode === 'vertical-controls') { const control = (await page.locator(previous ? '.reader-toolbar' : '.reader-footer').boundingBox())!; expect(previous ? rect.y - control.y - control.height : control.y - rect.y - rect.height).toBeGreaterThanOrEqual(7); } else expect(previous ? rect.y - box.y : box.y + box.height - rect.y - rect.height).toBeLessThan(12); }
      await button.tap();
      await expect(page.locator('.mobile-reader-title')).toHaveText(previous ? 'Vol 1' : 'Vol 3');
    });
});


for (const mobile of [false, true]) test.describe(`intervening folders ${mobile ? 'mobile' : 'desktop'}`, () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 960 } });
  test('history neighbours skip organising folders in both directions', async ({ page }) => {
    await fixture(page, 'name-asc', false, false, 'horizontal', false, true);
    const card = page.locator('.omi-home__book').filter({ has: page.locator('.omi-home__book-title', { hasText: /^Vol 2$/ }) });
    if (mobile) await card.tap(); else await card.dblclick();
    await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
    await expect(page.locator('.reader-layout')).toHaveAttribute('aria-busy', 'false');
    await page.keyboard.press('End'); await page.keyboard.press('ArrowRight');
    const next = page.getByRole('button', { name: '下一本：Vol 3', exact: true });
    await expect(next).toBeVisible(); if (mobile) await next.tap(); else await next.click();
    const title = page.locator(mobile ? '.mobile-reader-title' : '#reader-title');
    await expect(title).toContainText('Vol 3');
    await expect(page.locator('.reader-layout')).toHaveAttribute('aria-busy', 'false');
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowLeft');
    const back = page.getByRole('button', { name: '上一本：Vol 2', exact: true });
    await expect(back).toBeVisible(); if (mobile) await back.tap(); else await back.click();
    await expect(title).toContainText('Vol 2');
    await expect(page.locator('.reader-layout')).toHaveAttribute('aria-busy', 'false');
    await page.keyboard.press('Home'); await page.keyboard.press('ArrowLeft');
    const previous = page.getByRole('button', { name: '上一本：Vol 1', exact: true });
    await expect(previous).toBeVisible(); if (mobile) await previous.tap(); else await previous.click();
    await expect(title).toContainText('Vol 1');
  });
});
