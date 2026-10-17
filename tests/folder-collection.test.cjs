const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

test('folder collection labels count child books, never loose image pages or unrelated files', async t => {
  const Module = require('node:module'), original = Module._load;
  Module._load = function(id, ...args) {
    if (id === 'electron') return { nativeImage: { createFromBuffer() { return { isEmpty: () => false, getSize: () => ({ width: 1, height: 1 }), toDataURL: () => 'data:image/png;base64,fixture' }; } } };
    return original.call(this, id, ...args);
  };
  let service;
  try { const name = require.resolve('../dist-electron/services/thumbnailService.js'); delete require.cache[name]; service = require(name); }
  finally { Module._load = original; }
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-collection-'));
  t.after(async () => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('omicomic-collection-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  await fs.copyFile(path.join(__dirname, 'fixtures/images/pixel.png'), path.join(root, 'cover.png'));
  await fs.copyFile(path.join(root, 'cover.png'), path.join(root, '2.png'));
  await fs.writeFile(path.join(root, 'info.txt'), 'metadata');
  assert.equal((await service.获取文件夹封面缩略图(root)).itemCount, undefined);
  assert.equal((await service.获取文件夹封面缩略图(root)).childFolderCount, 0);
  await fs.writeFile(path.join(root, 'single.cbz'), '');
  assert.equal((await service.获取文件夹封面缩略图(root)).itemCount, undefined);
  await fs.writeFile(path.join(root, 'second.pdf'), '');
  assert.equal((await service.获取文件夹封面缩略图(root)).itemCount, 2);
  assert.equal((await service.获取文件夹封面缩略图(root)).childFolderCount, 0, 'independent books alone do not create a folder-count label');
  await fs.mkdir(path.join(root, 'child'));
  assert.equal((await service.获取文件夹封面缩略图(root)).itemCount, 3);
  assert.equal((await service.获取文件夹封面缩略图(root)).childFolderCount, 1);
  assert.deepEqual((await service.获取文件夹封面缩略图(root)).folderSummary, {folders:1,books:2,images:2,unsupported:1});
  const parent = path.join(root, 'parent');
  await fs.mkdir(parent); await fs.mkdir(path.join(parent, 'child'));
  await fs.copyFile(path.join(root, 'cover.png'), path.join(parent, 'child', 'cover.png'));
  const inherited = await service.获取文件夹封面缩略图(parent);
  assert.equal(inherited.itemCount, 1);
  assert.equal(inherited.childFolderCount, 1, 'the parent keeps its own folder count when borrowing a child cover');
  assert.ok(inherited.url, 'a collection still borrows the first child cover');
  assert.deepEqual(inherited.folderSummary,{folders:1,books:0,images:0,unsupported:0},'borrowed cover does not overwrite parent structure');
});
