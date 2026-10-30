import { test, expect } from '@playwright/test';
import { installMock } from './mock';

async function open(page: import('@playwright/test').Page, slowSampling=false) {
  await page.addInitScript(installMock,{count:48});
  await page.addInitScript(({slowSampling})=>{
    const api=window.omicomic,get=api.getAppData;
    api.getAppData=async()=>{const r=await get();if(r.ok){r.data.recentOpened[0].currentPageIndex=12;r.data.settings.readerPreloadPages=4;r.data.settings.readerMemoryCacheSizeMb=256;}return r;};
    const c=document.createElement('canvas');c.width=2124;c.height=3000;const ctx=c.getContext('2d')!;ctx.fillStyle='#eee';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='#222';for(let y=0;y<3000;y+=26)ctx.fillRect(0,y,c.width,6);for(let x=0;x<2124;x+=26)ctx.fillRect(x,0,6,c.height);
    const url=c.toDataURL();api.getPageImage=async()=>({ok:true,data:{url,width:c.width,height:c.height}});
    if(slowSampling){const NativeWorker=window.Worker;window.Worker=new Proxy(NativeWorker,{construct(Target,args){const w=new Target(...args as [string,WorkerOptions]);if(String(args[0]).includes('displaySampling')){let listener:((event:MessageEvent)=>void)|undefined;Object.defineProperty(w,'onmessage',{set(fn){if(listener)w.removeEventListener('message',listener);listener=e=>setTimeout(()=>fn?.(e),350);w.addEventListener('message',listener);},configurable:true});}return w;}});}
    (window as any).__unfilteredVisible=0;
    const watch=()=>{const stage=document.querySelector('.reader-layout');if(stage&&stage.getBoundingClientRect().width&&getComputedStyle(stage).visibility!=='hidden'&&!stage.closest('.page-panel.is-hidden'))for(const e of document.querySelectorAll('.reader-effects')){const r=e.getBoundingClientRect(),img=e.querySelector('img');if(r.width&&img?.complete&&getComputedStyle(img).visibility!=='hidden'&&!e.classList.contains('has-display-raster'))(window as any).__unfilteredVisible++;}requestAnimationFrame(watch);};requestAnimationFrame(watch);
  },{slowSampling});
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  await expect(page.locator('.page-panel.is-visible .reader-layout')).toBeVisible();
  await expect(page.locator('[data-reader-page-index="12"] .has-display-raster')).toHaveCount(1);
  await page.locator('.page-panel.is-visible').evaluate(async element=>{await Promise.all(element.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>undefined)));});
}

test('ordinary reading reveals prepared pixels once instead of showing unfiltered then filtered tones',async({page})=>{
  await open(page,true);await page.waitForTimeout(150);
  expect(await page.evaluate(()=>(window as any).__unfilteredVisible)).toBe(0);
});
test('ordinary page turns keep the complete previous image while the next filter finishes',async({page})=>{
  await open(page,true);
  await page.evaluate(()=>{(window as any).__emptyReaderFrames=0;(window as any).__checkReaderPixels=true;const frame=()=>{if(!(window as any).__checkReaderPixels)return;const visible=[...document.querySelectorAll<HTMLCanvasElement>('.reader-page-frame:not([aria-hidden="true"]) .has-display-raster canvas')].some(c=>c.width>0&&getComputedStyle(c).visibility==='visible');if(!visible)(window as any).__emptyReaderFrames++;requestAnimationFrame(frame);};requestAnimationFrame(frame);});
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(page.locator('[data-reader-page-index="12"]:not([aria-hidden="true"]) .has-display-raster')).toHaveCount(1);
  await expect(page.locator('[data-reader-page-index="13"]:not([aria-hidden="true"]) .has-display-raster')).toHaveCount(1);
  expect(await page.evaluate(()=>{(window as any).__checkReaderPixels=false;return (window as any).__emptyReaderFrames;})).toBe(0);
});

for(const panorama of [false,true])test(`mouse side clicks turn pages and dragging does not click through (${panorama?'panorama':'ordinary'})`,async({page})=>{
  await open(page);if(panorama)await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();
  const stage=page.locator('.reader-stage'),box=(await stage.boundingBox())!,y=box.y+box.height*.5;
  const progress=page.getByRole('slider',{name:'阅读进度'});
  await page.mouse.click(box.x+box.width*.9,y);
  await expect(progress).toHaveAttribute('aria-valuenow','14');
  await page.mouse.click(box.x+box.width*.1,y);await expect(progress).toHaveAttribute('aria-valuenow','13');
  await page.getByRole('button',{name:'当前从左到右阅读，点击切换为从右到左',exact:true}).click();
  await page.mouse.click(box.x+box.width*.1,y);await expect(progress).toHaveAttribute('aria-valuenow','14');
  await page.mouse.click(box.x+box.width*.9,y);await expect(progress).toHaveAttribute('aria-valuenow','13');
  await page.mouse.move(box.x+box.width*.85,y);await page.mouse.down();await page.mouse.move(box.x+box.width*.85-35,y,{steps:8});await page.waitForTimeout(200);await page.mouse.up();await page.waitForTimeout(400);await expect(progress).toHaveAttribute('aria-valuenow','13');
});

test.describe('fractional pixel presentation',()=>{
  test.use({viewport:{width:1101,height:821},deviceScaleFactor:1.25});
  test('zoom keeps a complete image and does not apply the zoom factor twice to its bitmap',async({page})=>{
    await open(page);
    await page.evaluate(()=>{(window as any).__zoomBlankFrames=0;(window as any).__checkZoom=true;const sample=()=>{if(!(window as any).__checkZoom)return;const e=document.querySelector('.reader-effects')!,canvas=e.querySelector('canvas')!,image=e.querySelector('img')!;if(getComputedStyle(canvas).visibility==='hidden'&&getComputedStyle(image).visibility==='hidden')(window as any).__zoomBlankFrames++;requestAnimationFrame(sample);};requestAnimationFrame(sample);});
    const box=(await page.locator('.reader-stage').boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.keyboard.down('Control');await page.mouse.wheel(0,-180);await page.keyboard.up('Control');
    const canvas=page.locator('[data-reader-page-index="12"] .reader-display-raster');
    await expect.poll(()=>canvas.evaluate(c=>{const r=c.getBoundingClientRect(),host=c.parentElement!.getBoundingClientRect();return Math.abs(r.width-host.width)<1&&Math.abs(r.height-host.height)<1&&Math.abs(r.width*devicePixelRatio-c.width)<1;})).toBe(true);
    await page.getByRole('button',{name:'缩放',exact:true}).click();await page.getByRole('button',{name:'重置大小',exact:true}).click();await page.keyboard.press('Escape');
    await expect.poll(()=>canvas.evaluate(c=>{const r=c.getBoundingClientRect(),host=c.parentElement!.getBoundingClientRect();return Math.abs(r.width-host.width)<1&&Math.abs(r.height-host.height)<1;})).toBe(true);
    expect(await page.evaluate(()=>{(window as any).__checkZoom=false;return (window as any).__zoomBlankFrames;})).toBe(0);
  });
  for(const flow of ['horizontal','vertical'])test(`the actual ${flow} panorama raster keeps an integer pixel origin and size`,async({page})=>{
    await open(page);
    expect(await page.locator('.reader-stage').evaluate(e=>({x:e.scrollWidth-e.clientWidth,y:e.scrollHeight-e.clientHeight}))).toEqual({x:0,y:0});
    await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();if(flow==='vertical')await page.getByRole('button',{name:'当前横向阅读，点击切换纵向阅读',exact:true}).click();
    const canvas=page.locator('[data-reader-page-index="12"] .reader-display-raster');await expect(page.locator('[data-reader-page-index="12"] .has-display-raster')).toHaveCount(1);
    await expect.poll(()=>canvas.evaluate(c=>{const r=c.parentElement!.getBoundingClientRect();return c.width===Math.round(r.width*devicePixelRatio)&&c.height===Math.round(r.height*devicePixelRatio);})).toBe(true);
    const box=(await page.locator('.reader-stage').boundingBox())!,x=box.x+box.width*.6,y=box.y+box.height*.6;
    await page.mouse.move(x,y);await page.mouse.down();const values=[];
    for(let n=0;n<24;n++){await page.mouse.move(x-(flow==='horizontal'?n*2.3:0),y-(flow==='vertical'?n*2.3:0));await page.waitForTimeout(18);values.push(await canvas.evaluate(c=>{const r=c.getBoundingClientRect(),d=devicePixelRatio;return {x:r.x*d,y:r.y*d,width:r.width*d,height:r.height*d,canvas:[c.width,c.height]};}));}
    await page.mouse.up();for(const r of values){for(const value of [r.x,r.y,r.width,r.height])expect(Math.abs(value-Math.round(value)),JSON.stringify(r)).toBeLessThan(.025);expect(Math.abs(r.width-r.canvas[0])).toBeLessThan(.025);expect(Math.abs(r.height-r.canvas[1])).toBeLessThan(.025);}
  });
  for(const flow of ['horizontal','vertical'])for(const scale of [1,.5])test(`composited ${flow} pixels at ${scale} zoom remain unchanged during a slow drag`,async({page})=>{
    await open(page);await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();if(flow==='vertical')await page.getByRole('button',{name:'当前横向阅读，点击切换纵向阅读',exact:true}).click();
    if(scale!==1){await page.getByRole('button',{name:'缩放',exact:true}).click();await page.getByRole('slider',{name:'缩放比例'}).fill('-100');await page.keyboard.press('Escape');}
    const canvas=page.locator('[data-reader-page-index="12"] .reader-display-raster');await expect(page.locator('[data-reader-page-index="12"] .has-display-raster')).toHaveCount(1);
    await expect.poll(()=>canvas.evaluate(c=>{const r=c.parentElement!.getBoundingClientRect();return c.width===Math.round(r.width*devicePixelRatio)&&c.height===Math.round(r.height*devicePixelRatio);})).toBe(true);
    const stage=(await page.locator('.reader-stage').boundingBox())!,x=stage.x+stage.width*.6,y=stage.y+stage.height*.6;
    const offset=await canvas.evaluate(c=>{const r=c.getBoundingClientRect(),s=document.querySelector('.reader-stage')!.getBoundingClientRect();return {x:Math.round((s.left+s.width/2-r.left)*devicePixelRatio),y:Math.round((s.top+s.height/2-r.top)*devicePixelRatio)};});
    await page.mouse.move(x,y);await page.mouse.down();const frames:number[][]=[];
    for(let n=0;n<10;n++){
      await page.mouse.move(x-(flow==='horizontal'?n*1.6:0),y-(flow==='vertical'?n*1.6:0));await page.waitForTimeout(25);
      const origin=await canvas.evaluate(c=>{const r=c.getBoundingClientRect();return {x:Math.round(r.left*devicePixelRatio),y:Math.round(r.top*devicePixelRatio)};});
      const png=await page.screenshot();frames.push(await page.evaluate(async({png,x,y})=>{const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'})),surface=new OffscreenCanvas(16,16),ctx=surface.getContext('2d')!;ctx.drawImage(bitmap,x,y,16,16,0,0,16,16);bitmap.close();return [...ctx.getImageData(0,0,16,16).data];},{png:png.toString('base64'),x:origin.x+offset.x,y:origin.y+offset.y}));
    }
    await page.mouse.up();const maxDifference=Math.max(...frames.slice(1).map(frame=>Math.max(...frame.map((v,i)=>Math.abs(v-frames[0][i])))));expect(maxDifference).toBeLessThanOrEqual(1);console.log(JSON.stringify({flow,scale,compositedFrames:frames.length,maxDifference}));
  });
});
