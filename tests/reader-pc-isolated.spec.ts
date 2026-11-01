import {test,expect} from '@playwright/test';
import {installMock} from './mock';

test('PC fit filtering includes byte-heavy ordinary scans and suppresses horizontal screen-tone bands',async({page})=>{
  await page.setViewportSize({width:2559,height:1392});await page.addInitScript(installMock,{count:1});
  await page.addInitScript(()=>{
    const c=document.createElement('canvas');c.width=2562;c.height=3625;const ctx=c.getContext('2d')!,tile=document.createElement('canvas');tile.width=tile.height=4;
    const t=tile.getContext('2d')!;t.fillStyle='white';t.fillRect(0,0,4,4);t.fillStyle='black';t.fillRect(0,0,2,2);t.fillRect(2,2,2,2);
    ctx.fillStyle=ctx.createPattern(tile,'repeat')!;ctx.fillRect(0,0,c.width,c.height);
    ctx.fillStyle='white';ctx.fillRect(0,2000,2562,1625);ctx.fillStyle='black';ctx.font='bold 42px sans-serif';ctx.fillText('Clear type 123 中文',180,2450);ctx.fillRect(100,2700,2100,8);
    const url=c.toDataURL();window.omicomic.getPageImage=async()=>({ok:true,data:{url,width:2562,height:3625,encodedBytes:8686452}});
  });
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  const current=page.locator('.reader-page-frame:not([aria-hidden="true"])');await expect(current.locator('.has-display-raster')).toHaveCount(1);
  const metric=await current.locator('.reader-display-raster').evaluate((c:HTMLCanvasElement)=>{
    const ctx=c.getContext('2d')!,area=ctx.getImageData(20,20,c.width-40,Math.floor(c.height*.5)-40),means=[];
    for(let y=0;y<area.height;y++){let sum=0;for(let x=0;x<area.width;x++)sum+=area.data[(y*area.width+x)*4];means.push(sum/area.width);}
    const average=means.reduce((s,n)=>s+n,0)/means.length,band=Math.sqrt(means.reduce((s,n)=>s+(n-average)**2,0)/means.length);
    const text=ctx.getImageData(0,Math.floor(c.height*.6),c.width,Math.floor(c.height*.3)).data;let black=255,white=0;for(let n=0;n<text.length;n+=4){black=Math.min(black,text[n]);white=Math.max(white,text[n]);}
    return {band,average,black,white,width:c.width,height:c.height};
  });
  expect(metric.average).toBeGreaterThan(125);expect(metric.average).toBeLessThan(130);expect(metric.band).toBeLessThan(1);
  expect(metric.black).toBeLessThan(8);expect(metric.white).toBeGreaterThan(248);
  expect(await current.locator('img.reader-image').evaluate((i:HTMLImageElement)=>[i.naturalWidth,i.naturalHeight])).toEqual([2562,3625]);
  console.log(JSON.stringify({pcByteHeavyFit:metric}));
});

test('PC source viewport reuses covered pixels during a large-image drag',async({page})=>{
  test.setTimeout(90000);await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(installMock,{count:1});
  await page.addInitScript(()=>{
    const c=document.createElement('canvas');c.width=8000;c.height=10000;const ctx=c.getContext('2d')!;ctx.fillStyle='#468cbe';ctx.fillRect(0,0,c.width,c.height);
    const url=c.toDataURL();window.omicomic.getPageImage=async()=>({ok:true,data:{url,width:8000,height:10000}});
    const draw=CanvasRenderingContext2D.prototype.drawImage;(window as any).__sourceDraws=0;
    CanvasRenderingContext2D.prototype.drawImage=function(...args:any[]){if(this.canvas.classList.contains('reader-viewport-raster'))(window as any).__sourceDraws++;return (draw as any).apply(this,args);};
  });
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  const stage=page.locator('.reader-stage'),box=(await stage.boundingBox())!,surface=page.locator('.reader-viewport-raster');await expect(surface).toBeVisible();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.keyboard.down('Control');await page.mouse.wheel(0,-Math.log(4)/.002);await page.keyboard.up('Control');
  await expect.poll(async()=>Number(await surface.getAttribute('data-zoom'))).toBeCloseTo(4,5);await page.evaluate(()=>(window as any).__sourceDraws=0);
  await page.mouse.down();for(let n=1;n<=60;n++){await page.mouse.move(x-n*8,y);await page.waitForTimeout(8);}await page.mouse.up();
  const draws=await page.evaluate(()=>(window as any).__sourceDraws);console.log(JSON.stringify({pcCoveredDragDraws:draws,pointerMoves:60}));expect(draws).toBeLessThanOrEqual(8);
  expect(await surface.evaluate((c:HTMLCanvasElement)=>c.width*c.height)).toBeLessThanOrEqual(8_000_000);
  const pixel=await surface.evaluate((c:HTMLCanvasElement)=>[...c.getContext('2d')!.getImageData(c.width>>1,c.height>>1,1,1).data]);expect(pixel).toEqual([70,140,190,255]);
});
