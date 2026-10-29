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

test('dropped directories persist atomically without changing the current directory or existing order', async t => {
  const f = await fixture(t), current = path.join(f.dir, 'Current'), incoming = path.join(f.dir, 'Incoming');
  await fs.mkdir(current); await fs.mkdir(incoming);
  await f.service.添加或更新根目录(current, 'My chosen name');
  await f.service.更新资源库状态({ lastActiveRootPath: current, lastCurrentPath: current });
  const before = await f.service.读取应用数据();
  const [a, b] = await Promise.all([f.service.添加拖入根目录(incoming), f.service.添加拖入根目录(incoming + path.sep)]);
  assert.deepEqual([a.alreadyAdded, b.alreadyAdded], [false, true]);
  const after = await f.load().读取应用数据();
  assert.deepEqual(after.library.roots.map(root => root.path), [current, incoming]);
  assert.equal(after.library.lastActiveRootPath, before.library.lastActiveRootPath);
  assert.equal(after.library.lastCurrentPath, before.library.lastCurrentPath);
  assert.deepEqual(after.library.roots[0], before.library.roots[0]);
});

test('first dropped directory becomes restorable, rejects files and missing paths, and deduplicates directory aliases', async t => {
  const f = await fixture(t), incoming = path.join(f.dir, 'Incoming'), alias = path.join(f.dir, 'Alias'), file = path.join(f.dir, 'file.cbz');
  await fs.mkdir(incoming); await fs.writeFile(file, 'fixture');
  await assert.rejects(f.service.添加拖入根目录(file), /DROP_NOT_DIRECTORY/);
  await assert.rejects(f.service.添加拖入根目录(path.join(f.dir, 'Missing')));
  assert.equal((await f.service.读取应用数据()).library.roots.length, 0);
  await f.service.添加拖入根目录(incoming);
  await fs.symlink(incoming, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await f.service.添加拖入根目录(alias)).alreadyAdded, true);
  if (process.platform === 'win32') assert.equal((await f.service.添加拖入根目录(incoming.toUpperCase())).alreadyAdded, true);
  const saved = await f.load().读取应用数据();
  assert.equal(saved.library.roots.length, 1); assert.equal(saved.library.lastCurrentPath, incoming);
});

test('desktop language, information size and performance preferences survive restart without losing manual values',async t=>{
  const f=await fixture(t,{settings:{readerMemoryCacheSizeMb:350,readerPreloadPages:7,readerImageLoadConcurrency:3}});
  assert.equal((await f.service.读取应用数据()).settings.desktopPerformanceProfile,'custom');
  for(const language of ['en','ja','zh-CN']) {
    await f.service.更新设置({language,desktopInfoFontSize:18,desktopReaderAutoHide:true});
    const saved=(await f.load().读取应用数据()).settings;
    assert.equal(saved.language,language);assert.equal(saved.desktopInfoFontSize,18);assert.equal(saved.desktopReaderAutoHide,true);assert.equal(saved.readerMemoryCacheSizeMb,350);
  }
  await f.service.更新设置({desktopPerformanceProfile:'balanced'});
  assert.equal((await f.load().读取应用数据()).settings.readerMemoryCacheSizeMb,256);
  await f.service.更新设置({readerMemoryCacheSizeMb:2048,readerPreloadPages:40,readerImageLoadConcurrency:12});
  const saved=(await f.load().读取应用数据()).settings;
  assert.equal(saved.desktopPerformanceProfile,'custom');assert.equal(saved.readerPreloadPages,40);assert.equal(saved.readerImageLoadConcurrency,12);
});

test('page sizes migrate 60 to 50 and persist 500 plus opt-in space search', async t => {
  const f = await fixture(t, { settings: { pageSize: 60 } });
  assert.equal((await f.service.读取应用数据()).settings.pageSize, 50);
  assert.equal((await f.service.读取应用数据()).settings.searchSplitSpaces, false);
  await f.service.更新设置({ pageSize: 500, searchSplitSpaces: true });
  const saved = (await f.load().读取应用数据()).settings;
  assert.equal(saved.pageSize, 500);
  assert.equal(saved.searchSplitSpaces, true);
});

test('home screen remains on for legacy settings and an explicit opt-out survives restart', async t => {
  const f = await fixture(t, {settings:{}});
  assert.equal((await f.service.读取应用数据()).settings.showHomePage,true);
  await f.service.更新设置({showHomePage:false});
  assert.equal((await f.load().读取应用数据()).settings.showHomePage,false);
  await f.service.更新设置({showHomePage:true});
  assert.equal((await f.load().读取应用数据()).settings.showHomePage,true);
});

test('desktop typography migrates the old standard and persists custom numeric sizes', async t => {
  const f = await fixture(t, { settings: { desktopInfoFontSize: 14 } });
  let settings = (await f.service.读取应用数据()).settings;
  assert.equal(settings.desktopInfoFontSize, 12);
  assert.equal(settings.desktopGlobalFontSize, 14);
  await f.service.更新设置({ desktopInfoFontSize: 13, desktopGlobalFontSize: 17 });
  settings = (await f.load().读取应用数据()).settings;
  assert.equal(settings.desktopInfoFontSize, 13);
  assert.equal(settings.desktopGlobalFontSize, 17);
  // 14 remains a valid custom choice after the one-time migration.
  await f.service.更新设置({ desktopInfoFontSize: 14 });
  assert.equal((await f.load().读取应用数据()).settings.desktopInfoFontSize, 14);
  await f.service.更新设置({ desktopInfoFontSize: -2, desktopGlobalFontSize: 100 });
  settings = (await f.load().读取应用数据()).settings;
  assert.equal(settings.desktopInfoFontSize, 10);
  assert.equal(settings.desktopGlobalFontSize, 24);
});

test('desktop performance scales by RAM and CPU without phone limits',()=>{
  const {desktopPerformance}=require('../dist-electron/shared/desktopPerformance.js');
  assert.deepEqual(desktopPerformance('auto',32*1024**3,16),{readerMemoryCacheSizeMb:4096,readerPreloadPages:48,readerImageLoadConcurrency:12});
  assert.deepEqual(desktopPerformance('high',32*1024**3,16),{readerMemoryCacheSizeMb:8192,readerPreloadPages:96,readerImageLoadConcurrency:16});
  assert.deepEqual(desktopPerformance('auto',8*1024**3,4),{readerMemoryCacheSizeMb:1024,readerPreloadPages:20,readerImageLoadConcurrency:2});
});

test('old restrictive PC preset upgrades once, while future custom values remain intentional', async t => {
  const f = await fixture(t, { settings: { desktopPerformanceProfile:'custom', readerMemoryCacheSizeMb:500, readerPreloadPages:5, readerImageLoadConcurrency:5 } });
  assert.equal((await f.service.读取应用数据()).settings.desktopPerformanceProfile, 'auto');
  await f.service.更新设置({ readerMemoryCacheSizeMb:500, readerPreloadPages:5, readerImageLoadConcurrency:5 });
  const settings = (await f.load().读取应用数据()).settings;
  assert.equal(settings.desktopPerformanceProfile, 'custom'); assert.equal(settings.readerMemoryCacheSizeMb, 500);
  assert.equal(settings.desktopPerformanceRevision, 2);
});

test('partial tag and note updates preserve each other and favorite metadata',async t=>{
  const f=await fixture(t),item=resource(f.dir,'partial.cbz');
  await f.service.添加收藏(item);await f.service.更新资源整理信息({...item,tags:['原标签'],note:'原简介'});
  await f.service.更新资源整理信息({...item,tags:['新标签']});await f.service.更新资源整理信息({...item,note:'新简介'});
  const data=await f.load().读取应用数据();
  assert.deepEqual(data.resourceMeta[item.resourceKey].tags,['新标签']);assert.equal(data.resourceMeta[item.resourceKey].note,'新简介');
  assert.deepEqual(data.favorites[0].tags,['新标签']);assert.equal(data.favorites[0].note,'新简介');
});
function progress(item, currentPageIndex = 2) {
  return { ...item, currentPageIndex, totalPages: 10, percent: 30, completed: false,
    hasStartedReading: true, firstReadAt: 1000, updatedAt: 2000 };
}

test('failed persistence leaves committed progress unchanged and cannot leak into the next save', async t => {
  const f = await fixture(t), s = f.service, book = resource(f.dir, 'failed-save.cbz');
  await s.保存阅读进度(progress(book, 1));
  const committed = structuredClone(await s.读取应用数据());
  const committedDisk = await fs.readFile(f.dataPath, 'utf8');
  const originalRename = fs.rename;
  const rename = t.mock.method(fs, 'rename', async (source, target) => {
    if (target === f.dataPath) throw Object.assign(new Error('Disk full'), { code: 'ENOSPC' });
    return originalRename(source, target);
  });
  await assert.rejects(s.保存阅读进度(progress(book, 7)), { code: 'ENOSPC' });
  assert.deepEqual(await s.读取应用数据(), committed);
  assert.equal(await fs.readFile(f.dataPath, 'utf8'), committedDisk);
  rename.mock.restore();
  await s.更新设置({ language: 'en' });
  const restored = await f.load().读取应用数据();
  assert.equal(restored.settings.language, 'en');
  assert.equal(restored.readingProgress[book.resourceKey].currentPageIndex, 1);
});

test('reads see committed settings during a slow save while queued edits commit in order', async t => {
  const f = await fixture(t), s = f.service;
  await s.更新设置({ colorTheme: 'mist', language: 'zh-CN' });
  let release, reached;
  const held = new Promise(resolve => { release = resolve; });
  const entered = new Promise(resolve => { reached = resolve; });
  const originalRename = fs.rename;
  t.mock.method(fs, 'rename', async (source, target) => {
    if (target === f.dataPath) { reached(); await held; }
    return originalRename(source, target);
  });
  const first = s.更新设置({ colorTheme: 'night' });
  const second = s.更新设置({ language: 'ja' });
  try {
    await entered;
    const during = await s.读取应用数据();
    assert.equal(during.settings.colorTheme, 'mist');
    assert.equal(during.settings.language, 'zh-CN');
  } finally { release(); await Promise.all([first, second]); }
  const restored = await f.load().读取应用数据();
  assert.equal(restored.settings.colorTheme, 'night');
  assert.equal(restored.settings.language, 'ja');
});

function ordered(items, values, field = 'resourceKey') {
  assert.deepEqual(items.map(item => item[field]), values);
  assert.deepEqual(items.map(item => item.sortIndex), values.map((_, index) => index));
}

test('renaming a bookmark keeps its physical page, metadata and position after reload', async t => {
  const f=await fixture(t),s=f.service,item=resource(f.dir,'book.cbz');
  const {bookmark}=await s.切换书签({...item,pageIndex:2,totalPages:10,pageName:'000003.png',tags:['科幻'],note:'夜空'});
  const second=await s.切换书签({...item,pageIndex:5,totalPages:10});
  await s.更新书签整理信息(bookmark.id,{bookmarkTitle:'月光书签'});
  const saved=await f.load().读取应用数据(),mark=saved.bookmarks.find(value=>value.id===bookmark.id);
  assert.equal(mark.bookmarkTitle,'月光书签');assert.equal(mark.title,'book.cbz');assert.equal(mark.pageIndex,2);assert.equal(mark.pageName,'000003.png');assert.deepEqual(mark.tags,['科幻']);assert.equal(mark.note,'夜空');assert.equal(saved.bookmarks[0].id,second.bookmark.id);
});

test('per-book sorting atomically remaps physical bookmarks, resume, pairing anchor and settings across reloads', async t => {
  const { pageIdentity, sortReaderPages } = require('../dist-electron/shared/readerPreferences.js');
  const f = await fixture(t), s = f.service;
  const book = resource(f.dir, '漫画.cbz'), other = resource(f.dir, 'other.cbz');
  const pages = [1,2,3,10].map((n,index)=>({index,name:`${n}.png`,archiveInnerPath:`pages/${n}.png`,type:'archive-image',sourcePath:book.sourcePath,modifiedAt:index%2?undefined:100}));
  await s.保存阅读进度({...progress(book,1),totalPages:4,currentPageId:pageIdentity(pages[1]),readerViewState:{fitMode:'fit-window',pageMode:'double',pairingAnchor:1,pageDirection:'right-to-left',flow:'horizontal',panorama:false,immersive:false,adjustments:{enabled:true,gamma:1.3,sharpen:25},autoRead:{intervalSeconds:3,scrollPixelsPerSecond:100}}});
  await s.保存阅读进度(progress(other,7));
  await s.切换书签({...book,pageIndex:1,totalPages:4,pageName:'2.png',archiveInnerPath:'pages/2.png'});
  for(const mode of ['name-desc','time-asc','time-desc','name-asc']) {
    const saved = await s.切换阅读页面顺序({...book,pages,total:4},mode,pageIdentity(pages[1]));
    const expected = sortReaderPages(pages,mode).findIndex(p=>p.name==='2.png');
    const restored = await f.load().读取应用数据();
    assert.equal(restored.readingProgress[book.resourceKey].currentPageIndex,expected);
    assert.equal(restored.readingProgress[book.resourceKey].currentPageId,pageIdentity(pages[1]));
    assert.equal(restored.readingProgress[book.resourceKey].readerViewState.pageSort,mode);
    assert.equal(saved.readerViewState.pairingAnchor,expected);
    assert.equal(saved.readerViewState.adjustments.gamma,1.3);
    assert.equal(saved.readerViewState.autoRead.intervalSeconds,3);
    assert.equal(restored.bookmarks[0].pageIndex,expected);
    assert.equal(restored.bookmarks[0].pageId,pageIdentity(pages[1]));
    assert.equal(await s.当前页已书签(book.resourceKey,expected,pageIdentity(pages[1])),true);
    assert.equal(restored.readingProgress[other.resourceKey].currentPageIndex,7);
  }
  const before = await fs.readFile(f.dataPath,'utf8');
  await assert.rejects(s.切换阅读页面顺序({...book,pages,total:4},'time-asc','missing-image'));
  assert.equal(await fs.readFile(f.dataPath,'utf8'),before);
});

test('legacy document bookmarks with identical chapter titles retain distinct pages', async t => {
  const book = resource('/legacy', 'chapters.epub', 'epub');
  const f = await fixture(t, { bookmarks: [0,1].map(pageIndex => ({ ...book, id: `old-${pageIndex}`, pageIndex, totalPages: 2, pageName: 'Chapter' })) });
  const data = await f.service.读取应用数据();
  assert.deepEqual(data.bookmarks.map(b => b.pageIndex), [0,1]);
  assert.equal(await f.service.当前页已书签(book.resourceKey, 1, 'epub-chapter:1'), true);
});

test('temporary files persist, deduplicate and retain progress when only their reference is deleted', async t => {
  const f = await fixture(t);
  const item = resource(f.dir, 'outside.cbz');
  await fs.writeFile(item.sourcePath, 'original bytes');
  await f.service.记录临时打开(progress(item));
  await f.service.记录临时打开(progress(item));
  await f.service.保存阅读进度(progress(item, 5));
  await f.service.更新资源整理信息({ ...item, tags: ['保留标签'], note: '保留简介' });
  const restored = await f.load().读取应用数据();
  assert.equal(restored.temporaryOpened.length, 1);
  assert.equal(restored.temporaryOpened[0].currentPageIndex, 5);
  assert.equal(restored.library.roots.length, 0);
  await f.service.移除临时打开(item.resourceKey);
  await f.service.保存阅读进度(progress(item, 6));
  const after = await f.load().读取应用数据();
  assert.deepEqual(after.temporaryOpened, []);
  assert.equal(after.readingProgress[item.resourceKey].currentPageIndex, 6);
  assert.deepEqual(after.resourceMeta[item.resourceKey].tags, ['保留标签']);
  assert.equal(await fs.readFile(item.sourcePath, 'utf8'), 'original bytes');
});

test('adding a library directory absorbs only its temporary files, including after restart', async t => {
  const f = await fixture(t);
  const root = path.join(f.dir, 'Comics');
  const included = resource(root, 'one.cbz');
  const sibling = resource(path.join(f.dir, 'Comics-other'), 'two.cbz');
  await f.service.记录临时打开(progress(included));
  await f.service.记录临时打开(progress(sibling));
  await f.service.添加或更新根目录(root, 'Comics');
  await f.service.记录临时打开(progress(included));
  const data = await f.load().读取应用数据();
  assert.deepEqual(data.temporaryOpened.map(item => item.resourceKey), [sibling.resourceKey]);
  assert.equal(data.library.roots[0].path, root);
});

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
  assert.equal(data.settings.colorTheme, 'mist');
  assert.equal(data.settings.pageSize, 100);
  assert.equal(data.settings.readerDefaultFitMode, 'fit-window');
  assert.equal(data.settings.readerPageMode, 'single');
  assert.equal(data.settings.desktopPerformanceProfile, 'auto');
  assert.equal(data.settings.readerMemoryCacheSizeMb, require('../dist-electron/shared/desktopPerformance.js').desktopPerformance('auto',os.totalmem(),os.availableParallelism()).readerMemoryCacheSizeMb);
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
  assert.equal(data.settings.pageSize, 50);
  assert.equal(data.settings.searchSplitSpaces, false);
  assert.equal(data.settings.readerMemoryCacheSizeMb, 16384);
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

test('theme choices survive a fresh service load, preserve other settings and reject unknown values', async t => {
  const f = await fixture(t);
  await f.service.更新设置({ cardSize: 'large', readerPreloadPages: 8 });
  for (const colorTheme of ['nord', 'sand', 'night', 'mist']) {
    await f.service.更新设置({ colorTheme });
    const restored = await f.load().读取应用数据();
    assert.equal(restored.settings.colorTheme, colorTheme);
    assert.equal(restored.settings.cardSize, 'large');
    assert.equal(restored.settings.readerPreloadPages, 8);
  }
  for (const colorTheme of ['unknown-theme', 'sage', 'mauve']) {
    await f.service.更新设置({ colorTheme });
    assert.equal((await f.load().读取应用数据()).settings.colorTheme, 'mist');
  }
});

test('retired saved themes fall back without changing reading or library preferences', async t => {
  for (const colorTheme of ['sage', 'mauve']) {
    const f = await fixture(t, { settings: { colorTheme, cardSize: 'large', readerPreloadPages: 8 } });
    const { settings } = await f.service.读取应用数据();
    assert.equal(settings.colorTheme, 'mist');
    assert.equal(settings.cardSize, 'large');
    assert.equal(settings.readerPreloadPages, 8);
  }
});

test('continuous card scales persist independently, bound invalid values and upgrade old settings', async t => {
  const f = await fixture(t, { settings: { cardSize: 'small', colorTheme: 'sand' } });
  const initial = (await f.service.读取应用数据()).settings;
  assert.equal(initial.cardScale, 100);
  assert.equal(initial.detailThumbnailScale, 100);
  await f.service.更新设置({ cardScale: 87, detailThumbnailScale: 134 });
  let saved = (await f.load().读取应用数据()).settings;
  assert.equal(saved.cardScale, 87);
  assert.equal(saved.detailThumbnailScale, 134);
  assert.equal(saved.colorTheme, 'sand');
  await f.service.更新设置({ cardScale: -20, detailThumbnailScale: 999 });
  saved = (await f.load().读取应用数据()).settings;
  assert.equal(saved.cardScale, 40);
  assert.equal(saved.detailThumbnailScale, 200);
  await f.service.更新设置({ cardScale: null, detailThumbnailScale: 'bad' });
  saved = (await f.load().读取应用数据()).settings;
  assert.equal(saved.cardScale, 100);
  assert.equal(saved.detailThumbnailScale, 100);
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
  const view = { fitMode: 'fit-width', pageMode: 'double', pageDirection: 'right-to-left', flow: 'vertical', panorama: true, immersive: true, ...require('../dist-electron/shared/readerPreferences.js').normalizeReaderPreferences({}) };
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
  const anchoredView = { ...view, pairingAnchor: 5 };
  await reloaded.保存阅读进度({ ...progress(item, 9), readerViewState: anchoredView });
  const restored = await f.load().获取阅读进度(item.resourceKey);
  assert.equal(restored.currentPageIndex, 9);
  assert.deepEqual(restored.readerViewState, anchoredView);
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
