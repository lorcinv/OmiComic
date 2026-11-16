const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {randomUUID,createHash}=require('node:crypto');
const {zip,padded}=require('./helpers/largeAnimationFixtures.cjs');
const {EPUBDocumentSource}=require('../dist-electron/services/epubService.js');
const {createEpubImageSession,epubImageResponse}=require('../dist-electron/services/epubImageStreams.js');
const {sanitizeChapter}=require('../dist-electron/services/epubWorker.js');

test('large EPUB animation is streamed intact, uses a small chapter, and is revoked on close',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omi-epub-stream-'));let book;
  t.after(async()=>{await book?.close();assert.ok(path.basename(root).startsWith('omi-epub-stream-'));await fs.rm(root,{recursive:true,force:true});});
  const data=padded(await fs.readFile(path.join(__dirname,'fixtures/animations/animated.gif')),'gif',9*1024**2);
  const file=path.join(root,'book.epub');await fs.writeFile(file,zip([
    ['META-INF/container.xml','<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'],
    ['book.opf','<package><manifest><item id="a" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/></spine></package>'],
    ['chapter.xhtml','<html><body><p>Before animation</p><img src="large.gif"/><p>After animation</p></body></html>'],['large.gif',data],
  ]));
  book=new EPUBDocumentSource(file);await book.request('index');const html=await book.request('chapter',0);
  assert.ok(html.length<4096);assert.match(html,/Before animation/);assert.match(html,/data-omi-animated="true"/);
  const url=new URL(html.match(/src="(omicomic-image:[^"]+)"/)[1]);
  const response=await epubImageResponse(url);assert.equal(response.status,200);
  const actual=createHash('sha256');for await(const chunk of response.body)actual.update(chunk);
  assert.equal(actual.digest('hex'),createHash('sha256').update(data).digest('hex'));
  const controller=new AbortController(),cancelled=await epubImageResponse(url,controller.signal);controller.abort();
  await assert.rejects(()=>cancelled.arrayBuffer());
  await book.close();assert.equal((await epubImageResponse(url)).status,404);
});
test('EPUB stream validates CRC and rejects changed files and unknown capabilities',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omi-epub-stream-')),file=path.join(root,'bad.epub'),id=randomUUID();
  t.after(async()=>{assert.ok(path.basename(root).startsWith('omi-epub-stream-'));await fs.rm(root,{recursive:true,force:true});});
  const bytes=zip([['a.gif',Buffer.from('not-a-valid-crc')]]);bytes[35]^=1;await fs.writeFile(file,bytes);
  const session=createEpubImageSession(file);t.after(()=>session.close());session.register([{id,name:'a.gif',mime:'image/gif',bytes:15}]);
  const url=new URL(session.base+id);assert.equal((await epubImageResponse(new URL(session.base+randomUUID()))).status,404);
  await assert.rejects(async()=>{const response=await epubImageResponse(url);await response.arrayBuffer();},/校验|改变/);
  await fs.appendFile(file,'changed');assert.equal((await epubImageResponse(url)).status,410);
});
test('publisher HTML cannot inject another file capability',()=>{
  const base=`omicomic-image://epub/${randomUUID()}/`,url=base+randomUUID();
  assert.doesNotMatch(sanitizeChapter(`<img src="${url}">`),/src=/);
  assert.doesNotMatch(sanitizeChapter('<img src="file:///private.gif">',base),/src=/);
  assert.match(sanitizeChapter(`<img src="${url}">`,base),/src="omicomic-image:/);
});
