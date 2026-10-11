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
  await fs.writeFile(path.join(root, 'single.cbz'), '');
  assert.equal((await service.获取文件夹封面缩略图(root)).itemCount, undefined);
  await fs.writeFile(path.join(root, 'second.pdf'), '');
  assert.equal((await service.获取文件夹封面缩略图(root)).itemCount, 2);
  await fs.mkdir(path.join(root, 'child'));
  assert.equal((await service.获取文件夹封面缩略图(root)).itemCount, 3);
  const parent = path.join(root, 'parent');
  await fs.mkdir(parent); await fs.mkdir(path.join(parent, 'child'));
  await fs.copyFile(path.join(root, 'cover.png'), path.join(parent, 'child', 'cover.png'));
  const inherited = await service.获取文件夹封面缩略图(parent);
  assert.equal(inherited.itemCount, 1);
  assert.ok(inherited.url, 'a collection still borrows the first child cover');
});
