import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const book=(page:Page)=>page.locator('.page-panel.is-visible .mobile-resource-card').filter({has:page.getByText('Book',{exact:true})});
const back=(page:Page)=>page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
async function setup(page:Page) {
  await page.addInitScript(installMock,{count:12});
  await page.addInitScript(async()=>{
    const api=window.omicomic,data=(await api.getAppData() as any).data;
    data.settings.readerPreloadPages=4;data.settings.readerMemoryCacheSizeMb=64;
    const c=document.createElement('canvas');c.width=600;c.height=900;const ctx=c.getContext('2d')!;
    ctx.fillStyle='#9baabd';ctx.fillRect(0,0,600,900);ctx.fillStyle='#1e324f';ctx.font='80px sans-serif';ctx.fillText('OMI',185,450);
    const image=c.toDataURL();api.getThumbnail=async()=>({ok:true,data:{url:image}});
    api.getPageImage=async()=>({ok:true,data:{url:image,width:600,height:900}});
    const original=document.startViewTransition?.bind(document);
    (window as any).__transitions=[];
    if(original)document.startViewTransition=((update:any)=>{
      (window as any).__transitions.push(document.documentElement.dataset.mobileNavigation);
      return original(update);
    }) as typeof document.startViewTransition;
  });
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();await expect(book(page)).toBeVisible({timeout:15000});await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.mobileNavigation??'')).toBe('');
}
async function touch(page:Page,kind:'touchstart'|'touchmove'|'touchend'|'touchcancel',x:number,y=230) {
  await page.evaluate(({kind,x,y})=>{
    const w=window as any;
    if(kind==='touchstart')w.__touchTarget=document.elementFromPoint(x,y);
    const target=w.__touchTarget as Element,t=new Touch({identifier:1,target,clientX:x,clientY:y});
    target.dispatchEvent(new TouchEvent(kind,{bubbles:true,cancelable:true,touches:kind==='touchend'||kind==='touchcancel'?[]:[t],changedTouches:[t]}));
  },{kind,x,y});
}

for(const side of ['left','right'] as const)test(`${side} drawer tracks partial movement and reversal before release`,async({page})=>{
  await setup(page);const start=side==='left'?12:378,sign=side==='left'?1:-1;
  await touch(page,'touchstart',start);await touch(page,'touchmove',start+sign*80);
  const panel=page.locator('.is-side-drawer .mobile-sheet');await expect(panel).toBeAttached();
  const positions=[];
  for(const distance of [80,145,210,125,55]){
    await touch(page,'touchmove',start+sign*distance);
    const b=(await panel.boundingBox())!;positions.push(b.x);
    expect(Math.abs(b.x-(side==='left'?-b.width+distance:390-distance))).toBeLessThan(2);
    const shade=await page.locator('.mobile-screen-dimmer').evaluate(el=>Number(getComputedStyle(el).opacity));
    expect(Math.abs(shade-distance/b.width)).toBeLessThan(.02);
  }
  await page.screenshot({path:`test-results/transitions1111-${side}-partial.png`});
  await touch(page,'touchend',start+sign*55);await expect(panel).toHaveCount(0);
  expect(positions[2]).not.toBe(positions[3]);await expect(book(page)).toBeVisible({timeout:15000});await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.mobileNavigation??'')).toBe('');
});

test('vertical scrolling does not claim a sidebar and a cancelled opening settles closed',async({page})=>{
  await setup(page);await touch(page,'touchstart',20,250);await touch(page,'touchmove',22,310);await touch(page,'touchend',22,310);await expect(page.locator('.mobile-sheet')).toHaveCount(0);
  await touch(page,'touchstart',10);await touch(page,'touchmove',150);await touch(page,'touchcancel',150);await expect(page.locator('.mobile-sheet')).toHaveCount(0);
});

test('reader enters only after decode; cancelling a slow open cannot resurrect the reader',async({page})=>{
  await setup(page);await page.evaluate(()=>{const api=window.omicomic,get=api.getPageImage;api.getPageImage=async input=>{await new Promise<void>(r=>(window as any).__releaseFirst=r);return get(input);};});
  await book(page).click();await expect(page.locator('.mobile-reader-preparing')).toBeAttached();await expect(book(page)).toBeVisible();
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toHaveCount(0);
  await back(page);await expect(page.locator('.mobile-reader-preparing')).toHaveCount(0);
  await page.evaluate(()=>(window as any).__releaseFirst?.());await expect(book(page)).toBeVisible({timeout:15000});await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.mobileNavigation??'')).toBe('');
});

test('prepared reader is decoded before reveal and neighbours reuse their actual DOM images',async({page})=>{
  await setup(page);await book(page).click();const shown=page.locator('.page-panel.is-visible .reader-page-frame:not([aria-hidden]) .reader-image');await expect(shown).toBeVisible();
  await expect.poll(()=>page.locator('.reader-page-frame[data-reader-page-index="1"] img').evaluate(el=>(el as HTMLImageElement).complete)).toBe(true);
  await page.evaluate(()=>{(window as any).__warmImage=document.querySelector('[data-reader-page-index="1"] img');});
  await page.keyboard.press('ArrowRight');await expect(shown).toHaveAttribute('alt','page1.png');
  expect(await shown.evaluate(el=>el===(window as any).__warmImage)).toBe(true);
  const result=await page.evaluate(async()=>{
    let blank=0,count=0;const start=performance.now();
    while(performance.now()-start<1000){await new Promise(requestAnimationFrame);count++;const img=document.querySelector('.reader-page-frame:not([aria-hidden]) .reader-image') as HTMLImageElement;if(!img?.complete||!img.naturalWidth)blank++;}
    return {blank,count};
  });
  expect(result.blank).toBe(0);expect(result.count).toBeGreaterThan(5);
  await page.screenshot({path:'test-results/transitions1111-reader.png'});
});

test('Android first-page preparation pauses background metadata and resumes it after cancellation',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    document.documentElement.dataset.platform='android';
    const api=window.omicomic,original=api.getPageImage;
    (window as any).__backgroundCalls=0;
    for(const name of ['checkResourcePath','getReadablePageCount','getThumbnail'] as const){
      const call=api[name] as (input:any)=>Promise<any>;
      (api as any)[name]=async(input:any)=>{(window as any).__backgroundCalls++;await new Promise(r=>setTimeout(r,30));return call(input);};
    }
    api.getPageImage=async input=>{await new Promise<void>(resolve=>(window as any).__releasePreparedPage=resolve);return original(input);};
  });
  await book(page).click();await expect(page.locator('.mobile-reader-preparing')).toBeAttached();
  const before=await page.evaluate(()=>(window as any).__backgroundCalls);
  await page.waitForTimeout(300);
  expect(await page.evaluate(()=>(window as any).__backgroundCalls)).toBe(before);
  await back(page);await expect(page.locator('.mobile-reader-preparing')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>(window as any).__backgroundCalls)).toBeGreaterThan(before);
  await page.evaluate(()=>(window as any).__releasePreparedPage?.());
  await expect(book(page)).toBeVisible();
});

test('folder, detail, tabs and settings use short transitions and Back works during entry',async({page})=>{
  await setup(page);await page.locator('.mobile-resource-card').filter({has:page.getByText('Parent',{exact:true})}).click();await expect(page.getByText('Nested',{exact:true})).toBeVisible();await back(page);await expect(book(page)).toBeVisible();
  await book(page).getByRole('button',{name:'打开资源信息'}).click();await expect(page.locator('.resource-detail-page')).toBeVisible();await back(page);await expect(book(page)).toBeVisible();
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'收藏',exact:true}).click();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'书签',exact:true}).click();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'最近阅读',exact:true}).click();
  await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:/应用设置/}).click();await page.getByRole('button',{name:/外观与主题/}).click();await back(page);await expect(page.getByRole('button',{name:/默认阅读/})).toBeVisible();await back(page);await expect(page.locator('.mobile-settings-page')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.mobileNavigation??'')).toBe('');
  const moves=await page.evaluate(()=>(window as any).__transitions as string[]);expect(moves).toContain('forward');expect(moves).toContain('back');expect(moves).toContain('folder');expect(moves).toContain('detail');expect(moves).toContain('tab-next');
});

test('late folder and comic responses cannot replace a newer tab',async({page})=>{
  await setup(page);await page.evaluate(()=>{const api=window.omicomic,list=api.listDirectory;api.listDirectory=async path=>{if(path.includes('Parent'))await new Promise<void>(r=>(window as any).__releaseFolder=r);return list(path);};});
  await page.locator('.mobile-resource-card').filter({has:page.getByText('Parent',{exact:true})}).click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseFolder)).toBe('function');
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'收藏',exact:true}).click();await page.evaluate(()=>(window as any).__releaseFolder());await expect(page.locator('.mobile-library-bar')).not.toContainText('Parent');
  await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'资源库',exact:true}).click();await expect(book(page)).toBeVisible();
  await page.evaluate(()=>{const api=window.omicomic,get=api.getResourcePages;api.getResourcePages=async input=>{await new Promise<void>(r=>(window as any).__releaseComic=r);return get(input);};});
  await book(page).click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releaseComic)).toBe('function');await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'书签',exact:true}).click();await page.evaluate(()=>(window as any).__releaseComic());
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toHaveCount(0);
});

test('next comic warms its first image while the current comic remains visible',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    const api=window.omicomic,get=api.getResourcePages,image=api.getPageImage;
    let warmed=false;
    api.getResourcePages=async input=>{
      if(input.path!=='/comics/Parent')return get(input);
      const r=await get({path:'/comics/Book',type:'folder'});if(!r.ok)return r;
      return {ok:true,data:{...r.data,resourceKey:'folder:/comics/Parent',sourcePath:'/comics/Parent',title:'Next comic',pages:r.data.pages.map(p=>({...p,sourcePath:p.sourcePath.replace('/Book/','/Parent/')}))}};
    };
    api.getPageImage=async input=>{if(input.sourcePath.includes('/Parent/')&&!warmed){await new Promise<void>(r=>(window as any).__nextComicReady=r);warmed=true;}return image(input);};
  });
  await book(page).click();await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();await page.keyboard.press('End');
  await expect(page.locator('.reader-page-frame:not([aria-hidden]) img')).toHaveAttribute('alt','page11.png');await page.keyboard.press('ArrowRight');
  await page.getByRole('button',{name:'下一本：Parent',exact:true}).click();await expect.poll(()=>page.evaluate(()=>typeof (window as any).__nextComicReady)).toBe('function');
  await expect(page.locator('.reader-page-frame:not([aria-hidden]) img')).toHaveAttribute('alt','page11.png');await expect(page.locator('.reader-filename-strip')).toContainText('Book');
  await page.evaluate(()=>(window as any).__nextComicReady());await expect(page.locator('.reader-filename-strip')).toContainText('Next comic');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.mobileNavigation??'')).toBe('');
  expect(await page.locator('.reader-page-frame:not([aria-hidden]) img').evaluate(el=>(el as HTMLImageElement).complete)).toBe(true);
});

test('opening again during the return transition does not clear the new reader',async({page})=>{
  await setup(page);
  for(let n=0;n<3;n++){
    await book(page).click();await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
    await back(page);await expect(book(page)).toBeVisible();
    // Commit another open before the outgoing transition has finished.
    if(n<2)await book(page).evaluate(el=>(el as HTMLElement).click());
    if(n<2){await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();await back(page);await expect(book(page)).toBeVisible();}
  }
  await expect(page.locator('.mobile-reader-preparing')).toHaveCount(0);
});
