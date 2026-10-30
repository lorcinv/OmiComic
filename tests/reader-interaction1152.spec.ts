import { test,expect,type Page } from '@playwright/test';
import { installMock } from './mock';

async function open(page:Page,mobile=false){
  await page.addInitScript(installMock,{count:48});
  await page.addInitScript(async()=>{
    const api=window.omicomic,data=(await api.getAppData()).data!;
    Object.assign(data.settings,{readerMemoryCacheSizeMb:256,readerPreloadPages:4,mobileReaderAutoHide:false,readerDefaultFitMode:'fit-window'});
    data.recentOpened[0].currentPageIndex=12;
    const c=document.createElement('canvas');c.width=1200;c.height=1800;const x=c.getContext('2d')!;x.fillStyle='#fafafa';x.fillRect(0,0,1200,1800);x.fillStyle='#242424';for(let n=0;n<1800;n+=24)x.fillRect(0,n,1200,5);const url=c.toDataURL();
    api.getPageImage=async()=>({ok:true,data:{url,width:1200,height:1800}});
    api.getReadingProgress=async()=>({ok:true,data:{currentPageIndex:12,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}} as any});
  });
  await page.goto('/');if(mobile)await page.evaluate(()=>document.documentElement.dataset.platform='android');
  if(mobile){await page.getByRole('button',{name:'打开资源库',exact:true}).click();await page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).click();}
  else await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();await expect(page.locator('[data-reader-page-index="12"] img')).toHaveCount(1);await page.waitForTimeout(250);
}
async function panorama(page:Page,mobile=false){
  if(mobile){await page.locator('.reader-stage').tap();await page.getByRole('button',{name:'阅读设置',exact:true}).click();}
  await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();
  if(mobile)await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
  await expect(page.locator('.reader-stage')).toHaveClass(/is-panorama/);
}
const index=(page:Page)=>page.locator('[role="slider"][aria-label="阅读进度"]').getAttribute('aria-valuenow');
for(const flow of ['horizontal','vertical'])test(`desktop ${flow} panorama keeps adjacent geometry and drag after shrink, enlarge and reset`,async({page})=>{
  await open(page);await panorama(page);if(flow==='vertical')await page.getByRole('button',{name:'当前横向阅读，点击切换纵向阅读',exact:true}).click();
  await page.getByRole('button',{name:'缩放',exact:true}).click();const slider=page.getByRole('slider',{name:'缩放比例'});
  await slider.fill('-100');await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom','0.5');
  const geometry=()=>page.locator('.reader-page-frame').evaluateAll((nodes,flow)=>{const rects=nodes.slice(0,3).map(e=>e.getBoundingClientRect());return rects.slice(1).every((r,n)=>Math.abs(flow==='vertical'?r.top-rects[n].bottom:r.left-rects[n].right)<1);},flow);
  await expect.poll(geometry).toBe(true);await slider.fill('40');await page.getByRole('button',{name:'重置大小',exact:true}).click();await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom','1');
  await page.keyboard.press('Escape');const box=(await page.locator('.reader-stage').boundingBox())!,known=page.locator('[data-reader-page-index="12"]');
  const before=(await known.boundingBox())!;await page.mouse.move(box.x+box.width*.6,box.y+box.height*.6);await page.mouse.down();await page.mouse.move(box.x+box.width*.6-(flow==='horizontal'?70:0),box.y+box.height*.6-(flow==='vertical'?70:0),{steps:12});
  const after=(await known.boundingBox())!;expect(flow==='vertical'?after.y-before.y:after.x-before.x).toBeLessThan(-45);await page.mouse.up();
});
test('desktop vertical top and bottom clicks turn pages while the centre restores zoom',async({page})=>{
  await open(page);await panorama(page);await page.getByRole('button',{name:'当前横向阅读，点击切换纵向阅读',exact:true}).click();const box=(await page.locator('.reader-stage').boundingBox())!;
  await page.mouse.click(box.x+box.width/2,box.y+box.height*.9);await expect.poll(()=>index(page)).toBe('14');await page.mouse.click(box.x+box.width/2,box.y+box.height*.1);await expect.poll(()=>index(page)).toBe('13');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.keyboard.down('Control');await page.mouse.wheel(0,180);await page.keyboard.up('Control');await expect.poll(()=>page.locator('.reader-stage').getAttribute('data-reader-zoom')).not.toBe('1');
  await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom','1');await expect.poll(()=>index(page)).toBe('13');
});
test.describe('touch interaction',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('phone panorama paging setting follows volume controls and has no zoom panel',async({page})=>{
    await open(page,true);await page.locator('.reader-stage').tap();await page.getByRole('button',{name:'阅读设置',exact:true}).click();
    const checkbox=page.getByRole('checkbox',{name:'全景点击翻页'});await expect(checkbox).not.toBeChecked();await checkbox.check();
    const labels=await page.locator('.mobile-volume-settings .settings-toggle').allTextContents();expect(labels.map(x=>x.trim())).toEqual(['音量键翻页','反转音量键翻页方向','全景点击翻页']);
    await expect(page.getByRole('button',{name:'缩放',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));await expect(page.locator('.mobile-sheet-overlay')).toHaveCount(0);await page.waitForTimeout(250);
    const b=(await page.locator('.reader-stage').boundingBox())!;await page.touchscreen.tap(b.x+b.width*.9,b.y+b.height/2);await expect.poll(()=>index(page)).toBe('14');
  });
  for(const mode of ['single','double','double-rtl'])test(`phone ${mode} drags the complete next group into view before committing one turn`,async({page,context})=>{
    await open(page,true);
    if(mode!=='single'){
      await page.locator('.reader-stage').tap();await page.getByRole('button',{name:'阅读设置',exact:true}).click();await page.getByRole('button',{name:'当前单页，点击切换双页',exact:true}).click();
      if(mode==='double-rtl')await page.getByRole('button',{name:'当前从左到右阅读，点击切换为从右到左',exact:true}).click();
      await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));await expect(page.locator('.mobile-sheet-overlay')).toHaveCount(0);await page.waitForTimeout(250);
    }
    const first=Number(await index(page)),direction=mode==='double-rtl'?1:-1,groupSize=mode==='single'?1:2;
    const cdp=await context.newCDPSession(page),box=(await page.locator('.reader-stage').boundingBox())!,x=box.x+box.width*(direction<0?.8:.2),y=box.y+box.height*.5;
    const touch=async(type:'touchStart'|'touchMove'|'touchEnd',px=x)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:px,y,id:1}]});
    await touch('touchStart');await touch('touchMove',x+direction*25);await expect(page.locator('.reader-swipe-preview .has-display-raster')).toHaveCount(groupSize);await expect.poll(()=>page.locator('.reader-swipe-preview img').evaluateAll((images:HTMLImageElement[])=>images.every(image=>image.complete&&image.naturalWidth>0))).toBe(true);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await touch('touchMove',x+direction*120);
    await expect(page.locator('.reader-swipe-preview')).toBeVisible();expect(Number(await index(page))).toBe(first);
    await expect.poll(async()=>direction*await page.locator('.reader-page-spread').evaluate(e=>Number.parseFloat((e as HTMLElement).style.translate))).toBeGreaterThan(80);
    await page.screenshot({path:`output/reader-1152/mobile-follow-${mode}.png`});await touch('touchEnd');await expect.poll(async()=>Number(await index(page))).toBe(first+groupSize);await expect(page.locator('.reader-swipe-preview')).toHaveCount(0);
  });
  for(const panoramaMode of [false,true])test(`a real pinch and centre double tap reset enlarged and shrunk ${panoramaMode?'panorama':'ordinary'} pages`,async({page,context})=>{
    await open(page,true);if(panoramaMode)await panorama(page,true);await expect(page.locator('.mobile-sheet-overlay')).toHaveCount(0);await page.waitForTimeout(200);
    const cdp=await context.newCDPSession(page),b=(await page.locator('.reader-stage').boundingBox())!,x=b.x+b.width/2,y=b.y+b.height/2;
    const pinch=async(from:number,to:number)=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-from,y,id:1},{x:x+from,y,id:2}]});for(let n=1;n<=6;n++){const d=from+(to-from)*n/6;await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-d,y,id:1},{x:x+d,y,id:2}]});}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});};
    await pinch(35,80);await expect.poll(async()=>Number(await page.locator('.reader-stage').getAttribute('data-reader-zoom'))).toBeGreaterThan(1.8);
    const enlargedIndex=await index(page);await page.touchscreen.tap(x,y);await page.touchscreen.tap(x,y);await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom','1');expect(await index(page)).toBe(enlargedIndex);
    await pinch(35,80);
    await pinch(80,20);await expect.poll(async()=>Number(await page.locator('.reader-stage').getAttribute('data-reader-zoom'))).toBeLessThan(.7);
    const prior=await index(page);await page.touchscreen.tap(x,y);await page.touchscreen.tap(x,y);await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom','1');expect(await index(page)).toBe(prior);
    if(panoramaMode){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:3}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-60,y,id:3}]});await expect(page.locator('.reader-stage')).toHaveClass(/is-panorama-dragging/);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('.reader-stage')).not.toHaveClass(/is-panorama-dragging/);}
  });
});
