import {test,expect,type Page} from '@playwright/test';
import {installMock} from './mock';
import {expectReaderPixels} from './readerPixels';
const back=(page:Page)=>page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
async function setup(page:Page,theme='mist') {
  await page.addInitScript(installMock,{count:12});
  await page.addInitScript(async theme=>{
    const api=window.omicomic, data=(await api.getAppData() as any).data,ok=(data:any)=>({ok:true,data});
    (window as any).__data=data;(window as any).__metaPatches=[];(window as any).__removedRoots=[];
    data.settings.colorTheme=theme;data.settings.readerDefaultFitMode='fit-window';data.settings.mobileReaderPreviews=false;
    const books=['Book','Second','Third','Custom'].map((title,index)=>({resourceKey:'folder:/comics/'+title,sourcePath:'/comics/'+title,sourceType:'folder',title,sortIndex:index}));
    data.resourceMeta[books[0].resourceKey]={...books[0],tags:['科幻','彩色'],note:'原始简介'};data.tagOrder=['科幻','彩色'];
    data.bookshelves=[{id:'category',name:'我的分类',sortIndex:0}];
    data.virtualFolders=[{id:'shelf',bookshelfId:'category',name:'三本漫画叠放的书架',items:books,tags:[],note:'',sortIndex:0}, {id:'one',bookshelfId:'category',name:'一本漫画',items:[books[0]],tags:[],note:'',sortIndex:1},{id:'empty',bookshelfId:'category',name:'空书架',items:[],tags:[],note:'',sortIndex:2}];
    data.bookmarks=[{id:'mark',...books[0],bookmarkTitle:'阅读标记',pageIndex:3,pageName:'page3.png',totalPages:12,tags:[],note:'',updatedAt:1,createdAt:new Date(2026,9,14,12).getTime(),sortIndex:0}];
    api.getBookmarks=async()=>ok(data.bookmarks);api.getBookmarkPagePreview=async()=>ok({dataUrl:(await api.getPageImage({} as any) as any).data.url});
    const images=['#b8cbd5','#c8b9ac','#98b6a5','#c9bbc9'].map((color,index)=>{const canvas=document.createElement('canvas');canvas.width=600;canvas.height=900;const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,600,900);ctx.fillStyle='#ffffffaa';ctx.fillRect(40,45,520,810);ctx.fillStyle=color;ctx.font='bold 90px sans-serif';ctx.fillText(String(index+1).padStart(2,'0'),180,480);return canvas.toDataURL();});
    api.getThumbnail=async({path}:any)=>ok({url:images[Math.max(0,books.findIndex(b=>b.sourcePath===path))],byteSize:2048});
    api.getPageImage=async()=>ok({url:images[0],width:600,height:900});
    api.updateResourceMeta=async(input:any)=>{(window as any).__metaPatches.push(input);Object.assign(data.resourceMeta[input.resourceKey],input);return ok(data.resourceMeta[input.resourceKey]);};
    api.removeLibraryRoot=async path=>{(window as any).__removedRoots.push(path);data.library.roots=data.library.roots.filter((r:any)=>r.path!==path);return ok(data);};
    api.updateVirtualFolder=async(input:any)=>{const folder=data.virtualFolders.find((f:any)=>f.id===input.id);Object.assign(folder,input);return ok(folder);};
  },theme);
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
}
async function library(page:Page){await page.getByRole('button',{name:'打开资源库',exact:true}).click();await expect(page.locator('.resource-card').first()).toBeVisible();}
async function detail(page:Page){await library(page);await page.locator('.resource-card').filter({has:page.getByText('Book',{exact:true})}).getByRole('button',{name:'打开资源信息'}).click();await expect(page.locator('#resource-detail-title')).toBeVisible();}

for(const mobile of [false,true])test.describe(mobile?'phone 1.1.7':'desktop 1.1.7',()=>{
  test.use(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
  test('panorama reverses physical page order and preserves logical seeking and drag direction',async({page})=>{
    await setup(page);await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();await expectReaderPixels(page.locator('.reader-image').first());
    if(mobile){await page.locator('.reader-stage').tap();await page.getByRole('button',{name:'阅读设置',exact:true}).click();}
    await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();
    if(mobile)await back(page);
    const rail=page.getByRole('slider',{name:'阅读进度'});await rail.focus();await page.keyboard.press('Home');await expect(rail).toHaveAttribute('aria-valuenow','1');for(const value of [2,3,4]){await page.keyboard.press('ArrowRight');await expect(rail).toHaveAttribute('aria-valuenow',String(value));}
    await expect(rail).toHaveAttribute('aria-valuenow','4');
    const x=(index:number)=>page.locator(`[data-reader-page-index="${index}"]`).evaluate(el=>el.getBoundingClientRect().x);
    expect(await x(4)).toBeGreaterThan(await x(3));
    if(mobile)await page.getByRole('button',{name:'阅读设置',exact:true}).click();
    await page.getByRole('button',{name:'当前从左到右阅读，点击切换为从右到左',exact:true}).click();if(mobile)await back(page);
    await expect.poll(async()=>await x(4)-await x(3)).toBeLessThan(0);
    await expect(rail).toHaveAttribute('aria-valuenow','4');
    const center=await page.locator('[data-reader-page-index="3"]').boundingBox(),stage=(await page.locator('.reader-stage').boundingBox())!;
    expect(Math.abs(center!.x+center!.width/2-stage.x-stage.width/2)).toBeLessThan(2);
    await page.screenshot({path:`test-results/polish117-${mobile?'phone':'pc'}-rtl.png`});
    const y=stage.y+stage.height*.5;await page.mouse.move(stage.x+stage.width*.2,y);await page.mouse.down();await page.mouse.move(stage.x+stage.width*.85,y,{steps:20});await page.mouse.up();
    await expect.poll(async()=>Number(await rail.getAttribute('aria-valuenow'))).toBeGreaterThan(4);
    await rail.focus();await page.keyboard.press('Home');await expect(rail).toHaveAttribute('aria-valuenow','1');await page.keyboard.press('End');await expect(rail).toHaveAttribute('aria-valuenow','12');
    if(mobile)await page.getByRole('button',{name:'阅读设置',exact:true}).click();
    await page.getByRole('button',{name:'当前从右到左阅读，点击切换为从左到右',exact:true}).click();if(mobile)await back(page);
    await expect(rail).toHaveAttribute('aria-valuenow','12');expect(await x(11)).toBeGreaterThan(await x(10));
  });
  test('tags and notes edit separately, outside tap saves notes and exits tag editing',async({page})=>{
    await setup(page);await detail(page);const tags=page.getByLabel('资源标签',{exact:true}),note=page.getByLabel('资源简介区域',{exact:true});
    if(mobile)await tags.getByRole('button',{name:'科幻',exact:true}).dispatchEvent('contextmenu');else await tags.getByRole('button',{name:'科幻',exact:true}).dblclick();
    await expect(page.getByRole('button',{name:'移除标签：科幻'})).toBeVisible();await expect(page.getByRole('textbox',{name:'资源简介'})).toHaveCount(0);await expect(tags.getByText('完成',{exact:true})).toHaveCount(0);
    await page.locator('#resource-detail-title').click();await expect(page.getByRole('button',{name:/移除标签/})).toHaveCount(0);
    if(!mobile){
      await expect(note.getByRole('button',{name:/编辑简介|保存简介/})).toHaveCount(0);
      const alignment=await note.evaluate(el=>{
        const center=(node:Element)=>{const range=document.createRange();range.selectNodeContents(node);const rect=range.getClientRects()[0];return rect.y+rect.height/2;};
        return Math.abs(center(el.querySelector('.resource-detail-field-label')!)-center(el.querySelector('p')!));
      });
      expect(alignment).toBeLessThan(2);
    }
    if(mobile)await page.getByRole('button',{name:'编辑简介'}).click();else await note.locator('p').dblclick();
    await page.getByRole('textbox',{name:'资源简介'}).fill('独立保存的简介');await page.locator('#resource-detail-title').click();await expect(page.getByRole('textbox',{name:'资源简介'})).toHaveCount(0);await expect(note).toContainText('独立保存的简介');
    expect(await page.evaluate(()=>(window as any).__metaPatches.at(-1).tags)).toBeUndefined();
    await page.getByRole('button',{name:'添加标签',exact:true}).click();await page.getByRole('textbox',{name:'新标签'}).fill('新标签');await page.getByRole('button',{name:'添加',exact:true}).click();expect(await page.evaluate(()=>(window as any).__metaPatches.at(-1).note)).toBeUndefined();
    await page.locator('#resource-detail-title').click();const caption=page.locator('.resource-detail-thumbnail-caption').first();
    expect(await caption.evaluate(el=>{const text=el.querySelector('span')!,num=el.querySelector('strong')!,r=el.getBoundingClientRect(),n=text.getBoundingClientRect();return n.width<=r.width*2/3+1&&n.x>num.getBoundingClientRect().right&&Math.abs(n.right-r.right)<5;})).toBe(true);
    await page.screenshot({path:`test-results/polish117-${mobile?'phone':'pc'}-detail.png`});
  });
});

test.describe('phone menus and shelves 1.1.7',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('home entry is prominent and bookmark metadata separates page, date and size',async({page})=>{
    await setup(page);const home=page.locator('.mobile-home-nav'),entry=home.locator('button').first();await expect(entry).toContainText('进入资源库');expect((await entry.boundingBox())!.width/(await home.locator('button').nth(1).boundingBox())!.width).toBeGreaterThan(1.7);await page.screenshot({path:'test-results/polish117-home.png'});
    await library(page);await page.getByRole('button',{name:'书签',exact:true}).click();const card=page.locator('.mobile-resource-card').first();await expect(card.locator('.mobile-card-pages')).toHaveText('4/12');await expect(card.locator('time')).toHaveText('2026-10-14');expect(await card.locator('.mobile-card-pages').evaluate(el=>getComputedStyle(el).borderRadius)).toBe('0px');await page.screenshot({path:'test-results/polish117-bookmarks.png'});
  });
  test('stack loads first three distinct covers, custom changes only front, single and empty shelves are glass',async({page})=>{
    await setup(page);await library(page);await page.getByRole('button',{name:'书架',exact:true}).click();const shelf=page.locator('[data-shelf-id="shelf"]');await expect(shelf.locator('.mobile-shelf-layer img')).toHaveCount(3);
    const src=await shelf.locator('img').evaluateAll(els=>els.map(el=>(el as HTMLImageElement).src));expect(new Set(src).size).toBe(3);
    expect(await shelf.locator('.layer-3').evaluate(el=>el.getBoundingClientRect().x)).toBeGreaterThan(await shelf.locator('.layer-2').evaluate(el=>el.getBoundingClientRect().x));
    await expect(page.locator('[data-shelf-id="one"] .is-glass')).toHaveCount(2);await expect(page.locator('[data-shelf-id="empty"] .is-glass')).toHaveCount(3);await page.screenshot({path:'test-results/polish117-shelves.png'});
    await page.evaluate(()=>{(window as any).__data.virtualFolders[0].coverResourceKey='folder:/comics/Custom';});
    await page.getByRole('button',{name:'资源库',exact:true}).click();await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:/刷新资源库/}).click();await page.getByRole('button',{name:'书架',exact:true}).click();
    await expect.poll(()=>shelf.locator('.layer-1 img').getAttribute('src')).not.toBe(src[0]);expect(await shelf.locator('img').nth(1).getAttribute('src')).toBe(src[1]);expect(await shelf.locator('img').nth(2).getAttribute('src')).toBe(src[2]);
    await page.getByRole('button',{name:'切换列表卡片'}).click();await page.screenshot({path:'test-results/polish117-shelves-list.png'});
  });
  test('drawer root menu deletes only index, overlays nest, left swipe opens tags and blank closes just the top layer',async({page})=>{
    await setup(page);await library(page);await page.locator('.library-layout').evaluate(el=>{const touch=(x:number)=>new Touch({identifier:1,target:el,clientX:x,clientY:250});el.dispatchEvent(new TouchEvent('touchstart',{bubbles:true,touches:[touch(350)]}));el.dispatchEvent(new TouchEvent('touchmove',{bubbles:true,cancelable:true,touches:[touch(130)]}));el.dispatchEvent(new TouchEvent('touchend',{bubbles:true,touches:[],changedTouches:[touch(130)]}));});await expect(page.getByRole('dialog',{name:'标签管理'})).toBeVisible();await back(page);
    await page.getByRole('button',{name:'资源库目录'}).click();const drawer=page.getByRole('dialog',{name:'资源库',exact:true});await drawer.getByRole('button',{name:'管理资源库 Comics'}).click();const menu=page.getByRole('dialog',{name:'Comics',exact:true});await expect(menu.getByText('完成',{exact:true})).toHaveCount(0);await page.touchscreen.tap(370,250);await expect(menu).toHaveCount(0);await expect(drawer).toBeVisible();
    await drawer.getByRole('button',{name:'管理资源库 Comics'}).click();await page.getByRole('button',{name:'删除资源库',exact:true}).click();await expect(drawer).toBeVisible();const confirm=page.locator('.root-delete-overlay').filter({has:page.locator('#root-delete-title')});await expect(confirm).toContainText('不会删除');await page.screenshot({path:'test-results/polish117-root-delete.png'});await confirm.getByRole('button',{name:'删除',exact:true}).click();expect(await page.evaluate(()=>(window as any).__removedRoots)).toEqual(['/comics']);await expect(drawer).toContainText('添加漫画目录');
  });
  for(const [theme,label] of [['mist','雾蓝'],['nord','北境'],['sand','暖沙'],['night','夜色']])test(`drawers and sheets follow ${label} without external blur`,async({page})=>{
    await setup(page,theme);await library(page);await page.getByRole('button',{name:'显示选项'}).click();const options=page.getByRole('dialog',{name:'显示选项'});const labels=await options.locator('.mobile-settings-link').allTextContents();expect(labels.findIndex(s=>s.includes('应用设置'))).toBeGreaterThan(labels.findIndex(s=>s.includes('标签管理')));
    expect(await page.locator('.mobile-sheet-overlay').evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('none');await page.screenshot({path:`test-results/polish117-${theme}-options.png`});await back(page);
    await page.getByRole('button',{name:'资源库目录'}).click();const footer=page.locator('.mobile-drawer-footer');
    const colors=await footer.evaluate(el=>{const swatch=document.createElement('span');swatch.style.background='var(--面板色)';document.body.append(swatch);const color=getComputedStyle(swatch).backgroundColor;swatch.remove();return{footer:getComputedStyle(el).backgroundColor,theme:color};});expect(colors.footer).toBe(colors.theme);
    await page.screenshot({path:`test-results/polish117-${theme}-drawer.png`});await back(page);await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:/标签管理/}).click();await page.screenshot({path:`test-results/polish117-${theme}-tags.png`});
  });
});
