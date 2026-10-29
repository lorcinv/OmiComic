import { test, expect } from '@playwright/test';
import { installMock } from './mock';
import { seedDenseScreentones } from './denseScreentones';

for (const [highPixels,viewportHeight] of [[false,960],[false,1392],[true,960]] as const) test(`halftones stay filtered during ordinary and panorama reading at ${viewportHeight}px${highPixels?' with an 80 MP source':''}`, async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({width:1440,height:viewportHeight});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(installMock,{count:24});
  await page.addInitScript(({ highPixels }) => {
    const api=window.omicomic,get=api.getAppData;
    api.getAppData=async()=>{const r=await get();if(r.ok){r.data.recentOpened[0].currentPageIndex=8;r.data.settings.readerMemoryCacheSizeMb=512;}return r;};
    const width=highPixels?8000:1062,height=highPixels?10000:1500;
    const tile=document.createElement('canvas');tile.width=tile.height=2;
    const t=tile.getContext('2d')!;t.fillStyle='white';t.fillRect(0,0,2,2);t.fillStyle='black';t.fillRect(0,0,1,1);t.fillRect(1,1,1,1);
    const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d')!;
    ctx.fillStyle=ctx.createPattern(tile,'repeat')!;ctx.fillRect(0,0,width,height);
    ctx.fillStyle='white';ctx.fillRect(0,height*.55,width,height*.45);ctx.fillStyle='black';
    ctx.font=`bold ${Math.max(40,Math.round(height*.04))}px sans-serif`;ctx.fillText('Omi 123 ABC',width*.1,height*.7);ctx.fillRect(width*.1,height*.8,width*.7,Math.max(8,Math.round(height*.008)));
    for(const [n,color] of ['red','lime','blue'].entries()){ctx.fillStyle=color;ctx.fillRect(width*.84,height*(.6+n*.1),width*.08,height*.04);}
    ctx.clearRect(width*.1,height*.94,width*.2,height*.05);ctx.fillStyle='rgba(255,0,0,.5)';ctx.fillRect(width*.1,height*.94,width*.2,height*.05);
    const url=c.toDataURL('image/png');api.getPageImage=async()=>({ok:true,data:{url,width,height}});
    (window as any).__samplingRequests=0;
    (window as any).__currentRasterWrites=0;
    const widthProperty=Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,'width')!;
    Object.defineProperty(HTMLCanvasElement.prototype,'width',{...widthProperty,set(value){
      if(value>0 && this.classList.contains('reader-display-raster') && this.closest('[data-reader-page-index="8"]'))(window as any).__currentRasterWrites++;
      widthProperty.set!.call(this,value);
    }});
    const OriginalWorker=window.Worker;
    window.Worker=new Proxy(OriginalWorker,{construct(Target,args){
      const worker=new Target(...args as [string,WorkerOptions]);
      if(String(args[0]).includes('displaySampling')){const post=worker.postMessage.bind(worker);worker.postMessage=((...values:any[])=>{(window as any).__samplingRequests++;return (post as any)(...values);}) as typeof worker.postMessage;}
      return worker;
    }});
  },{highPixels});
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  const current=page.locator('[data-reader-page-index="8"]');
  await expect(current.locator('.has-display-raster')).toHaveCount(1,{timeout:20000});
  const pixels=await current.locator('.reader-display-raster').evaluate((surface:HTMLCanvasElement)=>{
    const c=document.createElement('canvas');c.width=surface.width;c.height=surface.height;
    const ctx=c.getContext('2d')!;ctx.drawImage(surface,0,0);const {data}=ctx.getImageData(0,0,c.width,c.height);
    let count=0,sum=0,squares=0,black=255,white=0;
    for(let y=10;y<c.height*.45;y+=3)for(let x=10;x<c.width-10;x+=3){const v=data[(y*c.width+x)*4];sum+=v;squares+=v*v;count++;}
    for(let y=Math.floor(c.height*.56);y<c.height*.9;y++)for(let x=5;x<c.width-5;x++){const v=data[(y*c.width+x)*4];black=Math.min(black,v);white=Math.max(white,v);}
    const pixel=(x:number,y:number)=>[...ctx.getImageData(Math.floor(c.width*x),Math.floor(c.height*y),1,1).data];
    return {width:c.width,height:c.height,mean:sum/count,deviation:Math.sqrt(Math.max(0,squares/count-(sum/count)**2)),black,white,colors:[pixel(.88,.62),pixel(.88,.72),pixel(.88,.82)],alpha:pixel(.2,.965)};
  });
  expect(pixels.mean).toBeGreaterThan(120);expect(pixels.mean).toBeLessThan(135);
  expect(pixels.deviation).toBeLessThan(5);expect(pixels.black).toBeLessThan(8);expect(pixels.white).toBeGreaterThan(248);
  expect(pixels.colors).toEqual([[255,0,0,255],[0,255,0,255],[0,0,255,255]]);expect(pixels.alpha).toEqual([255,0,0,128]);
  await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();
  await expect(current.locator('.has-display-raster')).toHaveCount(1);
  const box=(await page.locator('.reader-stage').boundingBox())!,x=box.x+box.width*.6,y=box.y+box.height*.5;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-30,y);await page.waitForTimeout(300);
  const before=await page.evaluate(()=>(window as any).__currentRasterWrites);
  const dimensions=await current.locator('.reader-display-raster').evaluate((c:HTMLCanvasElement)=>[c.width,c.height]);
  for(let n=0;n<40;n++){await page.mouse.move(x-30-Math.sin(n/4)*8,y);await page.waitForTimeout(8);}
  expect(await page.evaluate(()=>(window as any).__currentRasterWrites)).toBe(before);
  expect(await current.locator('.reader-display-raster').evaluate((c:HTMLCanvasElement)=>[c.width,c.height])).toEqual(dimensions);
  await page.mouse.up();
  if(!highPixels && viewportHeight===1392){
    await page.waitForTimeout(2200);
    const pixel=await current.locator('.reader-display-raster').evaluate((source:HTMLCanvasElement)=>{
      const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d')!;ctx.drawImage(source,Math.floor(source.width/2),Math.floor(source.height/5),1,1,0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];
    });
    expect(pixel[0]).toBeGreaterThan(120);expect(pixel[0]).toBeLessThan(135);expect(pixel[3]).toBe(255);
  }
  console.log(JSON.stringify({highPixels,...pixels,totalSamplingRequests:await page.evaluate(()=>(window as any).__samplingRequests)}));
});

test('80 MP dense dots and crosshatches remain filtered after idle and panorama mode changes',async({page})=>{
  test.setTimeout(90000);await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(installMock,{count:3});await page.addInitScript(seedDenseScreentones,{width:8000,height:10000});
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  const current=page.locator('[data-reader-page-index="1"]');
  const check=async()=>{
    await expect(current.locator('.has-display-raster')).toHaveCount(1,{timeout:20000});
    const values=await current.locator('.reader-display-raster').evaluate((source:HTMLCanvasElement)=>{
      const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d')!;ctx.drawImage(source,0,0);
      return (window as any).__denseZones.map((z:any)=>{const b=ctx.getImageData(Math.round(c.width*z.x)-12,Math.round(c.height*z.y)-12,24,24).data;let sum=0,sq=0,alpha=0;for(let n=0;n<b.length;n+=4){sum+=b[n];sq+=b[n]*b[n];alpha+=b[n+3];}return {n:z.n,expected:z.expected,mean:sum/576,deviation:Math.sqrt(Math.max(0,sq/576-(sum/576)**2)),alpha:alpha/576};});
    });
    for(const value of values){expect(value.alpha).toBe(255);expect(Math.abs(value.mean-value.expected),JSON.stringify(value)).toBeLessThan(2);expect(value.deviation,JSON.stringify(value)).toBeLessThan(2);}
    return values;
  };
  const ordinary=await check();await page.waitForTimeout(2600);expect(await check()).toEqual(ordinary);
  await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();await check();
  await page.waitForTimeout(2600);const panorama=await check();
  console.log(JSON.stringify({dense80mp:{ordinary,panorama}}));
});

test('software sampling preserves dense tones when WebGL is unavailable',async({page})=>{
  test.setTimeout(60000);await page.addInitScript(installMock,{count:1});await page.addInitScript(seedDenseScreentones,{width:2000,height:2500,initial:0});
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;
    window.Worker=new Proxy(NativeWorker,{construct(Target,args){
      if(!String(args[0]).includes('displaySampling'))return new Target(...args as [string,WorkerOptions]);
      const module=new URL(String(args[0]),location.href).href;
      const code=`const pending=[];self.onmessage=e=>pending.push(e);const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:get.call(this,kind,...args)};await import(${JSON.stringify(module)});for(const e of pending)self.onmessage(e);`;
      return new Target(URL.createObjectURL(new Blob([code],{type:'text/javascript'})),{type:'module'});
    }});
  });
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();await expect(page.locator('.has-display-raster')).toHaveCount(1,{timeout:30000});
  const values=await page.locator('.reader-display-raster').evaluate((source:HTMLCanvasElement)=>{
    const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d')!;ctx.drawImage(source,0,0);
    return (window as any).__denseZones.slice(0,3).map((z:any)=>{const b=ctx.getImageData(Math.round(c.width*z.x)-12,Math.round(c.height*z.y)-12,24,24).data;let sum=0,sq=0,alpha=0;for(let n=0;n<b.length;n+=4){sum+=b[n];sq+=b[n]*b[n];alpha+=b[n+3];}return {n:z.n,expected:z.expected,mean:sum/576,deviation:Math.sqrt(Math.max(0,sq/576-(sum/576)**2)),alpha:alpha/576};});
  });
  for(const value of values){expect(value.alpha).toBe(255);expect(Math.abs(value.mean-value.expected)).toBeLessThan(2);expect(value.deviation,JSON.stringify(value)).toBeLessThan(2);}
});

test('long panorama drags prepare newly mounted pages without exposing unfiltered or empty rasters',async({page})=>{
  test.setTimeout(90000);await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(installMock,{count:128});
  await page.addInitScript(()=>{
    const api=window.omicomic,get=api.getAppData;api.getAppData=async()=>{const r=await get();if(r.ok){r.data.recentOpened[0].currentPageIndex=32;r.data.settings.readerMemoryCacheSizeMb=512;r.data.settings.readerPreloadPages=12;}return r;};
    const c=document.createElement('canvas');c.width=1062;c.height=1500;const ctx=c.getContext('2d')!,tile=document.createElement('canvas');tile.width=tile.height=2;const p=tile.getContext('2d')!;p.fillStyle='white';p.fillRect(0,0,2,2);p.fillStyle='black';p.fillRect(0,0,1,1);p.fillRect(1,1,1,1);ctx.fillStyle=ctx.createPattern(tile,'repeat')!;ctx.fillRect(0,0,c.width,c.height);const url=c.toDataURL();api.getPageImage=async()=>({ok:true,data:{url,width:1062,height:1500}});
  });
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();
  await expect(page.locator('[data-reader-page-index="32"] .has-display-raster')).toHaveCount(1);await page.waitForTimeout(900);
  const stage=(await page.locator('.reader-stage').boundingBox())!,x=stage.x+stage.width*.8,y=stage.y+stage.height*.5;
  await page.mouse.move(x,y);await page.mouse.down();let furthest=32;
  for(let n=1;n<=270;n++){
    await page.mouse.move(x-n*44,y);await page.waitForTimeout(10);
    if(n%9)continue;
    const visible=await page.locator('[data-reader-page-index]').evaluateAll(nodes=>{
      const s=document.querySelector('.reader-stage')!.getBoundingClientRect();return nodes.filter(node=>{const r=node.getBoundingClientRect();return r.right>s.left+20&&r.left<s.right-20;}).map(node=>{
        const c=node.querySelector<HTMLCanvasElement>('.reader-display-raster'),t=document.createElement('canvas');t.width=t.height=1;const ctx=t.getContext('2d')!;if(c?.width)ctx.drawImage(c,c.width/2,c.height/4,1,1,0,0,1,1);
        const img=node.querySelector('img');
        return {index:Number((node as HTMLElement).dataset.readerPageIndex),ready:!!node.querySelector('.has-display-raster'),loaded:img?.complete,natural:img?.naturalWidth,raster:c?[c.width,c.height]:null,pixel:[...ctx.getImageData(0,0,1,1).data]};
      });
    });
    for(const value of visible){furthest=Math.max(furthest,value.index);expect(value.ready,JSON.stringify({step:n,...value})).toBe(true);expect(value.pixel[3],JSON.stringify({step:n,...value})).toBe(255);expect(value.pixel[0]).toBeGreaterThan(120);expect(value.pixel[0]).toBeLessThan(135);}
  }
  await page.mouse.up();expect(furthest).toBeGreaterThan(58);console.log(JSON.stringify({longDragFurthestPage:furthest}));
});

test('direction and page-count buttons change shape without active fill in every desktop theme',async({page})=>{
  await page.addInitScript(installMock,{count:24});await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  await expect(page.locator('.reader-flow-toggle')).toBeEnabled();
  await expect(page.locator('.reader-page-count-toggle')).toBeEnabled();await page.mouse.move(0,0);
  for(const theme of ['mist','nord','sand','night']){
    await page.evaluate(theme=>{document.documentElement.dataset.colorTheme=theme;},theme);
    await page.waitForTimeout(180);
    const buttons=page.locator('.reader-reading-actions :is(.reader-flow-toggle,.reader-page-count-toggle)');
    const before=await buttons.evaluateAll(nodes=>nodes.map(node=>({bg:getComputedStyle(node).backgroundColor,color:getComputedStyle(node).color})));
    await page.getByRole('button',{name:'当前横向阅读，点击切换纵向阅读',exact:true}).click();
    await page.getByRole('button',{name:'当前单页，点击切换双页',exact:true}).click();await page.mouse.move(0,0);
    await expect.poll(()=>buttons.evaluateAll(nodes=>nodes.map(node=>({bg:getComputedStyle(node).backgroundColor,color:getComputedStyle(node).color})))).toEqual(before);
    await page.getByRole('button',{name:'当前纵向阅读，点击切换横向阅读',exact:true}).click();
    await page.getByRole('button',{name:'当前双页，点击切换单页',exact:true}).click();await page.mouse.move(0,0);
  }
});
