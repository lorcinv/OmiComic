import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installMock } from './mock';

async function library(page: Page, collection = false) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(async ({mockSource, collection}: {mockSource:string;collection:boolean}) => {
    const install = eval('(' + mockSource + ')'); install({ count: 8 });
    const api = window.omicomic, result = await api.getAppData();
    if (!result.ok) throw Error('fixture');
    const data = result.data;
    data.settings.showHomePage = false;
    (data as any).temporaryOpened=data.recentOpened.slice(0,1);
    if(collection){
      const thumbnail=api.getThumbnail,list=api.listDirectory;
      api.getThumbnail=async input=>input.path.endsWith('/Parent')?{ok:true,data:{url:null,itemCount:2}}:thumbnail(input);
      api.listDirectory=async path=>{const r=await list(path);if(!r.ok||path!=='/comics')return r;return{...r,data:{...r.data,items:r.data.items.map(item=>item.type==='image'?{...item,id:item.id.replace('.png','.cbz'),name:item.name.replace('.png','.cbz'),path:item.path.replace('.png','.cbz'),type:'archive' as const,extension:'cbz'}:item)}};};
    }
    data.bookshelves = [{ id: 'category', name: '分类', sortIndex: 0, createdAt: 1, updatedAt: 1 }];
    data.virtualFolders = ['甲', '乙'].map((name, i) => ({ id: `s${i}`, name, note: '保留原备注', bookshelfId: 'category', items: [], createdAt: 1, updatedAt: 1, sortIndex: i }));
    data.favorites = [{ resourceKey: 'archive:/comics/book.cbz', sourcePath: '/comics/book.cbz', sourceType: 'archive', title: '收藏漫画', addedAt: 1, updatedAt: 1, tags: [], note: '' }];
    api.getFavorites = async () => ({ ok: true, data: data.favorites });
    (window as any).__shelfWrites = [];
    api.createVirtualFolder = async input => {
      (window as any).__shelfWrites.push(input);
      const folder = { ...input, id: 'new', note: '', bookshelfId: 'category', items: [], createdAt: 1, updatedAt: 1 };
      data.virtualFolders.push(folder); return { ok: true, data: folder };
    };
    api.updateVirtualFolder = async input => {
      (window as any).__shelfWrites.push(input);
      const folder = data.virtualFolders.find(item => item.id === input.id)!;
      if ((window as any).__failShelfSave) throw Error('保存失败，请重试。');
      Object.assign(folder, Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))); return { ok: true, data: { ...folder } };
    };
    api.addVirtualFolderItems = async ({ folderId, items }) => {
      const folder = data.virtualFolders.find(item => item.id === folderId)!;
      folder.items.push(...items.map(item => ({ ...item, folderId, id: item.resourceKey, addedAt: 1 })));
      return { ok: true, data: { folder: { ...folder }, addedCount: items.length, skippedCount: 0 } };
    };
    api.importDroppedDirectory = async () => ({ ok: true, data: { alreadyAdded: true, root: data.library.roots[0] } });
  }, {mockSource:installMock.toString(),collection});
  await page.goto('/');
  await expect(page.locator('.resource-card').first()).toBeVisible();
}

test('desktop drop notice sits at the top and right-click actions are grouped and bounded', async ({ page }) => {
  await library(page);
  await page.evaluate(() => {
    const transfer = new DataTransfer(); transfer.items.add(new File([''], 'Comics'));
    document.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  const notice = page.locator('.directory-drop-notice'); await expect(notice).toBeVisible();
  const rect = await notice.boundingBox(); expect(rect!.y).toBeGreaterThan(45); expect(rect!.y + rect!.height).toBeLessThan(160);
  const card = page.locator('.resource-card').filter({ has: page.locator('strong', { hasText: 'Book' }) }).first();
  await card.evaluate(el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 1435, clientY: 950 })));
  const menu = page.getByRole('menu'); await expect(menu).toBeVisible();
  expect(await menu.getByRole('menuitem').allTextContents()).toEqual(['查看资源信息', '加入书架', '加入收藏', '选择文件', '重命名本地文件', '删除资源…']);
  expect(await menu.getByRole('separator').count()).toBe(4);
  const bounds = await menu.boundingBox(); expect(bounds!.x).toBeGreaterThan(1200); expect(bounds!.y).toBeGreaterThan(500); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1433); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(953);
  expect(await menu.getByRole('menuitem').last().evaluate(el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); })).toBe(true);
  await page.screenshot({ path: 'test-results/ui-pdf-fixes/desktop-menu-top-notice.png' });
  await page.keyboard.press('Escape'); await page.setViewportSize({ width: 1024, height: 768 });
  await card.evaluate(el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 1014, clientY: 758 })));
  const compact = await menu.boundingBox(); expect(compact!.x + compact!.width).toBeLessThanOrEqual(1017); expect(compact!.y + compact!.height).toBeLessThanOrEqual(761);
  await page.screenshot({ path: 'test-results/ui-pdf-fixes/desktop-menu-1024.png' });
});

test('selection keeps the original resource menus and can add selected books to a shelf', async ({ page }) => {
  await library(page,true);
  const parent=page.locator('.resource-card').filter({has:page.locator('strong',{hasText:/^Parent$/})});
  await expect(parent).toContainText('2 项');await parent.click({button:'right'});
  const menu=page.getByRole('menu');
  expect(await menu.getByRole('menuitem').allTextContents()).toEqual(['选择文件','重命名本地文件','删除资源…']);
  await menu.getByRole('menuitem',{name:'选择文件',exact:true}).click();await parent.click({button:'right'});
  expect(await menu.getByRole('menuitem').allTextContents()).toEqual(['选择文件','重命名本地文件','删除资源…']);
  await page.locator('.selection-toolbar').getByRole('button',{name:'全选',exact:true}).click();await expect(page.locator('.resource-card.is-selected')).toHaveCount(10);
  await page.locator('.selection-toolbar').getByRole('button',{name:'取消全选',exact:true}).click();await expect(page.locator('.resource-card.is-selected')).toHaveCount(0);
  const image=(name:string)=>page.locator('.resource-card').filter({has:page.locator('strong',{hasText:name})});
  await image('page0.cbz').click();await image('page1.cbz').click();await image('page0.cbz').click({button:'right'});
  await expect(menu.getByRole('menuitem',{name:'加入书架',exact:true})).toBeVisible();
  await expect(menu.getByRole('menuitem',{name:'加入收藏',exact:true})).toBeVisible();
  await menu.getByRole('menuitem',{name:'加入书架',exact:true}).click();
  await page.locator('.shelf-picker').getByRole('button',{name:/^甲/}).click();
  expect(await page.evaluate(async()=>{const r=await window.omicomic.getAppData();return r.ok&&r.data.virtualFolders[0].items.map(item=>item.sourcePath);})).toEqual(['/comics/page0.cbz','/comics/page1.cbz']);
  await expect(page.locator('.selection-check')).toHaveCount(0);
});

test('shelf root, shelf books and temporary storage retain their resource menus', async ({ page }) => {
  await library(page);
  await page.evaluate(async()=>{await window.omicomic.addVirtualFolderItems({folderId:'s0',items:[{resourceKey:'folder:/comics/Book',sourcePath:'/comics/Book',sourceType:'folder',title:'Book'}]});});
  await page.locator('.sidebar-item').filter({has:page.locator('span',{hasText:/^书架$/})}).click();
  const card=page.locator('.bookshelf-folder-card').filter({hasText:'甲'}),menu=page.getByRole('menu');
  await card.click({button:'right'});await expect(menu.getByRole('menuitem',{name:'编辑备注',exact:true})).toHaveCount(0);
  await menu.getByRole('menuitem',{name:'选择文件',exact:true}).click();await card.click();await expect(card).toHaveAttribute('aria-pressed','true');
  await card.click({button:'right'});await expect(menu.getByRole('menuitem',{name:'重命名',exact:true})).toBeVisible();await expect(menu.getByRole('menuitem',{name:'删除',exact:true})).toBeVisible();
  await page.locator('.selection-toolbar').getByRole('button',{name:'全选',exact:true}).click();await expect(page.locator('.bookshelf-folder-card.is-selected')).toHaveCount(2);
  await page.locator('.selection-toolbar').getByRole('button',{name:'退出选择',exact:true}).click();await card.dblclick();
  const book=page.locator('.resource-card').first();await book.click({button:'right'});await menu.getByRole('menuitem',{name:'选择文件',exact:true}).click();
  await book.click();await book.click({button:'right'});await expect(menu.getByRole('menuitem',{name:'加入收藏',exact:true})).toBeVisible();await expect(menu.getByRole('menuitem',{name:'移动到书架',exact:true})).toBeVisible();
  await page.locator('.selection-toolbar').getByRole('button',{name:'退出选择',exact:true}).click();
  await page.locator('.sidebar-item').filter({has:page.locator('span',{hasText:/^临时存放$/})}).click();
  await page.locator('.resource-card').first().click({button:'right'});await expect(menu.getByRole('menuitem',{name:'查看资源信息',exact:true})).toBeVisible();await expect(menu.getByRole('menuitem',{name:'加入书架',exact:true})).toBeVisible();
});

test('adding a mixed folder expands its books and opens its own images without nesting', async ({ page }) => {
  await library(page);
  await page.evaluate(() => {
    const api = window.omicomic, list = api.listDirectory, read = api.getResourcePages;
    const entry = (path: string, type: string) => ({ id: path, path, name: path.split('/').at(-1), type, extension: '' });
    api.listDirectory = async path => path === '/comics/Parent'
      ? { ok: true, data: { path, parentPath: '/comics', items: [entry(path + '/1.png', 'image'), entry(path + '/nested', 'folder'), entry(path + '/book.pdf', 'pdf')], total: 3 } } as any
      : path === '/comics/Parent/nested'
        ? { ok: true, data: { path, parentPath: '/comics/Parent', items: [entry(path + '/story.epub', 'epub')], total: 1 } } as any : list(path);
    api.getResourcePages = async input => input.path === '/comics/Parent'
      ? { ok: true, data: { key: 'folder:' + input.path, resourceKey: 'folder:' + input.path, sourcePath: input.path, sourceType: 'folder', title: 'Parent', pages: [{ index: 0, sourcePath: input.path + '/1.png', name: '1.png', type: 'folder-image' }], total: 1 } } : read(input);
  });
  await page.locator('.resource-card').filter({ has: page.locator('strong', { hasText: /^Parent$/ }) }).evaluate(el => el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 500, clientY: 300 })));
  await page.getByRole('menuitem', { name: '加入书架', exact: true }).click();
  await page.getByRole('menu', { name: '加入书架', exact: true }).getByRole('button', { name: /^甲/ }).click();
  expect(await page.evaluate(async () => { const result = await window.omicomic.getAppData(); return result.ok && result.data.virtualFolders[0].items.map(item => item.sourcePath); })).toEqual(['/comics/Parent', '/comics/Parent/nested/story.epub', '/comics/Parent/book.pdf']);
  await page.locator('.sidebar-item').filter({ has: page.locator('span', { hasText: /^书架$/ }) }).click();
  await page.locator('.bookshelf-folder-card').filter({ hasText: '甲' }).dblclick();
  await expect(page.locator('.resource-card')).toHaveCount(3);
  await page.evaluate(() => { window.omicomic.listDirectory = async () => { throw Error('A shelf book must not navigate into its directory'); }; });
  await page.locator('.resource-card').filter({ has: page.locator('strong', { hasText: /^Parent$/ }) }).dblclick();
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
});

test('an existing collection reference expands inside its shelf when opened', async ({ page }) => {
  await library(page);
  await page.evaluate(async () => {
    const api = window.omicomic, result = await api.getAppData(); if (!result.ok) throw Error('fixture');
    const legacy = { id: 'legacy', folderId: 's0', resourceKey: 'folder:/comics/Legacy', sourcePath: '/comics/Legacy', sourceType: 'folder', title: '旧合集', addedAt: 1, sortIndex: 0 } as const;
    result.data.virtualFolders[0].items = [legacy];
    const list = api.listDirectory, read = api.getResourcePages;
    const entry = (path: string, type: string) => ({ id: path, path, name: path.split('/').at(-1), type, extension: '' });
    api.listDirectory = async path => path === '/comics/Legacy'
      ? { ok: true, data: { path, parentPath: '/comics', items: [entry(path + '/Images', 'folder'), entry(path + '/Book.pdf', 'pdf')], total: 2 } } as any
      : path === '/comics/Legacy/Images' ? { ok: true, data: { path, parentPath: '/comics/Legacy', items: [entry(path + '/1.png', 'image')], total: 1 } } as any : list(path);
    api.getResourcePages = async input => input.path === '/comics/Legacy'
      ? { ok: false, error: { code: 'NO_IMAGES', message: '未在该文件夹中找到可阅读图片。' } } : read(input);
    api.removeVirtualFolderItem = async ({ folderId, resourceKey }) => {
      const folder = result.data.virtualFolders.find(item => item.id === folderId)!;
      folder.items = folder.items.filter(item => item.resourceKey !== resourceKey); return { ok: true, data: { ...folder } };
    };
  });
  await page.locator('.sidebar-item').filter({ has: page.locator('span', { hasText: /^书架$/ }) }).click();
  await page.locator('.bookshelf-folder-card').filter({ hasText: '甲' }).dblclick();
  await page.locator('.resource-card').filter({ hasText: '旧合集' }).dblclick();
  await expect(page.locator('.resource-card')).toHaveCount(2);
  await expect(page.locator('.resource-card').filter({ hasText: '旧合集' })).toHaveCount(0);
  await expect(page.locator('.resource-card').filter({ hasText: 'Images' })).toBeVisible();
  await expect(page.locator('.reader-layout')).toHaveCount(0);
});

for (const mobile of [false, true]) test.describe(mobile ? 'phone shelf fixes' : 'desktop shelf fixes', () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  test('new shelf asks only for a name', async ({ page }) => {
    await library(page); await page.locator('.sidebar-item').filter({ has: page.locator('span', { hasText: /^书架$/ }) }).click();
    if (mobile) {
      await page.getByRole('button', { name: '书架分类', exact: true }).click();
      await page.getByRole('button', { name: '新建书架', exact: true }).click();
    } else {
      await page.locator('.bookshelf-root-view').dispatchEvent('contextmenu', { clientX: 500, clientY: 300 });
      await page.getByRole('menuitem', { name: '新建书架', exact: true }).click();
    }
    const dialog = page.getByRole('dialog', { name: '新建书架', exact: true });
    await expect(dialog.locator('textarea')).toHaveCount(0);
    await dialog.getByRole('textbox', { name: '名称', exact: true }).fill('新书架');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__shelfWrites.at(-1))).toEqual({ name: '新书架', bookshelfId: 'category' });
  });
});

test.describe('phone actions', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('favorites can be added to a shelf from their selection toolbar', async ({ page }) => {
    await library(page); await page.locator('.sidebar-item').filter({ has: page.locator('span', { hasText: /^收藏$/ }) }).click();
    await page.locator('.mobile-resource-card').filter({ hasText: '收藏漫画' }).dispatchEvent('contextmenu');
    await page.getByRole('navigation', { name: '资源操作', exact: true }).getByRole('button', { name: '加入书架', exact: true }).click();
    await expect(page.getByRole('dialog', { name: '加入书架', exact: true })).toBeVisible();
  });
  test('rename remains usable repeatedly, reports save errors in the dialog and keeps notes', async ({ page }) => {
    await library(page); await page.locator('.sidebar-item').filter({ has: page.locator('span', { hasText: /^书架$/ }) }).click();
    for (const name of ['新甲', '再改甲']) {
      await page.locator('[data-shelf-id="s0"]').dispatchEvent('contextmenu');
      await page.getByRole('navigation', { name: '资源操作' }).getByRole('button', { name: '重命名', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '重命名书架', exact: true });
      const field = dialog.getByRole('textbox', { name: '名称', exact: true });
      if (name === '新甲') {
        await field.fill('乙'); await dialog.getByRole('button', { name: '保存', exact: true }).click();
        await expect(dialog.getByRole('alert')).toHaveText('已存在同名书架。');
      }
      await field.fill(name);
      if (name === '新甲') {
        await field.dispatchEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true });
        await expect(dialog).toBeVisible(); expect(await page.evaluate(() => (window as any).__shelfWrites.length)).toBe(0);
        await page.evaluate(() => { (window as any).__failShelfSave = true; });
        await dialog.getByRole('button', { name: '保存', exact: true }).click();
        await expect(dialog.getByRole('alert')).toHaveText('保存失败，请重试。');
        await page.evaluate(() => { (window as any).__failShelfSave = false; });
      }
      await dialog.getByRole('button', { name: '保存', exact: true }).click();
      await expect(dialog).toHaveCount(0); await expect(page.locator('[data-shelf-id="s0"]')).toContainText(name);
    }
    expect(await page.evaluate(async () => { const result = await window.omicomic.getAppData(); return result.ok && result.data.virtualFolders[0].note; })).toBe('保留原备注');
    const style = await page.locator('.bookshelf-root-view').evaluate(el => ({ width: getComputedStyle(el).scrollbarWidth, webkit: getComputedStyle(el, '::-webkit-scrollbar').display }));
    expect(style).toEqual({ width: 'none', webkit: 'none' });
    await page.screenshot({ path: 'test-results/ui-pdf-fixes/mobile-bookshelf.png' });
  });
});

async function pdf(page: Page, mobile: boolean) {
  const bytes = [...readFileSync('tests/fixtures/documents/three-pages.pdf')];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 3 });
  await page.addInitScript(async ({ bytes, mobile }) => {
    const api = window.omicomic, result = await api.getAppData(); if (!result.ok) return;
    const data = result.data, key = 'pdf:/comics/sample.pdf';
    Object.assign(data.settings, { readerPreloadPages: 0, mobileReaderPreviews: true, mobileReaderAutoHide: false, readerDefaultFitMode: 'fit-window' });
    data.recentOpened = [{ resourceKey: key, sourcePath: '/comics/sample.pdf', sourceType: 'pdf', title: 'PDF 适配测试', currentPageIndex: 0, totalPages: 3, updatedAt: 1 }];
    api.getResourcePages = async () => ({ ok: true, data: { key, resourceKey: key, sourcePath: '/comics/sample.pdf', sourceType: 'pdf', title: 'PDF 适配测试', pages: [], total: 0 } });
    api.openDocument = async () => ({ ok: true, data: { size: bytes.length, chapters: [] } });
    api.readDocumentRange = async (_id, begin, end) => ({ ok: true, data: new Uint8Array(bytes.slice(begin, end)) });
    api.closeDocument = async () => ({ ok: true, data: null });
    (window as any).__pdfMobile = mobile;
  }, { bytes, mobile });
  await page.goto('/');
  const recent = page.getByRole('button', { name: /继续阅读 PDF 适配测试/ });
  if (mobile) await recent.tap(); else await recent.dblclick();
  await expect(page.locator('.page-panel.is-visible canvas.reader-pdf-canvas').first()).toBeVisible();
}

for (const mobile of [false, true]) test.describe(mobile ? 'phone PDF' : 'desktop PDF', () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  test('turns PDF pages without dropping the current canvas and uses one PDF raster', async ({ page }) => {
    await pdf(page, mobile);
    await page.evaluate(async () => {
      const { DocumentSource } = await import('/src/reader/documentSource.ts');
      const read = DocumentSource.prototype.readPage;
      DocumentSource.prototype.readPage = async function(...args) { await new Promise(resolve => setTimeout(resolve, 400)); return read.apply(this, args); };
      (window as any).__emptyPdfFrames = 0; (window as any).__pdfSampling = true;
      const frame = () => {
        if (!(window as any).__pdfSampling) return;
        const canvases = [...document.querySelectorAll<HTMLCanvasElement>('.page-panel.is-visible .reader-page-frame:not([aria-hidden="true"]) canvas.reader-pdf-canvas')];
        if (!canvases.some(c => c.width > 0 && c.height > 0 && c.getBoundingClientRect().width > 0 && c.getContext('2d')!.getImageData(0, 0, 1, 1).data[3] > 0)) (window as any).__emptyPdfFrames++;
        requestAnimationFrame(frame);
      }; requestAnimationFrame(frame);
    });
    if (mobile) {
      const stage = await page.locator('.reader-stage').boundingBox();
      await page.touchscreen.tap(stage!.x + stage!.width * .94, stage!.y + stage!.height * .5);
    } else await page.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(page.locator('[data-reader-page-index="1"][aria-hidden]:not([aria-hidden="false"])')).toHaveCount(0);
    await expect(page.locator('[data-reader-page-index="1"] canvas.reader-pdf-canvas')).toBeVisible();
    expect(await page.evaluate(() => { (window as any).__pdfSampling = false; return (window as any).__emptyPdfFrames; })).toBe(0);
    await expect(page.locator('.reader-display-raster,.reader-quality-transition')).toHaveCount(0);
    if (mobile) {
      const stage = await page.locator('.reader-stage').boundingBox();
      await page.touchscreen.tap(stage!.x + stage!.width / 2, stage!.y + stage!.height / 2);
      const rail = await page.getByRole('slider', { name: '阅读进度', exact: true }).boundingBox();
      await page.mouse.move(rail!.x + rail!.width * .25, rail!.y + rail!.height / 2); await page.mouse.down();
      await page.mouse.move(rail!.x + rail!.width * .75, rail!.y + rail!.height / 2, { steps: 4 }); await page.mouse.up();
      await expect(page.locator('.mobile-reader-previews img').first()).toBeVisible();
    }
    await page.screenshot({ path: `test-results/ui-pdf-fixes/${mobile ? 'mobile' : 'desktop'}-pdf.png` });
  });
});
