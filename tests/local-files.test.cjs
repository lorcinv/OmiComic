const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const Module = require('node:module');

async function fixture(t, rejectTrash = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omi-local-files-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const library = path.join(root, 'library');
  await fs.mkdir(library);
  const originalLoad = Module._load;
  Module._load = function(id, ...args) {
    if (id === 'electron') return { app: { getPath: () => root }, shell: { trashItem: async source => {
      if (rejectTrash) throw new Error('Recycle bin unavailable');
      await fs.rename(source, path.join(root, 'recycled'));
    } } };
    return originalLoad.call(this, id, ...args);
  };
  let data, files;
  try {
    for (const name of ['appDataService', 'localFileService']) delete require.cache[require.resolve(`../dist-electron/services/${name}.js`)];
    data = require('../dist-electron/services/appDataService.js');
    files = require('../dist-electron/services/localFileService.js');
  } finally { Module._load = originalLoad; }
  await data.添加或更新根目录(library, '测试目录');
  const book = path.join(library, '漫画.cbz');
  await fs.writeFile(book, 'original bytes');
  const item = { sourcePath: book, resourceKey: `archive:${book}`, sourceType: 'archive', title: '漫画.cbz' };
  await data.保存阅读进度({ ...item, currentPageIndex: 3, totalPages: 8, percent: 50, completed: false, hasStartedReading: true, firstReadAt: 1, updatedAt: 2 });
  await data.添加收藏(item);
  await data.切换书签({ ...item, pageIndex: 3, totalPages: 8 });
  await data.更新资源整理信息({ ...item, tags: ['标签'], note: '简介' });
  const folder = await data.创建虚拟文件夹({ name: '书架' });
  await data.添加虚拟文件夹项目(folder.id, [item]);
  return { root, library, book, item, data, files };
}

test('real file rename migrates every reference and persists progress after reload', async t => {
  const f = await fixture(t);
  const result = await f.files.changeLocalResource({ path: f.book, action: 'rename', name: '新名称.cbz' }, [f.library]);
  assert.equal(await fs.readFile(result.newPath, 'utf8'), 'original bytes');
  await assert.rejects(fs.access(f.book));
  const saved = JSON.parse(await fs.readFile(path.join(f.root, 'omicomic-data.json'), 'utf8'));
  const key = `archive:${result.newPath}`;
  assert.equal(saved.readingProgress[key].currentPageIndex, 3);
  assert.equal(saved.favorites[0].resourceKey, key);
  assert.equal(saved.bookmarks[0].sourcePath, result.newPath);
  assert.equal(saved.virtualFolders[0].items[0].resourceKey, key);
  assert.equal(saved.resourceMeta[key].note, '简介');
  assert.equal(saved.recentOpened[0].title, '新名称.cbz');
  await fs.access(path.join(f.root, 'omicomic-data.json.before-file-operation.json'));
});

test('index removal leaves original bytes and can restore visibility', async t => {
  const f = await fixture(t);
  const { appData } = await f.files.changeLocalResource({ path: f.book, action: 'index' }, [f.library]);
  assert.equal(await fs.readFile(f.book, 'utf8'), 'original bytes');
  assert.deepEqual(appData.excludedResourcePaths, [f.book]);
  assert.equal(appData.favorites.length, 0);
  assert.equal(appData.bookmarks.length, 0);
  assert.equal(Object.keys(appData.readingProgress).length, 0);
  assert.deepEqual((await f.data.恢复已移除索引()).excludedResourcePaths, []);
});

test('trash success removes records; trash failure preserves file and records', async t => {
  for (const fail of [false, true]) {
    const f = await fixture(t, fail);
    const action = () => f.files.changeLocalResource({ path: f.book, action: 'trash' }, [f.library]);
    if (fail) {
      await assert.rejects(action, /Recycle bin/);
      assert.equal((await f.data.读取应用数据()).favorites.length, 1);
      await fs.access(f.book);
    } else {
      assert.equal((await action()).appData.favorites.length, 0);
      await fs.access(path.join(f.root, 'recycled'));
      await assert.rejects(fs.access(f.book));
    }
  }
});

test('rejects collisions, extension changes, escapes, reserved names and root deletion', async t => {
  const f = await fixture(t);
  await fs.writeFile(path.join(f.library, 'occupied.cbz'), 'keep');
  for (const name of ['occupied.cbz', '../escape.cbz', 'CON.cbz', 'trailing. ', 'new.exe']) {
    await assert.rejects(f.files.changeLocalResource({ path: f.book, action: 'rename', name }, [f.library]));
  }
  await assert.rejects(f.files.changeLocalResource({ path: f.library, action: 'trash' }, [f.library]));
  await assert.rejects(f.files.changeLocalResource({ path: f.book, action: 'trash' }, [path.join(f.root, 'other')]));
  assert.equal(await fs.readFile(f.book, 'utf8'), 'original bytes');
  assert.equal(await fs.readFile(path.join(f.library, 'occupied.cbz'), 'utf8'), 'keep');
});

test('folder mapping updates descendants, tombstones, cover and grants without touching prefix siblings', () => {
  const { updateResourceRecords } = require('../dist-electron/services/resourceRecords.js');
  const old = 'D:\\comics\\Book'; const next = 'D:\\comics\\New';
  const a = { sourcePath: `${old}\\one.cbz`, resourceKey: `archive:${old}\\one.cbz`, title: 'one.cbz' };
  const b = { sourcePath: `${old}2\\one.cbz`, resourceKey: `archive:${old}2\\one.cbz`, title: 'one.cbz' };
  const source = { library: { roots: [{path: 'D:\\comics', name: '漫画'}], lastCurrentPath: old }, readingProgress: { [a.resourceKey]: a }, resourceMeta: {}, recentOpened: [a,b], temporaryOpened: [a], favorites: [a], bookmarks: [a], removedRecentResourceKeys: [a.resourceKey], externalReadGrants: [a], virtualFolders: [{items:[a], coverResourceKey: a.resourceKey}] };
  const result = updateResourceRecords(source, old, next);
  assert.equal(result.favorites[0].sourcePath, `${next}\\one.cbz`);
  assert.equal(result.recentOpened[1].sourcePath, b.sourcePath);
  assert.equal(result.virtualFolders[0].coverResourceKey, `archive:${next}\\one.cbz`);
  assert.equal(result.library.lastCurrentPath, next);
  assert.equal(source.favorites[0].sourcePath, a.sourcePath);
});
