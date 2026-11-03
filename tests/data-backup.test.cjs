const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const backup = require('../dist-electron/shared/dataBackup.js');

async function fixture(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omi-backup-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const servicePath = require.resolve('../dist-electron/services/appDataService.js');
  function load() {
    const original = Module._load;
    Module._load = function(id, ...args) { return id === 'electron' ? { app: { getPath: () => dir } } : original.call(this, id, ...args); };
    try { delete require.cache[servicePath]; return require(servicePath); } finally { Module._load = original; }
  }
  const service = load(), data = await service.读取应用数据();
  return { dir, data, service, load };
}
function populate(base, root = 'D:\\Comics') {
  const data = structuredClone(base), sourcePath = `${root}\\作品A\\第一卷.cbz`;
  const ref = { resourceKey: `archive:${sourcePath}`, sourcePath, sourceType: 'archive', title: '第一卷.cbz' };
  const meta = { ...ref, note: '备注', tags: ['测试'], updatedAt: 10 };
  const progress = { ...ref, currentPageIndex: 4, currentPageName: '005.png', currentPageId: 'archive-image:005.png', totalPages: 10, percent: 50, completed: false, hasStartedReading: true, firstReadAt: 1, updatedAt: 10 };
  data.library = { roots: [{ path: root, name: '漫画', addedAt: 1, lastOpenedAt: 2 }], lastActiveRootPath: root, lastCurrentPath: root };
  data.readingProgress = { [ref.resourceKey]: progress }; data.resourceMeta = { [ref.resourceKey]: meta };
  data.favorites = [{ ...meta, addedAt: 1, sortIndex: 0 }]; data.bookmarks = [{ ...meta, id: `${ref.resourceKey}#image:005`, pageIndex: 4, pageId: 'archive-image:005.png', pageName: '005.png', totalPages: 10, createdAt: 1, sortIndex: 0, thumbnailUrl: 'transient:preview' }];
  data.recentOpened = [progress]; data.temporaryOpened = []; data.tagOrder = ['测试'];
  data.virtualFolders = [{ id: 'shelf', bookshelfId: 'bookshelf-default', name: '作品', note: '', tags: [], createdAt: 1, updatedAt: 2, sortIndex: 0, coverResourceKey: ref.resourceKey, items: [{ ...ref, id: `shelf:${ref.resourceKey}`, folderId: 'shelf', addedAt: 1, sortIndex: 0 }] }];
  data.externalReadGrants = [{ sourcePath: 'D:\\private.cbz', sourceType: 'archive' }];
  return { data, ref };
}
const options = mappings => ({ mappings, mode: 'merge', prefer: 'local', includeSettings: false });

test('backup filename contains product, platform and local date/time; roundtrip excludes transient images and grants', async t => {
  const f = await fixture(t), { data } = populate(f.data), before = structuredClone(data);
  assert.equal(backup.backupFilename('win32', new Date(2026, 10, 3, 15, 4, 9)), 'OmiComic-Data-win-20261103-150409.json');
  const out = backup.createDataBackup(data, 'win32', '1.1.76');
  assert.equal(out.platform, 'win'); assert.equal(out.data.bookmarks[0].thumbnailUrl, undefined); assert.equal(out.data.externalReadGrants, undefined);
  assert.deepEqual(backup.parseDataBackup(JSON.stringify(out)), out); assert.deepEqual(data, before);
});

test('rejects corrupt, unsupported, incomplete and prototype-bearing backups before writing anything', async t => {
  const f = await fixture(t), { data } = populate(f.data), out = backup.createDataBackup(data, 'win', '1.1.76');
  assert.throws(() => backup.parseDataBackup('{'), /无法读取/);
  assert.throws(() => backup.parseDataBackup(JSON.stringify({ ...out, formatVersion: 2 })), /格式版本/);
  const broken = structuredClone(out); broken.data.bookmarks[0].pageIndex = -1;
  assert.throws(() => backup.parseDataBackup(JSON.stringify(broken)), /不完整/);
  assert.throws(() => backup.parseDataBackup(JSON.stringify(out).replace('"version":1', '"__proto__":{},"version":1')), /无法读取/);
  const missing = structuredClone(out); delete missing.data.resourceMeta;
  assert.throws(() => backup.parseDataBackup(JSON.stringify(missing)), /不完整/);
});

test('Windows to Android mapping updates all book references and stable page identities, without mutating the backup', async t => {
  const f = await fixture(t), { data, ref } = populate(f.data), out = backup.createDataBackup(data, 'win', '1.1.76');
  const original = structuredClone(out), target = '/local/granted/漫画', next = backup.remapBackup(out, options([{ from: 'D:\\Comics', to: target }]), 'android');
  const key = `archive:${target}/作品A/第一卷.cbz`;
  for (const item of [next.favorites[0], next.bookmarks[0], next.recentOpened[0], next.resourceMeta[key], next.readingProgress[key], next.virtualFolders[0].items[0]]) { assert.equal(item.resourceKey, key); assert.equal(item.sourcePath, `${target}/作品A/第一卷.cbz`); }
  assert.equal(next.bookmarks[0].id, data.bookmarks[0].id.replace(ref.resourceKey, key));
  assert.equal(next.virtualFolders[0].coverResourceKey, key); assert.equal(next.readingProgress[key].currentPageId, 'archive-image:005.png');
  assert.equal(next.library.roots[0].path, target); assert.deepEqual(out, original);
});

test('unmapped cross-platform records are retained without importing foreign library roots', async t => {
  const f = await fixture(t), { data, ref } = populate(f.data), out = backup.createDataBackup(data, 'win', '1.1.76');
  const next = backup.remapBackup(out, options([]), 'android');
  assert.equal(next.library.roots.length, 0); assert.ok(next.readingProgress[ref.resourceKey]); assert.equal(next.favorites.length, 1);
});

test('automatic matching probes relative paths in authorized roots and leaves ambiguous roots for manual choice', async t => {
  const f = await fixture(t), { data } = populate(f.data), out = backup.createDataBackup(data, 'win', '1.1.76');
  const local = structuredClone(f.data); local.library.roots = [{ path: '/local/a/漫画', name: '漫画', addedAt: 1, lastOpenedAt: 1 }];
  const probes = [];
  const found = await backup.autoMatchBackupLocations(out, local, 'android', async (p, directory) => { probes.push(p); return !directory && p.endsWith('/作品A/第一卷.cbz'); });
  assert.deepEqual(found, [{ from: 'D:\\Comics', to: '/local/a/漫画', reason: 'relative' }]); assert.equal(probes.length, 1);
  local.library.roots.push({ path: '/local/b/漫画副本', name: '漫画副本', addedAt: 1, lastOpenedAt: 1 });
  assert.deepEqual(await backup.autoMatchBackupLocations(out, local, 'android', async p => p.endsWith('/作品A/第一卷.cbz')), []);
  assert.deepEqual(await backup.autoMatchBackupLocations(out, local, 'win32', async p => p === 'D:\\Comics'), [{ from: 'D:\\Comics', to: 'D:\\Comics', reason: 'original' }]);
});

test('mapping a temporary external directory never adds it to the saved library',async t=>{
  const f=await fixture(t),{data}=populate(f.data);data.library={roots:[]};
  const out=backup.createDataBackup(data,'win','1.1.76'),location=backup.backupLocations(out.data)[0];
  assert.equal(location.external,true);
  const next=backup.remapBackup(out,options([{from:location.path,to:'/local/granted/作品A'}]),'android');
  assert.deepEqual(next.library.roots,[]);assert.equal(next.favorites[0].sourcePath,'/local/granted/作品A/第一卷.cbz');
});

test('directory mappings are simultaneous, support Windows separators and reject book identity collisions', async t => {
  const f = await fixture(t), first = populate(f.data, 'D:\\A'), second = populate(f.data, 'D:\\B');
  first.data.library.roots.push(...second.data.library.roots);
  Object.assign(first.data.readingProgress, second.data.readingProgress);
  const out = backup.createDataBackup(first.data, 'win', '1.1.76');
  const mapped = backup.remapBackup(out, options([{ from: 'D:\\A', to: 'D:\\B' }, { from: 'D:\\B', to: 'D:\\C' }]), 'win32');
  assert.ok(mapped.readingProgress['archive:D:\\B\\作品A\\第一卷.cbz']); assert.ok(mapped.readingProgress['archive:D:\\C\\作品A\\第一卷.cbz']);
  assert.throws(() => backup.remapBackup(out, options([{ from: 'D:\\A', to: 'D:\\C' }, { from: 'D:\\B', to: 'D:\\C' }]), 'win'), /同一路径/);
});

test('manual merge honors conflict choice and deduplicates bookmarks by book and physical page, not per-device IDs', async t => {
  const f = await fixture(t), { data, ref } = populate(f.data), local = structuredClone(data), imported = structuredClone(data);
  local.resourceMeta[ref.resourceKey].note = '本机'; imported.resourceMeta[ref.resourceKey].note = '导入'; imported.bookmarks[0].id = 'android-uuid';
  imported.readingProgress[ref.resourceKey].currentPageIndex = 1; imported.settings.readerMemoryCacheSizeMb = 500;
  const out = backup.createDataBackup(imported, 'android', '1.1.76');
  let next = backup.mergeBackup(local, out, options([]), 'win');
  assert.equal(next.resourceMeta[ref.resourceKey].note, '本机'); assert.equal(next.bookmarks.length, 1); assert.equal(next.readingProgress[ref.resourceKey].currentPageIndex, 4);
  next = backup.mergeBackup(local, out, { ...options([]), prefer: 'imported', includeSettings: true }, 'win');
  assert.equal(next.resourceMeta[ref.resourceKey].note, '导入'); assert.equal(next.readingProgress[ref.resourceKey].currentPageIndex, 1); assert.equal(next.settings.readerMemoryCacheSizeMb, local.settings.readerMemoryCacheSizeMb);
});

test('import backup persists across reload, undo restores it, and a failed atomic commit keeps the previous snapshot', async t => {
  const f = await fixture(t), before = await f.service.读取应用数据(), incoming = populate(before).data;
  await f.service.导入备份数据(current => ({ ...incoming, externalReadGrants: current.externalReadGrants }));
  assert.equal(await f.service.有导入前备份(), true); assert.equal((await f.load().读取应用数据()).favorites.length, 1);
  let service = f.load(); await service.恢复导入前数据(); assert.equal((await f.load().读取应用数据()).favorites.length, 0);
  assert.equal(await service.有导入前备份(), false);
  service = f.load(); const rename = fs.rename;
  fs.rename = async (from, to) => { if (to === path.join(f.dir, 'omicomic-data.json')) throw new Error('simulated write failure'); return rename(from, to); };
  try { await assert.rejects(service.导入备份数据(current => ({ ...incoming, externalReadGrants: current.externalReadGrants })), /simulated write/); }
  finally { fs.rename = rename; }
  assert.equal((await service.读取应用数据()).favorites.length, 0); assert.equal((await f.load().读取应用数据()).favorites.length, 0);
});
