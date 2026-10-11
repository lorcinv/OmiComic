import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
import fs from 'node:fs/promises';

async function open(page: Page, options: { count?: number; delay?: number; tall?: boolean; large?: boolean } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: options.count ?? 6 });
  await page.addInitScript(({ count = 6, delay = 0, tall = false, large = false }) => {
    const api = (window as any).omicomic, baseData = api.getAppData;
    const state = JSON.parse(localStorage.getItem('reader-test-state') ?? '{"progress":{},"marks":[]}');
    const persist = () => localStorage.setItem('reader-test-state', JSON.stringify(state));
    const prefs = () => import('/electron/shared/readerPreferences.ts');
    const basePages = Array.from({length:count}, (_, index) => ({ index, name:`${[1,2,3,10,11,20][index] ?? index+20}.png`, sourcePath:`/comics/Book/page${index}.png`, type:'folder-image', modifiedAt:[300,200,200,undefined,100,undefined][index] }));
    const canvas = document.createElement('canvas'); canvas.width = large ? 5000 : 600; canvas.height = large ? 5000 : tall ? 9000 : 900;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#687c90'; ctx.fillRect(0,0,canvas.width,canvas.height);
    // Gray noise and a soft edge make both raster processing controls observable.
    const pixels = ctx.getImageData(0,0,100,100);
    for(let i=0;i<pixels.data.length;i+=4) { const n=((i*17)%19)-9; pixels.data.set([108+n,123+n,141+n,255],i); }
    ctx.putImageData(pixels,0,0); ctx.fillStyle='#8e9dac';ctx.fillRect(100,0,100,100);
    const picture = {url:canvas.toDataURL(),width:canvas.width,height:canvas.height};
    (window as any).__requests=[];
    api.getAppData = async()=>{const result=await baseData();result.data.readingProgress=state.progress;result.data.bookmarks=state.marks;result.data.settings.readerDefaultFitMode='fit-window';result.data.settings.readerPreloadPages=0;return result;};
    api.getRecentOpened = async()=>({ok:true,data:Object.values(state.progress).sort((a:any,b:any)=>b.updatedAt-a.updatedAt)});
    api.getReadingProgress = async(key:string)=>({ok:true,data:state.progress[key]??null});
    api.saveReadingProgress = async(input:any)=>{const saved={...input,updatedAt:Date.now(),readerViewState:input.readerViewState??state.progress[input.resourceKey]?.readerViewState};state.progress[input.resourceKey]=saved;persist();(window as any).__saved.push(saved);return {ok:true,data:saved};};
    api.getResourcePages = async({path}:any)=>{const p=await prefs();const key=`folder:${path}`;return {ok:true,data:{key,resourceKey:key,sourcePath:path,sourceType:'folder',title:'Book',pages:p.sortReaderPages(basePages,p.normalizePageSort(state.progress[key]?.readerViewState?.pageSort)),total:count}};};
    api.getPageImage = async(input:any)=>{(window as any).__requests.push(input.sourcePath);if(delay&&/page1\./.test(input.sourcePath))await new Promise(r=>setTimeout(r,delay));return {ok:true,data:picture};};
    api.getBookmarks=async()=>({ok:true,data:state.marks});
    api.isPageBookmarked=async(key:string,_index:number,id:string)=>({ok:true,data:state.marks.some((b:any)=>b.resourceKey===key&&b.pageId===id)});
    api.toggleBookmark=async(input:any)=>{const at=state.marks.findIndex((b:any)=>b.resourceKey===input.resourceKey&&b.pageId===input.pageId);if(at<0)state.marks.push({...input,id:input.pageId});else state.marks.splice(at,1);persist();return {ok:true,data:{bookmarked:at<0}};};
    api.setReaderPageSort=async(input:any)=>{const p=await prefs(),result=await api.getResourcePages(input),resource=result.data;resource.pages=p.sortReaderPages(resource.pages,input.mode);const index=resource.pages.findIndex((page:any)=>p.pageIdentity(page)===input.currentPageId);for(const mark of state.marks){if(mark.resourceKey===resource.resourceKey)mark.pageIndex=resource.pages.findIndex((page:any)=>p.pageIdentity(page)===mark.pageId);}const old=state.progress[resource.resourceKey];const progress={...old,currentPageIndex:index,currentPageId:input.currentPageId,currentPageName:resource.pages[index].name,readerViewState:{...old.readerViewState,pageSort:input.mode,pairingAnchor:index,pairingAnchorId:input.currentPageId}};state.progress[resource.resourceKey]=progress;persist();resource.requestedPageId=input.currentPageId;return {ok:true,data:{resource,progress}};};
  }, options);
  await page.goto('/'); await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'跳转到页码'})).toBeEnabled();
  await expect(page.locator('.reader-image').first()).toBeVisible();
}
const selectedBooks=new WeakMap<Page,string>();
async function settings(page: Page) {
  await expect(page.getByRole('button',{name:'阅读器设置',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'返回',exact:true}).click();
  selectedBooks.set(page,await page.evaluate(()=>(window as any).__saved.at(-1).resourceKey));
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('tab',{name:/^阅读器 /}).click();
  await expect(page.getByRole('slider',{name:'翻页间隔',exact:true})).toBeVisible();
}
async function resume(page: Page) {
  if(await page.getByRole('button',{name:'关闭设置',exact:true}).count()) {
    await expect(page.locator('.book-reader-settings')).toHaveAttribute('aria-busy','false');
    await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  }
  if(await page.locator('.resource-detail-read-button').count()) await page.locator('.resource-detail-read-button').click();
  else {await page.getByRole('button',{name:/^最近阅读/}).click();await page.locator('.resource-card[data-selection-key="'+selectedBooks.get(page)+'"]').dblclick();}
  await expect(page.locator('.reader-image').first()).toBeVisible();
}
async function adjust(page: Page) { await page.getByRole('button',{name:'画面调整',exact:true}).click(); }
async function slider(page: Page, label: string, value: number) {
  await page.getByRole('slider',{name:label,exact:true}).fill(String(value));
}
async function interval(page: Page) { await settings(page);await slider(page,'翻页间隔',1);await resume(page); }
async function jump(page: Page, index: number) { const input=page.getByRole('textbox',{name:'跳转到页码'}); await input.fill(String(index));await input.press('Enter'); }
const play=(page:Page)=>page.getByRole('button',{name:'开始自动阅读',exact:true});
const pause=(page:Page)=>page.getByRole('button',{name:'暂停自动阅读',exact:true});

test('page sorting preserves the image, bookmark, per-book preferences and fresh reload', async({page})=>{
  await open(page); await jump(page,2);await page.getByRole('button',{name:'添加当前页书签'}).click();
  const expected=[['文件名自然降序',5],['修改时间升序',2],['修改时间降序',2],['文件名自然升序',2]] as const;
  for(const [label,index] of expected){await settings(page);await page.getByRole('combobox',{name:'页面排序'}).click();await page.getByRole('option',{name:label,exact:true}).click();await resume(page);await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue(String(index));await expect(page.locator('#reader-title')).toContainText('/ 2.png');await expect(page.getByRole('button',{name:'取消当前页书签'})).toBeVisible();}
  await settings(page);await page.getByRole('combobox',{name:'页面排序'}).click();await page.getByRole('option',{name:'文件名自然降序',exact:true}).click();await resume(page);
  await page.getByRole('button',{name:'返回',exact:true}).click();await page.reload();await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  await expect(page.locator('#reader-title')).toContainText('/ 2.png');await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('5');await expect(play(page)).toBeVisible();
  await settings(page);await expect(page.getByRole('combobox',{name:'页面排序'})).toContainText('文件名自然降序');await page.keyboard.press('Escape');await expect(page.locator('.settings-window')).toHaveCount(0);await resume(page);await expect(page.locator('.reader-layout')).toBeVisible();
});

test('general settings select books independently and persist auto read without starting it',async({page})=>{
  await open(page);await settings(page);
  await slider(page,'翻页间隔',7);await slider(page,'滚动速度',150);await expect(page.locator('.book-reader-settings')).toHaveAttribute('aria-busy','false');
  await page.screenshot({path:'test-results/general-reader-settings.png'});
  await resume(page);await expect(play(page)).toBeVisible();await page.getByRole('button',{name:'返回',exact:true}).click();
  await page.getByRole('button',{name:/^资源库/}).click();await page.locator('.resource-card').filter({hasText:'Book'}).getByRole('button',{name:'打开资源信息'}).click();
  await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('tab',{name:/^阅读器 /}).click();
  await expect(page.getByRole('slider',{name:'翻页间隔',exact:true})).toHaveValue('5');
  await page.getByRole('combobox',{name:'当前漫画'}).click();await page.getByRole('option',{name:'Book',exact:true}).last().click();
  await expect(page.getByRole('slider',{name:'翻页间隔',exact:true})).toHaveValue('7');await expect(page.getByRole('slider',{name:'滚动速度',exact:true})).toHaveValue('150');
});

test('returning from sorted reading updates the existing thumbnail panel and retains its selected image',async({page})=>{
  await open(page);await page.getByRole('button',{name:'返回',exact:true}).click();
  await page.locator('.resource-card').filter({hasText:'Book'}).getByRole('button',{name:'打开资源信息'}).click();
  await page.getByRole('button',{name:'第 2 页：2.png',exact:true}).dblclick();
  await expect(page.locator('#reader-title')).toContainText('/ 2.png');await settings(page);await page.getByRole('combobox',{name:'页面排序'}).click();await page.getByRole('option',{name:'文件名自然降序',exact:true}).click();await resume(page);
  await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('5');await page.getByRole('button',{name:'返回',exact:true}).click();
  await expect(page.locator('.resource-detail-thumbnail').first()).toHaveAttribute('aria-label','第 1 页：20.png');
  await expect(page.getByRole('button',{name:'第 5 页：2.png',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('auto paging advances groups, waits for loads, stops at the end and never restarts itself',async({page})=>{
  test.setTimeout(45000);await open(page,{count:6,delay:3500});await interval(page);await play(page).click();
  await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('2',{timeout:3500});
  await page.waitForTimeout(1100);await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('2');
  await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('3',{timeout:6000});
  await pause(page).click();await jump(page,1);await page.getByRole('button',{name:'当前单页，点击切换双页',exact:true}).click();
  await expect(page.locator('.reader-page-spread > figure')).toHaveCount(2);await play(page).click();
  await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('3');await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('6');
  await expect(play(page)).toBeVisible();await expect(page.getByRole('slider',{name:'阅读进度',exact:true})).toHaveAttribute('aria-valuenow','6');
  await page.getByRole('button',{name:'返回',exact:true}).click();await page.reload();await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();await expect(play(page)).toBeVisible();
});

test('manual actions, panels, blur and background pause without automatic resume',async({page})=>{
  await open(page,{count:20});await interval(page);
  const actions=[async()=>page.getByRole('button',{name:'下一页',exact:true}).click(),async()=>jump(page,4),async()=>page.locator('.reader-stage').click({position:{x:5,y:5}}),async()=>page.getByRole('slider',{name:'阅读进度',exact:true}).click({position:{x:50,y:4}}),async()=>page.getByRole('combobox',{name:'缩放方式'}).click(),async()=>adjust(page),async()=>page.evaluate(()=>window.dispatchEvent(new Event('blur'))),async()=>page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));})];
  for(const action of actions){if(await page.locator('.reader-tool-panel').count())await page.getByRole('button',{name:'关闭面板'}).click();await play(page).click();await expect(pause(page)).toBeVisible();await action();await expect(play(page)).toBeVisible();if(await page.getByRole('listbox').count())await page.keyboard.press('Escape');}
  const before=await page.getByRole('textbox',{name:'跳转到页码'}).inputValue();await page.waitForTimeout(1200);await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue(before);
});

test('continuous auto scroll waits for pages and reaches the actual last edge of a long strip',async({page})=>{
  test.setTimeout(45000);await open(page,{count:1,tall:true});await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();await page.getByRole('button',{name:'当前横向阅读，点击切换纵向阅读',exact:true}).click();
  await settings(page);await slider(page,'滚动速度',400);await resume(page);
  const image=page.locator('.reader-image').first(),before=(await image.boundingBox())!.y;
  await play(page).click();await page.waitForTimeout(800);await expect(pause(page)).toBeVisible();expect((await image.boundingBox())!.y).toBeLessThan(before-200);
  // Move close to the true long-page edge, then let automatic scroll finish.
  await pause(page).click();await page.locator('.reader-stage').dispatchEvent('wheel',{deltaY:50000,deltaMode:0});
  await page.evaluate(()=>{const stage=document.querySelector('.reader-stage')!;for(let i=0;i<80;i++)stage.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaY:900}));});
  await play(page).click();await expect(play(page)).toBeVisible({timeout:4000});
  const bounds=await image.boundingBox(),stage=await page.locator('.reader-stage').boundingBox();expect(Math.abs(bounds!.y+bounds!.height-stage!.y-stage!.height)).toBeLessThan(12);
});

test('continuous reading waits at a slow next page instead of scrolling through it',async({page})=>{
  await open(page,{count:3,delay:3500});await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();
  await settings(page);await slider(page,'滚动速度',400);await resume(page);
  const before=await page.locator('.reader-page-spread').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--reader-panorama-translate'));
  await play(page).click();await page.waitForTimeout(1100);await expect(pause(page)).toBeVisible();
  expect(Math.abs(parseFloat(await page.locator('.reader-page-spread').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--reader-panorama-translate')))-parseFloat(before))).toBeLessThan(1);
  await expect.poll(async()=>Math.abs(parseFloat(await page.locator('.reader-page-spread').evaluate(el=>(el as HTMLElement).style.getPropertyValue('--reader-panorama-translate')))-parseFloat(before)),{timeout:5000}).toBeGreaterThan(3);
});

test('pairs share processing, RTL automation advances forward, and mode changes pause it',async({page})=>{
  await open(page);await page.getByRole('button',{name:'当前单页，点击切换双页',exact:true}).click();
  await page.getByRole('button',{name:'当前从左到右阅读，点击切换为从右到左',exact:true}).click();
  await adjust(page);await slider(page,'锐化',45);await slider(page,'降噪',30);await page.getByRole('checkbox',{name:'灰度',exact:true}).check();await page.getByRole('button',{name:'关闭面板'}).click();
  await expect(page.locator('.reader-effects[data-processing="ready"]')).toHaveCount(2);
  const filters=await page.locator('.reader-effects').evaluateAll(els=>els.map(el=>getComputedStyle(el).filter));expect(filters[0]).toBe(filters[1]);expect(filters[0]).toContain('grayscale(1)');
  await interval(page);await play(page).click();await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('3');
  await page.getByRole('button',{name:'当前双页，点击切换单页',exact:true}).click();await expect(play(page)).toBeVisible();
  await adjust(page);await page.getByRole('checkbox',{name:'启用画面调整'}).uncheck();await expect(page.locator('.reader-processed-image')).toHaveCount(0);
});

test('all color effects alter rendered pixels, compare restores original, reset and persistence work',async({page})=>{
  await open(page);
  const sample=async()=>{const bytes=await page.locator('.reader-effects').first().screenshot();return page.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d')!;ctx.drawImage(image,Math.floor(image.width/2),Math.floor(image.height/2),1,1,0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);},bytes.toString('base64'));};
  const original=await sample();await adjust(page);
  for(const [label,value] of [['亮度',130],['对比度',145],['伽马',1.6],['暖色',100]] as const){await slider(page,label,value);await page.getByRole('button',{name:'关闭面板'}).click();const changed=await sample();expect(changed).not.toEqual(original);await adjust(page);await page.getByRole('button',{name:'恢复默认'}).click();}
  await page.getByRole('checkbox',{name:'灰度',exact:true}).check();await page.getByRole('button',{name:'关闭面板'}).click();const gray=await sample();expect(Math.max(...gray)-Math.min(...gray)).toBeLessThan(2);
  await adjust(page);await page.getByRole('button',{name:'恢复默认'}).click();await page.getByRole('checkbox',{name:'反色',exact:true}).check();await page.getByRole('button',{name:'关闭面板'}).click();const inverted=await sample();for(let c=0;c<3;c++)expect(Math.abs(original[c]+inverted[c]-255)).toBeLessThan(3);
  await adjust(page);await page.getByRole('checkbox',{name:'启用画面调整'}).uncheck();await page.getByRole('button',{name:'关闭面板'}).click();expect(await sample()).toEqual(original);
  await adjust(page);await slider(page,'伽马',1.35);await page.getByRole('button',{name:'关闭面板'}).click();await page.getByRole('button',{name:'返回',exact:true}).click();await page.reload();await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();await adjust(page);await expect(page.getByRole('slider',{name:'伽马',exact:true})).toHaveValue('1.35');await expect(page.getByRole('checkbox',{name:'反色',exact:true})).toBeChecked();await page.getByRole('button',{name:'恢复默认'}).click();await expect(page.getByRole('checkbox',{name:'启用画面调整'})).not.toBeChecked();await page.getByRole('button',{name:'关闭面板'}).click();expect(await sample()).toEqual(original);
});

test('worker processing is real, bounded for large pages, consistent in pairs and removable',async({page})=>{
  await open(page,{count:30,large:true});await page.getByRole('combobox',{name:'缩放方式'}).click();await page.getByRole('option',{name:'原始尺寸',exact:true}).click();
  await page.evaluate(()=>{const times:number[]=[];(window as any).__processingFrames=times;(window as any).__sampleProcessing=true;let last=performance.now();const frame=(now:number)=>{times.push(now-last);last=now;if((window as any).__sampleProcessing)requestAnimationFrame(frame);};requestAnimationFrame(frame);});
  const start=Date.now();await adjust(page);await slider(page,'锐化',80);await slider(page,'降噪',75);await page.getByRole('button',{name:'关闭面板'}).click();
  await expect(page.locator('.reader-effects').first()).toHaveAttribute('data-processing','ready',{timeout:15000});
  const frames=await page.evaluate(()=>{(window as any).__sampleProcessing=false;return (window as any).__processingFrames as number[];});
  const performanceResult={sourcePixels:25_000_000,previewPixelLimit:4_000_000,readyMs:Date.now()-start,frames:frames.length,longestFrameMs:Math.max(...frames)};
  await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/reader-performance.json',JSON.stringify(performanceResult,null,2));
  await test.info().attach('large-page-performance',{body:JSON.stringify(performanceResult),contentType:'application/json'});expect(frames.length).toBeGreaterThan(2);
  const result=await page.locator('.reader-processed-image').first().evaluate((image:HTMLImageElement)=>({width:image.naturalWidth,height:image.naturalHeight}));expect(result.width*result.height).toBeLessThanOrEqual(4_010_000);expect(Math.max(result.width,result.height)).toBeLessThanOrEqual(8192);
  const difference=await page.locator('.reader-effects').first().evaluate(async host=>{const original=host.querySelector<HTMLImageElement>('.reader-effects-original img')!,processed=host.querySelector<HTMLImageElement>('.reader-processed-image')!;await processed.decode();const canvas=document.createElement('canvas');canvas.width=processed.naturalWidth;canvas.height=processed.naturalHeight;const ctx=canvas.getContext('2d')!;ctx.drawImage(original,0,0,canvas.width,canvas.height);const a=ctx.getImageData(0,0,canvas.width,canvas.height).data;ctx.drawImage(processed,0,0);const b=ctx.getImageData(0,0,canvas.width,canvas.height).data;let changed=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])changed++;return changed;});expect(difference).toBeGreaterThan(20);
  const requests=await page.evaluate(()=>(window as any).__requests.length);expect(requests).toBeLessThan(15);
  await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();await page.waitForTimeout(500);expect(await page.locator('.reader-processed-image').count()).toBeLessThan(5);
  await adjust(page);await page.getByRole('checkbox',{name:'启用画面调整'}).uncheck();await expect(page.locator('.reader-processed-image')).toHaveCount(0);
  await page.setViewportSize({width:600,height:620});await expect(page.getByRole('button',{name:'恢复默认'})).toBeEnabled();
  const panel=await page.locator('.reader-tool-panel').boundingBox();expect(panel!.x).toBeGreaterThanOrEqual(0);expect(panel!.x+panel!.width).toBeLessThanOrEqual(600);expect(panel!.y+panel!.height).toBeLessThanOrEqual(620);
  await page.screenshot({path:'test-results/reader-tools-small.png'});
  await page.getByRole('button',{name:'关闭面板'}).click();await expect(play(page)).toBeInViewport();await expect(page.getByRole('button',{name:'阅读器设置',exact:true})).toHaveCount(0);
});
