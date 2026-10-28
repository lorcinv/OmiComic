import {test,expect,type Page,type Locator} from '@playwright/test';
import {installMock} from './mock';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const back=async(page:Page)=>{await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));await page.waitForTimeout(350);};
async function start(page:Page){
  page.on('pageerror',e=>console.log('PAGE ERROR:',e.message));
  await page.addInitScript(installMock,{count:16});
  await page.addInitScript(async()=>{
    const api=window.omicomic,result=await api.getAppData();if(!result.ok)return;const d=result.data;
    Object.assign(d.settings,JSON.parse(localStorage.getItem('settings1120')??'{}'));
    const save=api.updateSettings;api.updateSettings=async patch=>{const r=await save(patch);if(r.ok)localStorage.setItem('settings1120',JSON.stringify(r.data));return r;};
    const books=['Alpha','Beta','Gamma'].map((title,i)=>({resourceKey:'folder:/comics/'+title,sourcePath:'/comics/'+title,sourceType:'folder' as const,title,addedAt:1,updatedAt:1,sortIndex:i}));
    d.favorites=books;api.getFavorites=async()=>({ok:true,data:d.favorites});
    api.getBookmarkPagePreview=async()=>({ok:false,error:{code:'TEST_NO_PREVIEW',message:'Test preview unavailable'}});
    d.bookmarks=books.map((book,i)=>({...book,id:'mark'+i,pageIndex:0,pageName:'page0.png',createdAt:1}));api.getBookmarks=async()=>({ok:true,data:d.bookmarks});
    d.bookshelves=[{id:'cat',name:'分类',sortIndex:0,createdAt:1,updatedAt:1}];
    d.virtualFolders=['Shelf A','Shelf B','Shelf C'].map((name,i)=>({id:'s'+i,bookshelfId:'cat',name,sortIndex:i,createdAt:1,updatedAt:1,tags:[],note:'',items:books.map((book,j)=>({...book,id:'i'+j,folderId:'s'+i}))}));
    api.reorderFavorites=async keys=>({ok:true,data:d.favorites=keys.map((key,i)=>({...d.favorites.find(b=>b.resourceKey===key)!,sortIndex:i}))});
    api.reorderVirtualFolders=async input=>{const keys=input;d.virtualFolders=keys.map((key:string,i:number)=>({...d.virtualFolders.find(b=>b.id===key)!,sortIndex:i}));return {ok:true,data:d.virtualFolders};};
    api.deleteVirtualFolder=async id=>({ok:true,data:d.virtualFolders=d.virtualFolders.filter(b=>b.id!==id)});
  });
  await page.goto('/');await expect(page.locator('.omi-home__book')).toHaveCount(4);
}
async function hold(page:Page,card:Locator){
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-navigation',/.+/);await card.click({trial:true});
  const r=(await card.boundingBox())!, client=await page.context().newCDPSession(page);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+50,y:r.y+50,id:0}]});
  await page.waitForTimeout(600);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();
}
test('both settings entrances remain above the shared shade',async({page})=>{
  await start(page);
  await page.locator('.mobile-home-nav').getByRole('button',{name:'设置',exact:true}).tap();
  const settings=page.locator('.mobile-settings-surface');await expect(settings).toBeVisible();
  const foreground=()=>settings.evaluate(el=>{const target=el.querySelector('strong')!,r=target.getBoundingClientRect();return {onBody:el.parentElement===document.body,aboveShade:el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)),color:getComputedStyle(target).color};});
  await page.waitForTimeout(350);const home=await foreground();expect(home.onBody&&home.aboveShade).toBe(true);
  await page.screenshot({path:'test-results/mobile1120-settings-home.png'});await back(page);
  await page.getByRole('button',{name:'打开资源库',exact:true}).tap();await page.getByRole('button',{name:'显示选项',exact:true}).tap();await page.getByRole('button',{name:'应用设置',exact:true}).tap();await page.waitForTimeout(350);
  expect(await foreground()).toEqual(home);await page.screenshot({path:'test-results/mobile1120-settings-library.png'});
});
test('long press directly selects across resource views; tap adds and back clears',async({page})=>{
  await start(page);await page.getByRole('button',{name:'打开资源库',exact:true}).tap();
  const nav=page.getByRole('navigation',{name:'主导航'}),cards=page.locator('.mobile-resource-card');
  for(const view of ['资源库','最近阅读','收藏','书签','书架']){

    const tab=nav.getByRole('button',{name:view,exact:true});if(await tab.getAttribute('aria-current')!=='page')await tab.tap();if(view==='书架')await page.getByRole('button',{name:'Shelf A',exact:true}).tap();
    await hold(page,cards.first());await expect(cards.first()).toHaveClass(/is-selected/);
    expect(await cards.first().evaluate(el=>getComputedStyle(el,'::after').backgroundColor)).toBe('rgba(112, 173, 225, 0.26)');
    await expect(page.locator('.mobile-action-bar').getByRole('button',{name:'选择',exact:true})).toHaveCount(0);
    await expect(page.locator('.mobile-floating-actions').getByRole('button',{name:'全选',exact:true})).toBeVisible();
    await cards.nth(1).tap();await expect(page.locator('.mobile-resource-card.is-selected')).toHaveCount(2);
    await page.getByRole('button',{name:'全选',exact:true}).tap();await expect(page.locator('.mobile-resource-card.is-selected')).toHaveCount(await cards.count());
    await back(page);await expect(page.locator('.mobile-resource-card.is-selected')).toHaveCount(0);await expect(page.locator('.mobile-action-bar')).toHaveCount(0);
  }
});
test('sorting selects every resource and remains selected while dragging',async({page})=>{
  await start(page);await page.getByRole('button',{name:'打开资源库',exact:true}).tap();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'收藏',exact:true}).tap();
  const cards=page.locator('.mobile-resource-card');await hold(page,cards.first());await page.getByRole('button',{name:'排序',exact:true}).tap();
  await expect(page.locator('.mobile-resource-card.is-selected.is-touch-sortable')).toHaveCount(3);await cards.nth(1).tap();await expect(page.locator('.mobile-resource-card.is-selected')).toHaveCount(3);
  const from=(await cards.first().boundingBox())!,to=(await cards.nth(1).boundingBox())!;
  await page.mouse.move(from.x+50,from.y+50);await page.mouse.down();await page.mouse.move(to.x+50,to.y+50,{steps:12});await page.mouse.up();
  await expect(cards.first()).toHaveAttribute('aria-label','Beta');await expect(page.locator('.mobile-resource-card.is-selected')).toHaveCount(3);await page.screenshot({path:'test-results/mobile1120-sort.png'});
  await page.getByRole('button',{name:'完成排序',exact:true}).tap();await expect(page.locator('.is-touch-sortable')).toHaveCount(0);await back(page);await expect(page.locator('.mobile-action-bar')).toHaveCount(0);
});
test('bookshelf containers support direct multiselect, sorting and confirmed batch deletion',async({page})=>{
  await start(page);await page.getByRole('button',{name:'打开资源库',exact:true}).tap();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'书架',exact:true}).tap();
  const cards=page.locator('.mobile-bookshelf-card');await hold(page,cards.first());await expect(cards.first()).toHaveClass(/is-selected/);await cards.nth(1).tap();await expect(page.locator('.mobile-bookshelf-card.is-selected')).toHaveCount(2);
  await page.getByRole('button',{name:'排序',exact:true}).tap();await expect(page.locator('.mobile-bookshelf-card.is-selected.is-touch-sortable')).toHaveCount(3);
  await page.getByRole('button',{name:'完成排序',exact:true}).tap();await page.getByRole('button',{name:'取消全选',exact:true}).tap();await cards.first().tap();await cards.nth(1).tap();
  await page.getByRole('button',{name:'删除书架',exact:true}).tap();await expect(page.getByRole('dialog')).toContainText('Shelf A、Shelf B');await page.getByRole('button',{name:'取消',exact:true}).tap();await expect(cards).toHaveCount(3);
  await page.getByRole('button',{name:'删除书架',exact:true}).tap();await page.getByRole('dialog').getByRole('button',{name:'删除',exact:true}).tap();await expect(cards).toHaveCount(1);await expect(cards).toHaveAttribute('aria-label','Shelf C');
});
test('reader chrome hides after idle, stays during a panel and previews, and can be disabled persistently',async({page})=>{
  test.setTimeout(60000);await start(page);
  await page.locator('.mobile-home-nav').getByRole('button',{name:'设置',exact:true}).tap();await page.getByRole('button',{name:/漫画阅读设置/}).tap();
  const toggle=page.getByRole('checkbox',{name:'阅读工具栏 3 秒自动隐藏'});await expect(toggle).toBeChecked();await back(page);await back(page);
  await page.getByRole('button',{name:'打开资源库',exact:true}).tap();await page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).tap();
  const stage=page.locator('.reader-stage'),bar=page.locator('.reader-toolbar');await stage.tap();await expect(bar).toBeVisible();await page.waitForTimeout(2200);await expect(bar).toBeVisible();await expect(bar).toBeHidden({timeout:2000});
  await stage.tap();await page.getByRole('button',{name:'阅读设置',exact:true}).tap();await page.waitForTimeout(3300);await expect(bar).toBeVisible();await back(page);await expect(bar).toBeHidden({timeout:4000});
  await stage.tap();const rail=page.getByRole('slider',{name:'阅读进度'}),r=(await rail.boundingBox())!;await page.mouse.move(r.x+30,r.y+18);await page.mouse.down();await page.mouse.move(r.x+120,r.y+18,{steps:10});await page.mouse.up();await expect(page.locator('.mobile-reader-previews')).toBeVisible();await page.waitForTimeout(3300);await expect(bar).toBeVisible();await expect(page.locator('.mobile-reader-previews')).toBeVisible();
  await back(page);await back(page);await page.getByRole('button',{name:'显示选项',exact:true}).tap();await page.getByRole('button',{name:'应用设置',exact:true}).tap();await page.getByRole('button',{name:/漫画阅读设置/}).tap();await toggle.uncheck();await back(page);await back(page);
  await page.reload();await page.getByRole('button',{name:'打开资源库',exact:true}).tap();await page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).tap();await stage.tap();await page.waitForTimeout(3500);await expect(bar).toBeVisible();
});
