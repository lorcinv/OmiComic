import {test,expect,type Page,type BrowserContext} from '@playwright/test';
import {installMock} from './mock';

async function seed(page:Page,mobile=true,flow='ordinary',rtl=false) {
  await page.addInitScript(installMock,{count:147});
  await page.addInitScript(async({flow,rtl})=>{
    const api=window.omicomic,data=(await api.getAppData()).data!;
    Object.assign(data.settings,{mobileReaderAutoHide:false,readerDefaultFitMode:'fit-window',doublePageDirection:rtl?'right-to-left':'left-to-right'});
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1800;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fafafa';ctx.fillRect(0,0,1200,1800);
    ctx.fillStyle='#343434';for(let y=0;y<1800;y+=40)ctx.fillRect(0,y,1200,5);
    const url=canvas.toDataURL();api.getPageImage=async()=>({ok:true,data:{url,width:1200,height:1800}});
    api.getReadingProgress=async()=>({ok:true,data:{currentPageIndex:12,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:rtl?'right-to-left':'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:flow!=='ordinary',immersive:false}} as any});
  },{flow,rtl});
  await page.goto('/');if(mobile)await page.evaluate(()=>document.documentElement.dataset.platform='android');
  await page.getByRole('button',{name:'打开资源库',exact:true}).click();
}
async function open(page:Page) {
  await page.locator('.mobile-resource-card,.resource-card').filter({has:page.locator('strong',{hasText:/^Book$/})}).locator('strong').click();
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
  await expect.poll(()=>page.locator('.reader-stage img').evaluateAll(nodes=>nodes.some(n=>(n as HTMLImageElement).complete&&(n as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.waitForTimeout(500);
}
async function touch(context:BrowserContext,page:Page) {
  const cdp=await context.newCDPSession(page);
  const tap=async(x:number,y:number)=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
    await page.waitForTimeout(25);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  return {cdp,tap,double:async(x:number,y:number)=>{await tap(x,y);await page.waitForTimeout(65);await tap(x,y);}};
}
const pageIndex=(page:Page)=>page.locator('.reader-progress-rail').getAttribute('aria-valuenow');
async function openSettings(page:Page) {
  const button=page.getByRole('button',{name:'阅读设置',exact:true});
  if(!await button.isVisible())await page.locator('.reader-stage').tap();
  await button.click();
}
async function closeSettings(page:Page) {
  await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'阅读设置',exact:true})).toHaveCount(0);
}

for(const device of ['phone','tablet'])test.describe(device,()=>{
  test.use({viewport:device==='phone'?{width:390,height:844}:{width:1100,height:800},isMobile:true,hasTouch:true});
  for(const [flow,rtl] of [['ordinary',false],['horizontal',false],['horizontal',true],['vertical',false]] as const)
    test(`${flow} ${rtl?'RTL':''}: zoom keeps the tapped content in place, restores and never turns a page`,async({page,context})=>{
      await seed(page,true,flow,rtl);await open(page);const input=await touch(context,page);
      const frame=(await page.locator('.reader-stage').boundingBox())!;
      const visible=await page.locator('.reader-stage img').evaluateAll((nodes,frame)=>nodes.map(n=>{
        const r=n.getBoundingClientRect();return {index:n.closest('[data-reader-page-index]')?.getAttribute('data-reader-page-index'),x:r.x,y:r.y,width:r.width,height:r.height};
      }).filter(r=>r.x<frame.x+frame.width&&r.x+r.width>frame.x&&r.y<frame.y+frame.height&&r.y+r.height>frame.y),frame);
      const before=visible.find(r=>r.index==='12')??visible[Math.floor(visible.length/2)];
      expect(before).toBeTruthy();
      const x=Math.max(frame.x+20,Math.min(frame.x+frame.width-20,before.x+before.width*.68));
      const y=Math.max(frame.y+20,Math.min(frame.y+frame.height-20,before.y+before.height*.63));
      const u=(x-before.x)/before.width,v=(y-before.y)/before.height,index=await pageIndex(page);
      const footer=await page.locator('.reader-footer').getAttribute('class');
      await input.double(x,y);await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom','2');
      await page.waitForTimeout(350);expect(await pageIndex(page)).toBe(index);expect(await page.locator('.reader-footer').getAttribute('class')).toBe(footer);
      const after=await page.locator('.reader-stage img').evaluateAll((nodes,index)=>{
        const node=nodes.find(n=>n.closest('[data-reader-page-index]')?.getAttribute('data-reader-page-index')===index)!;const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};
      },before.index);
      // Keep the tapped point fixed wherever bounds allow. A page smaller
      // than the viewport stays centred instead of exposing extra blank space.
      const expected=(origin:number,viewport:number,size:number,point:number,fraction:number)=>size<=viewport
        ? origin+(viewport-size)/2 : Math.max(origin+viewport-size,Math.min(origin,point-size*fraction));
      expect(after.x,JSON.stringify({before,after,frame,x,y,u,v})).toBeCloseTo((flow==='horizontal'?x-after.width*u:expected(frame.x,frame.width,after.width,x,u)),0);
      expect(after.y,JSON.stringify({before,after,frame,x,y,u,v})).toBeCloseTo((flow==='vertical'?y-after.height*v:expected(frame.y,frame.height,after.height,y,v)),0);
      await input.double(frame.x+frame.width*.9,frame.y+frame.height*.65);
      await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom','1');
      await page.waitForTimeout(350);expect(await pageIndex(page)).toBe(index);
    });
  test('floating detail pager leaves with details and works again after returning',async({page})=>{
    await seed(page);await page.locator('.mobile-resource-card').filter({has:page.locator('strong',{hasText:/^Book$/})}).getByRole('button',{name:'打开资源信息',exact:true}).click();
    const detail=page.locator('.resource-detail-page');await expect(detail).toBeVisible();
    await detail.getByRole('button',{name:'下一组预览',exact:true}).click();
    const floating=page.getByRole('navigation',{name:'浮动预览分页',exact:true});await expect(floating).toBeVisible();
    await expect(floating.locator('output')).toHaveText('2 / 4');
    const chosen=await detail.locator('.resource-detail-thumbnail').evaluateAll(nodes=>{
      const visible=nodes.find(n=>{const r=n.getBoundingClientRect();return r.top>100&&r.bottom<innerHeight-80;}) as HTMLElement;
      return visible.getAttribute('aria-label');
    });
    await detail.getByRole('button',{name:chosen!,exact:true}).click();
    await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
    await expect(page.locator('.mobile-page-pill.is-detail-pager')).toHaveCount(0);
    await page.evaluate(()=>window.dispatchEvent(new Event('omi-reader-back')));
    await expect(detail).toBeVisible();await expect(floating).toBeVisible();await expect(floating.locator('output')).toHaveText('2 / 4');
    await floating.getByRole('button',{name:'下一组预览',exact:true}).click();await expect(floating.locator('output')).toHaveText('3 / 4');
  });
  test('double-tap setting persists, removes the tap delay, and preserves pinch zoom',async({page,context})=>{
    await seed(page);await open(page);const input=await touch(context,page);
    const setting=page.getByRole('checkbox',{name:'双击放大画面',exact:true});
    await openSettings(page);await expect(setting).toBeChecked();
    await setting.uncheck();await expect.poll(()=>page.evaluate(async()=>(await window.omicomic.getAppData()).data!.settings.mobileReaderDoubleTapZoom)).toBe(false);
    await page.screenshot({path:`.cache/android1191-tap-option/${device}-setting.png`});await closeSettings(page);
    const stage=page.locator('.reader-stage'),r=(await stage.boundingBox())!,x=r.x+r.width*.85,y=r.y+r.height*.5;
    const before=Number(await pageIndex(page));
    await page.evaluate(()=>{
      const rail=document.querySelector('.reader-progress-rail')!,before=rail.getAttribute('aria-valuenow');let released=0;
      (window as any).__tapPageDelay=null;
      document.querySelector('.reader-stage')!.addEventListener('pointerup',()=>released=performance.now(),{capture:true,once:true});
      const observer=new MutationObserver(()=>{if(rail.getAttribute('aria-valuenow')!==before){(window as any).__tapPageDelay=performance.now()-released;observer.disconnect();}});
      observer.observe(rail,{attributes:true,attributeFilter:['aria-valuenow']});
    });
    await input.tap(x,y);await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow',String(before+1));
    expect(await page.evaluate(()=>(window as any).__tapPageDelay)).toBeLessThan(150);
    await input.double(r.x+r.width*.5,y);await page.waitForTimeout(250);await expect(stage).toHaveAttribute('data-reader-zoom','1');
    await input.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:r.x+r.width*.5-20,y},{id:2,x:r.x+r.width*.5+20,y}]});
    await input.cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:r.x+r.width*.5-50,y},{id:2,x:r.x+r.width*.5+50,y}]});
    await input.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(async()=>Number(await stage.getAttribute('data-reader-zoom'))).toBeGreaterThan(1.5);
    expect(Number(await pageIndex(page))).toBe(before+1);
    await page.evaluate(()=>window.dispatchEvent(new Event('omi-reader-back')));await open(page);
    await openSettings(page);await expect(setting).not.toBeChecked();await setting.check();
    await closeSettings(page);
    const index=await pageIndex(page);await input.double(x,y);await expect(stage).toHaveAttribute('data-reader-zoom','2');expect(await pageIndex(page)).toBe(index);
  });
  test('confirmed single tap turns once; a following pinch cancels the pending tap',async({page,context})=>{
    await seed(page);await open(page);const input=await touch(context,page);
    const r=(await page.locator('.reader-stage').boundingBox())!,x=r.x+r.width*.85,y=r.y+r.height*.5;
    const before=Number(await pageIndex(page));await input.tap(x,y);
    await page.waitForTimeout(100);expect(Number(await pageIndex(page))).toBe(before);
    await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow',String(before+1));
    await page.waitForTimeout(300);expect(Number(await pageIndex(page))).toBe(before+1);
    await input.tap(x,y);
    await input.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y},{id:2,x:x-40,y}]});
    await input.cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x+15,y},{id:2,x:x-70,y}]});
    await input.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(400);expect(Number(await pageIndex(page))).toBe(before+1);
    await expect.poll(async()=>Number(await page.locator('.reader-stage').getAttribute('data-reader-zoom'))).toBeGreaterThan(1.5);
  });
});

test.describe('default reading preference',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('the global switch and reader switch share the saved preference',async({page})=>{
    await seed(page);await page.getByRole('button',{name:'显示选项',exact:true}).click();
    await page.getByRole('button',{name:'应用设置',exact:true}).click();await page.getByRole('button',{name:/默认阅读/}).click();
    const setting=page.getByRole('checkbox',{name:'双击放大画面',exact:true});await expect(setting).toBeChecked();await setting.uncheck();
    await page.getByRole('button',{name:'返回设置',exact:true}).click();await page.getByRole('button',{name:'关闭设置',exact:true}).click();
    await open(page);await openSettings(page);await expect(setting).not.toBeChecked();await setting.check();
    await closeSettings(page);await page.evaluate(()=>window.dispatchEvent(new Event('omi-reader-back')));
    await page.getByRole('button',{name:'显示选项',exact:true}).click();await page.getByRole('button',{name:'应用设置',exact:true}).click();await page.getByRole('button',{name:/默认阅读/}).click();await expect(setting).toBeChecked();
  });
});
test('desktop retains immediate click paging and mouse-centred wheel zoom',async({page})=>{
  await seed(page,false);await page.locator('.resource-card').filter({has:page.locator('strong',{hasText:/^Book$/})}).dblclick();
  await expect(page.locator('.reader-stage')).toBeVisible();await page.waitForTimeout(500);
  const box=(await page.locator('.reader-stage').boundingBox())!,before=Number(await pageIndex(page));
  await page.mouse.click(box.x+box.width*.9,box.y+box.height*.5);
  await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow',String(before+1));
  await page.mouse.dblclick(box.x+box.width*.5,box.y+box.height*.5);await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom','1');
  await page.mouse.move(box.x+box.width*.65,box.y+box.height*.5);await page.keyboard.down('Control');await page.mouse.wheel(0,-300);await page.keyboard.up('Control');
  await expect.poll(async()=>Number(await page.locator('.reader-stage').getAttribute('data-reader-zoom'))).toBeGreaterThan(1.5);
});

test.describe('Android camera margin',()=>{
  test.use({viewport:{width:844,height:390},isMobile:true,hasTouch:true});
  for(const zoomed of [false,true])test(`swipe handoff preserves the fitted position (${zoomed?'2x':'1x'})`,async({page,context})=>{
    await seed(page);await page.evaluate(()=>document.documentElement.style.setProperty('--android-reader-safe-left','48px'));await open(page);
    const input=await touch(context,page),stage=page.locator('.reader-stage'),box=(await stage.boundingBox())!;
    if(zoomed){await input.double(box.x+box.width*.5,box.y+box.height*.5);await expect(stage).toHaveAttribute('data-reader-zoom','2');}
    const index=Number(await pageIndex(page));
    await page.evaluate(()=>{
      (window as any).__swipeTrace=[];(window as any).__swipeRunning=true;
      const frame=()=>{const image=document.querySelector('.reader-swipe-preview[data-swipe-active="true"] [data-swipe-page]'),r=image?.getBoundingClientRect();if(r&&getComputedStyle(image!).visibility!=='hidden')(window as any).__swipeTrace.push({x:r.x,y:r.y});if((window as any).__swipeRunning)requestAnimationFrame(frame);};frame();
    });
    const x=box.x+box.width*.8,y=box.y+box.height*.5;
    await input.cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
    for(let n=1;n<=10;n++){await input.cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x-box.width*.65*n/10,y}]});await page.waitForTimeout(16);}
    await input.cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow',String(index+1));await page.waitForTimeout(400);
    const trace=await page.evaluate(()=>{(window as any).__swipeRunning=false;return (window as any).__swipeTrace as {x:number;y:number}[];});
    expect(trace.length).toBeGreaterThan(3);
    const image=(await page.locator(`.reader-page-spread [data-reader-page-index="${index}"] img`).boundingBox())!,last=trace.at(-1)!;
    expect(Math.abs(last.x-image.x)).toBeLessThan(2);expect(Math.abs(last.y-image.y)).toBeLessThan(2);
  });
});
