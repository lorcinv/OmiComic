import { test, expect } from '@playwright/test';
import { installMock } from './mock';

for (const mobile of [false, true]) test(`${mobile ? 'mobile' : 'PC'} searches names, notes and tags across views without matching parent paths`, async ({ page }) => {
  page.on('pageerror', error => console.error(error.stack));
  await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 960 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 4 });
  await page.addInitScript(async () => {
    const api = window.omicomic, result = await api.getAppData();
    if (!result.ok) throw new Error('Missing fixture data');
    const data = result.data, root = '/comics/JK-parent-path';
    const files = ['Name JK.cbz', 'Tag match.cbz', 'Note match.cbz', 'Unrelated.cbz', 'Folder note'].map((name, i) => ({
      id: root + '/' + name, path: root + '/' + name, name,
      type: (i === 4 ? 'folder' : 'archive') as 'folder' | 'archive', extension: i === 4 ? '' : 'cbz', size: 68, modifiedAt: 1,
    }));
    data.library = { roots: [{ path: root, name: 'Comics', addedAt: 0, lastOpenedAt: 0 }], lastActiveRootPath: root, lastCurrentPath: root };
    const records = files.map((file, i) => ({ resourceKey: `${file.type}:${file.path}`, sourcePath: file.path, sourceType: file.type,
      title: file.name, tags: i === 1 ? ['JK'] : [], note: i === 2 || i === 4 ? 'About JK' : '', updatedAt: 1, sortIndex: i }));
    data.resourceMeta = Object.fromEntries(records.map(record => [record.resourceKey, record]));
    data.favorites = records.map(record => ({ ...record, addedAt: 1 }));
    data.recentOpened = records.map(record => ({ ...record, currentPageIndex: 0, totalPages: 4 }));
    data.temporaryOpened = data.recentOpened;
    data.bookmarks = records.map((record, i) => ({ ...record, id: 'bookmark-' + i, pageIndex: 0, totalPages: 4, pageName: 'page 1', thumbnailUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNQ8yoBAAF+AOUqTs0pAAAAAElFTkSuQmCC', createdAt: 1 }));
    data.bookshelves = [{ id: 'shelf', name: 'Shelf', createdAt: 1, updatedAt: 1, sortIndex: 0 }];
    data.virtualFolders = records.map((record, i) => ({ id: 'group-' + i, bookshelfId: 'shelf', name: 'Group ' + i, note: '', tags: [], createdAt: 1, updatedAt: 1, sortIndex: i,
      items: [{ ...record, id: 'item-' + i, folderId: 'group-' + i, addedAt: 1 }] }));
    api.listDirectory = async path => ({ ok: true, data: { path, parentPath: null, items: files, total: files.length } });
    api.scanLibrary = async () => ({ ok: true, data: { items: files, directories: 2, skipped: 0, scannedAt: Date.now(), complete: true } });
    api.getFavorites = async () => ({ ok: true, data: data.favorites });
    api.getBookmarks = async () => ({ ok: true, data: data.bookmarks });
    api.getBookmarkPagePreview = async () => ({ ok: true, data: { dataUrl: data.bookmarks[0].thumbnailUrl! } });
  });
  await page.goto('/'); await page.getByRole('button', { name: '打开资源库', exact: true }).first().click();
  const cards = page.locator('.resource-card');
  await expect(cards).toHaveCount(5);
  const fill = async (query: string) => {
    if (mobile && !await page.getByRole('searchbox').isVisible()) await page.getByRole('button', { name: '搜索', exact: true }).click();
    const input = mobile ? page.getByRole('searchbox') : page.locator('.library-controls input').first();
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.fill(query);
  };
  const expected = ['Folder note', 'Name JK.cbz', 'Note match.cbz', 'Tag match.cbz'];
  const expectMatches = async () => {
    await expect(cards).toHaveCount(4);
    await expect.poll(async () => (await cards.locator('strong').allTextContents()).sort()).toEqual(expected);
    await expect(cards.filter({ hasText: 'Unrelated.cbz' })).toHaveCount(0);
  };
  await fill('jk'); await expectMatches();
  await fill('JK-parent-path'); await expect(cards).toHaveCount(0);
  await fill('tag:jk'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Tag match.cbz');
  await fill('note:jk'); await expect(cards).toHaveCount(2);
  await fill('name:jk'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Name JK.cbz');
  for (const label of mobile ? ['收藏', '书签', '最近阅读'] : ['收藏', '书签', '最近阅读', '临时存放']) {
    console.log('Checking view:', label);
    await page.locator('.sidebar-primary-nav').getByRole('button', { name: new RegExp('^' + label) }).click();
    await fill('jk'); await expectMatches();
    await fill('JK-parent-path'); await expect(cards).toHaveCount(0);
  }
  await page.locator('.sidebar-primary-nav').getByRole('button', { name: /^书架/ }).click();
  await fill('jk');
  const groups = page.locator('.bookshelf-folder-card');
  await expect(groups).toHaveCount(4);
  await expect(groups.filter({ hasText: 'Group 3' })).toHaveCount(0);
  await fill('JK-parent-path'); await expect(groups).toHaveCount(0);
  await fill('jk');
  const group = groups.filter({ hasText: 'Group 1' });
  if (mobile) await group.click(); else await group.dblclick();
  await fill('JK-parent-path'); await expect(cards).toHaveCount(0);
  await fill('jk'); await expect(cards).toHaveCount(1); await expect(cards).toContainText('Tag match.cbz');
});
