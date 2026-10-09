const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { PDFDocumentSource } = require('../dist-electron/services/pdfService.js');
const { EPUBDocumentSource } = require('../dist-electron/services/epubService.js');
const { resolveEpubPath, sanitizeChapter } = require('../dist-electron/services/epubWorker.js');

test('EPUB paths stay inside archive; no network, drive, or traversal paths', () => {
  assert.equal(resolveEpubPath('OPS/text/chapter.xhtml', '../img/1.png'), 'OPS/img/1.png');
  for (const value of ['https://bad/x', 'file:///etc/passwd', '../../escape', '%2e%2e/%2e%2e/secret', '//bad/x', 'C:\\secret', '%00x']) assert.throws(() => resolveEpubPath('OPS/book.opf', value));
});
test('chapter sanitizer removes scripts, events, navigation, SVG and external resources', () => {
  const result = sanitizeChapter('<script>alert(1)</script><iframe src="file:///secret"></iframe><img src="https://bad/a.png" onerror="alert(1)"><svg><script>x</script></svg><a href="javascript:alert(1)">hello</a><p style="background:url(https://bad)">safe</p><img src="data:image/png;base64,YQ==">');
  assert.doesNotMatch(result, /script|iframe|onerror|https:|file:|javascript:|<svg|style=/i);
  assert.match(result, /hello/); assert.match(result, /data:image\/png;base64,YQ==/);
});
test('PDF range source validates header and bounds and returns exact bytes', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-pdf-'));
  try {
    const file = path.join(dir, 'a.pdf'); await fs.writeFile(file, '%PDF-1.7\nhello');
    const source = await PDFDocumentSource.open(file);
    assert.equal(Buffer.from(await source.range(0, 5)).toString(), '%PDF-');
    await assert.rejects(source.range(-1, 4)); await assert.rejects(source.range(0, source.size + 1)); await source.close();
    await fs.writeFile(file, 'not-a-pdf'); await assert.rejects(PDFDocumentSource.open(file));
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});
// Small stored ZIP fixture builder, independent of any external test utilities.
const { zip } = require('./helpers/documentFixtures.cjs');
test('EPUB worker indexes spine order, renders one isolated chapter, then cancels safely', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-epub-'));
  const file = path.join(dir, 'a.epub');
  const entries = [
    ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'],
    ['OPS/book.opf', '<package><manifest><item id="second" href="b.xhtml" media-type="application/xhtml+xml"/><item id="first" href="a.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>'],
    ['OPS/a.xhtml', '<html><body><h1>First chapter</h1><script>evil()</script><img src="i.png"/><img src="https://bad/x"/></body></html>'],
    ['OPS/b.xhtml', '<p>Second chapter</p>'], ['OPS/i.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a26kAAAAASUVORK5CYII=', 'base64')],
  ];
  await fs.writeFile(file, zip(entries)); const book = new EPUBDocumentSource(file);
  try {
    assert.equal((await book.request('index')).length, 2);
    const first = await book.request('chapter', 0);
    assert.match(first, /First chapter/); assert.doesNotMatch(first, /evil|https:\/\/bad/); assert.match(first, /default-src 'none'/); assert.match(first, /data:image\/png;base64/);
    assert.match(await book.request('chapter', 1), /Second chapter/);
    await assert.rejects(book.request('chapter', 2));
    await book.close(); await assert.rejects(book.request('index'));
  } finally { await book.close(); await fs.rm(dir, { recursive: true, force: true }); }
});

test('EPUB raster header checks reject disguised SVG and giant surfaces', () => {
  const { safeRasterImage } = require('../dist-electron/services/documentImageSafety.js');
  assert.equal(safeRasterImage(Buffer.from('<svg/>')), false);
  const png = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(png); png.writeUInt32BE(100000,16); png.writeUInt32BE(100000,20);
  assert.equal(safeRasterImage(png), false); png.writeUInt32BE(100,16); png.writeUInt32BE(100,20); assert.equal(safeRasterImage(png), true);
});

test('EPUB repeated-image amplification is rejected before serializing, ordinary duplicates survive', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-epub-repeat-'));
  // A valid one-pixel PNG with trailing padding: one entry remains small, but 90 data URLs would exceed 60 MiB.
  const png = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a26kAAAAASUVORK5CYII=', 'base64'),Buffer.alloc(512*1024)]);
  const file = path.join(dir,'repeated.epub');
  await fs.writeFile(file,zip([
    ['META-INF/container.xml','<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'],
    ['OPS/book.opf','<package><manifest><item id="ordinary" href="ordinary.xhtml" media-type="application/xhtml+xml"/><item id="malicious" href="malicious.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="ordinary"/><itemref idref="malicious"/></spine></package>'],
    ['OPS/ordinary.xhtml','<p>两次插图</p>'+ '<img src="i.png"/>'.repeat(2)],
    ['OPS/malicious.xhtml','<p>重复图片膨胀</p>'+ '<img src="i.png"/>'.repeat(90)],
    ['OPS/i.png',png],
  ]));
  const book = new EPUBDocumentSource(file);
  try {
    assert.equal((await book.request('index')).length,2);
    const html = await book.request('chapter',0);
    assert.equal((html.match(/data:image\/png;base64,/g)||[]).length,2);
    assert.match(html,/两次插图/);
    await assert.rejects(book.request('chapter',1),/序列化内容超过安全上限/);
    assert.match(await book.request('chapter',0),/两次插图/,'a rejected chapter must not poison the document session');
  } finally { await book.close(); await fs.rm(dir,{recursive:true,force:true}); }
});
test('serialized EPUB budget charges every reference before concatenating base64 payloads', () => {
  const { embedChapterImages } = require('../dist-electron/services/epubWorker.js');
  const payload='data:image/png;base64,'+'A'.repeat(1024*1024);
  assert.throws(()=>embedChapterImages('<img src="i.png"/>'.repeat(50),new Map([['i.png',payload]])),/序列化内容超过安全上限/);
  assert.throws(()=>embedChapterImages('<img src="i.png"/>'.repeat(800),new Map([['i.png','data:image/png;base64,'+'A'.repeat(Math.ceil(32*1024/3)*4)]])),/序列化内容超过安全上限/);
  assert.equal(embedChapterImages('<p>中文</p><img src="missing.png"/>',new Map()),'<p>中文</p><img src=""/>');
});

test('document authorization accepts a ..name child but rejects an outside real path', async () => {
  const Module = require('node:module'), { EventEmitter } = require('node:events');
  const handlers = new Map(), originalLoad = Module._load;
  let registerDocumentIpc;
  try {
    Module._load = function(name,...args) { return name === 'electron' ? { ipcMain: { handle: (channel,fn) => handlers.set(channel,fn) } } : originalLoad.call(this,name,...args); };
    ({registerDocumentIpc} = require('../dist-electron/services/documentService.js'));
  } finally { Module._load = originalLoad; }
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-document-root-'));
  const root = path.join(dir,'library'); await fs.mkdir(root);
  const child = path.join(root,'..comic.pdf'), outside = path.join(dir,'outside.pdf');
  await fs.writeFile(child,'%PDF-1.7\n'); await fs.writeFile(outside,'%PDF-1.7\n');
  const sender = new EventEmitter(); sender.id = 101; sender.mainFrame = {};
  const event = {sender,senderFrame:sender.mainFrame};
  registerDocumentIpc(()=>root);
  try {
    const result = await handlers.get('document:open')(event,{id:'valid-doc-101',path:child,type:'pdf'});
    assert.equal(result.ok,true,JSON.stringify(result));
    assert.equal((await handlers.get('document:close')(event,'valid-doc-101')).ok,true);
    const rejected = await handlers.get('document:open')(event,{id:'outside-doc-101',path:outside,type:'pdf'});
    assert.equal(rejected.ok,false); assert.match(rejected.error.message,/未授权/);
  } finally { sender.emit('destroyed'); await fs.rm(dir,{recursive:true,force:true}); }
});
