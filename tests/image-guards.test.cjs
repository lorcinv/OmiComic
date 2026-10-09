// Exercises the actual two main.ts functions in isolation. nativeImage is a spy,
// not a decoder: these tests establish pre-decode guards/resize arguments only.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const fixtures = path.join(__dirname, 'fixtures/images');
const main = fs.readFileSync(path.join(__dirname, '../electron/main.ts'), 'utf8');
const parsed = ts.createSourceFile('main.ts', main, ts.ScriptTarget.Latest, true);
const names = ['读取图片像素尺寸', '创建受限页面预览'];
const functions = parsed.statements.filter(statement => ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text));
assert.equal(functions.length, 2, 'Expected production guard functions must still exist');
const compiled = ts.transpileModule(functions.map(statement => statement.getText(parsed)).join('\n') + '\nexports.dimensions = 读取图片像素尺寸; exports.preview = 创建受限页面预览;', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
function load(nativeImage) {
  const exports = {};
  vm.runInNewContext(compiled, { exports, nativeImage, Buffer });
  return exports;
}
function fixture(name) { return fs.readFileSync(path.join(fixtures, name)); }

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

test('original PNG fixtures have intact chunk CRCs and explicit real dimensions', () => {
  const { dimensions } = load({});
  for (const [name, width, height] of [['pixel.png', 1, 1], ['portrait-3000x4000.png', 3000, 4000], ['oversized-8192x4096.png', 8192, 4096]]) {
    const bytes = fixture(name);
    for (let offset = 8; offset < bytes.length;) {
      const size = bytes.readUInt32BE(offset);
      assert.equal(crc32(bytes.subarray(offset + 4, offset + 8 + size)), bytes.readUInt32BE(offset + 8 + size), `${name} CRC`);
      offset += 12 + size;
    }
    const result = dimensions(bytes);
    assert.equal(result.width, width); assert.equal(result.height, height);
  }
});

test('33,554,432-pixel PNG and JPEG are refused before any native decode', t => {
  let decodeCalls = 0;
  const { dimensions, preview } = load({ createFromBuffer() { decodeCalls++; throw new Error('Native decode must not happen'); } });
  for (const name of ['oversized-8192x4096.png', 'oversized-8192x4096.jpg']) {
    const bytes = fixture(name);
    const size = dimensions(bytes);
    assert.equal(size.width, 8192); assert.equal(size.height, 4096);
    assert.throws(() => preview(bytes), /PREVIEW_TOO_LARGE/);
    t.diagnostic(JSON.stringify({ fixture: name, compressedBytes: bytes.length, width: size.width, height: size.height, rgbaDecodedBytesIfDecoded: size.width * size.height * 4, nativeDecodeCalls: decodeCalls }));
  }
  assert.equal(decodeCalls, 0);
});

test('12 MiB compressed-byte cap and unrecognized headers are rejected before decoding', () => {
  let decodeCalls = 0;
  const { preview } = load({ createFromBuffer() { decodeCalls++; throw new Error('unexpected native decode'); } });
  const oversizedBytes = Buffer.concat([fixture('pixel.png'), Buffer.alloc(12 * 1024 * 1024)]);
  assert.throws(() => preview(oversizedBytes), /PREVIEW_TOO_LARGE/);
  for (const bytes of [Buffer.alloc(0), Buffer.from('bad image'), Buffer.from([0xff, 0xd8, 0xff])]) assert.throws(() => preview(bytes), /PREVIEW_TOO_LARGE/);
  assert.equal(decodeCalls, 0);
});

test('12-megapixel portrait requests 270×360 preview; invalid native image is rejected', () => {
  let resizeOptions;
  const { preview } = load({ createFromBuffer() { return { isEmpty: () => false, resize(options) { resizeOptions = options; return { toJPEG: () => Buffer.from('spy-preview'), getSize: () => options }; } }; } });
  const result = preview(fixture('portrait-3000x4000.png'));
  assert.equal(resizeOptions.width, 270); assert.equal(resizeOptions.height, 360);
  assert.equal(result.width, 270); assert.equal(result.height, 360);
  const invalid = load({ createFromBuffer() { return { isEmpty: () => true }; } });
  assert.throws(() => invalid.preview(fixture('pixel.png')), /PREVIEW_INVALID/);
});

test('library cover thumbnails also reject oversized raster headers before native decoding', async () => {
  const Module = require('node:module'); const original = Module._load;
  let calls = 0;
  Module._load = function(id, ...args) {
    if (id === 'electron') return { nativeImage: { createFromBuffer() { calls++; throw new Error('Decoder must not be called'); } } };
    return original.call(this, id, ...args);
  };
  let service;
  try { const file = require.resolve('../dist-electron/services/thumbnailService.js'); delete require.cache[file]; service = require(file); }
  finally { Module._load = original; }
  for (const name of ['oversized-8192x4096.png', 'oversized-8192x4096.jpg']) {
    const result = await service.获取图片缩略图(path.join(fixtures, name));
    assert.equal(result.url, null);
  }
  assert.equal(calls, 0);
});
