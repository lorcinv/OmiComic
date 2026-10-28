import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
import { setCardScale } from './card-scale-helpers';
test.use({ screenshot: 'only-on-failure' });

async function open(page: Page, count = 10000) {
  page.on('pageerror', error => console.error(error.stack));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 3 });
  await page.addInitScript(({ count }) => {
    const api = (window as any).omicomic, getData = api.getAppData;
    api.getAppData = async () => { const result = await getData(); result.data.settings.cardScale = 40; return result; };
    api.listDirectory = async (path: string) => ({ ok: true, data: { path, parentPath: path === '/comics' ? null : path.slice(0, path.lastIndexOf('/')), items: Array.from({ length: path === '/comics' ? count : 2 }, (_, i) => ({ id: `${path}/${i}`, path: `${path}/${i}`, name: `Book ${i + 1}`, type: 'folder', extension: '' })), total: count } });
    api.getResourcePages = async () => ({ ok: false, error: { code: 'NO_IMAGES', message: 'no images' } });
  }, { count });
  await page.goto('/'); await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('[data-library-index="0"]')).toBeVisible();
}
const list = (page: Page) => page.getByLabel('当前目录文件列表', { exact: true });
const current = (page: Page) => page.getByRole('textbox', { name: '当前页码', exact: true });
async function jump(page: Page, number: number) {
  await current(page).fill(String(number)); await current(page).press('Enter');
  await expect(current(page)).toHaveValue(String(number));
}
async function firstVisible(page: Page) {
  return list(page).evaluate(element => {
    const top = element.getBoundingClientRect().top;
    const card = [...element.querySelectorAll<HTMLElement>('[data-library-index]')].find(card => card.getBoundingClientRect().bottom > top + 2);
    return card ? { index: Number(card.dataset.libraryIndex), y: card.getBoundingClientRect().top - top } : null;
  });
}

test('continuous directory scroll crosses row-aligned page landmarks without replacing visible cards', async ({ page }) => {
  await open(page);
  await expect(page.locator('.page-size-effective')).toHaveCount(0);
  await expect(page.locator('.pagination-bar')).toContainText('/ 159');
  // Compact cards fit more rows; virtualization remains bounded and row aligned.
  await expect.poll(() => page.locator('.resource-card').count()).toBeGreaterThanOrEqual(63);
  expect(await page.locator('.resource-card').count()).toBeLessThanOrEqual(84);
  expect((await page.locator('.resource-card').count()) % 7).toBe(0);
  await jump(page, 2);
  await expect.poll(async () => (await firstVisible(page))?.index).toBe(63);
  const mark = page.locator('[data-library-index="63"]');
  await mark.evaluate(element => { (window as any).__boundaryCard = element; });
  await list(page).evaluate(element => { element.scrollTop -= 50; });
  await expect(current(page)).toHaveValue('1');
  await list(page).hover(); await page.mouse.wheel(0, 100);
  await expect(current(page)).toHaveValue('2');
  expect(await mark.evaluate(element => element === (window as any).__boundaryCard)).toBe(true);
  expect(await page.locator('.resource-card').count()).toBeLessThanOrEqual(84);
  await jump(page, 100);
  await expect.poll(async () => (await firstVisible(page))?.index).toBe(6237);
  await page.getByRole('button', { name: '尾页', exact: true }).click();
  await expect(current(page)).toHaveValue('159');
  await expect.poll(async () => (await firstVisible(page))?.index).toBe(9954);
  await list(page).evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('[data-library-index="9999"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '下一页', exact: true })).toBeDisabled();
  await page.screenshot({ path: 'test-results/library-continuous-last.png' });
  await page.getByRole('button', { name: '首页', exact: true }).click();
  await expect(current(page)).toHaveValue('1');
  await expect.poll(() => list(page).evaluate(element => element.scrollTop)).toBe(0);
});

test('columns, window size and page size preserve the visible item; short last pages and filtering clamp correctly', async ({ page }) => {
  await open(page, 130);
  await jump(page, 2);
  await page.getByText('视图', { exact: true }).click();
  await setCardScale(page.locator('.view-options-popover input[type="range"]'), 75);
  await page.keyboard.press('Escape');
  // The row containing item 63 starts at 60 in a five-column grid.
  await expect.poll(async () => (await firstVisible(page))?.index).toBe(60);
  await page.setViewportSize({ width: 1100, height: 760 });
  await expect.poll(async () => (await firstVisible(page))?.index).toBe(60);
  await page.getByRole('combobox', { name: '每页数量', exact: true }).click();
  await page.getByRole('option', { name: '100', exact: true }).click();
  await expect.poll(async () => (await firstVisible(page))?.index).toBe(60);
  await expect(current(page)).toHaveValue('1');
  await jump(page, 2);
  await expect(page.locator('[data-library-index="129"]')).toBeAttached();
  await list(page).evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(current(page)).toHaveValue('2');
  await expect(page.locator('[data-library-index="129"]')).toBeVisible();
  const search = page.getByRole('textbox', { name: '搜索当前资源库', exact: true });
  await search.fill('nothing-matches');
  await expect(page.locator('.resource-card')).toHaveCount(0);
  await search.fill('');
  await expect(page.locator('[data-library-index="0"]')).toBeVisible();
  await expect(current(page)).toHaveValue('1');
});

test('Escape goes to the immediate parent, and menus, inputs and selection consume it first', async ({ page }) => {
  await open(page, 12);
  await page.locator('[data-library-index="0"]').dblclick();
  await page.locator('[data-library-index="0"]').dblclick();
  await expect(page.locator('[data-library-index="0"]')).toHaveAttribute('data-selection-key', '/comics/0/0/0');
  await page.getByText('视图', { exact: true }).click(); await page.keyboard.press('Escape');
  await expect(page.locator('[data-library-index="0"]')).toHaveAttribute('data-selection-key', '/comics/0/0/0');
  const search = page.getByRole('textbox', { name: '搜索当前资源库', exact: true });
  await search.focus(); await page.keyboard.press('Escape');
  await expect(page.locator('[data-library-index="0"]')).toHaveAttribute('data-selection-key', '/comics/0/0/0');
  await page.getByRole('button', { name: '选择', exact: true }).click(); await page.keyboard.press('Escape');
  await expect(page.locator('[data-library-index="0"]')).toHaveAttribute('data-selection-key', '/comics/0/0/0');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-library-index="0"]')).toHaveAttribute('data-selection-key', '/comics/0/0');
  await page.keyboard.press('Escape');
  await expect(page.locator('.resource-card')).toHaveCount(12);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '上一级', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '返回', exact: true })).toBeDisabled();
});
