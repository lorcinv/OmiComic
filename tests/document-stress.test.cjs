const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { zip } = require('./helpers/documentFixtures.cjs');
const { PDFDocumentSource } = require('../dist-electron/services/pdfService.js');
const { EPUBDocumentSource } = require('../dist-electron/services/epubService.js');
function measure() {
  const started = performance.now(), before = process.memoryUsage().rss; let peak = before;
  const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss); }, 5);
  return () => { clearInterval(timer); peak = Math.max(peak, process.memoryUsage().rss); return { elapsedMs: +(performance.now() - started).toFixed(2), rssBeforeBytes: before, sampledRssPeakBytes: peak, rssDeltaBytes: peak - before }; };
}
const container = ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'];
function entriesFor(chapters) {
  return [container, ['OPS/book.opf', `<package><manifest>${chapters.map((_,i)=>`<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine>${chapters.map((_,i)=>`<itemref idref="c${i}"/>`).join('')}</spine></package>`], ...chapters.map((html,i)=>[`OPS/c${i}.xhtml`, html])];
}
test('512 MiB sparse PDF reads only requested ranges; close interrupts subsequent reads', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-pdf-stress-'));
  const file = path.join(dir,'sparse.pdf'); const size = 512 * 1024 * 1024;
  try {
    const handle = await fs.open(file,'w'); await handle.write('%PDF-1.7\n'); await handle.truncate(size); await handle.write(Buffer.from('%%EOF'),0,5,size-5); await handle.close();
    const stop = measure(); const source = await PDFDocumentSource.open(file);
    let readBytes = 0;
    for (let i = 0; i < 64; i++) {
      const begin = Math.floor(i * (size - 65536) / 63); const data = await source.range(begin,begin+65536); assert.equal(data.length,65536); readBytes += data.length;
    }
    const pending = source.range(size-1024*1024,size); const closed = source.close();
    await Promise.allSettled([pending,closed]); await assert.rejects(source.range(0,5));
    const metrics = stop();
    assert.equal(readBytes,4*1024*1024);
    assert.ok(metrics.rssDeltaBytes < 128*1024*1024,'range reader must not allocate the complete 512 MiB source');
    t.diagnostic(JSON.stringify({ dataset:'sparse PDF transport only (not a parseable/rendered PDF)', logicalBytes:size, physicalBytes:(await fs.stat(file)).blocks*512, sequentialRanges:64, bytesRead:readBytes, ...metrics }));
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('1000-chapter EPUB indexes lazily and reads three distant chapters with bounded payloads', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-epub-stress-')); const file = path.join(dir,'many.epub');
  const chapters = Array.from({length:1000},(_,i)=>`<h1>Chapter ${i}</h1><p>${'reader text '.repeat(2800)}</p>`);
  await fs.writeFile(file,zip(entriesFor(chapters))); const size = (await fs.stat(file)).size;
  const stop = measure(); const book = new EPUBDocumentSource(file);
  try {
    const index = await book.request('index'); assert.equal(index.length,1000);
    let returnedBytes = 0;
    for (const number of [0,500,999]) { const html = await book.request('chapter',number); assert.match(html,new RegExp(`Chapter ${number}`)); assert.ok(html.length < 40000); returnedBytes += Buffer.byteLength(html); }
    const metrics = stop();
    assert.ok(metrics.rssDeltaBytes < 160*1024*1024,'worker must stay within its bounded heap');
    t.diagnostic(JSON.stringify({ dataset:'stored EPUB', chapters:1000, zipEntries:1002, archiveBytes:size, chaptersRendered:3, returnedBytes, ...metrics }));
  } finally { stop(); await book.close(); await fs.rm(dir,{recursive:true,force:true}); }
});
test('malformed, oversized markup, and high-ratio EPUB entries fail in bounded time', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-epub-invalid-'));
  const cases = [
    ['not-a-zip', Buffer.from('bad file'), 'index'],
    ['missing-package', zip([container]), 'index'],
    ['oversized-chapter', zip(entriesFor(['x'.repeat(4*1024*1024+1)])), 'chapter'],
    ['compressed-bomb', zip(entriesFor(['x'.repeat(2*1024*1024)]),true), 'chapter'],
  ];
  try {
    for (const [name,data,method] of cases) {
      const file = path.join(dir,`${name}.epub`); await fs.writeFile(file,data); const stop = measure(); const book = new EPUBDocumentSource(file);
      try { if (method==='chapter') await book.request('index'); await assert.rejects(book.request(method,0)); }
      finally { await book.close(); t.diagnostic(JSON.stringify({ dataset:name, archiveBytes:data.length,...stop() })); }
    }
  } finally { await fs.rm(dir,{recursive:true,force:true}); }
});
test('EPUB close rejects in-flight initialization and rejects new work', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-epub-cancel-')); const file = path.join(dir,'cancel.epub');
  await fs.writeFile(file,zip(entriesFor(Array.from({length:1000},(_,i)=>`<p>${i}</p>`))));
  const book = new EPUBDocumentSource(file); const stop = measure();
  try {
    const result = assert.rejects(book.request('index'),/关闭|结束/); await book.close(); await result;
    await assert.rejects(book.request('chapter',0)); t.diagnostic(JSON.stringify({ dataset:'1000-chapter immediate cancellation',...stop() }));
  } finally { stop(); await book.close(); await fs.rm(dir,{recursive:true,force:true}); }
});
