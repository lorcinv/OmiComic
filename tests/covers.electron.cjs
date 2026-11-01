const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { _electron, expect } = require('@playwright/test');
const { zip } = require('./helpers/documentFixtures.cjs');
const { Resvg } = require('@resvg/resvg-js');

test('real PDF/EPUB and collection covers render, stay bounded, and never interrupt the foreground document', { timeout: 90000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omicomic-covers-'));
  const profile = path.join(root, 'profile'), books = path.join(root, 'Books');
  await fs.mkdir(profile); await fs.mkdir(books);
  const pixel = await fs.readFile('tests/fixtures/images/pixel.png');
  const pdf = await fs.readFile('tests/fixtures/documents/three-pages.pdf');
  await fs.writeFile(path.join(books, 'First.pdf'), pdf);
  await fs.writeFile(path.join(books, 'Broken.pdf'), 'not a PDF');
  for (const [name, cover] of [['Front.epub', 'epub3'], ['Legacy.epub', 'epub2'], ['Illustrated.epub', 'chapter'], ['TextOnly.epub', 'none']]) {
    await fs.writeFile(path.join(books, name), zip([
      ['META-INF/container.xml', '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>'],
      ['OPS/book.opf', `<package>${cover === 'epub2' ? '<metadata><meta name="cover" content="artwork"/></metadata>' : ''}<manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/>${cover === 'epub3' || cover === 'epub2' ? `<item id="artwork" href="art/one.png" media-type="image/png" ${cover === 'epub3' ? 'properties="cover-image"' : ''}/>` : ''}</manifest><spine><itemref idref="one"/></spine></package>`],
      ['OPS/one.xhtml', `<h1>EPUB 内容</h1>${cover === 'chapter' ? '<img src="art/one.png"/>' : ''}`], ['OPS/art/one.png', pixel],
    ]));
  }
  const collection = path.join(books, 'Collection'); await fs.mkdir(collection);
  await fs.writeFile(path.join(collection, '01-first.cbz'), zip([['1.png', pixel]]));
  await fs.writeFile(path.join(collection, '02-note.txt'), 'fixture');
  await fs.writeFile(path.join(collection, '03-second.cbz'), zip([['1.png', pixel]]));
  const pdfCollection = path.join(books, 'PDF Collection'); await fs.mkdir(pdfCollection);
  await fs.mkdir(path.join(pdfCollection, 'Child'));
  await fs.writeFile(path.join(pdfCollection, 'Child', 'nested.pdf'), pdf);
  const mixed = path.join(books, 'Mixed Folder'); await fs.mkdir(mixed);
  await fs.mkdir(path.join(mixed,'Nested'));
  await fs.writeFile(path.join(mixed,'cover.png'),pixel);
  await fs.writeFile(path.join(mixed,'unsupported.psd'),'unsupported fixture');
  const pairs = path.join(books, 'Pair Book'); await fs.mkdir(pairs);
  for (let index = 1; index <= 10; index++) {
    const portrait = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><rect width="600" height="900" fill="${index % 2 ? '#bacbdf' : '#d1dfeb'}"/><text x="300" y="480" font-family="Arial" font-size="120" fill="#466385" text-anchor="middle">${index}</text></svg>`).render().asPng();
    await fs.writeFile(path.join(pairs, `${index}.png`), portrait);
  }
  await fs.writeFile(path.join(profile, 'omicomic-data.json'), JSON.stringify({ version: 1, library: { roots: [{ path: books, name: 'Books', addedAt: 1, lastOpenedAt: 1 }], lastActiveRootPath: books, lastCurrentPath: books } }));
  const env = { ...process.env, OMICOMIC_TEST_HEADLESS: '1', OMICOMIC_TEST_PROFILE: profile }; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  const executablePath = process.env.OMICOMIC_PACKAGED_EXE || require('electron');
  let electron;
  t.after(async () => {
    if (electron) await electron.close();
    assert.equal(path.dirname(root), path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('omicomic-covers-'));
    await fs.rm(root, { recursive: true, force: true });
  });
  electron = await _electron.launch({ executablePath, args: process.env.OMICOMIC_PACKAGED_EXE ? [] : ['.'], env });
  await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).webContents.setBackgroundThrottling(false));
  const page = await electron.firstWindow(); await page.emulateMedia({ reducedMotion: 'reduce' });
  // Capture the actual Electron surface: CDP capture can wait indefinitely for
  // a hidden test window's compositor after a long sequence of page turns.
  const screenshot=async filename=>{
    // DOM decode can precede the hidden window's compositor commit. Capture
    // only after that same content has had actual paint opportunities.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const capture=await electron.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>!w.getParentWindow()).webContents.capturePage(undefined,{stayAwake:true}).then(image=>{
      const pixels=image.getBitmap(),pages=[0,0];
      for(let n=0;n<pixels.length;n+=4){
        if(pixels[n+1]===223&&(pixels[n]===235&&pixels[n+2]===209||pixels[n]===209&&pixels[n+2]===235))pages[0]++;
        if(pixels[n+1]===203&&(pixels[n]===223&&pixels[n+2]===186||pixels[n]===186&&pixels[n+2]===223))pages[1]++;
      }
      return {url:image.toDataURL(),pages};
    }));
    assert.match(capture.url,/^data:image\/png;base64,/);
    if(filename.includes('double-pages')){
      if(!capture.pages.every(n=>n>150000))await fs.writeFile(filename.replace('.png','-failed.png'),Buffer.from(capture.url.split(',')[1],'base64'));
      assert.ok(capture.pages.every(n=>n>150000),'Native screenshot lost the actual page pixels: '+JSON.stringify(capture.pages));
    }
    const bytes=Buffer.from(capture.url.split(',')[1],'base64');assert.ok(bytes.length>100);await fs.writeFile(filename,bytes);
  };
  await page.locator('.omi-home__library').click();
  const card = name => page.locator('.resource-card').filter({ has: page.locator('.resource-details > strong', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) });
  for (const name of ['First.pdf', 'Front.epub', 'Legacy.epub', 'Illustrated.epub', 'Collection', 'PDF Collection', 'Pair Book']) {
    await expect(card(name).locator('.resource-preview > img')).toBeVisible({ timeout: 20000 });
    await expect.poll(() => card(name).locator('.resource-preview > img').evaluate(img => img.complete && img.naturalWidth > 0 && Math.max(img.naturalWidth, img.naturalHeight) <= 360)).toBe(true);
  }
  await expect(card('Collection').locator('.resource-card-info')).toHaveText('2 项');
  await expect(card('PDF Collection').locator('.resource-card-info')).toHaveText('1 项');
  for (const [name, type] of [['Broken.pdf', 'pdf'], ['TextOnly.epub', 'epub']]) {
    await expect(card(name).locator(`.resource-icon-symbol .is-${type}`)).toBeVisible();
    await expect(card(name).locator('.resource-icon-symbol')).toHaveText('');
  }
  await screenshot('test-results/pc-real-covers.png');
  await expect(card('Mixed Folder').locator('.resource-card-info')).toHaveText('1 项');
  await card('Mixed Folder').dblclick();
  await expect(card('Nested')).toBeVisible();
  await expect(card('cover.png')).toBeVisible();
  await expect(page.locator('.reader-layout')).not.toBeVisible();
  await page.getByRole('button',{name:'返回',exact:true}).click();
  await expect(card('Mixed Folder')).toBeVisible();

  const sessionCheck = await page.evaluate(async filePath => {
    const api = window.omicomic;
    const first = crypto.randomUUID(), second = crypto.randomUUID(), foreground = crypto.randomUUID(), later = crypto.randomUUID();
    const coverA = await api.openDocument({ path: filePath, type: 'pdf', id: first, purpose: 'thumbnail' });
    const coverB = await api.openDocument({ path: filePath, type: 'pdf', id: second, purpose: 'thumbnail' });
    const before = await api.readDocumentRange(first, 0, 5);
    const reader = await api.openDocument({ path: filePath, type: 'pdf', id: foreground });
    const cancelled = await api.readDocumentRange(first, 0, 5);
    const refused = await api.openDocument({ path: filePath, type: 'pdf', id: later, purpose: 'thumbnail' });
    const after = await api.readDocumentRange(foreground, 0, 5);
    await api.closeDocument(foreground); await api.closeDocument(first); await api.closeDocument(second); await api.closeDocument(later);
    return { coverA: coverA.ok, coverB: coverB.ok, before: before.ok, reader: reader.ok, cancelled: !cancelled.ok, refused: !refused.ok, after: after.ok };
  }, path.join(books, 'First.pdf'));
  assert.ok(Object.values(sessionCheck).every(Boolean), JSON.stringify(sessionCheck));
  const pair = async expected => {
    // Prepared hidden DOM can already have both pages. Keyboard input belongs
    // to the visible reader after App has completed the opening handoff.
    await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
    await expect(page.locator('.page-panel.mobile-reader-preparing')).toHaveCount(0);
    await expect.poll(() => page.locator('.reader-page-spread > figure:not([aria-hidden="true"])').evaluateAll(figures => figures.map(f => Number(f.dataset.readerPageIndex) + 1))).toEqual(expected);
    await expect.poll(() => page.locator('.reader-page-spread > figure:not([aria-hidden="true"]) img.reader-image').evaluateAll(images => images.length > 0 && images.every(img => img.complete && img.naturalWidth === 600))).toBe(true);
  };
  await card('Pair Book').dblclick();
  await page.getByRole('button', { name: '当前单页，点击切换双页', exact: true }).click(); await pair([1, 2]);
  await page.keyboard.press('End'); await pair([9, 10]);
  await expect(page.getByRole('slider', { name: '阅读进度' })).toHaveAttribute('aria-valuenow', '10');
  await expect.poll(async () => (await page.evaluate(() => window.omicomic.getAppData())).data.readingProgress[`folder:${pairs}`]?.percent).toBe(100);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await expect(card('Pair Book').locator('.resource-card-page')).toHaveText('10/10 · 100%');
  await card('Pair Book').dblclick(); await pair([9, 10]);
  await page.getByRole('button', { name: '当前双页，点击切换单页', exact: true }).click();
  const jump = page.getByRole('textbox', { name: '跳转到页码' }); await jump.fill('6'); await jump.press('Enter'); await pair([6]);
  await page.getByRole('button', { name: '当前单页，点击切换双页', exact: true }).click(); await pair([6, 7]);
  await page.keyboard.press('ArrowRight'); await pair([8, 9]);
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await card('Pair Book').dblclick(); await pair([8, 9]);
  await page.keyboard.press('ArrowLeft'); await pair([6, 7]);
  const surfaces=await page.locator('.reader-page-frame:not([aria-hidden="true"])').evaluateAll(figures=>figures.map(frame=>({page:frame.getAttribute('data-reader-page-index'),effects:[...frame.querySelectorAll('.reader-effects')].map(e=>({classes:e.className,data:{...e.dataset},rect:e.getBoundingClientRect().toJSON()})),surfaces:[...frame.querySelectorAll('canvas,img')].map(e=>({tag:e.tagName,width:e.width,height:e.height,visibility:getComputedStyle(e).visibility,rect:e.getBoundingClientRect().toJSON(),pixel:e.tagName==='CANVAS'&&e.width&&e.height?[...e.getContext('2d').getImageData(Math.floor(e.width/2),Math.floor(e.height/2),1,1).data]:null}))})));
  await fs.writeFile('test-results/pc-cover-surfaces.json',JSON.stringify(surfaces,null,2));
  assert.ok(surfaces.every(frame=>frame.surfaces.some(s=>s.tag==='CANVAS'&&s.visibility==='visible'&&s.pixel?.[3]>0||s.tag==='IMG'&&s.visibility==='visible'&&s.width>0)),'Current pages lack visible pixels: '+JSON.stringify(surfaces));
  await screenshot('test-results/pc-real-double-pages.png');
  await expect.poll(async () => (await page.evaluate(() => window.omicomic.getAppData())).data.readingProgress[`folder:${pairs}`]?.readerViewState?.pairingAnchor).toBe(5);
  assert.deepEqual(await fs.readFile(path.join(books, 'First.pdf')), pdf);
  await fs.writeFile('test-results/pc-cover-results.json', JSON.stringify({ realCovers: 7, iconFallbacks: 2, sessionCheck, doublePages: { initial: [1, 2], end: [9, 10], percent: 100, entry: [6, 7], next: [8, 9], persistedAnchor: 5 }, executablePath }, null, 2));
});
