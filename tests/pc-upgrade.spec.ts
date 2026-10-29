import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
import { expectReaderPixels } from './readerPixels';

async function setup(page:Page,count=140) {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(installMock,{count:120});
  await page.addInitScript(async count=>{
    const api=(window as any).omicomic,data=(await api.getAppData()).data;
    Object.assign(data.settings,{colorTheme:'mist',cardScale:75,recentOpenedLimit:200,readerMemoryCacheSizeMb:512,readerPreloadPages:12,readerImageLoadConcurrency:8});
    const books=Array.from({length:count},(_,i)=>({resourceKey:`folder:/comics/Book ${i}`,sourcePath:`/comics/Book ${i}`,sourceType:'folder',title:`Book ${i} with a long filename for the second title line`,sortIndex:i,addedAt:1,createdAt:1,updatedAt:count-i,currentPageIndex:i%120,totalPages:120,hasStartedReading:true,tags:[],note:''}));
    data.favorites=books;data.recentOpened=books;data.bookmarks=books.map((b,i)=>({...b,id:`mark-${i}`,pageIndex:0,pageName:'page0.png'}));
    data.bookshelves=[{id:'cat',name:'Category',sortIndex:0}];
    data.virtualFolders=books.map((b,i)=>({id:`shelf-${i}`,name:`Shelf ${i}`,bookshelfId:'cat',items:i===0?books:[],tags:[],note:'',sortIndex:i,createdAt:1,updatedAt:1}));
    data.readingProgress=Object.fromEntries(books.map(b=>[b.resourceKey,b]));
    api.getFavorites=async()=>({ok:true,data:books});api.getRecentOpened=async()=>({ok:true,data:books});api.getBookmarks=async()=>({ok:true,data:data.bookmarks});
    api.listDirectory=async()=>({ok:true,data:{path:'/comics',parentPath:null,items:books.map(b=>({id:b.sourcePath,path:b.sourcePath,type:'folder',name:b.title,extension:''})),total:count}});
    api.getBookmarkPagePreview=async()=>({ok:true,data:{dataUrl:(await api.getThumbnail({path:''})).data.url}});
  },count);
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await expect(page.locator('.resource-card').first()).toBeVisible();
}
const nav=(page:Page,name:string)=>page.locator('.page-panel.is-visible .library-sidebar button').filter({hasText:name}).first();

test('all desktop collections scroll continuously and retain row-aligned page navigation',async({page})=>{
  await setup(page);
  for(const label of ['资源库','收藏','书签','最近阅读','书架']) {
    await nav(page,label).click();
    const root=page.locator(label==='书架'?'.bookshelf-root-view':'.resource-list-scroll');
    const cards=page.locator(label==='书架'?'.bookshelf-folder-card':'.resource-card');
    await expect(cards.first()).toBeVisible();expect(await cards.count()).toBeLessThan(140);
    const input=page.getByRole('textbox',{name:'当前页码',exact:true});
    await input.fill('2');await input.press('Enter');await expect(input).toHaveValue('2');
    await root.evaluate(el=>{(window as any).__retainedCard=[...el.querySelectorAll(".resource-card,.bookshelf-folder-card")].find(card=>card.getBoundingClientRect().top>=el.getBoundingClientRect().top);});
    await root.evaluate(el=>{el.scrollTop-=40;});await expect(input).toHaveValue('1');
    await root.hover();await page.mouse.wheel(0,80);await expect(input).toHaveValue('2');
    expect(await page.evaluate(()=>(window as any).__retainedCard.isConnected)).toBe(true);
    await page.getByRole('button',{name:'尾页',exact:true}).click();
    await root.evaluate(el=>{el.scrollTop=el.scrollHeight;});await expect(input).toHaveValue('3');
    await expect(page.getByRole('button',{name:'下一页',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'首页',exact:true}).click();await expect(input).toHaveValue('1');
    await expect(page.locator('.page-size-effective')).toHaveCount(0);
  }
  await page.locator('.bookshelf-folder-card').first().dblclick();
  await expect(page.locator('.resource-card').first()).toBeVisible();
  await page.getByRole('button',{name:'尾页',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'当前页码',exact:true})).toHaveValue('3');
});

test('cards clip progress, show two title lines and dismiss right-click menus before details',async({page})=>{
  await setup(page,8);
  const card=page.locator('.resource-card').first(),title=card.locator('.resource-details strong');
  await card.locator('.resource-preview').hover();await page.waitForTimeout(500);await expect(page.getByRole('tooltip')).toHaveCount(0);
  await title.hover();await expect(page.getByRole('tooltip')).toHaveText(await title.innerText());
  await expect(title).toHaveCSS('-webkit-line-clamp','2');await expect(card).toHaveCSS('overflow','hidden');
  await card.click({button:'right',position:{x:20,y:20}});await expect(page.locator('.recent-context-menu')).toBeVisible();
  await card.getByRole('button',{name:'打开资源信息'}).click();await expect(page.locator('#resource-detail-title')).toBeVisible();await expect(page.locator('.recent-context-menu')).toHaveCount(0);
  await page.screenshot({path:'test-results/pc-upgrade-details.png'});
});

test('desktop languages, custom text sizes and fixed shelf focus indicators',async({page})=>{
  await setup(page,8);await nav(page,'书架').click();
  const tab=page.locator('.bookshelf-category-slot-marker');
  expect(await tab.evaluate(el=>getComputedStyle(el,'::before').content)).not.toBe('none');
  await expect(page.locator('.bookshelf-folder-empty-mark .app-svg-icon').first()).toBeVisible();
  for(const position of ['before','after']) {
    const card=page.locator('.bookshelf-folder-card').nth(1);await card.evaluate((el,pos)=>el.classList.add(`is-card-middle-drop-${pos}`),position);
    await expect(card).toHaveCSS('box-shadow',/0px 0px 0px 2px/);
    await page.screenshot({path:`test-results/pc-upgrade-shelf-${position}.png`});
    await card.evaluate((el,pos)=>el.classList.remove(`is-card-middle-drop-${pos}`),position);
  }
  await page.locator('.sidebar-settings-button').click();await page.locator('#settings-category-appearance').click();
  await page.getByRole('spinbutton',{name:'页码与信息字号',exact:true}).fill('18');await page.getByRole('spinbutton',{name:'页码与信息字号',exact:true}).press('Enter');
  expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--desktop-info-size').trim())).toBe('18px');
  const language=page.getByRole('combobox',{name:'语言 / Language'});
  await language.click();await page.getByRole('option',{name:'English',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','en');await expect(page.locator('.settings-window')).toContainText('Page and info text size');
  await page.getByRole('combobox',{name:/Language/}).click();await page.getByRole('option',{name:'日本語',exact:true}).click();
  await expect(page.locator('html')).toHaveAttribute('lang','ja');await expect(page.locator('.settings-window')).toContainText('ページ番号と情報の文字サイズ');
  await page.screenshot({path:'test-results/pc-upgrade-japanese.png'});
});

test('desktop prefetch survives adjacent turns and drops distant work',async({page})=>{
  await setup(page,8);
  await page.evaluate(()=>{
    const api=(window as any).omicomic,read=api.getPageImage;(window as any).__pageReads=[];
    api.getPageImage=async(input:any)=>{if(!input.preview){(window as any).__pageReads.push(input.sourcePath);await new Promise(resolve=>setTimeout(resolve,160));}return read(input);};
  });
  await page.locator('.resource-card').first().dblclick();await expectReaderPixels(page.locator('.reader-image').first());
  await expect.poll(()=>page.evaluate(()=>(window as any).__pageReads.length)).toBeGreaterThan(3);
  for(let i=0;i<6;i++){await page.getByRole('button',{name:'下一页',exact:true}).click();await page.waitForTimeout(45);}
  await expect(page.locator('.reader-page-jump input')).toHaveValue('7');await expectReaderPixels(page.locator('.reader-image').first());
  await page.getByRole('button',{name:'上一页',exact:true}).click();await expect(page.locator('.reader-page-jump input')).toHaveValue('6');
  const duplicate=await page.evaluate(()=>{const list=(window as any).__pageReads;return list.filter((item:string,i:number)=>list.indexOf(item)!==i);});expect(duplicate).toEqual([]);
  await page.locator('.reader-page-jump input').fill('110');await page.locator('.reader-page-jump input').press('Enter');
  await expect(page.locator('.reader-page-jump input')).toHaveValue('110');await expectReaderPixels(page.locator('.reader-image').first());
});

test('normal reader auto-hide keeps controls during held input and restores at screen edges',async({page})=>{
  await setup(page,8);
  await page.evaluate(async()=>{await window.omicomic.updateSettings({desktopReaderAutoHide:true,immersiveAutoHideDelay:500});});
  await page.locator('.resource-card').first().dblclick();await expectReaderPixels(page.locator('.reader-image').first());
  await expect(page.locator('.reader-layout')).toHaveClass(/is-auto-hide/);
  await page.mouse.move(800,400);await expect(page.locator('.reader-layout')).toHaveClass(/is-top-ui-hidden/);
  await page.mouse.move(800,5);await expect(page.locator('.reader-layout')).not.toHaveClass(/is-top-ui-hidden/);
  await page.mouse.down();await page.waitForTimeout(700);await expect(page.locator('.reader-layout')).not.toHaveClass(/is-top-ui-hidden/);
  await page.mouse.up();await page.mouse.move(800,400);await expect(page.locator('.reader-layout')).toHaveClass(/is-top-ui-hidden/);
  await expect(page.locator('.reader-toolbar')).toHaveCSS('background-color','rgb(246, 247, 249)');
});
