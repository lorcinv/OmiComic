import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function openLibrary(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 8 });
  await page.addInitScript(async () => {
    const api = (window as any).omicomic;
    const data = (await api.getAppData()).data;
    data.settings.bookshelfNoteHoverDelayMs = 0;
    data.resourceMeta['folder:/comics/Book'] = {
      resourceKey: 'folder:/comics/Book', sourcePath: '/comics/Book', sourceType: 'folder', title: 'Book',
      note: '这是一条资源备注', tags: ['作画参考'], updatedAt: 1,
    };
    api.addFavorite = async (input: any) => ({ ok: true, data: { ...input, addedAt: 1, updatedAt: 1 } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('.resource-card')).toHaveCount(10);
}

test('nested cover actions own one rounded tooltip within their exact hit area', async ({ page }) => {
  await openLibrary(page);
  const book = page.locator('.resource-card').filter({ has: page.locator('.resource-details strong', { hasText: /^Book$/ }) });
  const info = book.getByRole('button', { name: '打开资源信息', exact: true });
  const favorite = book.getByRole('button', { name: '收藏', exact: true });
  const tooltip = page.getByRole('tooltip');
  await book.locator('.resource-preview img').hover({ position: { x: 20, y: 20 } });
  await expect(tooltip).toHaveText('双击打开文件夹：Book');
  await info.locator('svg').hover();
  await expect(tooltip).toHaveText('资源信息');
  await expect(tooltip).toHaveCount(1);
  await expect(tooltip).toHaveCSS('border-radius', '12px');
  await expect(tooltip).toHaveCSS('box-shadow', 'none');
  await expect(tooltip).toHaveCSS('pointer-events', 'none');
  const trigger = (await info.boundingBox())!;
  const tip = (await tooltip.boundingBox())!;
  expect(tip.x).toBeGreaterThanOrEqual(trigger.x + trigger.width + 7);
  await expect(page.locator('[title]:not([title=""])')).toHaveCount(0);
  // 在按钮内部跨越 svg / circle，不退回父卡片的提示。
  await page.mouse.move(trigger.x + 3, trigger.y + 3);
  await expect(tooltip).toHaveText('资源信息');
  await page.screenshot({ path: 'test-results/tooltip-info-no-overlap.png' });
  // 移出按钮一像素就结束按钮提示，再进入父卡片的延时判定。
  await page.mouse.move(trigger.x - 1, trigger.y + 6);
  await expect(tooltip).toHaveCount(0);
  await expect(tooltip).toHaveText('双击打开文件夹：Book');
  await favorite.hover();
  await expect(tooltip).toHaveText('收藏');
  await book.locator('.preview-tag-row > .preview-tag-chip').hover();
  await expect(tooltip).toHaveText('作画参考');
  await page.mouse.move(225, 140);
  await expect(tooltip).toHaveCount(0);
  // 未满足延迟就离开，不允许残留的定时器弹出旧提示。
  await info.hover();
  await page.mouse.move(225, 140);
  await page.waitForTimeout(400);
  await expect(tooltip).toHaveCount(0);
});

test('dynamic titles, keyboard and disabled regions never restore a native rectangle', async ({ page }) => {
  await openLibrary(page);
  const book = page.locator('.resource-card').filter({ has: page.locator('.resource-details strong', { hasText: /^Book$/ }) });
  const info = book.getByRole('button', { name: '打开资源信息', exact: true });
  const tooltip = page.getByRole('tooltip');
  await info.hover();
  await expect(tooltip).toHaveText('资源信息');
  await info.evaluate(element => { element.setAttribute('title', '更新后的资源信息'); });
  await expect(tooltip).toHaveText('更新后的资源信息');
  await expect(info).toHaveAttribute('title', '');
  await info.evaluate(element => { element.removeAttribute('title'); });
  await expect(tooltip).toHaveCount(0);
  await page.mouse.move(225, 140);
  await info.hover();
  await page.waitForTimeout(350);
  await expect(tooltip).toHaveCount(0); // 无提示的子按钮也不能继承卡片提示。
  await info.evaluate(element => { element.setAttribute('title', '资源信息'); });
  await page.mouse.move(225, 140);
  await page.waitForTimeout(510);
  await info.focus();
  await expect(tooltip).toHaveText('资源信息');
  await page.keyboard.press('Escape');
  await expect(tooltip).toHaveCount(0);
  await info.evaluate(element => { element.setAttribute('data-tooltip-disabled', ''); });
  await info.hover();
  await page.waitForTimeout(350);
  await expect(tooltip).toHaveCount(0);
  await expect(info).toHaveAttribute('title', '');
  await info.evaluate(element => { element.removeAttribute('data-tooltip-disabled'); });
  await page.mouse.move(225, 140);
  await book.getByRole('button', { name: '收藏', exact: true }).hover();
  await expect(tooltip).toHaveText('收藏');
  await book.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(tooltip).toHaveCount(0);
  await page.mouse.move(225, 140);
  await book.getByRole('button', { name: '取消收藏', exact: true }).hover();
  await expect(tooltip).toHaveText('取消收藏');
  await expect(page.locator('[title]:not([title=""])')).toHaveCount(0);
  // 详情换页后旧按钮已卸载，不能留下提示层。
  await info.click();
  await expect(page.locator('.resource-detail-page')).toBeVisible();
  await expect(tooltip).toHaveCount(0);
});

test('long tooltips stay in the viewport, dismiss on wheel and do not overlap Ctrl notes', async ({ page }) => {
  await openLibrary(page);
  await page.setViewportSize({ width: 960, height: 640 });
  await page.evaluate(() => {
    const button = document.createElement('button');
    button.textContent = '边缘提示测试';
    button.title = '一个很长的资源路径：' + '文件夹名称/'.repeat(50);
    button.style.cssText = 'position:fixed;right:4px;bottom:4px;z-index:150';
    document.body.append(button);
  });
  const edge = page.getByRole('button', { name: '边缘提示测试' });
  const tooltip = page.getByRole('tooltip');
  await edge.hover();
  await expect(tooltip).toContainText('一个很长的资源路径');
  const box = (await tooltip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(12);
  expect(box.y).toBeGreaterThanOrEqual(12);
  expect(box.x + box.width).toBeLessThanOrEqual(948);
  expect(box.y + box.height).toBeLessThanOrEqual(628);
  expect(box.x + box.width).toBeLessThanOrEqual((await edge.boundingBox())!.x - 7);
  await page.mouse.wheel(0, 1);
  await expect(tooltip).toHaveCount(0);
  await edge.evaluate(element => element.remove());
  await page.locator('.resource-card').filter({ has: page.locator('.resource-details strong', { hasText: /^Book$/ }) })
    .getByRole('button', { name: '收藏', exact: true }).click();
  await page.locator('.library-sidebar').getByRole('button', { name: /^收藏/ }).click();
  const book = page.locator('.resource-card').filter({ has: page.locator('.resource-details strong', { hasText: /^Book$/ }) });
  await book.locator('.recent-source').hover();
  await expect(tooltip).toHaveText('/comics/Book');
  await page.waitForTimeout(350);
  await expect(tooltip).toHaveCount(1);
  await page.keyboard.down('Control');
  await book.locator('.resource-preview img').hover({ position: { x: 30, y: 30 } });
  await expect(tooltip).toHaveText('这是一条资源备注');
  await expect(tooltip).toHaveCount(1);
  await book.getByRole('button', { name: '打开资源信息', exact: true }).hover();
  await expect(tooltip).toHaveCount(0);
  await page.keyboard.up('Control');
  await page.mouse.move(225, 140);
  await book.getByRole('button', { name: '打开资源信息', exact: true }).hover();
  await expect(tooltip).toHaveText('资源信息');
});
