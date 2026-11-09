const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { _electron, expect } = require('@playwright/test');
const { zip } = require('./helpers/documentFixtures.cjs');

test('packaged Windows preserves bookshelf positions and adds a multi-selection through its original menu', { timeout: 120000 }, async () => {
  const executablePath = path.resolve(process.env.OMICOMIC_PACKAGED_EXE || 'release/win-unpacked/OmiComic.exe');
  const directory = await fs.mkdtemp(path.resolve('test-results/bookshelf1194-'));
  const profile = path.join(directory, 'profile'), source = path.join(directory, 'books');
  await fs.mkdir(profile); await fs.mkdir(source);
  const pixel = await fs.readFile('tests/fixtures/images/pixel.png');
  const images = Array.from({ length: 120 }, (_, i) => path.join(source, `page${i}.png`));
  await Promise.all(images.map(file => fs.writeFile(file, pixel)));
  for (const name of ['A.cbz', 'B.cbz']) await fs.writeFile(path.join(source, name), zip([['1.png', pixel]]));
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  let app;
  try {
    app = await _electron.launch({ executablePath, args: [], env });
    let page = await app.firstWindow();
    const result = await page.evaluate(() => window.omicomic.getAppData());
    assert.equal(result.ok, true);
    await app.close(); app = null;
    const data = result.data;
    data.settings.showHomePage = false; data.settings.hideBookshelfItemsInLibrary = false;
    data.settings.sortMode = 'name-asc';
    data.library = { roots: [{ path: source, name: 'Position fixture', addedAt: 1, lastOpenedAt: 1 }], lastActiveRootPath: source, lastCurrentPath: source };
    data.bookshelves = [{ id: 'category', name: '位置回归', sortIndex: 0, createdAt: 1, updatedAt: 1 }];
    data.virtualFolders = Array.from({ length: 80 }, (_, shelf) => ({
      id: `s${shelf}`, name: `Shelf ${shelf}`, bookshelfId: 'category', sortIndex: shelf, note: '', tags: [], createdAt: 1, updatedAt: 1,
      items: images.map((sourcePath, book) => ({ id: `s${shelf}-b${book}`, folderId: `s${shelf}`, resourceKey: `image:${sourcePath}`, sourcePath, sourceType: 'image', title: `Book ${book}`, sortIndex: book, addedAt: 1 })),
    }));
    await fs.writeFile(path.join(profile, 'omicomic-data.json'), JSON.stringify(data));
    app = await _electron.launch({ executablePath, args: [], env });
    page = await app.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' });
    const nav = name => page.locator('.sidebar-primary-nav .sidebar-item').filter({ has: page.locator('span', { hasText: new RegExp(`^${name}$`) }) });
    const root = page.locator('.bookshelf-root-view'), books = page.getByLabel('书架资源列表', { exact: true });
    await nav('书架').click(); await expect(root).toBeVisible();
    await root.evaluate(el => { el.scrollTop = 1100; el.dispatchEvent(new Event('scroll')); });
    await expect.poll(() => root.evaluate(el => el.scrollTop)).toBeCloseTo(1100, 0);
    const name = await page.locator('.bookshelf-folder-card').evaluateAll(elements => {
      const root = document.querySelector('.bookshelf-root-view').getBoundingClientRect();
      return elements.find(el => { const r = el.getBoundingClientRect(); return r.top >= root.top + 90 && r.bottom <= root.bottom - 20; }).querySelector('strong').textContent;
    });
    const shelf = page.locator('.bookshelf-folder-card').filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) });
    await shelf.dblclick(); await expect(books).toBeVisible();
    await books.evaluate(el => { el.scrollTop = 950; el.dispatchEvent(new Event('scroll')); });
    await expect.poll(() => books.evaluate(el => el.scrollTop)).toBeCloseTo(950, 0);
    await page.getByRole('button', { name: '返回书架', exact: true }).click();
    await expect.poll(() => root.evaluate(el => el.scrollTop)).toBeCloseTo(1100, 0);
    await shelf.dblclick(); await expect.poll(() => books.evaluate(el => el.scrollTop)).toBeCloseTo(950, 0);
    await nav('书架').click(); await expect.poll(() => root.evaluate(el => el.scrollTop)).toBeCloseTo(1100, 0);
    await nav('资源库').click();
    const card = name => page.locator('.resource-card').filter({ has: page.locator('strong', { hasText: new RegExp(`^${name}$`) }) });
    await card('A.cbz').click({ button: 'right' });
    await page.getByRole('menuitem', { name: '选择文件', exact: true }).click();
    await card('A.cbz').click(); await card('B.cbz').click();
    await card('A.cbz').click({ button: 'right' });
    await expect(page.getByRole('menuitem', { name: '加入收藏', exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/bookshelf1194-packaged-menu.png', fullPage: true });
    await page.getByRole('menuitem', { name: '加入书架', exact: true }).click();
    await page.locator('.shelf-picker').getByRole('button', { name: /^Shelf 0\s/ }).click();
    await expect(page.locator('.shelf-picker')).toHaveCount(0);
    const state = await app.evaluate(({ app, BrowserWindow }) => ({ version: app.getVersion(), packaged: app.isPackaged, visible: BrowserWindow.getAllWindows().some(w => w.isVisible()) }));
    assert.deepEqual(state, { version: require('../package.json').desktopVersion, packaged: true, visible: false });
    await app.close(); app = null;
    const saved = JSON.parse(await fs.readFile(path.join(profile, 'omicomic-data.json'), 'utf8'));
    assert.deepEqual(saved.virtualFolders[0].items.filter(item => item.sourceType === 'archive').map(item => path.basename(item.sourcePath)), ['A.cbz', 'B.cbz']);
    await fs.writeFile('test-results/bookshelf1194-packaged.json', JSON.stringify({ ...state, rootScrollTop: 1100, shelfScrollTop: 950, exits: ['back', 'sidebar'], added: ['A.cbz', 'B.cbz'], persisted: true }, null, 2));
  } finally { if (app) await app.close(); }
});
