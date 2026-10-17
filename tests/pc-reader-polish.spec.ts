import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function seed(page: Page, initial = 0, mode: 'single' | 'double' = 'double', spread = -1) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 10 });
  await page.addInitScript(({ initial, mode, spread }) => {
    const api = (window as any).omicomic, getData = api.getAppData;
    const saved: Record<string, any> = {};
    api.getAppData = async () => {
      const result = await getData();
      result.data.settings.readerPageMode = mode;
      result.data.settings.doublePageFirstSingle = true; // Existing profiles still open as a pair.
      result.data.readingProgress = saved;
      return result;
    };
    api.getReadingProgress = async (key: string) => ({ ok: true, data: saved[key] ?? { currentPageIndex: initial } });
    api.saveReadingProgress = async (input: any) => {
      const result = { ...input, readerViewState: input.readerViewState ?? saved[input.resourceKey]?.readerViewState };
      saved[input.resourceKey] = result; (window as any).__saved.push(result); return { ok: true, data: result };
    };
    api.listDirectory = async (path: string) => ({ ok: true, data: { path, parentPath: null, total: 3, items: ['A-before', 'Book', 'Z-after'].map(name => ({ id: `/comics/${name}`, path: `/comics/${name}`, name, type: 'folder', extension: '' })) } });
    const getPages = api.getResourcePages;
    (window as any).__bookOpenCalls = [];
    api.getResourcePages = async (input: any) => {
      (window as any).__bookOpenCalls.push(input.path);
      const result = await getPages(input);
      if (result.ok) result.data.title = input.path.split('/').pop();
      return result;
    };
    const pictures = [false, true].map(wide => {
      const canvas = document.createElement('canvas'); canvas.width = wide ? 1600 : 600; canvas.height = 900;
      const ctx = canvas.getContext('2d')!; ctx.fillStyle = wide ? '#b7d9c4' : '#b6c7dc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      return { url: canvas.toDataURL(), width: canvas.width, height: canvas.height };
    });
    api.getPageImage = async (input: any) => ({ ok: true, data: pictures[Number(Number(/page(\d+)/.exec(input.sourcePath)?.[1]) === spread)] });
  }, { initial, mode, spread });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await page.locator('.resource-card').filter({ hasText: 'Book' }).dblclick();
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toBeEnabled();
}

async function pair(page: Page, expected: number[]) {
  await expect.poll(() => page.locator('.reader-page-spread > figure').evaluateAll(figures => figures.map(f => Number((f as HTMLElement).dataset.readerPageIndex) + 1))).toEqual(expected);
  await expect(page.locator('.reader-page-spread img').first()).toBeVisible();
}

test('double pages include the cover and report the last visible pair as complete inside and outside the reader', async ({ page }) => {
  await seed(page);
  await pair(page, [1, 2]);
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('1');
  await page.keyboard.press('ArrowRight'); await pair(page, [3, 4]);
  await page.keyboard.press('End'); await pair(page, [9, 10]);
  await expect(page.getByRole('textbox', { name: '跳转到页码' })).toHaveValue('10');
  await expect(page.getByRole('slider', { name: '阅读进度' })).toHaveAttribute('aria-valuenow', '10');
  await expect.poll(() => page.evaluate(() => (window as any).__saved.some((p: any) => p.currentPageIndex === 9 && p.percent === 100 && p.completed && p.readerViewState.pairingAnchor === 0))).toBe(true);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  const book = page.locator('.resource-card').filter({ hasText: 'Book' });
  await expect(book).toHaveClass(/progress-completed/);
  await expect(book.locator('.resource-card-page')).toHaveText('10/10 · 100%');
  await book.dblclick(); await pair(page, [9, 10]);
});

test('switching at page 6 keeps 6+7 then 8+9, with reversible pairing and persisted entry anchor', async ({ page }) => {
  await seed(page, 5, 'single'); await pair(page, [6]);
  await page.getByRole('button', { name: '当前单页，点击切换双页', exact: true }).click(); await pair(page, [6, 7]);
  await page.keyboard.press('ArrowRight'); await pair(page, [8, 9]);
  await page.keyboard.press('ArrowLeft'); await pair(page, [6, 7]);
  await page.keyboard.press('ArrowLeft'); await pair(page, [4, 5]);
  await page.keyboard.press('ArrowRight'); await pair(page, [6, 7]);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.locator('.resource-card').filter({ hasText: 'Book' }).dblclick(); await pair(page, [6, 7]);
});

test('a wide next page stays separate and subsequent portrait pages pair immediately', async ({ page }) => {
  await seed(page, 0, 'double', 1); await pair(page, [1]);
  await page.keyboard.press('ArrowRight'); await pair(page, [2]);
  await page.keyboard.press('ArrowRight'); await pair(page, [3, 4]);
  await page.keyboard.press('ArrowLeft'); await pair(page, [2]);
});

test('triangle book navigation only appears after a boundary turn and follows reading direction', async ({ page }) => {
  await seed(page); await pair(page, [1, 2]);
  await expect(page.locator('.reader-book-switch')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: '上一本：A-before' })).toHaveClass(/reader-book-switch-left/);
  await expect(page.locator('.reader-book-switch svg path')).toHaveAttribute('d', /Z$/);
  const switchButton = page.locator('.reader-book-switch');
  await expect(switchButton).toHaveCSS('border-radius', '8px');
  await expect(switchButton).not.toHaveCSS('backdrop-filter', 'none');
  await expect(switchButton.locator('svg')).toHaveCSS('width', '16px');
  const buttonBox = (await switchButton.boundingBox())!, iconBox = (await switchButton.locator('svg').boundingBox())!;
  expect(Math.abs(buttonBox.x + buttonBox.width / 2 - iconBox.x - iconBox.width / 2)).toBeLessThan(1);
  expect(Math.abs(buttonBox.y + buttonBox.height / 2 - iconBox.y - iconBox.height / 2)).toBeLessThan(1);
  await page.keyboard.press('ArrowRight'); await pair(page, [3, 4]);
  await expect(page.locator('.reader-book-switch')).toHaveCount(0);
  await page.keyboard.press('End'); await pair(page, [9, 10]);
  await expect(page.locator('.reader-book-switch')).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('button', { name: '下一本：Z-after' })).toHaveClass(/reader-book-switch-right/);
  await page.locator('.reader-direction-toggle').click();
  await expect(page.locator('.reader-book-switch')).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('button', { name: '下一本：Z-after' })).toHaveClass(/reader-book-switch-left/);
  await page.screenshot({ path: 'test-results/pc-triangle-next-book.png' });
  await page.getByRole('button', { name: '下一本：Z-after' }).click();
  await pair(page, [1, 2]);
});

test('up and down switch adjacent books in either reading flow without stealing form input or skipping on key repeat', async ({ page }) => {
  await seed(page, 4, 'single');
  await pair(page, [5]);
  const title = page.locator('.reader-filename-strip');
  const input = page.getByRole('textbox', { name: '跳转到页码' });
  const count = () => page.evaluate(() => (window as any).__bookOpenCalls.length);
  const initial = await count();
  await input.focus(); await input.press('ArrowDown');
  expect(await count()).toBe(initial);
  await input.blur();
  const zoom = page.getByRole('combobox', { name: '缩放方式' });
  await zoom.click(); await page.keyboard.press('ArrowDown');
  expect(await count()).toBe(initial);
  await page.keyboard.press('Escape'); await zoom.blur();
  await page.keyboard.down('ArrowUp');
  await expect(title).toContainText('A-before /');
  await page.keyboard.down('ArrowUp'); // Held key must not issue another open.
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('ArrowUp'); // No book before the first.
  expect(await count()).toBe(initial + 1);
  await page.keyboard.press('ArrowDown'); await expect(title).toContainText('Book /');
  await pair(page, [5]);
  await page.getByRole('button', { name: '当前横向阅读，点击切换纵向阅读', exact: true }).click();
  await page.keyboard.down('ArrowDown'); await expect(title).toContainText('Z-after /');
  await page.keyboard.down('ArrowDown'); await page.keyboard.up('ArrowDown');
  await page.keyboard.press('ArrowDown'); // No book after the last.
  expect(await count()).toBe(initial + 3);
  await page.keyboard.press('ArrowUp'); await expect(title).toContainText('Book /');
  await pair(page, [5]);
});

test('view options dismiss outside, retain nested selectors, and refresh follows selection in the top bar', async ({ page }) => {
  await page.addInitScript(installMock, { count: 8 });
  await page.goto('/'); await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  const menu = page.locator('.view-options-menu'), summary = menu.locator('summary');
  await summary.click(); await expect(menu).toHaveAttribute('open', '');
  await page.getByRole('combobox', { name: '进度文本方式' }).click();
  await page.getByRole('option', { name: '百分比', exact: true }).click();
  await expect(menu).toHaveAttribute('open', '');
  await page.locator('.sidebar-view-count').click(); await expect(menu).not.toHaveAttribute('open', '');
  await summary.click(); await page.keyboard.press('Escape'); await expect(menu).not.toHaveAttribute('open', '');
  const refresh = page.getByRole('button', { name: '刷新并检测失效资源' });
  await expect(page.locator('.library-controls').getByRole('button', { name: '刷新并检测失效资源' })).toBeVisible();
  await expect(page.locator('.library-footer').getByRole('button', { name: '刷新并检测失效资源' })).toHaveCount(0);
  const selection = await page.getByRole('button', { name: '选择', exact: true }).boundingBox();
  expect((await refresh.boundingBox())!.x).toBeGreaterThan(selection!.x);
  const refreshBox = (await refresh.boundingBox())!, iconBox = (await refresh.locator('svg').boundingBox())!;
  expect(Math.abs(refreshBox.y + refreshBox.height / 2 - selection!.y - selection!.height / 2)).toBeLessThan(1);
  expect(Math.abs(iconBox.x + iconBox.width / 2 - refreshBox.x - refreshBox.width / 2)).toBeLessThan(1);
  expect(Math.abs(iconBox.y + iconBox.height / 2 - refreshBox.y - refreshBox.height / 2)).toBeLessThan(1);
  await page.screenshot({ path: 'test-results/library-toolbar-refresh.png' });
});
