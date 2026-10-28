import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function openLibrary(page: Page) {
  page.on('pageerror', error => console.error('PAGE ERROR:',error.stack));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 8 });
  await page.addInitScript(async () => {
    const api = window.omicomic, data = (await api.getAppData() as any).data;
    Object.assign(data.settings, { pageSize: 50, mobilePageSize: 50, cardScale: 40, searchSplitSpaces: false });
    data.resourceMeta['folder:/comics/Group 001'] = { resourceKey: 'folder:/comics/Group 001', sourcePath: '/comics/Group 001', sourceType: 'folder', title: 'Group 001', tags: ['special'], note: '' };
    data.bookshelves = [{ id: 'shelf', name: '唯一分类', createdAt: 0, updatedAt: 0, sortIndex: 0 }];
    data.favorites = Array.from({ length: 120 }, (_, index) => ({ resourceKey: `archive:/comics/favorite${index}.cbz`, sourcePath: `/comics/favorite${index}.cbz`, sourceType: 'archive', title: `Favorite ${index}`, addedAt: 0, updatedAt: 0, sortIndex: index, tags: [], note: '' }));
    data.bookmarks = Array.from({ length: 120 }, (_, index) => ({ id: `bookmark-${index}`, resourceKey: `archive:/comics/favorite${index % 60}.cbz`, sourcePath: `/comics/favorite${index % 60}.cbz`, sourceType: 'archive', title: `Favorite ${index % 60}`, bookmarkTitle: `Mark ${index}`, pageIndex: index % 7, totalPages: 8, addedAt: 0, updatedAt: 0, sortIndex: index, tags: [], note: '' }));
    data.virtualFolders = Array.from({ length: 120 }, (_, index) => ({ id: `folder-${index}`, bookshelfId: 'shelf', name: `Shelf ${String(index).padStart(3, '0')}`, note: '', tags: [], items: [{ ...data.favorites[index], folderId: `folder-${index}`, id: `entry-${index}` }], createdAt: 0, updatedAt: 0, sortIndex: index }));
    api.getFavorites = async () => ({ ok: true, data: data.favorites });
    api.getBookmarks = async () => ({ ok: true, data: data.bookmarks });
    api.getBookmarkPagePreview = async () => ({ ok: true, data: { dataUrl: '', width: 1, height: 1 } } as any);
    api.listDirectory = async path => {
      (window as any).__directory = path;
      const entry = (name: string, type: 'folder' | 'image' | 'archive') => ({ id: `${path}/${name}`, path: `${path}/${name}`, name, type, extension: type === 'archive' ? 'cbz' : '', modifiedAt: 0 });
      const items = path === '/comics' ? Array.from({ length: 180 }, (_, index) => entry(`Group ${String(index).padStart(3, '0')}`, 'folder'))
        : [entry('One.cbz', 'archive'), entry('Two.cbz', 'archive'), ...(path.endsWith('001') ? [entry('[作者] ' + '长标题 '.repeat(24) + '番外：特别篇.zip', 'archive')] : []), ...(Number(path.slice(-3)) % 3 === 0 ? [entry('1.png', 'image')] : [])];
      return { ok: true, data: { path, parentPath: path === '/comics' ? null : '/comics', items, total: items.length } };
    };
    api.scanLibrary = async path => {
      const items: any[] = [], roots: string[] = [path];
      for (const directory of roots) {
        const result = await api.listDirectory(directory);
        if (!result.ok) continue;
        for (const item of result.data.items) {
          if (item.type === 'folder') roots.push(item.path);
          items.push({ ...item, ...(item.type === 'folder' ? { containsImages: Number(item.path.slice(-3)) % 3 === 0 } : {}) });
        }
      }
      return { ok: true, data: { items, directories: roots.length, skipped: 0, scannedAt: Date.now() } };
    };
    api.getThumbnail = async ({ type }) => ({ ok: true, data: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNQ8yoBAAF+AOUqTs0pAAAAAElFTkSuQmCC', sourceVersion: 'test', ...(type === 'folder' ? { childFolderCount: 1, itemCount: 0 } : {}) } } as any);
    api.getResourcePages = async ({ path, type }) => {
      if (type === 'folder' && path.includes('/Group ') && Number(path.slice(-3)) % 3 !== 0) return { ok: false, error: { code: 'NO_IMAGES', message: 'no images' } };
      const pages = Array.from({ length: 8 }, (_, index) => ({ index, name: `${index}.png`, sourcePath: `${path}/${index}.png`, type: 'folder-image' as const }));
      return { ok: true, data: { key: `${type}:${path}`, resourceKey: `${type}:${path}`, sourcePath: path, sourceType: type, title: path.split('/').at(-1)!, pages, total: 8 } };
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: '打开资源库', exact: true }).click();
  await expect(page.locator('[data-library-index="0"]')).toBeVisible();
}

async function snapshot(page: Page) {
  return page.locator('.resource-list-scroll').evaluate(element => {
    const top = element.getBoundingClientRect().top;
    const card = [...element.querySelectorAll<HTMLElement>('[data-library-index]')].find(card => card.getBoundingClientRect().bottom > top + 2);
    return { index: Number(card?.dataset.libraryIndex), y: (card?.getBoundingClientRect().top ?? top) - top, scroll: element.scrollTop };
  });
}
async function randomSwitch(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: '显示选项', exact: true }).click();
  await page.getByRole('switch', { name: '随机阅读', exact: true }).click();
  if (mobile) await page.getByRole('button', { name: '关闭显示选项', exact: true }).click();
}
async function batchNames(page: Page) {
  const names = new Map<string, string>();
  const list = page.locator('.resource-list-scroll');
  const height = await list.evaluate(element => element.scrollHeight);
  for (let position = 0; position <= height + 800; position += 600) {
    await list.evaluate((element, value) => { element.scrollTop = value; }, position);
    await page.waitForTimeout(40);
    for (const item of await list.locator('.resource-card').evaluateAll(elements => elements.map(element => ({ index: (element as HTMLElement).dataset.libraryIndex ?? (element as HTMLElement).dataset.selectionKey ?? '', text: element.textContent ?? '' })))) names.set(item.index, item.text);
  }
  return [...names].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
}

for (const mobile of [false, true]) test.describe(mobile ? 'phone random and navigation' : 'PC random and navigation', () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 960 } });
  test('folder Back restores the visible item and Forward remains available', async ({ page }) => {
    await openLibrary(page);
    await page.locator('.resource-list-scroll').evaluate(element => { element.scrollTop = 3800; });
    await expect.poll(async () => (await snapshot(page)).index).toBeGreaterThan(10);
    let before = await snapshot(page);
    // Choose a non-image folder so both platforms navigate into its contents.
    const index = before.index % 3 === 0 ? before.index + 1 : before.index;
    const card = page.locator(`[data-library-index="${index}"]`);
    await card.scrollIntoViewIfNeeded();
    before = await snapshot(page);
    if (mobile) await card.click(); else await card.dblclick();
    await expect(page.locator('.resource-details strong,.mobile-card-title').filter({ hasText: 'One.cbz' })).toBeVisible();
    if (mobile) await page.evaluate(() => window.dispatchEvent(new Event('omi-library-back', { cancelable: true })));
    else await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).index).toBe(before.index);
    expect(Math.abs((await snapshot(page)).y - before.y)).toBeLessThan(4);
    if (!mobile) {
      await expect(page.getByRole('button', { name: '上一级', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: '前进', exact: true }).click();
      await expect(page.locator('.resource-details strong').filter({ hasText: 'One.cbz' })).toBeVisible();
    }
    await page.locator('.sidebar-primary-nav').getByRole('button', { name: '资源库', exact: true }).click();
    await expect.poll(async () => (await snapshot(page)).scroll).toBe(0);
  });
  test('random creates one full batch, redraws it and restores the original position', async ({ page }) => {
    await openLibrary(page);
    await page.locator('.resource-list-scroll').evaluate(element => { element.scrollTop = 3000; });
    await expect.poll(async () => (await snapshot(page)).index).toBeGreaterThan(5);
    const before = await snapshot(page);
    await randomSwitch(page, mobile);
    await expect(page.getByRole('button', { name: '重随机', exact: true })).toBeEnabled();
    if (mobile) await expect(page.locator('.mobile-page-pill.is-random-pager')).toBeVisible();
    else await expect(page.locator('.pagination-bar')).toHaveCount(0);
    const first = await batchNames(page);
    expect(first).toHaveLength(50);
    expect(first.at(-1)![0]).toBe('49');
    expect(first.some(([, name]) => name.includes('1.png'))).toBe(false);
    await page.getByRole('button', { name: '重随机', exact: true }).click();
    const second = await batchNames(page);
    expect(second).toHaveLength(50);
    expect(second).not.toEqual(first);
    await page.locator('.resource-list-scroll').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: `test-results/random-${mobile ? 'phone' : 'pc'}.png` });
    await randomSwitch(page, mobile);
    await expect.poll(async () => (await snapshot(page)).index).toBe(before.index);
    expect(Math.abs((await snapshot(page)).y - before.y)).toBeLessThan(4);
  });
  test('favorites and bookmarks offer random browsing, shelves do not', async ({ page }) => {
    await openLibrary(page);
    for (const label of ['收藏', '书签']) {
      await page.locator('.sidebar-primary-nav').getByRole('button', { name: new RegExp(`^${label}`) }).click();
      await randomSwitch(page, mobile);
      await expect(page.getByRole('button', { name: '重随机', exact: true })).toBeEnabled();
      expect(await batchNames(page)).toHaveLength(50);
    }
    await page.locator('.sidebar-primary-nav').getByRole('button', { name: /^书架/ }).click();
    if (mobile) await page.getByRole('button', { name: '显示选项', exact: true }).click();
    await expect(page.getByRole('switch', { name: '随机阅读', exact: true })).toHaveCount(0);
  });
  test('random bookmarks retain their page and batch when reading and switching entries', async ({ page }) => {
    await openLibrary(page);
    await page.locator('.sidebar-primary-nav').getByRole('button', { name: /^书签/ }).click();
    await randomSwitch(page, mobile);
    await expect(page.getByRole('button', { name: '重随机', exact: true })).toBeEnabled();
    const list = page.locator('.resource-list-scroll');
    await list.evaluate(element => { element.scrollTop = 0; });
    const ids = await list.locator('.resource-card').evaluateAll(elements => elements.slice(0, 2).map(element => element.getAttribute('data-bookmark-card-id')!));
    const expectedPage = (id: string) => String(Number(id.replace('bookmark-', '')) % 7 + 1);
    if (mobile) await list.locator('.resource-card').first().click(); else await list.locator('.resource-card').first().dblclick();
    await expect(page.locator('.reader-layout')).toBeVisible();
    await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow', expectedPage(ids[0]));
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow', expectedPage(ids[1]));
    await page.evaluate(() => window.dispatchEvent(new Event('omi-reader-back', { cancelable: true })));
    await expect(page.locator('.resource-list-scroll')).toBeVisible();
    expect(await page.locator('.resource-card').evaluateAll(elements => elements.slice(0, 2).map(element => element.getAttribute('data-bookmark-card-id')))).toEqual(ids);
  });
  test('search reaches every child of the active root and finds a long filename containing a colon', async ({ page }) => {
    await openLibrary(page);
    const card = page.locator('[data-library-index="1"]');
    if (mobile) await card.click(); else await card.dblclick();
    await expect(page.locator('.resource-details strong,.mobile-card-title').filter({ hasText: 'One.cbz' })).toBeVisible();
    if (mobile) await page.getByRole('button', { name: '搜索', exact: true }).click();
    const search = mobile ? page.getByRole('searchbox', { name: '搜索漫画、名称或标签' }) : page.getByRole('textbox', { name: '搜索当前资源库', exact: true });
    await search.fill('name:One');
    await expect.poll(() => page.locator('.resource-card').count()).toBeGreaterThan(2);
    await search.fill('番外：特别篇');
    await expect(page.locator('.resource-card')).toHaveCount(1);
    await expect(page.locator('.resource-card')).toContainText('长标题');
    if(mobile)await page.locator('.resource-card').click();else await page.locator('.resource-card').dblclick();
    await expect(page.locator('.reader-layout')).toBeVisible();
  });
  test('settings share categories and numeric options, and space splitting is opt-in', async ({ page }) => {
    await openLibrary(page);
    if (mobile) await page.getByRole('button', { name: '搜索', exact: true }).click();
    const search = mobile ? page.getByRole('searchbox', { name: '搜索漫画、名称或标签' }) : page.getByRole('textbox', { name: '搜索当前资源库', exact: true });
    await search.fill('Group special');
    await expect(page.locator('.resource-card')).toHaveCount(0);
    const settings = mobile ? page.locator('.mobile-settings-page') : page.locator('.settings-window');
    if (mobile) {
      await page.getByRole('button', { name: '清空搜索', exact: true }).click();
      await page.getByRole('button', { name: '关闭搜索', exact: true }).click();
      await page.getByRole('button', { name: '显示选项', exact: true }).click();
      const sort = await page.getByRole('combobox', { name: '资源库默认排序', exact: true }).boundingBox();
      const toggle = await page.getByRole('switch', { name: '随机阅读', exact: true }).boundingBox();
      expect(toggle!.x).toBeGreaterThanOrEqual(sort!.x + sort!.width - 1);
      expect(Math.abs(toggle!.y + toggle!.height / 2 - sort!.y - sort!.height / 2)).toBeLessThan(3);
      await page.screenshot({ path: 'test-results/random-phone-options.png' });
      await page.getByRole('button', { name: /应用设置/ }).click();
      await page.locator('.mobile-setting-category').filter({ hasText: '资源库' }).click();
    } else {
      await page.locator('.sidebar-settings-button').click();
      await page.locator('#settings-category-library').click();
    }
    await expect(settings.getByRole('checkbox', { name: '空格分隔搜索条件', exact: true })).not.toBeChecked();
    await settings.getByRole('checkbox', { name: '空格分隔搜索条件', exact: true }).check();
    await settings.getByRole('combobox', { name: '每页数量', exact: true }).click();
    await expect(page.getByRole('listbox').getByRole('option').locator('span:first-child')).toHaveText(['50', '100', '150', '200', '500']);
    await page.getByRole('option', { name: '100', exact: true }).click();
    await settings.getByRole('combobox', { name: '最近阅读记录上限', exact: true }).click();
    await expect(page.getByRole('listbox').getByRole('option').locator('span:first-child')).toHaveText(['50', '100', '150', '200']);
    await page.keyboard.press('Escape');
    if (mobile) {
      await settings.locator('header button').click();
      await page.locator('.mobile-setting-category').filter({ hasText: '漫画阅读设置' }).click();
      await expect(settings.locator('.book-reader-settings')).toHaveCSS('border-bottom-width', '0px');
      await expect(settings.locator('.book-reader-settings > .settings-row').last()).toHaveCSS('border-bottom-width', '0px');
      await expect(settings.getByRole('checkbox', { name: '阅读工具栏 3 秒自动隐藏', exact: true })).toBeVisible();
      await page.screenshot({ path: 'test-results/phone-reading-settings.png' });
      await settings.locator('header button').click(); await settings.locator('header button').click();
      await page.getByRole('button',{name:'搜索',exact:true}).click();
      await page.getByRole('searchbox',{name:'搜索漫画、名称或标签'}).fill('Group special');
    } else {
      await page.locator('#settings-category-performance').click();
      await expect(settings.getByRole('spinbutton', { name: '阅读预加载页数', exact: true })).toBeVisible();
      await page.locator('#settings-category-reader-default').click();
      await expect(settings.getByText('智能识别跨页图：', { exact: false })).toBeVisible();
      await page.locator('#settings-category-library').click();
      await page.screenshot({ path: 'test-results/pc-library-settings.png' });
      await page.keyboard.press('Escape');
    }
    await expect(page.locator('.resource-card')).toHaveCount(1);
  });
});

test('PC menu surfaces agree and the final category warning is visible', async ({ page }) => {
  await openLibrary(page);
  await page.getByRole('button', { name: '切换资源目录', exact: true }).click();
  const reference = await page.locator('.root-library-options').evaluate(element => {
    const style = getComputedStyle(element); return [style.backgroundColor, style.backdropFilter, style.borderRadius];
  });
  await page.getByRole('button', { name: '切换资源目录', exact: true }).click();
  await page.getByRole('combobox', { name: '排序方式', exact: true }).click();
  expect(await page.getByRole('listbox').evaluate(element => { const style = getComputedStyle(element); return [style.backgroundColor, style.backdropFilter, style.borderRadius]; })).toEqual(reference);
  expect((await page.getByRole('listbox').boundingBox())!.width).toBeLessThan(150);
  await page.keyboard.press('Escape');
  await page.locator('.view-options-menu > summary').click();
  await page.screenshot({path:'test-results/pc-view-menu-solid.png'});
  await expect(page.locator('.view-options-popover .card-scale-rail')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  expect(await page.locator('.view-options-popover').evaluate(element => { const style = getComputedStyle(element); return [style.backgroundColor, style.backdropFilter, style.borderRadius]; })).toEqual(reference);
  await page.locator('.view-options-menu > summary').click();
  await page.locator('.sidebar-primary-nav').getByRole('button', { name: /^书架/ }).click();
  await page.locator('.bookshelf-category-tab').first().click({ button: 'right' });
  await page.getByRole('menuitem', { name: '删除书架栏', exact: true }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('至少需要保留一个书架分类');
  expect(await alert.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.left + 50, rect.top + rect.height / 2));
  })).toBe(true);
  await page.screenshot({ path: 'test-results/last-category-warning.png' });
});


test('PC random controls share a surface, selected cards use an overlay, and resizing avoids window buttons', async ({ page }) => {
  await openLibrary(page);
  const add=page.getByRole('button',{name:'添加目录',exact:true}), toggle=page.getByRole('switch',{name:'随机阅读',exact:true});
  const a=(await add.boundingBox())!,b=(await toggle.boundingBox())!;
  expect(b.x).toBeGreaterThan(a.x+a.width);
  expect(Math.abs(b.height-a.height)).toBeLessThan(1);
  await toggle.hover();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await toggle.click();
  await expect(page.getByRole('button',{name:'重随机',exact:true})).toBeEnabled();
  const geometry=await page.locator('.random-browse-actions').evaluate(element=>{
    const toggle=element.children[0].getBoundingClientRect(),redraw=element.children[1].getBoundingClientRect();
    return {gap:redraw.left-toggle.right,height:redraw.height-toggle.height};
  });
  expect(geometry).toEqual({gap:0,height:0});
  await page.getByRole('button',{name:'重随机',exact:true}).hover();
  await expect(page.getByRole('tooltip')).toHaveText('重随机');
  await toggle.click();
  await page.getByRole('button',{name:'选择',exact:true}).click();
  const first=page.locator('.resource-card').first();await first.click();
  await expect(first).toHaveClass(/is-selected/);
  await expect(first.locator('.selection-check')).toBeHidden();
  expect(await first.evaluate(element=>getComputedStyle(element,'::after').backgroundColor)).toContain('0.28');
  for(const width of [1440,1280,1240,1201,1200,1100,1080,1024,960]){
    await page.setViewportSize({width,height:900});
    const overlap=await page.evaluate(()=>{
      const win=document.querySelector('.window-controls')!.getBoundingClientRect();
      return [...document.querySelectorAll('.library-controls button,.library-controls summary,.library-controls .glass-select-trigger')].filter(element=>{
        const r=element.getBoundingClientRect();return r.width>0&&r.right>win.left&&r.left<win.right&&r.bottom>win.top&&r.top<win.bottom;
      }).map(element=>({text:element.textContent,x:element.getBoundingClientRect().x,right:element.getBoundingClientRect().right}));
    });
    await page.screenshot({path:`test-results/pc-selection-${width}.png`});
    expect(overlap,`window buttons at ${width}`).toEqual([]);
    expect(await page.locator('.library-controls').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    expect((await page.locator('.library-controls').boundingBox())!.height).toBeLessThan(50);
    await expect(page.locator('.library-footer')).toHaveCSS('height','46px');
    expect(await page.locator('.library-footer').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
    expect(await page.locator('.library-footer').evaluate(element=>{
      const footer=element.getBoundingClientRect();return [...element.querySelectorAll('.library-footer-actions,.pagination-bar')].every(item=>{const box=item.getBoundingClientRect();return box.top>=footer.top&&box.bottom<=footer.bottom&&box.right<=footer.right;});
    })).toBe(true);

    const rail=page.locator('.desktop-library-float');
    await expect(rail.getByRole('textbox',{name:'当前页码',exact:true})).toHaveCount(0);
    await expect(rail.getByRole('combobox',{name:'每页数量',exact:true})).toHaveCount(0);
    await expect(page.locator('.library-footer').getByRole('textbox',{name:'当前页码',exact:true})).toBeVisible();
    if(width<=1200) await expect(rail.getByRole('button',{name:'全选',exact:true})).toBeVisible();
    else await expect(rail.getByRole('button',{name:'全选',exact:true})).toBeHidden();
    if(width<=1200) expect(await page.evaluate(()=>{
      const rail=document.querySelector('.desktop-library-float')!.getBoundingClientRect(),header=document.querySelector('.library-controls')!.getBoundingClientRect(),footer=document.querySelector('.library-footer')!.getBoundingClientRect(),scroll=document.querySelector('.resource-list-scroll')!.getBoundingClientRect();
      return rail.top>=header.bottom+8&&rail.bottom<=footer.top-12&&rail.right<=scroll.right-20;
    })).toBe(true);

  }
  await page.screenshot({path:'test-results/pc-selection-narrow.png'});
});

test('empty views use sidebar SVGs and random mode keeps icon and title positions', async ({page})=>{
  await page.addInitScript(installMock,{count:0});
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  for(const view of ['收藏','书签']){
    await page.locator('.sidebar-primary-nav').getByRole('button',{name:new RegExp(`^${view}`)}).click();
    const before=await page.locator('.empty-illustration').boundingBox();
    const title=await page.locator('.empty-library h2').boundingBox();
    await expect(page.locator('.empty-illustration .app-svg-icon')).toHaveCount(1);
    await page.getByRole('switch',{name:'随机阅读',exact:true}).click();
    await expect(page.getByRole('button',{name:'重随机',exact:true})).toBeEnabled();
    const after=await page.locator('.empty-illustration').boundingBox();
    const titleAfter=await page.locator('.empty-library h2').boundingBox();
    expect(after).toEqual(before);expect(titleAfter!.y).toBe(title!.y);expect(titleAfter!.height).toBe(title!.height);
  }
  await page.screenshot({path:'test-results/pc-empty-random-stable.png'});
});


test.describe('Android tablet adaptation',()=>{
  test.use({isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 15; Tablet) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'});
  for(const size of [{width:768,height:1024},{width:1024,height:768},{width:1280,height:800}]) test(`grid, settings and reader at ${size.width} x ${size.height}`,async({page})=>{
    await page.setViewportSize(size);await openLibrary(page);
    await expect(page.locator('.is-mobile-library')).toBeVisible();
    const columns=await page.locator('.resource-list').first().evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBeGreaterThan(2);expect(columns).toBeLessThanOrEqual(8);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'显示选项',exact:true}).click();
    const sheet=(await page.locator('.mobile-sheet').boundingBox())!;expect(sheet.width).toBeLessThanOrEqual(562);
    await page.screenshot({path:`test-results/tablet-${size.width}-options.png`});
    await page.getByRole('button',{name:/应用设置/}).click();
    const settings=page.locator('.mobile-settings-body');
    expect((await settings.boundingBox())!.width).toBeLessThanOrEqual(960);
    expect(await settings.locator('nav').evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(2);
    await page.screenshot({path:`test-results/tablet-${size.width}-settings.png`});
    await page.locator('.mobile-settings-page > header button').click();
    await page.locator('[data-library-index="0"]').click();
    await page.locator('.resource-card').first().click();
    await expect(page.locator('.reader-layout')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`test-results/tablet-${size.width}-reader.png`});
    await page.evaluate(()=>window.dispatchEvent(new Event('omi-reader-back',{cancelable:true})));
    await page.getByRole('button',{name:'切换列表卡片',exact:true}).click();
    expect(await page.locator('.resource-list').first().evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(size.width>=1000?2:1);
    await page.setViewportSize({width:size.height,height:size.width});
    await expect.poll(()=>page.locator('.resource-list').first().evaluate(element=>getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(size.height>=1000?2:1);

  });
});
