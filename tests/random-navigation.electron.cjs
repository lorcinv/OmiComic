const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron, expect } = require('@playwright/test');
const { zip } = require('./helpers/documentFixtures.cjs');

test('real Electron library restores a directory and reads a stable recursive random batch', { timeout: 120000 }, async t => {
  const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-random-browse-'));
  const books = path.join(fixture, '漫画库'), profile = path.join(fixture, 'profile');
  await fs.mkdir(profile); await fs.mkdir(books);
  const image = await fs.readFile('tests/fixtures/images/pixel.png');
  const nestedPath = path.join(books,'Nested ZIP.cbz');
  await fs.writeFile(nestedPath,zip([['Container.zip',zip([['1.png',image],['2.png',image]])]]));
  for (let index = 0; index < 90; index++) {
    const book = path.join(books, `Group ${String(index).padStart(3, '0')}`, '漫画');
    await fs.mkdir(book, { recursive: true });
    await fs.writeFile(path.join(book, '1.png'), image);
    await fs.writeFile(path.join(book, '2.png'), image);
  }
  let app;
  t.after(async () => {
    if (app) await app.close();
    assert.equal(path.dirname(fixture), path.resolve(os.tmpdir()));
    assert.ok(path.basename(fixture).startsWith('omicomic-random-browse-'));
    await fs.rm(fixture, { recursive: true, force: true });
  });
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: profile };
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const packaged = process.env.OMICOMIC_TEST_EXE;
  app = await _electron.launch({ executablePath: packaged || require('electron'), args: packaged ? [] : ['.'], env });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1440, 960));
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.waitForFunction(() => window.omicomic !== undefined);
  await page.evaluate(async books => {
    const api = window.omicomic;
    const result = await api.addLibraryRoot({ path: books, name: '真实随机测试库' });
    if (!result.ok) throw new Error(result.error.message);
    await api.updateLibraryState({ lastActiveRootPath: books, lastCurrentPath: books });
    await api.updateSettings({ cardScale: 40, pageSize: 50 });
  }, books);
  await page.reload(); await page.locator('.omi-home__library').click();
  const native = await page.evaluate(async ({books,nestedPath}) => {
    const api=window.omicomic,firstStart=performance.now();
    let first=await api.scanLibrary(books,false,false,{incremental:true,restart:true});
    while(first.ok&&!first.data.items.length&&!first.data.complete){await new Promise(resolve=>setTimeout(resolve,40));first=await api.scanLibrary(books,false,false,{incremental:true});}
    if(!first.ok)throw new Error(first.error.message);
    const firstBatchMs=performance.now()-firstStart,firstBatchItems=first.data.items.length,firstBatchDirectories=first.data.directories,firstBatchComplete=first.data.complete;
    const start=performance.now(),cold=await api.scanLibrary(books,true),coldMs=performance.now()-start;
    const again=performance.now(),warm=await api.scanLibrary(books),warmMs=performance.now()-again;
    const book=await api.getResourcePages({path:nestedPath,type:'archive'});
    if(!cold.ok||!warm.ok||!book.ok)throw new Error(JSON.stringify({cold,warm,book}));
    if(book.data.total!==2)throw new Error('Nested pages missing');
    const page=await api.getPageImage(book.data.pages[0]);if(!page.ok)throw new Error(page.error.message);
    const image=new Image();image.src=page.data.url;await image.decode();
    return {directories:cold.data.directories,imageBooks:cold.data.items.filter(file=>file.containsImages).length,firstBatchMs,firstBatchItems,firstBatchDirectories,firstBatchComplete,coldMs,warmMs,nestedPages:book.data.total,nestedImageWidth:image.naturalWidth};
  },{books,nestedPath});
  assert.equal(native.directories,181);assert.equal(native.imageBooks,90);assert.ok(native.nestedImageWidth>0);
  assert.ok(native.firstBatchItems>0);assert.equal(native.firstBatchComplete,false);assert.ok(native.firstBatchDirectories<181);
  await fs.writeFile('test-results/installed-native-catalog.json',JSON.stringify(native,null,2));
  const list = page.getByLabel('当前目录文件列表', { exact: true });
  await expect(page.locator('[data-library-index="0"]')).toBeVisible();
  await list.evaluate(element => { element.scrollTop = 1500; });
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(1000);
  const index = await list.evaluate(element => {
    const top = element.getBoundingClientRect().top;
    const card = [...element.querySelectorAll('[data-library-index]')].find(card => card.getBoundingClientRect().bottom > top + 2);
    return Number(card.dataset.libraryIndex) + 7;
  });
  const card = page.locator(`[data-library-index="${index}"]`);
  await card.scrollIntoViewIfNeeded();
  const before = await list.evaluate(element => element.scrollTop);
  await card.dblclick();
  await expect(page.locator('.resource-details strong', { hasText: /^漫画$/ })).toHaveCount(1);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(before);
  await expect(page.getByRole('button', { name: '前进', exact: true })).toBeEnabled();
  await page.getByRole('switch', { name: '随机阅读', exact: true }).click();
  await expect(page.getByRole('button', { name: '重随机', exact: true })).toBeEnabled();
  await expect(page.locator('.library-opening-status')).toHaveCount(0, { timeout: 20000 });
  await page.getByRole('button', { name: '重随机', exact: true }).click();
  await expect(page.locator('.resource-card')).toHaveCount(50);
  await expect(page.locator('.pagination-bar')).toHaveCount(0);
  const batch = await page.locator('.resource-card').evaluateAll(elements => elements.map(element => element.getAttribute('data-selection-key')));
  assert.equal(new Set(batch).size, 50);
  await page.locator('.resource-card').first().dblclick();
  await expect(page.locator('.reader-layout')).toBeVisible();
  await page.locator('.reader-back').click();
  await expect(page.getByRole('switch', { name: '随机阅读', exact: true })).toBeChecked();
  assert.deepEqual(await page.locator('.resource-card').evaluateAll(elements => elements.map(element => element.getAttribute('data-selection-key'))), batch);
  await page.screenshot({ path: 'test-results/random-electron-real-library.png' });
  await page.getByRole('switch', { name: '随机阅读', exact: true }).click();
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(before);
  assert.deepEqual(errors, []);
});
