import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function seed(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(async source => {
    eval(`(${source})`)({ count: 2 });
    const api = window.omicomic, result = await api.getAppData();
    if (!result.ok) throw Error('fixture');
    const data = result.data;
    data.settings.showHomePage = false;
    data.bookshelves = [{ id: 'category', name: '分类', sortIndex: 0, createdAt: 1, updatedAt: 1 }];
    data.virtualFolders = Array.from({ length: 80 }, (_, shelf) => ({
      id: `s${shelf}`, name: `Shelf ${shelf}`, bookshelfId: 'category', sortIndex: shelf,
      createdAt: 1, updatedAt: 1, note: '', tags: [],
      items: Array.from({ length: 100 }, (_, book) => ({
        id: `s${shelf}-b${book}`, folderId: `s${shelf}`, resourceKey: `image:/comics/s${shelf}/${book}.png`,
        sourcePath: `/comics/s${shelf}/${book}.png`, sourceType: 'image' as const,
        title: `Book ${book}`, sortIndex: book, addedAt: 1,
      })),
    }));
    api.getAppData = async () => ({ ok: true, data: structuredClone(data) });
  }, installMock.toString());
  await page.goto('/');
  await nav(page).click();
}

const nav = (page: Page) => page.locator('.sidebar-primary-nav .sidebar-item').filter({ has: page.locator('span', { hasText: /^书架$/ }) });
const root = (page: Page) => page.locator('.page-panel.is-visible .bookshelf-root-view');
const books = (page: Page) => page.getByLabel('书架资源列表', { exact: true });

async function scroll(page: Page, location: 'root' | 'books', top: number) {
  const list = location === 'root' ? root(page) : books(page);
  await expect(list).toBeVisible();
  await list.evaluate((element, top) => { element.scrollTop = top; element.dispatchEvent(new Event('scroll')); }, top);
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeCloseTo(top, 0);
}

for (const mobile of [false, true]) test.describe(mobile ? 'mobile bookshelf positions' : 'desktop bookshelf positions', () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  for (const exit of ['back', 'sidebar'] as const) test(`returning through ${exit} keeps the shelf list and each shelf position`, async ({ page }) => {
    await seed(page);
    await scroll(page, 'root', 1100);
    const cards = page.locator(mobile ? '.mobile-bookshelf-card' : '.bookshelf-folder-card');
    const shelfName = await cards.evaluateAll(elements => {
      const list = document.querySelector('.bookshelf-root-view')!.getBoundingClientRect();
      return elements.find(element => { const rect = element.getBoundingClientRect(); return rect.top >= list.top + 90 && rect.bottom <= list.bottom - 20; })!.querySelector('strong')!.textContent;
    });
    const visibleShelf = cards.filter({ has: page.locator('strong', { hasText: new RegExp(`^${shelfName}$`) }) });
    if (mobile) await visibleShelf.tap(); else await visibleShelf.dblclick();
    await scroll(page, 'books', 950);
    if (exit === 'back') {
      if (mobile) await page.evaluate(() => window.dispatchEvent(new Event('omi-back', { cancelable: true })));
      else await page.getByRole('button', { name: '返回书架', exact: true }).click();
    } else await nav(page).click();
    await expect(root(page)).toBeVisible();
    await expect.poll(() => root(page).evaluate(element => element.scrollTop)).toBeCloseTo(1100, 0);
    const sameShelf = cards.filter({ has: page.locator('strong', { hasText: new RegExp(`^${shelfName}$`) }) });
    if (mobile) await sameShelf.tap(); else await sameShelf.dblclick();
    await expect(books(page)).toBeVisible();
    await expect.poll(() => books(page).evaluate(element => element.scrollTop)).toBeCloseTo(950, 0);
  });
});
