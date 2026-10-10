import { test, expect, type Page, type Locator } from '@playwright/test';
import { installMock } from './mock';
import { setCardScale } from './card-scale-helpers';

test.use({ screenshot: 'only-on-failure' });

async function openLibrary(page: Page) {
  page.setDefaultTimeout(10000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 70 });
  await page.addInitScript(async () => {
    const api = (window as any).omicomic;
    const data = (await api.getAppData()).data;
    data.settings = { ...data.settings, cardScale: 100, detailThumbnailScale: 100,
      ...JSON.parse(localStorage.getItem('test-card-scale') || '{}') };
    (window as any).__scaleData = data;
    (window as any).__scaleSaves = [];
    const records = Array.from({ length: 24 }, (_, index) => ({
      resourceKey: `folder:/comics/Book ${index + 1}`, sourcePath: `/comics/Book ${index + 1}`,
      sourceType: 'folder', title: `Book ${index + 1}`, currentPageIndex: index, totalPages: 70,
      updatedAt: index + 1, addedAt: index + 1, sortIndex: index,
    }));
    data.recentOpened = records;
    data.temporaryOpened = records.map(item => ({ ...item, resourceKey: item.resourceKey.replace('/comics/', '/outside/'), sourcePath: item.sourcePath.replace('/comics/', '/outside/') }));
    data.favorites = records;
    data.bookmarks = records.map((item, index) => ({ ...item, id: `bookmark-${index}`, pageIndex: index, createdAt: index + 1 }));
    data.bookshelves = [{ id: 'shelf', name: '测试分类', createdAt: 1, updatedAt: 1, sortIndex: 0 }];
    data.virtualFolders = Array.from({ length: 12 }, (_, index) => ({
      id: `shelf-${index}`, bookshelfId: 'shelf', name: `书架 ${index + 1}`, note: '', tags: [],
      createdAt: 1, updatedAt: 1, sortIndex: index,
      items: records.map((item, itemIndex) => ({ ...item, id: `item-${index}-${itemIndex}`, folderId: `shelf-${index}` })),
    }));
    api.listDirectory = async (path: string) => ({ ok: true, data: { path, parentPath: null,
      items: records.map(item => ({ id: item.sourcePath, path: item.sourcePath, name: item.title, type: 'folder', extension: '', modifiedAt: 1 })), total: records.length } });
    api.updateSettings = async (settings: any) => {
      data.settings = settings;
      (window as any).__scaleSaves.push(settings);
      localStorage.setItem('test-card-scale', JSON.stringify(settings));
      return { ok: true, data: settings };
    };
    api.getBookmarkPagePreview = async () => ({ ok: true, data: { dataUrl: (await api.getThumbnail()).data.url } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('.resource-card')).toHaveCount(24);
}

async function selectScale(page: Page, value: number) {
  await page.locator('.view-options-menu > summary').click();
  const control = page.getByRole('group', { name: '缩略图大小', exact: true });
  await expect(control.getByRole('button')).toHaveCount(0);
  await setCardScale(control.getByRole('slider'), value);
  await page.locator('.view-options-menu > summary').click();
}

async function expectGridFilled(grid: Locator, columns: number, context: string) {
  const metrics = await grid.evaluate(element => {
    const style = getComputedStyle(element);
    const box = element.getBoundingClientRect();
    const columns = style.gridTemplateColumns.split(' ').length;
    const row = Array.from(element.children).slice(0, columns).map(card => card.getBoundingClientRect());
    return {
      columns, width: row[0].width, overflow: element.scrollWidth - element.clientWidth,
      leftGap: row[0].left - box.left - element.clientLeft - parseFloat(style.paddingLeft),
      rightGap: box.left + element.clientLeft + element.clientWidth - parseFloat(style.paddingRight) - row.at(-1)!.right,
      widthDifference: Math.max(...row.map(card => card.width)) - Math.min(...row.map(card => card.width)),
      lastWidth: element.lastElementChild!.getBoundingClientRect().width,
    };
  });
  expect(metrics.columns, context).toBe(columns);
  expect(metrics.overflow, context).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.leftGap), context).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.rightGap), context).toBeLessThanOrEqual(1);
  expect(metrics.widthDifference, context).toBeLessThanOrEqual(1);
  expect(Math.abs(metrics.lastWidth - metrics.width), `${context}: incomplete final row`).toBeLessThanOrEqual(1);
  return metrics;
}

test('every detent fills the available width across all tabs, details and resized windows', async ({ page }) => {
  test.setTimeout(120000);
  await openLibrary(page);
  const detents = [40, 55, 75, 100, 125, 150, 200];
  const measurements: unknown[] = [];
  for (const view of ['资源库', '收藏', '书签', '临时存放', '最近阅读', '书架', '书架内容']) {
    if (view === '书架内容') await page.locator('.bookshelf-folder-card').first().dblclick();
    else await page.locator('.library-sidebar').getByRole('button', { name: new RegExp(`^${view}`) }).click();
    const isShelf = view === '书架';
    const grid = page.locator(isShelf ? '.bookshelf-folder-grid' : '.resource-list');
    const cards = grid.locator(isShelf ? '.bookshelf-folder-card' : '.resource-card');
    await expect(cards, view).toHaveCount(isShelf ? 12 : 24);
    for (const width of [960, 1280, 1440, 1800, 1920, 2559]) {
      await page.setViewportSize({ width, height: 900 });
      const sizes: number[] = [];
      for (const [index, scale] of detents.entries()) {
        await selectScale(page, scale);
        const metrics = await expectGridFilled(grid, 7 - index, `${view} ${width} ${scale}`);
        sizes.push(metrics.width);
        if (view === '资源库' && width === 1440 && scale === 100) {
          await page.locator('.view-options-menu > summary').click();
          await page.screenshot({ path: 'test-results/resource-scale-default.png' });
          await page.locator('.view-options-menu > summary').click();
        }
      }
      measurements.push({ view, viewport: width, sizes });
      for (let index = 1; index < sizes.length; index++) expect(sizes[index]).toBeGreaterThan(sizes[index - 1]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    if (!isShelf) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await cards.first().getByRole('button', { name: '打开资源信息', exact: true }).click();
      const control = page.getByRole('group', { name: '缩略预览大小' });
      const preview = page.locator('.resource-detail-thumbnail-grid');
      await expect(control.getByRole('slider')).toHaveCount(1);
      await expect(control.getByRole('button')).toHaveCount(0);
      for (const width of [960, 1440, 2559]) {
        await page.setViewportSize({ width, height: 900 });
        for (const [index, scale] of detents.entries()) {
          await setCardScale(control.getByRole('slider'), scale);
          await expectGridFilled(preview, 7 - index, `${view} detail ${width} ${scale}`);
        }
      }
      await page.locator('.resource-detail-back').click();
    }
  }
  await test.info().attach('card-size-measurements', { body: JSON.stringify(measurements), contentType: 'application/json' });
});

test('always-visible detents support dragging, keyboard and Ctrl wheel, with independent saved choices', async ({ page }) => {
  await openLibrary(page);
  const list = page.locator('.resource-list-scroll');
  const grid = page.locator('.resource-list');
  await page.locator('.view-options-menu > summary').click();
  const control = page.getByRole('group', { name: '缩略图大小', exact: true });
  const slider = control.getByRole('slider');
  await expect(control.getByRole('button')).toHaveCount(0);
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 4 张');
  await slider.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 3 张');
  await page.mouse.wheel(0, 120);
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 4 张');
  await page.keyboard.up('Control');
  await expect(control.getByRole('button')).toHaveCount(0);
  await expect(control.locator('.card-scale-track i')).toHaveCount(7);
  await slider.press('ArrowLeft');
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 5 张');
  await slider.press('ArrowRight');
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 4 张');
  const bar = (await slider.boundingBox())!;
  await page.mouse.move(bar.x + 12, bar.y + bar.height / 2);
  await page.mouse.down();
  await page.mouse.move(bar.x + bar.width - 12, bar.y + bar.height / 2, { steps: 7 });
  await page.mouse.up();
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 1 张');
  await setCardScale(slider, 100);
  await page.screenshot({ path: 'test-results/resource-scale-detents.png' });
  await page.locator('.view-options-menu > summary').click();

  await list.hover({ position: { x: 100, y: 150 } });
  await page.mouse.wheel(0, 420);
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect.poll(() => grid.evaluate(element => getComputedStyle(element).getPropertyValue('--card-columns').trim())).toBe('3');
  expect(await list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
  await page.locator('.view-options-menu > summary').click();
  await setCardScale(slider, 100);
  await expect.poll(() => page.evaluate(() => (window as any).__scaleData.settings.cardScale)).toBe(100);
  await page.evaluate(() => { (window as any).__scaleSaves = []; });
  await control.evaluate(element => {
    for (let index = 0; index < 8; index++) element.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -120, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => page.evaluate(() => (window as any).__scaleData.settings.cardScale)).toBe(200);
  expect(await page.evaluate(() => (window as any).__scaleSaves.length)).toBe(1);
  await setCardScale(slider, 40);
  await control.dispatchEvent('wheel', { ctrlKey: true, deltaY: 120 });
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 7 张');
  // 触控板细碎的增量不会一个事件跳一档。
  await control.evaluate(element => {
    for (let index = 0; index < 5; index++) element.dispatchEvent(new WheelEvent('wheel', { ctrlKey: true, deltaY: -4, bubbles: true, cancelable: true }));
  });
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 7 张');
  await control.dispatchEvent('wheel', { ctrlKey: true, deltaY: -20 });
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 6 张');
  await setCardScale(slider, 125);
  await page.locator('.view-options-menu > summary').click();

  await grid.locator('.resource-card').first().getByRole('button', { name: '打开资源信息', exact: true }).click();
  const detail = page.locator('.resource-detail-page');
  const preview = page.locator('.resource-detail-thumbnail-grid');
  const detailControl = page.getByRole('group', { name: '缩略预览大小' });
  const detailSlider = detailControl.getByRole('slider');
  await expect(detailControl.getByRole('button')).toHaveCount(0);
  await expect(detailSlider).toHaveAttribute('aria-valuetext', '每行 4 张');
  await detailControl.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await expect(detailSlider).toHaveAttribute('aria-valuetext', '每行 3 张');
  await detailSlider.hover();
  await page.mouse.wheel(0, 120);
  await page.keyboard.up('Control');
  await expect(detailSlider).toHaveAttribute('aria-valuetext', '每行 4 张');
  await expect(detail).not.toHaveClass(/is-header-collapsed/);
  expect(await preview.evaluate(element => element.scrollTop)).toBe(0);
  await page.locator('.resource-detail-cover').hover();
  await page.mouse.wheel(0, 120);
  await expect(detail).toHaveClass(/is-header-collapsed/);
  await preview.dispatchEvent('wheel', { ctrlKey: true, deltaY: 120 });
  await expect(detailSlider).toHaveAttribute('aria-valuetext', '每行 5 张');
  await expect(detail).toHaveClass(/is-header-collapsed/);
  expect(await preview.evaluate(element => element.scrollTop)).toBe(0);
  await setCardScale(detailSlider, 150);
  await expect.poll(() => page.evaluate(() => (window as any).__scaleData.settings.detailThumbnailScale)).toBe(150);
  expect(await page.evaluate(() => (window as any).__scaleData.settings.cardScale)).toBe(125);
  await page.reload();
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await page.locator('.view-options-menu > summary').click();
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 3 张');
  await page.locator('.view-options-menu > summary').click();
  await grid.locator('.resource-card').first().getByRole('button', { name: '打开资源信息', exact: true }).click();
  await expect(detailSlider).toHaveAttribute('aria-valuetext', '每行 2 张');
  // 回到默认四列仍使用同一个滑条，没有重置入口。
  await detailControl.dispatchEvent('wheel', { ctrlKey: true, deltaY: 120 });
  await setCardScale(detailSlider, 100);
  expect(await preview.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(4);
  await page.setViewportSize({ width: 960, height: 640 });
  await page.screenshot({ path: 'test-results/detail-scale-detents-960.png' });
  await page.locator('.resource-detail-back').click();
  await page.locator('.sidebar-settings-button').click();
  const settingsControl = page.getByRole('group', { name: '卡片尺寸', exact: true });
  const settingsSlider = settingsControl.getByRole('slider');
  await expect(settingsSlider).toHaveAttribute('aria-valuetext', '每行 3 张');
  await settingsSlider.hover();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -120);
  await page.keyboard.up('Control');
  await expect(settingsSlider).toHaveAttribute('aria-valuetext', '每行 2 张');
  await expect(settingsControl.getByRole('button')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/card-scale-settings-960.png' });
});

test('previous custom scales snap to a detent and the first wheel step changes visible density', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('test-card-scale', JSON.stringify({ cardScale: 91, detailThumbnailScale: 131 })));
  await openLibrary(page);
  await page.locator('.view-options-menu > summary').click();
  const slider = page.getByRole('slider', { name: '缩略图大小', exact: true });
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 4 张');
  await slider.dispatchEvent('wheel', { ctrlKey: true, deltaY: -120 });
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 3 张');
  await expectGridFilled(page.locator('.resource-list'), 3, 'legacy list scale after first step');
  await page.locator('.view-options-menu > summary').click();
  await page.locator('.resource-card').first().getByRole('button', { name: '打开资源信息', exact: true }).click();
  const detailSlider = page.getByRole('slider', { name: '缩略预览大小' });
  await expect(detailSlider).toHaveAttribute('aria-valuetext', '每行 3 张');
  await detailSlider.dispatchEvent('wheel', { ctrlKey: true, deltaY: 120 });
  await expect(detailSlider).toHaveAttribute('aria-valuetext', '每行 4 张');
  await expectGridFilled(page.locator('.resource-detail-thumbnail-grid'), 4, 'legacy detail scale after first step');
});

test('directional acceleration and edge feedback respect reduced motion', async ({ page }) => {
  await openLibrary(page);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('.view-options-menu > summary').click();
  const control = page.getByRole('group', { name: '缩略图大小', exact: true });
  const slider = control.getByRole('slider');
  await page.evaluate(() => {
    (window as any).__scaleMotions = [];
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.matches('.card-scale-thumb, .card-scale-rail')) (window as any).__scaleMotions.push({ frames, options, target: this.className });
      return animate.call(this, frames, options);
    };
  });
  await control.dispatchEvent('wheel', { ctrlKey: true, deltaY: -120 });
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 3 张');
  await control.dispatchEvent('wheel', { ctrlKey: true, deltaY: 120 });
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 4 张');
  await setCardScale(slider, 200);
  await control.dispatchEvent('wheel', { ctrlKey: true, deltaY: -120 });
  const motions = await page.evaluate(() => (window as any).__scaleMotions);
  expect(motions.some((motion: any) => /translateX\([47]px\)/.test(motion.frames[1].transform))).toBe(true);
  expect(motions.some((motion: any) => /translateX\(-[47]px\)/.test(motion.frames[1].transform))).toBe(true);
  expect(motions.some((motion: any) => motion.options.duration === 190)).toBe(true);
  expect(motions.at(-1).target).toBe('card-scale-rail');
  const count = motions.length;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await control.dispatchEvent('wheel', { ctrlKey: true, deltaY: 120 });
  await expect(slider).toHaveAttribute('aria-valuetext', '每行 2 张');
  expect(await page.evaluate(() => (window as any).__scaleMotions.length)).toBe(count);
  expect(await control.locator('.card-scale-thumb').evaluate(element => getComputedStyle(element).boxShadow)).toBe('none');
});
