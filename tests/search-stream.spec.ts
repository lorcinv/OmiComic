import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

const visibleAnchor = (page: Page) => page.locator('.resource-list-scroll').evaluate(element => {
  const top = element.getBoundingClientRect().top;
  const card = [...element.querySelectorAll<HTMLElement>('[data-library-index]')].find(item => item.getBoundingClientRect().bottom > top + 2);
  return { key: card?.dataset.selectionKey, y: card ? card.getBoundingClientRect().top - top : 0, scroll: element.scrollTop, height: element.scrollHeight };
});

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'PC'} pins streamed search hits, scroll and pages; Back exits random first`, async ({ page }) => {
  page.on('pageerror', error => console.error(error.stack));
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await page.addInitScript(installMock, { count: 3 });
  await page.addInitScript(async () => {
    const api = window.omicomic, data = await api.getAppData();
    if (data.ok) { data.data.settings.cardScale = 40; data.data.settings.pageSize = 50; }
    const make = (prefix: string, count: number, type: 'folder' | 'archive') => Array.from({ length: count }, (_, i) => {
      const name = 'Hit ' + prefix + String(i).padStart(3, '0') + (type === 'archive' ? '.cbz' : '');
      return { id: '/comics/' + name, path: '/comics/' + name, name, type, extension: type === 'folder' ? '' : 'cbz', containsImages: type === 'folder', modifiedAt: 1 };
    });
    const first = make('Zfolder', 100, 'folder'), second = make('Afolder', 450, 'folder'), third = make('Mfolder', 50, 'folder');
    const batches = [[...first, ...make('Zbook', 10, 'archive')], [...second, ...make('Bbook', 100, 'archive')], [...third, ...make('Abook', 90, 'archive')]];
    const stats = (window as any).__stream = { calls: 0, released: [true, false, false] };
    api.listDirectory = async path => ({ ok: true, data: { path, parentPath: null, items: first, total: first.length } });
    api.scanLibrary = async () => {
      const number = stats.calls++;
      while (!stats.released[number] && number < 3) await new Promise(resolve => setTimeout(resolve, 10));
      return { ok: true, data: { items: batches[number] ?? [], directories: number + 1, skipped: 0, scannedAt: Date.now(), complete: number >= 2 } };
    };
  });
  await page.goto('/'); await page.getByRole('button', { name: '打开资源库', exact: true }).first().click();
  if (mobile) await page.getByRole('button', { name: '搜索', exact: true }).click();
  const input = mobile ? page.getByRole('searchbox') : page.getByRole('textbox', { name: '搜索当前资源库', exact: true });
  await input.fill('Hit');
  const list = page.locator('.resource-list-scroll');
  await expect(page.locator('[data-library-index="0"] strong')).toHaveText('Hit Zfolder000');
  await expect.poll(() => page.evaluate(() => (window as any).__stream.calls)).toBe(2);
  await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('[data-library-index="109"]')).toContainText('Hit Zbook009');
  if (mobile) await expect(page.locator('.mobile-page-number output')).toHaveText('3 / 3');
  else await expect(page.getByRole('textbox', { name: '当前页码', exact: true })).toHaveValue('2');
  const before = await visibleAnchor(page);
  await page.evaluate(() => { (window as any).__stream.released[1] = true; });
  await expect.poll(() => list.evaluate(element => element.scrollHeight)).toBeGreaterThan(before.height);
  const appended = await visibleAnchor(page);
  expect(appended.key).toBe(before.key); expect(Math.abs(appended.y - before.y)).toBeLessThan(1); expect(appended.scroll).toBe(before.scroll);
  if (mobile) await expect(page.locator('.mobile-page-number output')).toContainText('3 / ');
  else await expect(page.getByRole('textbox', { name: '当前页码', exact: true })).toHaveValue('2');
  await expect(page.locator('[data-library-index="109"]')).toContainText('Hit Zbook009');
  await page.evaluate(() => { (window as any).__stream.released[2] = true; });
  await expect.poll(() => list.evaluate(element => element.scrollHeight)).toBeGreaterThan(appended.height);
  const completed = await visibleAnchor(page);
  expect(completed.key).toBe(before.key); expect(Math.abs(completed.y - before.y)).toBeLessThan(1); expect(completed.scroll).toBe(before.scroll);
  await page.clock.fastForward(125_000);
  expect(await page.evaluate(() => (window as any).__stream.calls)).toBe(3);
  expect((await visibleAnchor(page)).key).toBe(before.key);
  await list.evaluate(element => { element.scrollTop = 0; });
  await expect(page.locator('[data-library-index="0"] strong')).toHaveText('Hit Zfolder000');
  await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('[data-library-index="799"]')).toBeAttached();
  await expect(page.locator('[data-library-index="799"]')).toContainText('Hit Abook089');
  if (mobile) {
    await page.getByRole('button', { name: '清空搜索', exact: true }).click();
    await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
    await page.getByRole('button', { name: '显示选项', exact: true }).click();
  }
  await page.getByRole('switch', { name: '随机阅读', exact: true }).click();
  if (mobile) {
    await page.getByRole('button', { name: '关闭显示选项', exact: true }).click();
    await page.getByRole('button', { name: '搜索', exact: true }).click();
    await input.fill('Hit');
  }
  await expect(page.getByRole('button', { name: '重随机', exact: true })).toBeVisible();
  await input.focus();
  if (mobile) await page.evaluate(() => window.dispatchEvent(new Event('omi-back', { cancelable: true })));
  else await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '重随机', exact: true })).toHaveCount(0);
  await expect(input).toHaveValue('Hit');
  await expect(list).toBeVisible();
  if (!mobile) {
    await list.evaluate(element => { element.scrollTop = 0; });
    await expect(page.locator('[data-library-index="0"] strong')).toHaveText('Hit Zfolder000');
  }
  if (mobile) await page.evaluate(() => window.dispatchEvent(new Event('omi-back', { cancelable: true })));
  else { await page.keyboard.press('Escape'); await page.keyboard.press('Escape'); }
  if (mobile) await expect(page.getByRole('searchbox')).toHaveCount(0);
  else await expect(input).toHaveValue('');
});
