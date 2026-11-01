import {test,expect} from '@playwright/test';
import {installMock} from './mock';

test('desktop entry and page turns use source pixels even while the obsolete display worker is held',async({page})=>{
  await page.addInitScript(installMock,{count:2});
  await page.addInitScript(()=>{
    const c=document.createElement('canvas');c.width=1400;c.height=2100;c.getContext('2d')!.fillRect(0,0,c.width,c.height);
    const url=c.toDataURL();window.omicomic.getPageImage=async()=>({ok:true,data:{url,width:1400,height:2100}});
    let held=true;const waiting:(()=>void)[]=[];
    (window as any).__releaseSampling=()=>{held=false;waiting.splice(0).forEach(run=>run());};
    const NativeWorker=window.Worker;
    window.Worker=new Proxy(NativeWorker,{construct(Target,args){
      const worker=new Target(...args as [string,WorkerOptions]);
      if(String(args[0]).includes('displaySampling')){
        let listener:((event:MessageEvent)=>void)|undefined;
        Object.defineProperty(worker,'onmessage',{set(fn){
          if(listener)worker.removeEventListener('message',listener);
          listener=event=>{if(held)waiting.push(()=>fn(event));else fn(event);};worker.addEventListener('message',listener);
        }});
      }
      return worker;
    }});
  });
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  await expect(page.locator('.page-panel.is-visible .reader-stage')).toBeVisible();
  const image=page.locator('.reader-page-frame:not([aria-hidden="true"]) img.reader-image').first();
  await expect(image).toBeVisible();expect(await image.evaluate((i:HTMLImageElement)=>i.naturalWidth)).toBe(1400);
  await expect(page.locator('.has-display-raster')).toHaveCount(0);
  await page.getByRole('button',{name:'下一页',exact:true}).click();
  await expect(page.locator('.reader-page-frame:not([aria-hidden="true"])')).toHaveAttribute('data-reader-page-index','1');
  await expect(page.locator('.reader-page-frame:not([aria-hidden="true"]) img.reader-image')).toBeVisible();
  await expect(page.locator('.has-display-raster,.reader-quality-transition')).toHaveCount(0);
});

for(const sharpen of [0,40])test(`zoom reads source pixels with sharpen=${sharpen}, instead of enlarging a fit-size preview`,async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(installMock,{count:1});
  await page.addInitScript(()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1400;const ctx=canvas.getContext('2d')!;
    for(let x=0;x<1400;x++){ctx.fillStyle=x%4<2?'black':'white';ctx.fillRect(x,0,1,1400);}
    const url=canvas.toDataURL();window.omicomic.getPageImage=async()=>({ok:true,data:{url,width:1400,height:1400,encodedBytes:100_000}});
  });
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  const viewport=page.locator('.reader-page-frame:not([aria-hidden="true"]) .reader-viewport-raster').first();
  await expect(page.locator('.has-display-raster')).toHaveCount(1);
  if(sharpen){
    await page.getByRole('button',{name:'画面调整',exact:true}).click();
    await page.getByRole('slider',{name:'锐化',exact:true}).fill(String(sharpen));await page.keyboard.press('Escape');
    await expect(page.locator('.reader-effects').first()).toHaveAttribute('data-processing','ready');
    // Processing already outputs a display-sized image. No second sampling pass.
    await expect(page.locator('.has-display-raster')).toHaveCount(0);
  }
  const original=page.locator('.reader-page-frame:not([aria-hidden="true"]) img.reader-image').first();
  const size=await original.boundingBox(),stage=await page.locator('.reader-stage').boundingBox();
  const zoom=1400/(size!.width*(await page.evaluate(()=>devicePixelRatio)));
  await page.evaluate(()=>{(window as any).__zoomRequestedAt=0;document.addEventListener('wheel',event=>{if(event.ctrlKey)(window as any).__zoomRequestedAt=performance.now();},{capture:true});});
  await page.mouse.move(stage!.x+stage!.width/2,stage!.y+stage!.height/2);await page.keyboard.down('Control');await page.mouse.wheel(0,-Math.log(zoom)/.002);await page.keyboard.up('Control');
  await expect(viewport).toBeVisible();
  await expect(page.locator('.has-processed-image')).toHaveCount(0);
  await expect.poll(()=>viewport.evaluate(c=>Number(c.dataset.sourceWidth))).toBe(1400);
  if(sharpen)await expect(viewport).toHaveAttribute('data-processing','ready');
  await expect.poll(()=>viewport.evaluate((c:HTMLCanvasElement)=>{
    const data=c.getContext('2d')!.getImageData(Math.floor(c.width/2)-32,Math.floor(c.height/2),64,1).data;let sum=0,sq=0;
    for(let i=0;i<data.length;i+=4){sum+=data[i];sq+=data[i]*data[i];}return Math.sqrt(Math.max(0,sq/64-(sum/64)**2));
  })).toBeGreaterThan(75);
  const latency=await viewport.evaluate(c=>Number(c.dataset.drawnAt)-(window as any).__zoomRequestedAt);
  expect(latency).toBeGreaterThanOrEqual(0);expect(latency).toBeLessThan(750);
  expect(await original.evaluate((img:HTMLImageElement)=>[img.naturalWidth,img.naturalHeight])).toEqual([1400,1400]);
  expect(await viewport.evaluate((c:HTMLCanvasElement)=>c.width*c.height)).toBeLessThanOrEqual(8_000_000);
  await page.keyboard.down('Control');await page.mouse.wheel(0,Math.log(zoom)/.002);await page.keyboard.up('Control');
  await expect(viewport).toHaveCount(0);
  await expect(page.locator('.reader-effects.is-display-pending')).toHaveCount(0);
  if(sharpen)await expect(page.locator('.reader-effects').first()).toHaveAttribute('data-processing','ready');
});

test('a small enlargement leaves the fit raster immediately, before native pixel size',async({page})=>{
  await page.addInitScript(installMock,{count:1});
  await page.addInitScript(()=>{
    const c=document.createElement('canvas');c.width=2124;c.height=3000;c.getContext('2d')!.fillRect(0,0,c.width,c.height);
    const url=c.toDataURL();window.omicomic.getPageImage=async()=>({ok:true,data:{url,width:2124,height:3000}});
  });
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  await expect(page.locator('.has-display-raster')).toHaveCount(1);
  const stage=page.locator('.reader-stage'),box=(await stage.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.keyboard.down('Control');await page.mouse.wheel(0,-48);await page.keyboard.up('Control');
  const surface=page.locator('.reader-page-frame:not([aria-hidden="true"]) .reader-viewport-raster');
  await expect(surface).toBeVisible();await expect(surface).toHaveAttribute('data-source-width','2124');
  await expect(page.locator('.has-display-raster,.reader-quality-transition')).toHaveCount(0);
  expect(Number(await stage.getAttribute('data-reader-zoom'))).toBeLessThan(1.2);
});
