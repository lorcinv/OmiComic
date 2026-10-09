const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

// Exercise the compiled production service. Only Electron's userData location is mocked.
async function fixture(t, initial) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omi-library-data-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const dataPath = path.join(dir, 'omicomic-data.json');
  if (initial !== undefined) await fs.writeFile(dataPath, JSON.stringify(initial));
  const servicePath = require.resolve('../dist-electron/services/appDataService.js');
  function load() {
    const originalLoad = Module._load;
    Module._load = function (id, ...args) {
      if (id === 'electron') return { app: { getPath: () => dir } };
      return originalLoad.call(this, id, ...args);
    };
    try {
      delete require.cache[servicePath];
      return require(servicePath);
    } finally {
      Module._load = originalLoad;
    }
  }
  return { dir, dataPath, load, service: load() };
}

function resource(dir, name, sourceType = 'archive') {
  const sourcePath = path.join(dir, name);
  return { resourceKey: `${sourceType}:${sourcePath}`, sourcePath, sourceType, title: name };
}
function progress(item, currentPageIndex = 2) {
  return { ...item, currentPageIndex, totalPages: 10, percent: 30, completed: false,
    hasStartedReading: true, firstReadAt: 1000, updatedAt: 2000 };
}
function ordered(items, values, field = 'resourceKey') {
  assert.deepEqual(items.map(item => item[field]), values);
  assert.deepEqual(items.map(item => item.sortIndex), values.map((_, index) => index));
}

test('legacy JSON gains defaults while preserving old library, progress and folder descriptions', async t => {
  const item = resource('/legacy', '漫画.cbz');
  const f = await fixture(t, {
    version: 1,
    library: { roots: [{ path: '/legacy', name: '旧资源库', addedAt: 11, lastOpenedAt: 12 }] },
    settings: { cardSize: 'large', pageSize: 100, skipBatchDeleteConfirm: { favorites: true, bookmarks: false } },
    readingProgress: { [item.resourceKey]: { ...progress(item), hasStartedReading: undefined } },
    favorites: [item],
    virtualFolders: [{ id: 'legacy-folder', name: '旧书架', description: '  旧版简介  ', items: [item] }],
  });
  const data = await f.service.读取应用数据();
  assert.equal(data.library.roots[0].name, '旧资源库');
  assert.equal(data.settings.cardSize, 'large');
  assert.equal(data.settings.pageSize, 100);
  assert.equal(data.settings.readerDefaultFitMode, 'fit-height');
  assert.equal(data.settings.readerPageMode, 'single');
  assert.equal(data.settings.readerMemoryCacheSizeMb, 200);
  assert.deepEqual(data.settings.confirmBeforeBatchDelete, { favorites: false, bookmarks: true, recent: true });
  assert.equal(data.readingProgress[item.resourceKey].hasStartedReading, true);
  assert.equal(data.readingProgress[item.resourceKey].firstReadAt, 1000);
  assert.equal(data.recentOpened[0].resourceKey, item.resourceKey);
  assert.deepEqual(data.favorites[0].tags, []);
  assert.equal(data.virtualFolders[0].note, '旧版简介');
  assert.equal(data.virtualFolders[0].bookshelfId, data.bookshelves[0].id);
  assert.equal(data.virtualFolders[0].items[0].folderId, 'legacy-folder');
  await f.service.保存应用数据(data);
  assert.deepEqual(await f.load().读取应用数据(), data);
});

test('invalid legacy values are bounded and malformed records do not erase valid records', async t => {
  const item = resource('/legacy', 'valid.jpg', 'image');
  const f = await fixture(t, {
    settings: { pageSize: 999, readerMemoryCacheSizeMb: 99999, readerPreloadPages: -2, readerImageLoadConcurrency: 0 },
    favorites: [null, {}, item, item],
    readingProgress: { bad: {}, [item.resourceKey]: { ...progress(item, 900), totalPages: 10 } },
    virtualFolders: [{ id: 'old', name: 'Old', bookshelfId: 'missing', coverResourceKey: 'missing', items: [null, item, item] }],
  });
  const data = await f.service.读取应用数据();
  assert.equal(data.settings.pageSize, 60);
  assert.equal(data.settings.readerMemoryCacheSizeMb, 2048);
  assert.equal(data.settings.readerPreloadPages, 0);
  assert.equal(data.settings.readerImageLoadConcurrency, 1);
  assert.equal(data.favorites.length, 1);
  assert.deepEqual(Object.keys(data.readingProgress), [item.resourceKey]);
  assert.equal(data.readingProgress[item.resourceKey].currentPageIndex, 9);
  assert.equal(data.readingProgress[item.resourceKey].completed, true);
  assert.equal(data.virtualFolders[0].items.length, 1);
  assert.equal(data.virtualFolders[0].coverResourceKey, undefined);
  assert.equal(data.virtualFolders[0].bookshelfId, data.bookshelves[0].id);
});

test('Unicode notes and deduplicated tags persist, synchronize favorites and delete across record types', async t => {
  const f = await fixture(t);
  const s = f.service;
  const item = resource(f.dir, '测试.cbz');
  await s.添加收藏(item);
  await s.更新资源整理信息({ ...item, note: '  简介：第一卷\n保留换行  ', tags: [' 科幻 ', '科幻', '', '已读'] });
  const { bookmark } = await s.切换书签({ ...item, pageIndex: 1, totalPages: 10 });
  await s.更新书签整理信息(bookmark.id, { note: '  书签注释  ', tags: ['科幻', '书签'] });
  const folder = await s.创建虚拟文件夹({ name: '分类', note: '分类说明' });
  const seed = await s.读取应用数据();
  seed.virtualFolders.find(value => value.id === folder.id).tags = ['科幻', '分类'];
  await s.保存应用数据(seed);
  await s.更新标签顺序(['书签', '已读', '科幻', '分类']);
  let data = await f.load().读取应用数据();
  assert.equal(data.resourceMeta[item.resourceKey].note, '简介：第一卷\n保留换行');
  assert.deepEqual(data.resourceMeta[item.resourceKey].tags, ['科幻', '已读']);
  assert.equal(data.favorites[0].note, data.resourceMeta[item.resourceKey].note);
  assert.deepEqual(data.favorites[0].tags, ['科幻', '已读']);
  assert.equal(data.bookmarks[0].note, '书签注释');
  assert.deepEqual(data.tagOrder, ['书签', '已读', '科幻', '分类']);
  await s.删除标签([' 科幻 ', '科幻']);
  data = await f.load().读取应用数据();
  assert.deepEqual(data.resourceMeta[item.resourceKey].tags, ['已读']);
  assert.deepEqual(data.favorites[0].tags, ['已读']);
  assert.deepEqual(data.bookmarks[0].tags, ['书签']);
  assert.deepEqual(data.virtualFolders[0].tags, ['分类']);
  assert.deepEqual(data.tagOrder, ['书签', '已读', '分类']);
  assert.equal(data.bookmarks[0].note, '书签注释');
});

test('favorites, bookmark page toggles and manual ordering survive service reload', async t => {
  const f = await fixture(t);
  const s = f.service;
  const a = resource(f.dir, 'a.cbz');
  const b = resource(f.dir, 'b.jpg', 'image');
  const favorite = await s.添加收藏({ ...a, note: 'A note', tags: ['A'] });
  await s.添加收藏(b);
  const refreshed = await s.添加收藏({ ...a, title: 'Updated A' });
  assert.equal(refreshed.addedAt, favorite.addedAt);
  assert.equal(refreshed.note, 'A note');
  assert.deepEqual(refreshed.tags, ['A']);
  await s.重排收藏([b.resourceKey, a.resourceKey, b.resourceKey, 'missing']);
  const first = await s.切换书签({ ...a, pageIndex: 2, totalPages: 10, archiveInnerPath: '卷一/003.jpg' });
  const second = await s.切换书签({ ...a, pageIndex: 4, totalPages: 10 });
  await s.重排书签([first.bookmark.id, second.bookmark.id]);
  let data = await f.load().读取应用数据();
  ordered(data.favorites, [b.resourceKey, a.resourceKey]);
  ordered(data.bookmarks, [first.bookmark.id, second.bookmark.id], 'id');
  assert.equal(data.bookmarks[0].archiveInnerPath, '卷一/003.jpg');
  assert.equal(await s.当前页已书签(a.resourceKey, 2), true);
  assert.equal((await s.切换书签({ ...a, pageIndex: 2, totalPages: 10 })).bookmarked, false);
  await s.移除收藏(b.resourceKey);
  data = await f.load().读取应用数据();
  ordered(data.favorites, [a.resourceKey]);
  assert.equal(data.bookmarks.length, 1);
  assert.equal(data.bookmarks[0].pageIndex, 4);
});

test('progress preserves first-read and view state; recent removal persists until reopening', async t => {
  const f = await fixture(t);
  const s = f.service;
  const item = resource(f.dir, 'pages', 'folder');
  const view = { fitMode: 'fit-width', pageMode: 'double', pageDirection: 'right-to-left', flow: 'vertical', panorama: true, immersive: true };
  await s.保存阅读进度({ ...progress(item, 9), readerViewState: view });
  let saved = await s.保存阅读进度({ ...progress(item, 0), firstReadAt: 9999, hasStartedReading: false });
  assert.equal(saved.firstReadAt, 1000);
  assert.equal(saved.hasStartedReading, true);
  assert.equal(saved.completed, false);
  assert.equal(saved.percent, 10);
  assert.deepEqual(saved.readerViewState, view);
  await s.移除最近打开(item.resourceKey);
  const reloaded = f.load();
  assert.deepEqual(await reloaded.获取最近打开(), []);
  assert.equal((await reloaded.获取阅读进度(item.resourceKey)).currentPageIndex, 0);
  await reloaded.保存阅读进度(progress(item, 3));
  const data = await f.load().读取应用数据();
  assert.equal(data.recentOpened.length, 1);
  assert.equal(data.recentOpened[0].currentPageIndex, 3);
  assert.deepEqual(data.removedRecentResourceKeys, []);
  assert.deepEqual(data.readingProgress[item.resourceKey].readerViewState, view);
});

test('bookshelf, virtual folder and item ordering survives reload and scoped deletion', async t => {
  const f = await fixture(t);
  const s = f.service;
  const defaultId = (await s.读取应用数据()).bookshelves[0].id;
  const shelf = await s.创建书架({ name: 'Other shelf' });
  const a = await s.创建虚拟文件夹({ name: 'A', bookshelfId: defaultId });
  const b = await s.创建虚拟文件夹({ name: 'B', bookshelfId: defaultId });
  const c = await s.创建虚拟文件夹({ name: 'A', bookshelfId: shelf.id });
  const items = ['a.cbz', 'b.cbz', 'c.cbz'].map(name => resource(f.dir, name));
  await s.添加虚拟文件夹项目(a.id, items);
  await s.重排虚拟文件夹项目(a.id, [items[2].resourceKey, items[0].resourceKey, items[1].resourceKey]);
  await s.重排虚拟文件夹([b.id, a.id, c.id]);
  await s.重排书架([shelf.id, defaultId]);
  let data = await f.load().读取应用数据();
  ordered(data.bookshelves, [shelf.id, defaultId], 'id');
  ordered(data.virtualFolders, [b.id, a.id, c.id], 'id');
  ordered(data.virtualFolders.find(folder => folder.id === a.id).items, [items[2].resourceKey, items[0].resourceKey, items[1].resourceKey]);
  await assert.rejects(s.创建虚拟文件夹({ name: 'A', bookshelfId: defaultId }), /VIRTUAL_FOLDER_NAME_EXISTS/);
  await s.删除书架(shelf.id);
  data = await f.load().读取应用数据();
  assert.deepEqual(data.virtualFolders.map(folder => folder.id), [b.id, a.id]);
  assert.equal(data.virtualFolders.find(folder => folder.id === a.id).items.length, 3);
  await assert.rejects(s.删除书架(defaultId), /BOOKSHELF_MINIMUM_REQUIRED/);
});

test('virtual copy and single/batch move change only references, preserve source bytes and clear old covers', async t => {
  const f = await fixture(t);
  const s = f.service;
  const items = ['a.cbz', 'b.cbz', 'c.cbz'].map(name => resource(f.dir, name));
  for (const item of items) await fs.writeFile(item.sourcePath, `source:${item.title}`);
  const from = await s.创建虚拟文件夹({ name: 'From' });
  const to = await s.创建虚拟文件夹({ name: 'To' });
  await s.添加虚拟文件夹项目(from.id, items);
  // Copy uses the same add-reference operation as the UI, without removing the original.
  const copied = await s.添加虚拟文件夹项目(to.id, [items[0], items[0]]);
  assert.equal(copied.addedCount, 1);
  assert.equal(copied.skippedCount, 1);
  assert.equal((await s.读取应用数据()).virtualFolders.find(folder => folder.id === from.id).items.length, 3);
  await s.更新虚拟文件夹({ id: from.id, coverResourceKey: items[0].resourceKey });
  const moved = await s.移动虚拟文件夹项目({ fromFolderId: from.id, toFolderId: to.id, item: items[0] });
  assert.equal(moved.targetAlreadyHad, true);
  assert.equal(moved.addedToTarget, false);
  assert.equal(moved.virtualFolders.find(folder => folder.id === from.id).coverResourceKey, undefined);
  const batch = await s.移动虚拟文件夹项目列表({ fromFolderId: from.id, toFolderId: to.id, items: [items[1], items[2], items[1]] });
  assert.equal(batch.movedCount, 2);
  assert.equal(batch.addedCount, 2);
  assert.equal(batch.targetAlreadyHadCount, 0);
  const data = await f.load().读取应用数据();
  assert.deepEqual(data.virtualFolders.find(folder => folder.id === from.id).items, []);
  const target = data.virtualFolders.find(folder => folder.id === to.id);
  ordered(target.items, items.map(item => item.resourceKey));
  assert.deepEqual(target.items.map(item => item.sourcePath), items.map(item => item.sourcePath));
  assert.equal(target.items.every(item => item.folderId === to.id), true);
  await s.清空虚拟文件夹项目(to.id);
  await s.删除虚拟文件夹(from.id);
  for (const item of items) assert.equal(await fs.readFile(item.sourcePath, 'utf8'), `source:${item.title}`);
});

test('invalid-reference cleanup removes all matching records by path/key and preserves unrelated files/data', async t => {
  const f = await fixture(t);
  const s = f.service;
  const items = ['stale-path.cbz', 'stale-key.cbz', 'keep.cbz'].map(name => resource(f.dir, name));
  for (const item of items) {
    await fs.writeFile(item.sourcePath, `untouched:${item.title}`);
    await s.添加收藏(item);
    await s.保存阅读进度(progress(item));
    await s.切换书签({ ...item, pageIndex: 2, totalPages: 10 });
    await s.更新资源整理信息({ ...item, note: item.title, tags: ['shared'] });
  }
  const folder = await s.创建虚拟文件夹({ name: 'Mixed' });
  await s.添加虚拟文件夹项目(folder.id, items);
  await s.更新虚拟文件夹({ id: folder.id, coverResourceKey: items[0].resourceKey });
  await s.清理失效资源记录({ sourcePaths: [items[0].sourcePath], resourceKeys: [items[1].resourceKey] });
  const data = await f.load().读取应用数据();
  const keep = items[2].resourceKey;
  ordered(data.favorites, [keep]);
  ordered(data.bookmarks, [keep]);
  assert.deepEqual(data.recentOpened.map(item => item.resourceKey), [keep]);
  assert.deepEqual(Object.keys(data.readingProgress), [keep]);
  assert.deepEqual(Object.keys(data.resourceMeta), [keep]);
  ordered(data.virtualFolders[0].items, [keep]);
  assert.equal(data.virtualFolders[0].coverResourceKey, undefined);
  assert.equal(data.resourceMeta[keep].note, 'keep.cbz');
  for (const item of items) assert.equal(await fs.readFile(item.sourcePath, 'utf8'), `untouched:${item.title}`);
});
