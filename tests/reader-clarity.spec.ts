import { test, expect } from '@playwright/test';
import { installMock } from './mock';

// A blurred image can pass a black/white extrema check and suppress every
// screentone. Read thin strokes and edge spread at the actual output density.
test('fit-size sampling keeps thin ink strokes, text edges and white page margins on GPU and software', async ({page},info) => {
  test.setTimeout(60000);
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const source = document.createElement('canvas'); source.width=1200; source.height=1800;
    const ctx=source.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,1200,1800);ctx.fillStyle='black';
    for(let i=0;i<12;i++)for(let n=1;n<=3;n++)ctx.fillRect(80+i*90,100+n*120,n,80);
    ctx.fillRect(600,600,500,160);ctx.font='28px sans-serif';ctx.fillText('清晰文字 Omi Comic 123 ABC',80,950);
    const module=new URL('/src/reader/displaySampling.worker.ts',location.href).href;
    const code=`const pending=[];self.onmessage=e=>pending.push(e);const get=OffscreenCanvas.prototype.getContext;OffscreenCanvas.prototype.getContext=function(kind,...args){return kind==='webgl2'?null:get.call(this,kind,...args)};await import(${JSON.stringify(module)});for(const e of pending)self.onmessage(e);`;
    const softwareUrl=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
    const workers={gpu:new Worker(module,{type:'module'}),software:new Worker(softwareUrl,{type:'module'})};
    const rows=[];let sequence=0;
    try{for(const ratio of [.5,.8,.95]){
      const width=Math.round(1200*ratio),height=Math.round(1800*ratio),outputs:Record<string,Uint8ClampedArray>={},metrics:Record<string,any>={};
      for(const [name,worker] of Object.entries(workers)){
        const bitmap=await createImageBitmap(source),start=performance.now();
        const sampled=await new Promise<ImageBitmap>((resolve,reject)=>{
          const timer=setTimeout(()=>reject(Error('Sampling timeout: '+name)),15000);
          worker.onmessage=e=>{clearTimeout(timer);if(e.data.bitmap)resolve(e.data.bitmap);else reject(Error('Sampling failed: '+name));};
          worker.onerror=error=>{clearTimeout(timer);reject(Error(error.message));};
          worker.postMessage({id:++sequence,bitmap,width,height},[bitmap]);
        });
        const c=new OffscreenCanvas(width,height),read=c.getContext('2d')!;read.drawImage(sampled,0,0);sampled.close();
        const pixels=read.getImageData(0,0,width,height).data;outputs[name]=pixels;
        const value=(x:number,y:number)=>pixels[(Math.floor(y)*width+Math.floor(x))*4];
        const contrast=[1,2,3].map(n=>Array.from({length:12},(_,i)=>{
          const x=(80+i*90)*ratio,y=(100+n*120+40)*ratio;let low=255;
          for(let dx=-3;dx<=5;dx++)low=Math.min(low,value(x+dx,y));return 255-low;
        }).reduce((a,b)=>a+b)/12);
        const edge=[-2,-1,0,1,2].map(dx=>value(600*ratio+dx,650*ratio));
        const margins=[value(20,0),value(20,Math.round(30*ratio)),value(20,height-1),value(width-1,height-1)];
        metrics[name]={contrast,edge,margins,elapsed:performance.now()-start};
      }
      let sum=0;for(let i=0;i<outputs.gpu.length;i+=4)sum+=Math.abs(outputs.gpu[i]-outputs.software[i]);
      rows.push({ratio,metrics,meanPixelDifference:sum/(width*height)});
    }}finally{Object.values(workers).forEach(worker=>worker.terminate());URL.revokeObjectURL(softwareUrl);}
    return rows;
  });
  await info.attach('clarity-metrics',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  for(const row of result){
    for(const values of Object.values(row.metrics)){
      expect(values.contrast[0]).toBeGreaterThan(row.ratio===.5?90:165);
      expect(values.contrast[1]).toBeGreaterThan(row.ratio===.5?195:240);
      expect(values.edge[1]).toBeGreaterThan(220);expect(values.edge[2]).toBeLessThan(35);
      expect(values.margins).toEqual([255,255,255,255]);
    }
    expect(row.meanPixelDifference).toBeLessThan(.5);
  }
});

test('reader fit-size and zoom present original detail without an extra blurry processing stage', async ({page},info) => {
  await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(installMock,{count:1});
  await page.addInitScript(()=>{
    const c=document.createElement('canvas');c.width=1200;c.height=1800;const ctx=c.getContext('2d')!;
    ctx.fillStyle='white';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle='black';
    for(let x=80;x<1150;x+=90)ctx.fillRect(x,500,2,500);
    ctx.font='28px sans-serif';ctx.fillText('清晰文字 Aa 123',80,350);
    const url=c.toDataURL();window.omicomic.getPageImage=async()=>({ok:true,data:{url,width:1200,height:1800,encodedBytes:100000}});
  });
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  const current=page.locator('.reader-page-frame:not([aria-hidden="true"])').first();
  await expect(current.locator('.has-display-raster')).toHaveCount(1);
  const fit=await current.locator('.reader-display-raster').evaluate((canvas:HTMLCanvasElement)=>{
    const ratio=canvas.width/1200,ctx=canvas.getContext('2d')!;let contrast=0,count=0;
    for(let x=80;x<1150;x+=90){let low=255;for(let dx=-3;dx<=4;dx++)low=Math.min(low,ctx.getImageData(Math.floor(x*ratio)+dx,Math.floor(700*ratio),1,1).data[0]);contrast+=255-low;count++;}
    return {ratio,contrast:contrast/count};
  });
  expect(fit.ratio).toBeGreaterThan(.35);expect(fit.contrast).toBeGreaterThan(160);
  const image=current.locator('img.reader-image'),box=(await image.boundingBox())!,stage=(await page.locator('.reader-stage').boundingBox())!;
  const zoom=1200/(box.width*await page.evaluate(()=>devicePixelRatio));
  await page.mouse.move(stage.x+stage.width/2,stage.y+stage.height/2);await page.keyboard.down('Control');await page.mouse.wheel(0,-Math.log(zoom)/.002);await page.keyboard.up('Control');
  await expect(current.locator('.reader-viewport-raster')).toBeVisible();
  await expect(current.locator('.reader-effects')).toHaveAttribute('data-display-sampling','original');
  expect(await image.evaluate((img:HTMLImageElement)=>[img.naturalWidth,img.naturalHeight])).toEqual([1200,1800]);
  await page.screenshot({path:info.outputPath('neutral-native-zoom.png')});
  await info.attach('reader-fit-clarity',{body:JSON.stringify(fit),contentType:'application/json'});
});
