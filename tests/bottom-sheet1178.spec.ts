import { test, expect, type Page, type Locator } from '@playwright/test';
import { installMock } from './mock';

async function library(page: Page) {
  await page.addInitScript(installMock, { count: 120 });
  await page.addInitScript(async () => { const result = await window.omicomic.getAppData(); if (result.ok) result.data.settings.showHomePage = false; });
  await page.goto('/'); await expect(page.locator('.resource-card,.mobile-resource-card').first()).toBeVisible();
}
async function details(page: Page) {
  await page.locator('.resource-card,.mobile-resource-card').filter({ has: page.locator('strong', { hasText: /^Book$/ }) }).getByRole('button', { name: '打开资源信息', exact: true }).click();
  await expect(page.locator('.resource-detail-page')).toBeVisible(); await expect(page.locator('html')).not.toHaveAttribute('data-mobile-navigation');
}
async function settled(dialog: Locator) { await expect.poll(() => dialog.evaluate(el => (el as HTMLElement).style.willChange)).not.toBe('transform'); }
async function drag(page: Page, dialog: Locator, distance: number, options: { cancel?: boolean; slow?: boolean; inspect?: () => Promise<void> } = {}) {
  await settled(dialog);
  const grip = dialog.locator('.mobile-sheet-grab-area'), box = (await grip.boundingBox())!, from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let index = 1; index <= 8; index++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x, y: from.y + distance * index / 8 }] });
    await page.waitForTimeout(options.slow ? 65 : 20);
  }
  await options.inspect?.();
  await cdp.send('Input.dispatchTouchEvent', { type: options.cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] }); await cdp.detach();
}

for (const mobile of [false, true]) test.describe(mobile ? 'phone read action' : 'desktop read action', () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  test('start reading stays shadow-free at rest and on hover', async ({ page }) => {
    await library(page); await details(page);
    const button = page.locator('.resource-detail-read-button');
    await expect(button).toBeVisible(); expect(await button.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
    await button.hover(); expect(await button.evaluate(el => getComputedStyle(el).boxShadow)).toBe('none');
    await page.screenshot({ path: `test-results/read-action-${mobile ? 'phone' : 'desktop'}-1178.png` });
  });
});

test.describe('phone bottom-sheet handle', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('detail handle follows the finger, snaps back for a short drag, and dismisses on a full drag', async ({ page }) => {
    await library(page); await details(page); await page.getByRole('button', { name: '详情操作', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '漫画操作', exact: true }); await settled(dialog);
    await expect(dialog.locator('.mobile-sheet-handle')).toBeVisible(); expect(await dialog.getByRole('button', { name: '重命名', exact: true }).evaluate(el => getComputedStyle(el).borderTopWidth)).toBe('0px');
    await drag(page, dialog, 12, { slow: true, inspect: async () => {
      const y = await dialog.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42); expect(y).toBeGreaterThan(10); expect(y).toBeLessThan(15);
      expect(await page.locator('.mobile-screen-dimmer').evaluate(el => Number(getComputedStyle(el).opacity))).toBeLessThan(1);
    } });
    await settled(dialog); expect(await dialog.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)).toBeLessThan(1);
    await page.screenshot({ path: 'test-results/detail-handle-restored1178.png' });
    await drag(page, dialog, 85, { inspect: async () => { await expect(dialog).toBeVisible(); expect(await dialog.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)).toBeGreaterThan(75); } });
    await expect(dialog).toHaveCount(0); await expect(page.locator('.resource-detail-page')).toBeVisible();
  });
  test('display controls keep working and cancellation restores the sheet before a later dismissal', async ({ page }) => {
    await library(page); await page.getByRole('button', { name: '显示选项', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '显示选项', exact: true }); await settled(dialog);
    const slider = dialog.getByRole('slider', { name: '网格列数', exact: true }); await slider.fill('3'); await expect(slider).toHaveValue('3');
    await drag(page, dialog, 160, { cancel: true }); await settled(dialog); expect(await dialog.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42)).toBeLessThan(1);
    await drag(page, dialog, 160); await expect(dialog).toHaveCount(0);
  });
  test('dragging the add-tag handle dismisses an input sheet without restoring its keyboard focus', async ({ page }) => {
    await library(page); await details(page); await page.getByRole('button', { name: '添加标签', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '添加标签', exact: true }), input = dialog.getByRole('textbox', { name: '新标签', exact: true });
    await input.fill('未保存草稿'); await input.focus();
    await input.evaluate(el => { (window as any).__tagFocusRestores = 0; el.addEventListener('focus', () => { (window as any).__tagFocusRestores++; }); });
    await drag(page, dialog, 100); await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__tagFocusRestores)).toBe(0); expect(await page.evaluate(() => document.activeElement?.matches('input,textarea'))).toBe(false);
  });
  test('closing a bottom menu leaves its parent side drawer open', async ({ page }) => {
    await library(page); await page.getByRole('button', { name: '资源库目录', exact: true }).click();
    const side = page.getByRole('dialog', { name: '资源库', exact: true }); await settled(side);
    await side.getByRole('button', { name: '管理资源库 Comics', exact: true }).click();
    const child = page.getByRole('dialog', { name: 'Comics', exact: true }); await settled(child); await drag(page, child, 80);
    await expect(child).toHaveCount(0); await expect(side).toBeVisible(); await expect(side.locator('.mobile-sheet-grab-area')).toHaveCount(0);
  });
  test('the page-jump and reader-settings sheets use the same dismissible handle', async ({ page }) => {
    await library(page); await details(page); await page.getByRole('button', { name: /^跳转页码，当前/ }).first().click();
    const pager = page.getByRole('dialog', { name: '跳转页码', exact: true }); await settled(pager); await drag(page, pager, 110); await expect(pager).toHaveCount(0);
    await page.locator('.resource-detail-read-button').click();
    await expect(page.locator('.reader-layout')).toBeVisible(); await expect(page.locator('html')).not.toHaveAttribute('data-mobile-navigation');
    const settings = page.getByRole('button', { name: '阅读设置', exact: true });
    if (!(await settings.isVisible())) await page.locator('.reader-stage').click({ position: { x: 150, y: 250 } });
    await settings.click(); const reader = page.getByRole('dialog', { name: '阅读设置', exact: true }); await settled(reader); await drag(page, reader, 160); await expect(reader).toHaveCount(0);
  });
});
