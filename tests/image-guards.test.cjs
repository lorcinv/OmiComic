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
const names = ['读取图片像素尺寸'];
const functions = parsed.statements.filter(statement => ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text));
assert.equal(functions.length, 1, 'Production header inspector must exist');
const compiled = ts.transpileModule(functions.map(statement => statement.getText(parsed)).join('\n') + '\nexports.dimensions = 读取图片像素尺寸;', { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
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

test('native page previews serialize originals, bound output and share cached requests', async () => {
  const Module=require('node:module'),original=Module._load;let calls=0,active=0,peak=0;const releases=[];
  Module._load=function(id,...args){if(id==='./thumbnailDecoder')return {decodeThumbnail:async()=>{
    calls++;peak=Math.max(peak,++active);
    await new Promise(resolve=>releases.push(resolve));active--;return {width:270,height:360,url:'data:image/png;base64,small'};
  }};return original.call(this,id,...args);};
  let preview;try{const file=require.resolve('../dist-electron/services/pagePreviewService.js');delete require.cache[file];preview=require(file).pagePreview;}finally{Module._load=original;}
  const {dimensions}=load({});
  const first=preview('one','/ordinary.png',dimensions),shared=preview('one','/ordinary.png',dimensions),second=preview('two','/ordinary2.png',dimensions);
  assert.equal(first,shared);await new Promise(r=>setImmediate(r));assert.equal(calls,1);releases.shift()();
  const result=await first;assert.equal(result.width,270);await new Promise(r=>setImmediate(r));assert.equal(calls,2);releases.shift()();await second;assert.equal(peak,1);
  await preview('one','/ordinary.png',dimensions);assert.equal(calls,2);
});

test('library covers reject surfaces above their 40 MP scan limit before native decoding', async t => {
  const Module = require('node:module'); const original = Module._load;
  let calls = 0;
  Module._load = function(id, ...args) {
    if (id === 'electron') return { nativeImage: { createFromBuffer() { calls++; throw new Error('Decoder must not be called'); } } };
    return original.call(this, id, ...args);
  };
  let service;
  try { const file = require.resolve('../dist-electron/services/thumbnailService.js'); delete require.cache[file]; service = require(file); }
  finally { Module._load = original; }
  const fs = require('node:fs/promises'), os = require('node:os');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-cover-guard-'));
  t.after(async () => { assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('omicomic-cover-guard-')); await fs.rm(root,{recursive:true,force:true}); });
  const png = Buffer.from(fixture('oversized-8192x4096.png'));
  png.writeUInt32BE(8192,20);
  const file = path.join(root,'over-40mp.png'); await fs.writeFile(file,png);
  assert.equal((await service.获取图片缩略图(file)).url,null);
  assert.equal(calls, 0);
});
