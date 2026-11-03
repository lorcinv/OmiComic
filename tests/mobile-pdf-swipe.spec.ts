import { test, expect } from '@playwright/test';
import { pdf } from './android/filmstrip-fixtures.cjs';
import { installMock } from './mock';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
for(const mode of ['single','double','double-rtl'])test(`PDF ${mode} prepares the complete neighbour and reuses its surface for light swipes`,async({page,context})=>{
  await page.addInitScript(installMock,{count:24});
  await page.addInitScript(async({bytes,mode})=>{
    const api=window.omicomic,r=await api.getAppData();if(!r.ok)throw Error('fixture');
    Object.assign(r.data.settings,{readerPreloadPages:1,readerMemoryCacheSizeMb:256,doublePageFirstSingle:false,mobileReaderAutoHide:false});
    api.getResourcePages=async()=>({ok:true,data:{key:'pdf:/test.pdf',resourceKey:'pdf:/test.pdf',sourcePath:'/test.pdf',sourceType:'pdf',title:'PDF',pages:[],total:0}});
    api.getReadingProgress=async()=>({ok:true,data:{currentPageIndex:6,readerViewState:{fitMode:'fit-window',pageMode:mode==='single'?'single':'double',pageDirection:mode==='double-rtl'?'right-to-left':'left-to-right',flow:'horizontal',panorama:false,immersive:false}} as any});
    api.openDocument=async()=>({ok:true,data:{size:bytes.length,chapters:[]}});
    api.readDocumentRange=async(_id,begin,end)=>({ok:true,data:new Uint8Array(bytes.slice(begin,end))});api.closeDocument=async()=>({ok:true,data:null});
  },{bytes:[...pdf(24)],mode});
  await page.goto('/');await page.evaluate(()=>document.documentElement.dataset.platform='android');
  await page.getByRole('button',{name:'打开资源库',exact:true}).click();await page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).click();
  const progress=page.locator('[aria-label="阅读进度"]'),step=mode==='single'?1:2,next=6+step;
  await expect(progress).toHaveAttribute('aria-valuenow','7');
  const warm=page.locator(`.reader-swipe-preview[data-swipe-group$=":${next}"]`);
  await expect(warm.locator('canvas.reader-pdf-canvas')).toHaveCount(step);
  await expect.poll(()=>warm.locator('canvas').evaluateAll((els:HTMLCanvasElement[])=>els.every(el=>el.width>0&&el.height>0))).toBe(true);
  await warm.evaluate(el=>(window as any).__preparedPdfCanvases=[...el.querySelectorAll('canvas')]);
  const box=(await page.locator('.reader-stage').boundingBox())!,sign=mode==='double-rtl'?1:-1,x=box.x+box.width*(sign>0?.25:.75),y=box.y+box.height*.5,cdp=await context.newCDPSession(page);
  const touch=(type:string,dx=0,dy=0)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:x+sign*dx,y:y+dy,id:1}]});
  await touch('touchStart');await touch('touchMove',8,10);await touch('touchMove',30,12);
  await expect(warm).toHaveAttribute('data-swipe-active','true');
  expect(await warm.evaluate(el=>[...el.querySelectorAll('canvas')].every((canvas,i)=>canvas===(window as any).__preparedPdfCanvases[i]))).toBe(true);
  await touch('touchMove',55,14);await touch('touchEnd');
  await expect(progress).toHaveAttribute('aria-valuenow',String(next+1));
  await expect(page.locator(`[data-reader-page-index="${next}"]:not([aria-hidden]) canvas.reader-pdf-canvas`)).toBeVisible();
  await page.screenshot({path:`test-results/mobile-pdf-${mode}.png`});
});
