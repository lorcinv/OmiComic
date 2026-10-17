import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

test.use({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
test.beforeEach(async ({page}) => {
  await page.addInitScript(installMock,{count:12});
  await page.emulateMedia({reducedMotion:'reduce'});
});
const back = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event('omi-back')));
async function library(page: Page) { await page.goto('/'); await page.getByRole('button',{name:'打开资源库',exact:true}).tap(); await expect(page.locator('.mobile-resource-card')).toHaveCount(14); }

test('compact phone home, list/grid, detail and hierarchical settings',async ({page}) => {
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(4);
  const books=await page.locator('.omi-home__book').all();
  const boxes=await Promise.all(books.map(book=>book.boundingBox()));
  expect(boxes[0]!.y).toBe(boxes[1]!.y);expect(boxes[2]!.y).toBe(boxes[3]!.y);
  expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y);
  await expect(page.locator('.omi-home__art,.omi-home__signature,.omi-home__footer')).toHaveCount(0);
  await page.screenshot({path:'test-results/rework-home.png'});
  await page.getByRole('button',{name:'打开资源库',exact:true}).tap();
  await expect(page.getByText('临时存放',{exact:true})).toBeHidden();
  await expect(page.locator('.mobile-library-back')).toHaveCount(0);
  await expect(page.locator('.mobile-resource-card')).toHaveCount(14);await page.screenshot({path:'test-results/rework-grid.png'});
  await page.getByRole('button',{name:'切换列表卡片'}).tap();
  const card=page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})});
  await expect(card.locator('.mobile-card-info')).toBeVisible();
  expect((await card.boundingBox())!.height).toBe(123);
  await page.screenshot({path:'test-results/rework-list.png'});
  await card.locator('.resource-preview').tap();
  await expect(page.locator('.resource-detail-page')).toBeVisible();
  await expect(page.locator('.resource-detail-back')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'test-results/rework-detail.png'});
  await back(page); await expect(page.locator('.resource-detail-page')).toHaveCount(0);
  await page.getByRole('button',{name:'显示选项'}).tap();
  await expect(page.getByRole('slider',{name:'网格列数'})).toBeVisible();
  await page.getByRole('button',{name:/应用设置/}).tap();
  await expect(page.getByRole('button',{name:/外观与主题/})).toBeVisible();
  await expect(page.getByRole('tab',{name:/进度显示/})).toHaveCount(0);
  await page.locator('.mobile-setting-category').filter({hasText:'资源库'}).tap();
  await expect(page.getByRole('combobox',{name:'资源库默认排序',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/rework-settings.png'});
  await back(page);await expect(page.getByRole('button',{name:/外观与主题/})).toBeVisible();
  await back(page);await expect(page.locator('.mobile-settings-page')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('phone unified search, long press action bar, selection and layered back',async ({page}) => {
  await library(page);
  await page.getByRole('button',{name:'搜索',exact:true}).tap();
  await page.getByRole('searchbox',{name:'搜索漫画、名称或标签'}).fill('Book -Parent');
  await expect(page.locator('.mobile-resource-card')).toHaveCount(1);
  await expect(page.locator('.library-controls')).toBeHidden();
  await back(page);await expect(page.locator('.mobile-library-bar input')).toHaveCount(0);
  const card=page.locator('.mobile-resource-card').first();
  await card.dispatchEvent('contextmenu');
  await expect(page.getByRole('navigation',{name:'资源操作'})).toBeVisible();
  await expect(page.locator('.recent-context-menu')).toHaveCount(0);
  await expect(page.getByRole('navigation',{name:'资源操作'}).getByRole('button',{name:'选择',exact:true})).toHaveCount(0);
  await expect(card.getByRole('checkbox')).toHaveAttribute('aria-checked','true');
  await page.screenshot({path:'test-results/rework-selection.png'});
  await back(page);await expect(card.getByRole('checkbox')).toHaveCount(0);await expect(page.locator('.mobile-action-bar')).toHaveCount(0);
  await page.getByRole('button',{name:'资源库目录'}).tap();
  await expect(page.getByRole('dialog',{name:'资源库',exact:true})).toBeVisible();
  await back(page);await expect(page.getByRole('dialog',{name:'资源库',exact:true})).toHaveCount(0);
  await expect(page.locator('.library-layout')).toBeVisible();
});

test('reader live seeking, persistent range, double-page and toolbar actions',async ({page}) => {
  await library(page);
  await page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).tap();
  await expect(page.locator('.reader-layout')).toBeVisible();
  await page.locator('.reader-stage').tap({position:{x:195,y:400}});
  await expect(page.locator('.reader-toolbar')).toBeVisible();
  await expect(page.getByRole('button',{name:'下一页',exact:true})).toBeHidden();
  await expect(page.locator('.mobile-reader-current')).toHaveText('1');
  const rail=page.getByRole('slider',{name:'阅读进度'}); const box=(await rail.boundingBox())!;
  expect(box.y+box.height/2).toBeLessThan(830);
  await rail.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:box.x+box.width*.5,clientY:box.y+18});
  await expect(rail).not.toHaveAttribute('aria-valuenow','1');
  await rail.dispatchEvent('pointermove',{pointerId:1,pointerType:'touch',isPrimary:true,buttons:1,clientX:box.x+box.width*.8,clientY:box.y+18});
  await expect.poll(async()=>Number(await rail.getAttribute('aria-valuenow'))).toBeGreaterThan(8);
  await rail.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:box.x+box.width*.8,clientY:box.y+18});
  await page.locator('.reader-stage').tap({position:{x:195,y:240}});
  await expect(page.locator('.mobile-reader-previews')).toHaveCount(0);
  await page.getByRole('button',{name:'阅读设置',exact:true}).tap();
  await expect(page.getByRole('dialog',{name:'阅读设置'}).getByRole('button',{name:'开始自动阅读'})).toHaveCount(0);
  await page.getByRole('button',{name:'画面调整',exact:true}).tap();
  await expect(page.getByRole('checkbox',{name:/启用/})).toHaveCount(0);
  await back(page);await expect(page.locator('.reader-tool-panel')).toHaveCount(0);
  await back(page);await expect(page.getByRole('dialog',{name:'阅读设置'})).toHaveCount(0);
  await expect(page.locator('.reader-layout')).toBeVisible();
  await page.screenshot({path:'test-results/rework-reader.png'});
});


test('phone double spread, pinch zoom, double-tap reset and global image settings',async ({page}) => {
  await page.addInitScript(() => { const api=window.omicomic,old=api.getAppData; api.getAppData=async()=>{const r=await old();if(r.ok)r.data.settings.readerDefaultFitMode='fit-window';return r;}; });
  await library(page);await page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).tap();
  const stage=page.locator('.reader-stage'),spread=page.locator('.reader-page-spread');
  await expect(spread.locator('.reader-page-frame:not([aria-hidden]) img')).toBeVisible();await stage.tap();
  await page.getByRole('button',{name:'阅读设置',exact:true}).tap();
  await page.getByRole('button',{name:'当前单页，点击切换双页'}).tap();
  await back(page);await expect(spread.locator('figure:not([aria-hidden])')).toHaveCount(2);
  await expect(page.locator('.mobile-reader-current')).toHaveText('1~2');
  const client=await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:145,y:400,id:1},{x:245,y:400,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:85,y:400,id:1},{x:305,y:400,id:2}]});
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>spread.evaluate(el=>Number(getComputedStyle(el).scale))).toBeGreaterThan(2);
  await stage.tap({position:{x:195,y:400}});await stage.tap({position:{x:195,y:400}});
  await expect.poll(()=>spread.evaluate(el=>Number(getComputedStyle(el).scale))).toBe(1);
  await page.getByRole('button',{name:'阅读设置',exact:true}).tap();await page.getByRole('button',{name:'画面调整',exact:true}).tap();
  await page.getByRole('slider',{name:'亮度',exact:true}).fill('115');
  await expect.poll(()=>page.evaluate(async()=>{const r=await window.omicomic.getAppData();return r.ok?r.data.settings.mobileImageAdjustments?.brightness:0;})).toBe(115);
  await back(page);await back(page);await back(page);
  await page.locator('.mobile-resource-card').filter({has:page.getByText('page0.png',{exact:true})}).tap();
  await expect(page.locator('.reader-layout')).toBeVisible();await stage.tap();
  await page.getByRole('button',{name:'阅读设置',exact:true}).tap();await page.getByRole('button',{name:'画面调整',exact:true}).tap();
  await expect(page.getByRole('slider',{name:'亮度',exact:true})).toHaveValue('115');
});

async function organizedLibrary(page: Page) {
  await page.addInitScript(() => {
    const api=window.omicomic,old=api.getAppData; let books:any[]=[];
    api.getAppData=async()=>{const r=await old();if(r.ok){if(!books.length)books=['Alpha','Beta','Gamma'].map((title,i)=>({resourceKey:'folder:/comics/'+title,sourcePath:'/comics/'+title,sourceType:'folder',title,addedAt:1,updatedAt:1,sortIndex:i}));r.data.favorites=books;r.data.bookshelves=[{id:'a',name:'默认分类',sortIndex:0,createdAt:1,updatedAt:1},{id:'b',name:'待阅读',sortIndex:1,createdAt:1,updatedAt:1}];r.data.virtualFolders=[{id:'s',bookshelfId:'a',name:'我的漫画',items:[],tags:[],note:'',sortIndex:0,createdAt:1,updatedAt:1}];}return r;};
    api.getFavorites=async()=>({ok:true,data:books});
    api.reorderFavorites=async keys=>{books=keys.map((key,i)=>({...books.find(item=>item.resourceKey===key),sortIndex:i}));return {ok:true,data:books};};
  });
}

test('phone favorites multiselect and touch sorting',async ({page}) => {
  await organizedLibrary(page);
  await library(page);await page.locator('.sidebar-primary-nav button').filter({hasText:'收藏'}).tap();
  const cards=page.locator('.mobile-resource-card');await expect(cards).toHaveCount(3);
  await cards.first().dispatchEvent('contextmenu');
  await cards.nth(1).tap();await expect(page.locator('.mobile-resource-card.is-selected')).toHaveCount(2);
  await back(page);await expect(page.locator('.mobile-action-bar')).toHaveCount(0);
  await cards.first().dispatchEvent('contextmenu');await page.getByRole('button',{name:'排序',exact:true}).tap();
  const from=(await cards.first().boundingBox())!,to=(await cards.nth(1).boundingBox())!;
  const client=await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x+60,y:from.y+60,id:0}]});
  await page.waitForTimeout(80);
  for (let step=1;step<=10;step++) {
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+60+(to.x-from.x)*step/10,y:from.y+60+(to.y-from.y)*step/10,id:0}]});
    await page.waitForTimeout(24);
  }
  await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(cards.first()).toHaveAttribute('aria-label','Beta');await back(page);await expect(page.locator('.mobile-action-bar')).toHaveCount(0);
  await expect(cards.first().getByRole('checkbox')).toHaveCount(0);
  await client.detach();
  // Continuation after an actual Android drag is exercised by mobile-actions.js.
});

test('phone bookshelf category drawer switches and manages categories',async ({page}) => {
  await organizedLibrary(page);await library(page);
  await page.locator('.sidebar-primary-nav button').filter({hasText:'书架'}).tap();
  await expect(page.locator('.mobile-bookshelf-card')).toHaveCount(1);await page.screenshot({path:'test-results/rework-shelves.png'});
  await page.getByRole('button',{name:'书架分类',exact:true}).tap();
  await page.getByRole('button',{name:'管理分类 待阅读'}).tap();
  await expect(page.getByRole('button',{name:'删除分类',exact:true})).toBeVisible();await back(page);
  await expect(page.locator('.library-layout')).toBeVisible();
});
