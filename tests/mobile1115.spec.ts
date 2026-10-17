import { test, expect } from '@playwright/test';
import { installMock } from './mock';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('first-row covers and displaced brand clicks can only open the intended comic', async ({ page }) => {
  await page.addInitScript(installMock, { count: 16 });
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(4);
  const hits = await page.evaluate(() => [...document.querySelectorAll('.omi-home__book')].slice(0, 2).flatMap(book => {
    const r = book.querySelector('.omi-home__cover')!.getBoundingClientRect();
    return [.1, .25, .5, .75, .9].flatMap(y => [.1, .5, .9].map(x => {
      const hit = document.elementFromPoint(r.left + r.width * x, r.top + r.height * y);
      return { expected: book.getAttribute('aria-label'), actual: hit?.closest('button')?.getAttribute('aria-label'), target: hit?.outerHTML.slice(0, 150) };
    }));
  }));
  await page.screenshot({ path: 'test-results/mobile1115-home.png' });
  expect(hits.filter(hit => hit.expected !== hit.actual)).toEqual([]);
  await page.evaluate(() => {
    const old = window.omicomic.getResourcePages;
    (window as any).__opened = [];
    window.omicomic.getResourcePages = input => { (window as any).__opened.push(input.path); return old(input); };
    const cover=document.querySelectorAll('.omi-home__book')[1].getBoundingClientRect();
    document.querySelector('.omi-home .omi-brand-icon')!.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1,clientX:cover.left+18,clientY:cover.top+20}));
  });
  expect(await page.evaluate(()=>(window as any).__opened)).toEqual([]);
  await page.locator('.omi-home__book').nth(1).tap({ position: { x: 18, y: 20 } });
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__opened)).toEqual(['/comics/Second']);
});

for(const source of ['home','recent'] as const)test(`${source} cards remain in place until the reader has finished opening`, async ({ page }) => {
  await page.addInitScript(installMock, { count: 16 });
  await page.addInitScript(() => {
    const api = window.omicomic, getImage = api.getPageImage, save = api.saveReadingProgress;
    api.getPageImage = async input => {
      await new Promise<void>(resolve => { ((window as any).__images ??= []).push(resolve); });
      return getImage(input);
    };
    api.saveReadingProgress = async input => {
      ((window as any).__saves??=[]).push({transition:document.documentElement.dataset.mobileNavigation??'',reader:!!document.querySelector('.page-panel.is-visible .reader-stage')});
      const result = await save(input), state = await api.getAppData();
      if (state.ok) state.data.recentOpened = [{ ...input, updatedAt: Date.now() }, ...state.data.recentOpened.filter(item => item.resourceKey !== input.resourceKey)];
      return result;
    };
  });
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(4);
  if(source==='recent'){
    await page.getByRole('button',{name:'打开资源库',exact:true}).tap();
    await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'最近阅读',exact:true}).tap();
    await expect(page.locator('.mobile-resource-card')).toHaveCount(4);
  }
  const titles=page.locator(source==='home'?'.omi-home__book-title':'.mobile-resource-card strong');
  const cards=page.locator(source==='home'?'.omi-home__book':'.mobile-resource-card');
  const before = await titles.allTextContents();
  await cards.nth(3).tap();
  await expect.poll(() => page.evaluate(() => (window as any).__images?.length ?? 0)).toBeGreaterThan(0);
  await page.waitForTimeout(850);
  expect(await titles.allTextContents()).toEqual(before);
  expect(await page.evaluate(()=>(window as any).__saves??[])).toEqual([]);
  if(source==='home')await expect(cards.nth(3)).toBeDisabled();
  await page.evaluate(() => { const callbacks = (window as any).__images; window.omicomic.getPageImage = async () => ({ ok: true, data: { url: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>' } }); callbacks.forEach((release: () => void) => release()); });
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__saves?.length??0)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>(window as any).__saves.every((save:any)=>save.reader&&save.transition===''))).toBe(true);
});

test('page display choices persist independently and both path actions use the library layout', async ({ page }) => {
  await page.addInitScript(installMock, { count: 12 });
  await page.addInitScript(async () => {
    const api=window.omicomic,result=await api.getAppData(); if(!result.ok)return;
    const d=result.data;
    Object.assign(d.settings,JSON.parse(localStorage.getItem('display1115')??'{}'));
    const saved=api.updateSettings; api.updateSettings=async patch=>{const r=await saved(patch);if(r.ok)localStorage.setItem('display1115',JSON.stringify(r.data));return r;};
    d.bookshelves=[{id:'category',name:'分类',createdAt:1,updatedAt:1,sortIndex:0}];
    d.virtualFolders=[{id:'shelf',bookshelfId:'category',name:'我的书架',createdAt:1,updatedAt:1,sortIndex:0,tags:[],note:'',items:[{id:'item',folderId:'shelf',resourceKey:'folder:/comics/Book',title:'Book',sourcePath:'/comics/Book',sourceType:'folder',addedAt:1,sortIndex:0}]}];
  });
  await page.goto('/');
  await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  const layout=page.locator('.page-panel.is-visible .library-layout'), nav=page.getByRole('navigation',{name:'主导航'});
  await expect(layout).toHaveClass(/mobile-cards-grid/);
  await page.getByRole('button',{name:'切换列表卡片'}).click();
  await expect(layout).toHaveClass(/mobile-cards-list/);
  await nav.getByRole('button',{name:'书架',exact:true}).click();
  await expect(layout).toHaveClass(/mobile-cards-grid/);
  await page.getByRole('button',{name:'我的书架',exact:true}).click();
  await expect(layout).toHaveClass(/mobile-cards-grid/);
  const book=page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})});
  await book.dispatchEvent('pointerdown',{button:0,pointerType:'touch',clientX:90,clientY:170});
  await expect(page.getByRole('button',{name:'打开路径',exact:true})).toBeVisible();
  await expect(page.locator('.mobile-floating-actions button').last()).toHaveText('打开路径');
  await book.dispatchEvent('pointerup');
  await page.getByRole('button',{name:'打开路径',exact:true}).click();
  await expect(nav.getByRole('button',{name:'资源库',exact:true})).toHaveAttribute('aria-current','page');
  await expect(layout).toHaveClass(/mobile-cards-list/);
  await nav.getByRole('button',{name:'最近阅读',exact:true}).click();
  await expect(layout).toHaveClass(/mobile-cards-grid/);
  const recent=page.locator('.mobile-resource-card').first();
  await recent.dispatchEvent('pointerdown',{button:0,pointerType:'touch',clientX:90,clientY:170});
  await expect(page.getByRole('button',{name:'打开路径',exact:true})).toBeVisible();await recent.dispatchEvent('pointerup');
  await page.getByRole('button',{name:'打开路径',exact:true}).click();
  await expect(layout).toHaveClass(/mobile-cards-list/);
  for(const title of ['收藏','书签']){
    await nav.getByRole('button',{name:title,exact:true}).click();await expect(layout).toHaveClass(/mobile-cards-grid/);
    if(title==='收藏')await page.getByRole('button',{name:'切换列表卡片'}).click();
  }
  await page.reload();await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await expect(layout).toHaveClass(/mobile-cards-list/);
  await nav.getByRole('button',{name:'收藏',exact:true}).click();await expect(layout).toHaveClass(/mobile-cards-list/);
  await nav.getByRole('button',{name:'书架',exact:true}).click();await expect(layout).toHaveClass(/mobile-cards-grid/);
});

test('mobile text selection is restricted to detail filenames and editable fields',async({page})=>{
  await page.addInitScript(installMock,{count:12});await page.goto('/');
  await expect(page.locator('.omi-home__book').first()).toBeVisible();
  expect(await page.locator('.omi-home__book-title').first().evaluate(el=>getComputedStyle(el).userSelect)).toBe('none');
  expect(await page.locator('.omi-home__book-title').first().evaluate(el=>el.dispatchEvent(new Event('contextmenu',{bubbles:true,cancelable:true})))).toBe(false);
  await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  const book=page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})});
  await book.getByRole('button',{name:'打开资源信息',exact:true}).click();
  const title=page.locator('#resource-detail-title');await expect(title).toBeVisible();
  expect(await title.evaluate(el=>getComputedStyle(el).userSelect)).toBe('text');
  expect(await title.evaluate(el=>el.dispatchEvent(new Event('contextmenu',{bubbles:true,cancelable:true})))).toBe(true);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.mobileNavigation??'')).toBe('');
  await page.screenshot({path:'test-results/mobile1115-detail.png'});
});
