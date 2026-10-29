import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
import { expectReaderPixels } from './readerPixels';

async function seed(page: Page, theme = 'mist') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 20 });
  await page.addInitScript(async theme => {
    const api = (window as any).omicomic, data = (await api.getAppData()).data;
    Object.assign(data.settings, { colorTheme: theme, cardScale: 75, desktopInfoFontSize: 14 });
    data.bookshelves = ['A', 'B', 'C'].map((name, i) => ({ id: `cat-${i}`, name: `分类 ${name}`, sortIndex: i }));
    const books = Array.from({ length: 5 }, (_, i) => ({ resourceKey: `folder:/comics/${i}`, sourcePath: `/comics/${i}`, sourceType: 'folder', title: `漫画 ${i + 1}`, sortIndex: i, addedAt: 1, updatedAt: 1, currentPageIndex: i, totalPages: 20, tags: [], note: '' }));
    data.favorites = books;
    data.bookmarks = books.map((book, i) => ({ ...book, id: `mark-${i}`, pageIndex: i, pageName: `page${i}.png` }));
    data.virtualFolders = books.map((book, i) => ({ id: `shelf-${i}`, name: `书架 ${i + 1}`, bookshelfId: 'cat-0', sortIndex: i, createdAt: 1, updatedAt: 1, items: [...books], tags: [], note: '' }));
    data.resourceMeta['folder:/comics/Book'] = { resourceKey: 'folder:/comics/Book', sourcePath: '/comics/Book', sourceType: 'folder', title: 'Book', tags: ['测试标签', '另一标签'], note: '简介文本', updatedAt: 1 };
    api.getFavorites = async () => ({ ok: true, data: data.favorites });
    api.getBookmarks = async () => ({ ok: true, data: data.bookmarks });
    api.getBookmarkPagePreview = async () => ({ ok: true, data: { dataUrl: (await api.getThumbnail()).data.url } });
    const order = (items: any[], keys: string[], field: string) => keys.map((key, i) => ({ ...items.find(item => item[field] === key), sortIndex: i }));
    (window as any).__reorders = [];
    api.reorderVirtualFolders = async (keys: string[]) => { (window as any).__reorders.push(keys); data.virtualFolders = order(data.virtualFolders, keys, 'id'); return { ok: true, data: data.virtualFolders }; };
    api.reorderVirtualFolderItems = async ({ folderId, orderedResourceKeys }: any) => { (window as any).__reorders.push(orderedResourceKeys); const folder = data.virtualFolders.find((item: any) => item.id === folderId); folder.items = order(folder.items, orderedResourceKeys, 'resourceKey'); return { ok: true, data: { ...folder } }; };
    api.reorderFavorites = async (keys: string[]) => { (window as any).__reorders.push(keys); data.favorites = order(data.favorites, keys, 'resourceKey'); return { ok: true, data: data.favorites }; };
    api.reorderBookmarks = async (keys: string[]) => { (window as any).__reorders.push(keys); data.bookmarks = order(data.bookmarks, keys, 'id'); return { ok: true, data: data.bookmarks }; };
    (window as any).__opens = 0;
    const read = api.getResourcePages;
    api.getResourcePages = async (input: any) => { (window as any).__opens++; return read(input); };
  }, theme);
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(3);
}

async function library(page: Page) {
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('.resource-card').first()).toBeVisible();
}
const nav = (page: Page, name: string) => page.locator('.page-panel.is-visible .library-sidebar button').filter({ hasText: name }).first();

test('desktop home requires double click or the revealed resume action and still supports keyboard activation', async ({ page }) => {
  await seed(page);
  await expect(page.locator('.omi-home__footer')).toHaveCount(0);
  const book = page.locator('.omi-home__book').first();
  await book.click({ position: { x: 30, y: 30 } });
  expect(await page.evaluate(() => (window as any).__opens)).toBe(0);
  await expect(page.locator('.reader-layout')).toHaveCount(0);
  await book.dblclick({ position: { x: 30, y: 30 } });
  await expectReaderPixels(page.locator('.reader-image').first());
  expect(await page.evaluate(() => (window as any).__opens)).toBe(1);
  await page.reload();
  await book.hover();
  await book.locator('.omi-home__cover-action').click();
  await expectReaderPixels(page.locator('.reader-image').first());
  expect(await page.evaluate(() => (window as any).__opens)).toBe(1);
  await page.reload();
  await book.focus(); await book.press('Enter');
  await expectReaderPixels(page.locator('.reader-image').first());
});

for (const [scope, name] of [['shelf', '书架'], ['resource', '书架'], ['favorite', '收藏'], ['bookmark', '书签']]) {
  test(`${scope}: middle drag uses the entire target, works both ways and cancels stale destinations`, async ({ page }) => {
    await seed(page); await library(page); await nav(page, name).click();
    if (scope === 'resource') await page.locator('.bookshelf-folder-card').first().dblclick();
    const cards = page.locator(`[data-card-drag-scope="${scope}"]`);
    await expect(cards).toHaveCount(5);
    const keys = () => cards.evaluateAll(elements => elements.map(el => (el as HTMLElement).dataset.cardDragKey));
    const original = await keys();
    async function drag(from: number, to: number, fraction: number, cancel?: 'source' | 'outside') {
      const source = (await cards.nth(from).boundingBox())!, target = (await cards.nth(to).boundingBox())!;
      await page.mouse.move(source.x + source.width / 2, source.y + 30); await page.mouse.down({ button: 'middle' });
      await page.mouse.move(target.x + target.width * fraction, target.y + 30, { steps: 6 });
      await expect(cards.nth(to)).toHaveClass(/is-card-middle-drop-/);
      if (scope === 'shelf' && !cancel) await page.screenshot({ path: 'test-results/pc-1.1.27-drag.png' });
      if (cancel) {
        await page.mouse.move(cancel === 'source' ? source.x + 30 : 100, cancel === 'source' ? source.y + 30 : 70);
        await expect(page.locator('.is-card-middle-drop-before, .is-card-middle-drop-after')).toHaveCount(0);
      }
      await page.mouse.up({ button: 'middle' });
      await expect(page.locator('.middle-drag-floating-card')).toHaveCount(0);
    }
    // Previously the left half of the adjacent next card produced a no-op.
    await drag(0, 1, .2);
    await expect.poll(keys).toEqual([original[1], original[0], ...original.slice(2)]);
    // The right half of the previous card must also move back, not do nothing.
    await drag(1, 0, .8); await expect.poll(keys).toEqual(original);
    await drag(0, 2, .5, 'source'); await expect.poll(keys).toEqual(original);
    await drag(0, 2, .5, 'outside'); await expect.poll(keys).toEqual(original);
    expect(await page.evaluate(() => (window as any).__reorders.length)).toBe(2);
  });
}

test('category focus stays anchored during real carousel motion', async ({ page }) => {
  await seed(page); await library(page); await nav(page, '书架').click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const marker = page.locator('.bookshelf-category-slot-marker');
  await expect(marker).toHaveClass(/is-visible/);
  const start = (await marker.boundingBox())!;
  const samples = await page.evaluate(async () => {
    const marker = document.querySelector('.bookshelf-category-slot-marker')!;
    const tabs = document.querySelectorAll<HTMLButtonElement>('.bookshelf-category-list button');
    tabs[1].click();
    const result = [];
    for (let i = 0; i < 20; i++) {
      await new Promise(requestAnimationFrame);
      result.push({ x: marker.getBoundingClientRect().x, moving: document.querySelector('.bookshelf-category-list')!.getAnimations({ subtree: true }).length });
    }
    return result;
  });
  expect(samples.every(sample => Math.abs(sample.x - start.x) < 1)).toBe(true);
  expect(samples.some(sample => sample.moving > 0)).toBe(true);
  await page.waitForFunction(() => document.querySelector('.bookshelf-category-list')!.getAnimations({ subtree: true }).length === 0);
  await page.screenshot({ path: 'test-results/pc-1.1.27-category.png' });
});

test('dragging from a sorted shelf view uses the visible order and restores manual ordering', async ({ page }) => {
  await seed(page); await library(page); await nav(page, '书架').click();
  await page.getByRole('combobox', { name: '排序方式', exact: true }).click();
  await page.getByRole('option', { name: '名称降序', exact: true }).click();
  const cards = page.locator('[data-card-drag-scope="shelf"]');
  const order = () => cards.evaluateAll(elements => elements.map(el => (el as HTMLElement).dataset.cardDragKey));
  await expect.poll(order).toEqual(['shelf-4', 'shelf-3', 'shelf-2', 'shelf-1', 'shelf-0']);
  const source = (await cards.first().boundingBox())!, target = (await cards.nth(1).boundingBox())!;
  await page.mouse.move(source.x + 30, source.y + 30); await page.mouse.down({ button: 'middle' });
  await page.mouse.move(target.x + 30, target.y + 30); await page.mouse.up({ button: 'middle' });
  await expect.poll(order).toEqual(['shelf-3', 'shelf-4', 'shelf-2', 'shelf-1', 'shelf-0']);
  await expect(page.getByRole('combobox', { name: '排序方式', exact: true })).toContainText('手动顺序');
});

test('largest custom sizes fit the small desktop reader and mobile ignores desktop scaling', async ({ page }) => {
  await seed(page);
  await page.evaluate(async () => { await window.omicomic.updateSettings({ desktopInfoFontSize: 24, desktopGlobalFontSize: 24 }); });
  await page.setViewportSize({ width: 960, height: 640 });
  await library(page);
  await page.locator('.resource-card').filter({ hasText: 'Book' }).dblclick();
  await expectReaderPixels(page.locator('.reader-image').first());
  const info = page.locator('.reader-page-jump input');
  expect(await info.evaluate(el => el.clientHeight - parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(8);
  await page.screenshot({ path: 'test-results/pc-1.1.27-reader-large-text.png' });
  const outside = await page.locator('.reader-footer button, .reader-page-jump input').evaluateAll(elements => elements.some(el => { const r = el.getBoundingClientRect(); return r.right > innerWidth || r.left < 0 || r.bottom > innerHeight; }));
  expect(outside).toBe(false);
  // The scale variable only exists on desktop; phone styles must stay independent.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('html')).toHaveAttribute('data-omi-layout', 'mobile');
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--desktop-font-scale').trim())).toBe('');
});

test('custom typography updates all desktop surfaces and has usable numeric limits', async ({ page }) => {
  await seed(page); await library(page);
  const title = page.locator('.resource-details strong').first();
  const baseline = await title.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await page.locator('.sidebar-settings-button').click(); await page.locator('#settings-category-appearance').click();
  const global = page.getByRole('spinbutton', { name: '全局字号', exact: true });
  const info = page.getByRole('spinbutton', { name: '页码与信息字号', exact: true });
  await expect(global).toHaveValue('14'); await expect(info).toHaveValue('12');
  await global.fill('18'); await global.press('Enter');
  expect(await title.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(baseline * 18 / 14, 2);
  await info.fill('15'); await info.press('Enter');
  expect(await page.locator('.resource-card-info .resource-card-page').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(15 * 18 / 14, 2);
  await page.getByRole('button', { name: '增大全局字号', exact: true }).click(); await expect(global).toHaveValue('19');
  await global.fill('100'); await global.press('Enter'); await expect(global).toHaveValue('24');
  await expect(page.getByRole('button', { name: '增大全局字号', exact: true })).toBeDisabled();
  await global.fill('18'); await global.press('Enter');
  await page.screenshot({ path: 'test-results/pc-1.1.27-typography.png' });
  await page.getByRole('button', { name: '关闭设置', exact: true }).click();
  await page.locator('.resource-card').filter({ hasText: 'Book' }).dblclick();
  await expectReaderPixels(page.locator('.reader-image').first());
  expect(await page.locator('.reader-page-jump input').evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(15 * 18 / 14, 2);
});

test('tag deletion stays muted without selection and becomes rose after selecting a tag', async ({ page }) => {
  await seed(page); await library(page);
  await page.locator('.tag-filter-button').click();
  const drawer = page.locator('.tag-manage-section'), remove = drawer.getByRole('button', { name: /^删除/ });
  await expect(remove).toBeDisabled();
  await expect(page.locator('.tag-manage-section p, .tag-filter-drawer .settings-panel-header p')).toHaveCount(0);
  await drawer.getByRole('button', { name: '选择', exact: true }).click();
  await page.locator('.tag-all-section').getByRole('button', { name: '测试标签', exact: true }).click();
  await expect(remove).toBeEnabled(); await expect(remove).toHaveCSS('background-color', 'rgb(187, 62, 112)');
  await page.screenshot({ path: 'test-results/pc-1.1.27-tags.png' });
  await page.locator('.tag-all-section').getByRole('button', { name: '测试标签', exact: true }).click();
  await expect(remove).toBeDisabled();
});

for (const theme of ['mist', 'nord', 'sand', 'night']) {
  test(`${theme}: flat detail and separated reader controls`, async ({ page }) => {
    await seed(page, theme); await library(page);
    await page.locator('.resource-card').filter({ hasText: 'Book' }).getByRole('button', { name: '打开资源信息' }).click();
    await expect(page.locator('.resource-detail-page')).toHaveCSS('background-image', 'none');
    await expect(page.locator('.resource-detail-lower')).toHaveCSS('box-shadow', 'none');
    for (const button of await page.locator('.resource-detail-footer button').all()) {
      await expect(button).toHaveCSS('box-shadow', 'none'); await expect(button).toHaveCSS('border-top-width', '0px');
    }
    await page.screenshot({ path: `test-results/pc-1.1.27-detail-${theme}.png` });
    await page.locator('.resource-detail-read-button').click(); await expectReaderPixels(page.locator('.reader-image').first());
    // Render colors to the same format before measuring each theme's button/chrome separation.
    const contrast = await page.locator('.reader-footer').evaluate(footer => {
      const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d')!;
      const rgb = (css: string) => { ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const button = footer.querySelector('button:not(:disabled)')!;
      const bg = rgb(getComputedStyle(footer).backgroundColor), control = rgb(getComputedStyle(button).backgroundColor);
      return Math.max(...bg.map((v, i) => Math.abs(v - control[i])));
    });
    expect(contrast).toBeGreaterThanOrEqual(15);
    await page.screenshot({ path: `test-results/pc-1.1.27-reader-${theme}.png` });
  });
}
