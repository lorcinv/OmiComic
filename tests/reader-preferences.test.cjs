const test = require('node:test');
const assert = require('node:assert/strict');
const { sortReaderPages, pageIdentity, resolvePageIndex, normalizeAdjustments, normalizeAutoRead, bookmarkMatches } = require('../dist-electron/shared/readerPreferences.js');
const {compareComicPagePaths}=require('../dist-electron/shared/comicPageSort.js');
const pages = [10, 2, 1, 20, 3].map((n, index) => ({ index, type: 'archive-image', name: `${n}.png`, archiveInnerPath: `chapter/${n}.png`, sourcePath: 'book.cbz', modifiedAt: n === 20 ? undefined : n === 10 ? 100 : 200 }));
const names = mode => sortReaderPages(pages, mode).map(p => p.name);

test('mixed scan prefixes calibrate page numbers while preserving cover, suffixes and directories',()=>{
  const input=['书名100.png','P010.png','书名090.png','P002.png','P001.png','P000C.jpg','_c.png','P000A.jpg','[0.jpg','P000B.jpg'];
  const expected=['_c.png','[0.jpg','P000A.jpg','P000B.jpg','P000C.jpg','P001.png','P002.png','P010.png','书名090.png','书名100.png'];
  const rows=input.map((name,index)=>({name,index,type:'archive-image',sourcePath:'book.cbz',archiveInnerPath:name}));
  assert.deepEqual(sortReaderPages(rows,'name-asc').map(p=>p.name),expected);
  assert.deepEqual(sortReaderPages(rows,'name-desc').map(p=>p.name),[...expected].reverse());
  const nested=['chapter10/P001.png','chapter2/书名090.png','chapter2/P001.png','cover.png'];
  assert.deepEqual([...nested].sort(compareComicPagePaths),['cover.png','chapter2/P001.png','chapter2/书名090.png','chapter10/P001.png']);
  assert.equal(resolvePageIndex(sortReaderPages(rows,'name-asc'),'archive-image:书名090.png',undefined,0),8);
});

test('calibrated filename order remains transitive and independent of ZIP entry order',()=>{
  const names=['cover.png','P000A.jpg','[0.jpg','P002.png','书名010.png','foo3.jpg','bar20.jpg','baz.jpg','chapter1/01.png','chapter2/P001.png','1-02.png','1-10.png'];
  const sorted=[...names].sort(compareComicPagePaths);
  assert.deepEqual([...names].reverse().sort(compareComicPagePaths),sorted);
  for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++)assert.ok(compareComicPagePaths(sorted[i],sorted[j])<0);
});
test('natural sort, time ties and missing times are deterministic in either direction', () => {
  assert.deepEqual(names('name-asc'), ['1.png','2.png','3.png','10.png','20.png']);
  assert.deepEqual(names('name-desc'), ['20.png','10.png','3.png','2.png','1.png']);
  assert.deepEqual(names('time-asc'), ['10.png','1.png','2.png','3.png','20.png']);
  assert.deepEqual(names('time-desc'), ['1.png','2.png','3.png','10.png','20.png']);
  for (const mode of ['name-asc','name-desc','time-asc','time-desc']) assert.deepEqual(sortReaderPages([...pages].reverse(), mode), sortReaderPages(pages, mode));
  assert.equal(pages[0].index, 0);
});
test('physical identity survives sorting and path rename; legacy bookmarks migrate by image name', () => {
  const id = pageIdentity(pages[1]);
  assert.equal(pageIdentity({ ...pages[1], sourcePath: 'renamed.cbz', index: 90 }), id);
  const ordered = sortReaderPages(pages, 'name-desc');
  assert.equal(resolvePageIndex(ordered, id, undefined, 0), 3);
  assert.equal(bookmarkMatches({ pageIndex: 0, pageName: 'chapter/2.png', sourceType: 'archive' }, 3, id), true);
  assert.equal(bookmarkMatches({ pageIndex: 3, pageId: 'another', sourceType: 'archive' }, 3, id), false);
  assert.notEqual(pageIdentity({ ...pages[0], type: 'epub-chapter', name: '重复章节', index: 0 }), pageIdentity({ ...pages[0], type: 'epub-chapter', name: '重复章节', index: 1 }));
});
test('malformed persisted adjustments and automation remain bounded and originally disabled', () => {
  assert.equal(normalizeAdjustments({}).enabled, false);
  const settings = normalizeAdjustments({ gamma: 0, brightness: Infinity, sharpen: 300, denoise: -1 });
  assert.equal(settings.gamma, .5); assert.equal(settings.brightness, 100); assert.equal(settings.sharpen, 100); assert.equal(settings.denoise, 0);
  assert.deepEqual(normalizeAutoRead({ intervalSeconds: 0, scrollPixelsPerSecond: 9999 }), { intervalSeconds: 1, scrollPixelsPerSecond: 400 });
});
