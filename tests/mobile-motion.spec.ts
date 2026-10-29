import {test,expect,type Page} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import {installMock} from './mock';
import {expectReaderPixels} from './readerPixels';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Hong_Kong'});
async function setup(page:Page){
  await page.addInitScript(installMock,{count:12});
  await page.addInitScript(async()=>{
    const api=window.omicomic,data=(await api.getAppData() as any).data;
    Object.assign(data.settings,{colorTheme:'mist',readerDefaultFitMode:'fit-window',mobileReaderPreviews:true});
    const book={resourceKey:'folder:/comics/Book',sourcePath:'/comics/Book',sourceType:'folder',title:'Book',tags:['彩色'],note:'',sortIndex:0,createdAt:new Date('2026-10-14T00:00:00+08:00').getTime(),updatedAt:1};
    data.tagOrder=book.tags;data.resourceMeta[book.resourceKey]=book;
    data.readingProgress[book.resourceKey]={...book,currentPageIndex:9,totalPages:12,hasStartedReading:true,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',panorama:false,immersive:false,flow:'horizontal',autoRead:{intervalSeconds:1,scrollPixelsPerSecond:80}}};
    data.bookmarks=[{...book,id:'mark',pageIndex:9,totalPages:12,pageName:'page9.png'}];
    api.getBookmarks=async()=>({ok:true,data:data.bookmarks});
    api.getReadingProgress=async(key)=>({ok:true,data:key===book.resourceKey?{...data.readingProgress[key],currentPageIndex:0}:null});
    const c=document.createElement('canvas');c.width=600;c.height=900;const ctx=c.getContext('2d')!;ctx.fillStyle='#b6c1ce';ctx.fillRect(0,0,600,900);ctx.fillStyle='#31455e';ctx.font='80px sans-serif';ctx.fillText('OMI',190,440);
    const image=c.toDataURL();api.getThumbnail=async()=>({ok:true,data:{url:image,byteSize:419430}});api.getBookmarkPagePreview=async()=>({ok:true,data:{dataUrl:image}});api.getPageImage=async()=>({ok:true,data:{url:image,width:600,height:900}});
  });
  await page.goto('/');
}
const back=(page:Page)=>page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
const book=(page:Page)=>page.locator('.page-panel.is-visible .mobile-resource-card').filter({has:page.getByText('Book',{exact:true})});
async function library(page:Page){await page.getByRole('button',{name:'打开资源库',exact:true}).click();await expect(book(page)).toBeVisible();}
async function reader(page:Page){await library(page);await book(page).click();await expectReaderPixels(page.locator('.reader-image').first());await page.locator('.reader-stage').tap();}

test('phone keeps the current folder during reads and opens comics without a filename or loading popup',async({page})=>{
  await setup(page);await library(page);
  await page.evaluate(()=>{const api=window.omicomic,original=api.listDirectory;api.listDirectory=async path=>{if(path==='/comics/Parent')await new Promise<void>(resolve=>(window as any).__directoryReady=resolve);return original(path);};});
  await page.locator('.mobile-resource-card').filter({has:page.getByText('Parent',{exact:true})}).click();
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__directoryReady)).toBe('function');
  await expect(book(page)).toBeVisible();await expect(page.getByText('正在读取目录',{exact:true})).toHaveCount(0);await expect(page.locator('.library-opening-status,[role="tooltip"]')).toHaveCount(0);
  await page.evaluate(()=>(window as any).__directoryReady());await expect(page.locator('.mobile-resource-card').filter({has:page.getByText('Nested',{exact:true})})).toBeVisible();await back(page);await expect(book(page)).toBeVisible();
  await page.evaluate(()=>{const api=window.omicomic,original=api.getResourcePages;api.getResourcePages=async input=>{await new Promise<void>(resolve=>(window as any).__bookReady=resolve);return original(input);};});
  await book(page).click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__bookReady)).toBe('function');
  await expect(book(page)).toBeVisible();await expect(page.locator('.library-opening-status,[role="tooltip"]')).toHaveCount(0);
  await page.evaluate(()=>(window as any).__bookReady());await expectReaderPixels(page.locator('.reader-image').first());
});

test('phone metadata uses a spaced dot, homepage drops the page suffix and bookmarks keep date on the same line',async({page})=>{
  await setup(page);await expect(page.locator('.omi-home__book-progress').first()).toHaveText('1 / 128%');
  await library(page);await expect(book(page).locator('.mobile-card-pages')).toHaveText('10/12 · 83% 0.4MB');
  await page.getByRole('button',{name:'书签',exact:true}).click();const card=page.locator('.mobile-resource-card').first();
  await expect(card.locator('.mobile-card-pages')).toHaveText('10/12');await expect(card.locator('time')).toHaveText('2026-10-14');
  const numbers=(await card.locator('.mobile-card-pages').boundingBox())!,date=(await card.locator('time').boundingBox())!;
  expect(Math.abs(numbers.y-date.y)).toBeLessThan(1);expect(date.x).toBeGreaterThan(numbers.x+numbers.width);await page.screenshot({path:'test-results/motion1110-bookmarks.png'});
});

test('RTL switches current and total ends, and the playback glyph is centered on the progress rail',async({page})=>{
  await setup(page);await reader(page);await page.getByRole('button',{name:'阅读设置',exact:true}).click();
  await page.getByRole('button',{name:'当前从左到右阅读，点击切换为从右到左',exact:true}).click();await back(page);await expect(page.locator('.mobile-sheet')).toHaveCount(0);
  const current=(await page.locator('.mobile-reader-current').boundingBox())!,total=(await page.locator('.mobile-reader-total').boundingBox())!,rail=(await page.getByRole('slider',{name:'阅读进度'}).boundingBox())!,glyph=(await page.locator('.mobile-reader-play svg').boundingBox())!;
  expect(total.x).toBeLessThan(rail.x);expect(current.x).toBeGreaterThan(rail.x+rail.width);expect(Math.abs(glyph.y+glyph.height/2-rail.y-rail.height/2)).toBeLessThan(1);
  await expect(page.locator('.mobile-reader-current')).toHaveText('1');await expect(page.locator('.mobile-reader-total')).toHaveText('12');await page.screenshot({path:'test-results/motion1110-rtl.png'});
});

test('mobile autoplay remains enabled after touching, seeking and opening settings until toggled off',async({page})=>{
  await setup(page);await reader(page);const play=page.locator('.mobile-reader-play'),rail=page.getByRole('slider',{name:'阅读进度'});
  await play.click();await expect(play).toBeVisible();await expect(play).toHaveAttribute('aria-pressed','true');
  const before=Number(await rail.getAttribute('aria-valuenow'));await expect.poll(async()=>Number(await rail.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  await page.locator('.reader-stage').tap();await expect(play).toHaveAttribute('aria-pressed','true');await page.locator('.reader-stage').tap();await expect(play).toBeVisible();
  await page.locator('.reader-stage').tap({position:{x:370,y:230}});await expect(play).toHaveAttribute('aria-pressed','true');
  await page.getByRole('button',{name:'阅读设置',exact:true}).click();const held=await rail.getAttribute('aria-valuenow');await page.waitForTimeout(1200);await expect(rail).toHaveAttribute('aria-valuenow',held!);await expect(play).toHaveAttribute('aria-pressed','true');
  await back(page);await expect(page.locator('.mobile-sheet')).toHaveCount(0);await expect.poll(async()=>Number(await rail.getAttribute('aria-valuenow'))).toBeGreaterThan(Number(held));
  const rect=(await rail.boundingBox())!;await rail.click({position:{x:rect.width*.45,y:22}});await expect(play).toHaveAttribute('aria-pressed','true');
  if(await page.locator('.mobile-reader-previews').count())await page.locator('.reader-stage').tap({position:{x:190,y:240}});
  await play.click();await expect(play).toHaveAttribute('aria-pressed','false');const stopped=await rail.getAttribute('aria-valuenow');await page.waitForTimeout(1300);await expect(rail).toHaveAttribute('aria-valuenow',stopped!);
});

test('panorama playback survives a tap and continues to move the comic',async({page})=>{
  await setup(page);await reader(page);await page.getByRole('button',{name:'阅读设置',exact:true}).click();await page.getByRole('button',{name:'开启全景连环画'}).click();await back(page);await expect(page.locator('.mobile-sheet')).toHaveCount(0);
  const frame=page.locator('.reader-page-frame').first(),play=page.locator('.mobile-reader-play');await play.click();const start=(await frame.boundingBox())!;await page.waitForTimeout(500);await page.locator('.reader-stage').tap();await expect(play).toHaveAttribute('aria-pressed','true');await page.waitForTimeout(700);const end=(await frame.boundingBox())!;
  expect(Math.abs(end.x-start.x)+Math.abs(end.y-start.y)).toBeGreaterThan(20);
});

test('mobile autoplay can be explicitly restarted after backgrounding with settings open',async({page})=>{
  await setup(page);await reader(page);const play=page.locator('.mobile-reader-play'),rail=page.getByRole('slider',{name:'阅读进度'});
  await play.click();await page.getByRole('button',{name:'阅读设置',exact:true}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-pause')));await expect(play).toHaveAttribute('aria-pressed','false');
  await back(page);await expect(page.locator('.mobile-sheet')).toHaveCount(0);await play.click();await expect(play).toHaveAttribute('aria-pressed','true');
  const before=Number(await rail.getAttribute('aria-valuenow'));await expect.poll(async()=>Number(await rail.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
});

test('left and right drawers animate outward without a reset frame before unmount',async({page})=>{
  await setup(page);await library(page);const result=[];
  for(const right of [false,true]){
    if(right){await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:'标签管理',exact:true}).click();}else await page.getByRole('button',{name:'资源库目录',exact:true}).click();
    const sheet=page.locator('.is-side-drawer .mobile-sheet');await expect(sheet).toBeVisible();await expect.poll(()=>sheet.evaluate(el=>el.getAnimations().length)).toBe(0);
    await page.evaluate(()=>{const el=document.querySelector('.is-side-drawer .mobile-sheet')!,shade=document.querySelector('.mobile-screen-dimmer')!;(window as any).__drawerFrames=[];const sample=()=>{if(!el.isConnected)return;(window as any).__drawerFrames.push({x:el.getBoundingClientRect().x,opacity:Number(getComputedStyle(shade).opacity)});requestAnimationFrame(sample);};sample();});
    await back(page);await expect(sheet).toHaveCount(0);const frames=await page.evaluate(()=>(window as any).__drawerFrames) as Array<{x:number;opacity:number}>;
    expect(frames.length).toBeGreaterThan(3);for(let i=1;i<frames.length;i++){expect((frames[i].x-frames[i-1].x)*(right?1:-1)).toBeGreaterThanOrEqual(-.5);expect(frames[i].opacity).toBeLessThanOrEqual(frames[i-1].opacity+.01);}result.push({side:right?'right':'left',frames});
  }
  writeFileSync('test-results/motion1110-drawer-frames.json',JSON.stringify(result,null,2));
});

test('mobile reading settings do not insert transient loading or saving text',async({page})=>{
  await setup(page);await library(page);await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:'应用设置',exact:true}).click();
  await page.evaluate(()=>{const api=window.omicomic,original=api.getResourcePages;api.getResourcePages=async input=>{await new Promise<void>(resolve=>(window as any).__settingsReady=resolve);return original(input);};});
  await page.getByRole('button',{name:/漫画阅读设置/}).click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__settingsReady)).toBe('function');await expect(page.getByText('正在读取阅读设置…',{exact:true})).toHaveCount(0);await page.evaluate(()=>(window as any).__settingsReady());await expect(page.getByRole('slider',{name:'翻页间隔',exact:true})).toBeVisible();
});

test('mist reader background is neutral white and visibly distinct from nord blue-gray',async({page})=>{
  await setup(page);await reader(page);const colors=await page.evaluate(()=>{const root=document.documentElement,stage=document.querySelector('.reader-stage')!;const colors:Record<string,string>={};for(const theme of ['mist','nord','sand']){root.dataset.colorTheme=theme;colors[theme]=getComputedStyle(stage).backgroundColor;}root.dataset.colorTheme='mist';return colors;});
  expect(colors.mist).toBe('rgb(239, 239, 237)');expect(colors.nord).toBe('rgb(213, 221, 234)');expect(colors.sand).not.toBe(colors.mist);await page.screenshot({path:'test-results/motion1110-mist-reader.png'});
});
