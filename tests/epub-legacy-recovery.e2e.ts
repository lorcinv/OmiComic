import {test,expect,type Page,type CDPSession} from '@playwright/test';
import {installMock} from './mock';

type Flow='ordinary'|'horizontal'|'vertical'|'rtl';
async function open(page:Page,flow:Flow,content:'image'|'unreadable'|'unsupported'='image',index=0){
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(installMock,{count:12});
  await page.addInitScript(({flow,content,index})=>{
    const api=window.omicomic as any,key='epub:/comics/sample.epub',oldData=api.getAppData;
    const view={fitMode:'fit-window',pageMode:'single',pageDirection:flow==='rtl'?'right-to-left':'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:flow!=='ordinary',immersive:false};
    const progress={currentPageIndex:index,currentPageId:`epub-chapter:${index}`,readerViewState:view};
    api.getAppInfo=async()=>({name:'OmiComic',version:'test',platform:'android'});
    api.getAppData=async()=>{const result=await oldData();Object.assign(result.data.settings,{mobileReaderAutoHide:false,startupPage:'home',readerDefaultFitMode:'fit-window'});result.data.recentOpened=[{resourceKey:key,sourcePath:'/comics/sample.epub',sourceType:'epub',title:'Sample EPUB',currentPageIndex:index,totalPages:12,updatedAt:1}];return result;};
    api.getReadingProgress=async()=>({ok:true,data:progress});
    api.getResourcePages=async()=>({ok:true,data:{key,resourceKey:key,sourcePath:'/comics/sample.epub',sourceType:'epub',title:'Sample EPUB',pages:[],total:0,readerInit:{settings:(await api.getAppData()).data.settings,progress}}});
    api.openDocument=async()=>({ok:true,data:{size:2000,chapters:Array.from({length:12},(_,index)=>({index,name:`Page ${index+1}`}))}});
    const state=(window as any).__epubRecovery={fail:content==='unreadable',reads:0};
    let image:string;
    const imageUrl=()=>{
      if(image)return image;
      const canvas=document.createElement('canvas');canvas.width=800;canvas.height=1200;
      const ctx=canvas.getContext('2d')!;ctx.fillStyle='#173c55';ctx.fillRect(0,0,800,1200);ctx.fillStyle='#eebf62';ctx.fillRect(40,40,720,1120);ctx.fillStyle='#173c55';ctx.font='bold 72px sans-serif';ctx.fillText('EPUB',100,180);ctx.fillRect(100,400,600,600);
      return image=canvas.toDataURL();
    };
    api.readDocumentChapter=async(_id:string,index:number)=>{
      state.reads++;
      const {sanitizeAndroidChapter}=await import(/* @vite-ignore */location.origin+'/src/android/epub.ts');
      const native=async()=>{if(index===0&&state.fail)throw Error('fixture image read failure');if(index===0&&content==='unsupported')return null;return{url:imageUrl(),width:800,height:1200};};
      try{return{ok:true,data:await sanitizeAndroidChapter(JSON.stringify({path:'/comics/sample.epub',entry:'OPS/page.xhtml',html:`<html><body><img src="images/page.${content==='unsupported'?'svg':'jpg'}"></body></html>`}),native,'data:')};}
      catch(error){return{ok:false,error:{code:'READ_FAILED',message:(error as Error).message}};}
    };
  },{flow,content,index});
  await page.goto('/');
  await page.waitForFunction(()=>!!document.querySelector('.omi-home__book'));
  await page.evaluate(()=>document.querySelector<HTMLElement>('.omi-home__book')!.click());
  await page.waitForFunction(()=>!!document.querySelector('.page-panel.is-visible .reader-stage .reader-image,.page-panel.is-visible .reader-stage .reader-page-error'));
  await page.waitForTimeout(250);
  return errors;
}

async function current(page:Page){
  return page.evaluate(()=>{
    const stage=document.querySelector<HTMLElement>('.page-panel.is-visible .reader-stage')!;
    const frame=stage.querySelector<HTMLElement>(stage.classList.contains('is-panorama')?'.is-current-page':'.reader-page-frame:not([aria-hidden=true])')!;
    const img=frame.querySelector<HTMLImageElement>('.reader-image');
    const box=(el:Element)=>{const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
    return{index:Number(frame.dataset.readerPageIndex),stage:box(stage),image:img?box(img):null,loaded:!!img?.naturalWidth,zoom:Number(stage.dataset.readerZoom)};
  });
}
async function aligned(page:Page,index:number){
  await expect.poll(async()=>{const m=await current(page);return m.index===index&&m.loaded&&!!m.image&&Math.abs(m.image.x-m.stage.x)<2&&Math.abs(m.image.y-m.stage.y)<2&&Math.abs(m.image.width-m.stage.width)<2&&Math.abs(m.image.height-m.stage.height)<2;}).toBe(true);
}
async function pinch(cdp:CDPSession,x:number,y:number,distances:number[]){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-distances[0],y,id:1},{x:x+distances[0],y,id:2}]});
  for(const d of distances.slice(1)){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-d,y,id:1},{x:x+d,y,id:2}]});await new Promise(resolve=>setTimeout(resolve,30));}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}

for(const flow of ['ordinary','horizontal','vertical','rtl'] as const)test(`${flow} restores the saved EPUB page, shrinks, enlarges and pans`,async({page,context},testInfo)=>{
  const errors=await open(page,flow,'image',4);await aligned(page,4);
  const cdp=await context.newCDPSession(page),m=await current(page),x=m.stage.x+m.stage.width/2,y=m.stage.y+m.stage.height/2;
  await pinch(cdp,x,y,[180,120,80,40,20]);
  await expect.poll(async()=>(await current(page)).zoom).toBe(.25);
  await pinch(cdp,x,y,[20,40,80,120,160]);
  await expect.poll(async()=>(await current(page)).zoom).toBeGreaterThan(1.8);
  const before=await current(page);
  const dx=flow==='vertical'||flow==='ordinary'?90:0,dy=flow==='vertical'?0:90;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let n=1;n<=6;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*n/6,y:y+dy*n/6,id:1}]});await page.waitForTimeout(35);}
  const moved=await current(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect(Math.abs((dx?moved.image!.x:moved.image!.y)-(dx?before.image!.x:before.image!.y))).toBeGreaterThan(40);
  await page.waitForTimeout(300);expect((await current(page)).zoom).toBeGreaterThan(1.8);
  expect(errors).toEqual([]);await page.screenshot({path:testInfo.outputPath('zoomed-pan.png'),fullPage:true});
});

test('first EPUB page remains aligned in continuous mode',async({page},testInfo)=>{
  const errors=await open(page,'horizontal');await aligned(page,0);
  await page.screenshot({path:testInfo.outputPath('first-page.png'),fullPage:true});
  expect(errors).toEqual([]);
});

test('switching ordinary, horizontal and vertical EPUB modes preserves the current page',async({page})=>{
  const errors=await open(page,'ordinary','image',4);await aligned(page,4);
  const stage=(await current(page)).stage;
  await page.mouse.click(stage.x+stage.width/2,stage.y+stage.height/2);
  await page.waitForFunction(()=>!!document.querySelector('.mobile-reader-more'));
  const more=await page.evaluate(()=>{const r=document.querySelector('.mobile-reader-more')!.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
  await page.mouse.click(more.x,more.y);
  await page.waitForFunction(()=>!!document.querySelector('.reader-panorama-toggle'));
  await page.evaluate(()=>document.querySelector<HTMLButtonElement>('.reader-panorama-toggle')!.click());
  await expect.poll(()=>page.evaluate(()=>document.querySelector('.reader-stage')!.classList.contains('is-panorama'))).toBe(true);await aligned(page,4);
  await page.evaluate(()=>document.querySelector<HTMLButtonElement>('[aria-label="当前横向阅读，点击切换纵向阅读"]')!.click());
  await expect.poll(()=>page.evaluate(()=>document.querySelector('.reader-stage')!.classList.contains('is-flow-vertical'))).toBe(true);await aligned(page,4);
  await page.evaluate(()=>document.querySelector<HTMLButtonElement>('.reader-panorama-toggle')!.click());
  await expect.poll(()=>page.evaluate(()=>document.querySelector('.reader-stage')!.classList.contains('is-panorama'))).toBe(false);await aligned(page,4);
  expect(errors).toEqual([]);
});

for(const content of ['unreadable','unsupported'] as const)test(`${content} EPUB page shows a readable error and allows navigation`,async({page},testInfo)=>{
  const errors=await open(page,'ordinary',content);
  const message=content==='unreadable'?'本页图片读取失败，请重试。':'本页使用的 EPUB 图片格式暂不支持。';
  await expect.poll(()=>page.evaluate(()=>document.querySelector('.reader-page-error')?.textContent)).toContain(message);
  await expect.poll(()=>page.evaluate(()=>{const text=document.querySelector<HTMLElement>('.reader-page-error em')!;return text.scrollWidth<=text.clientWidth+1&&text.scrollHeight<=text.clientHeight+1;})).toBe(true);
  await page.screenshot({path:testInfo.outputPath('page-error.png'),fullPage:true});
  await page.keyboard.press('ArrowRight');await aligned(page,1);
  await page.keyboard.press('ArrowLeft');
  await expect.poll(()=>page.evaluate(()=>document.querySelector('.reader-page-frame:not([aria-hidden=true]) .reader-page-error')?.textContent)).toContain(message);
  if(content==='unreadable'){
    await page.evaluate(()=>(window as any).__epubRecovery.fail=false);
    const point=await page.evaluate(()=>{const r=document.querySelector('.reader-page-frame:not([aria-hidden=true]) .reader-page-error button')!.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
    await page.mouse.click(point.x,point.y);await aligned(page,0);
    await page.screenshot({path:testInfo.outputPath('recovered.png'),fullPage:true});
  }
  expect(errors).toEqual([]);
});
