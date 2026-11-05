import {test,expect} from '@playwright/test';
import {installMock} from './mock';
import {longDocumentFixture} from './helpers/longDocumentFixture.cjs';

async function start(page:any,library=false){
  await page.addInitScript(installMock,{count:12});
  if(library)await page.addInitScript(async()=>{const r=await window.omicomic.getAppData();if(r.ok)r.data.settings.showHomePage=false;});
  await page.goto('/tests/tablet-harness.html');await page.waitForFunction(()=>!!(window as any).__openTestDocument&&!!document.querySelector('.omi-home,.mobile-resource-card'));
}
test('only the requested chapter is paginated before opening, and fragments retain every character',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const api=window.omicomic;let calls=0;const body=Array.from({length:120},(_,i)=>`<p>段落 ${i}：${String.fromCharCode(0x4e00+i).repeat(120)}</p>`).join('');
    api.openDocument=async()=>({ok:true,data:{size:2000,chapters:Array.from({length:30},(_,index)=>({index,name:'Chapter '+index}))}});
    api.readDocumentChapter=async()=>{calls++;return{ok:true,data:'<html><body>'+body+'</body></html>'};};
    const source=await (window as any).__openTestDocument('epub');
    try{const begin=performance.now(),resource=await source.open(),openMs=performance.now()-begin,initialCalls=calls,layout=(source as any).chapterLayouts.get(0);let text='',maxLength=0;
      for(let n=0;n<layout.pages.length;n++){const html=layout.pages[n];maxLength=Math.max(maxLength,html.length);text+=new DOMParser().parseFromString(html,'text/html').body.textContent;}
      const expected=new DOMParser().parseFromString('<html><body>'+body+'</body></html>','text/html').body.textContent;
      const a=await source.readPage(0),b=await source.readPage(1);return{initialCalls,openMs,complete:!resource.documentIndexing,pages:layout.pages.length,equal:text===expected,maxLength,wholeLength:body.length,heights:[a.height,b.height]};
    }finally{source.dispose();}
  });
  expect(result.initialCalls).toBe(1);expect(result.complete).toBe(false);expect(result.equal).toBe(true);expect(result.pages).toBeGreaterThan(10);expect(result.maxLength).toBeLessThan(result.wholeLength/2);expect(result.heights).toEqual([1200,1200]);
});
test('picture previews use the small image without decoding the full body',async({page})=>{
  await start(page);const requests:string[]=[];
  await page.route('https://omi.local/**',async route=>{requests.push(route.request().url());await route.fulfill({contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNQ8yoBAAF+AOUqTs0pAAAAAElFTkSuQmCC','base64')});});
  await page.evaluate(async()=>{const api=window.omicomic;api.openDocument=async()=>({ok:true,data:{size:2000,chapters:[{index:0,name:'Image',fixedLayout:true}]}});api.readDocumentChapter=async()=>({ok:true,data:'<html><body><img src="https://omi.local/body" data-omi-preview="https://omi.local/small" width="1400" height="2200"></body></html>'});const source=await (window as any).__openTestDocument('epub');try{await source.open();await source.readPreview(0);}finally{source.dispose();}});
  expect(requests).toContain('https://omi.local/small');expect(requests).not.toContain('https://omi.local/body');
});

test('details hand off their open document and stable page identity survives background pagination',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const api=window.omicomic;let opens=0,closes=0;
    api.openDocument=async()=>{opens++;return{ok:true,data:{size:2000,chapters:Array.from({length:8},(_,index)=>({index,name:'Chapter '+index}))}};};
    api.closeDocument=async()=>{closes++;return{ok:true,data:null};};
    api.readDocumentChapter=async(_id,index)=>({ok:true,data:`<html><body><h1>Chapter ${index}</h1>${'<p>文字分页和阅读位置应当保持一致。</p>'.repeat(100)}</body></html>`});
    const source=await (window as any).__openTestDocument('epub','thumbnail',{requestedPageId:'epub-text:5:1'});
    const resource=await source.open(),before=resource.total,prepared=await source.constructor.acquirePrepared(resource);
    const beforeIndex=resource.pages.findIndex((p:any)=>p.pageId===resource.requestedPageId);
    prepared.source.startIndexing();
    const deadline=performance.now()+10000;while(resource.total===before&&performance.now()<deadline)await new Promise(r=>setTimeout(r,30));
    const afterIndex=resource.pages.findIndex((p:any)=>p.pageId===resource.requestedPageId),body=await source.readPage(afterIndex);
    source.releaseReader();const closedWhileDetailsOpen=closes;source.dispose();await Promise.resolve();
    return{opens,closes,closedWhileDetailsOpen,beforeIndex,afterIndex,reused:prepared.source===source,hasText:body.html?.includes('文字分页'),height:body.height};
  });
  expect(result.reused).toBe(true);expect(result.opens).toBe(1);expect(result.closedWhileDetailsOpen).toBe(0);expect(result.closes).toBe(1);expect(result.afterIndex).toBeGreaterThan(result.beforeIndex);expect(result.hasText).toBe(true);expect(result.height).toBe(1200);
});
test('a long image yields five distinct bounded pages and previews',async({page})=>{
  await start(page);const image='data:image/png;base64,'+longDocumentFixture().png.toString('base64');
  const result=await page.evaluate(async image=>{const api=window.omicomic;api.openDocument=async()=>({ok:true,data:{size:2000,chapters:[{index:0,name:'Long',fixedLayout:true}]}});api.readDocumentChapter=async()=>({ok:true,data:`<html><body><img src="${image}" width="1600" height="12000"></body></html>`});const source=await (window as any).__openTestDocument('epub');try{const resource=await source.open(),first=await source.readPage(0),last=await source.readPage(4);const sample=(p:any)=>[...p.canvas.getContext('2d').getImageData(0,0,1,1).data];const previews=await Promise.all([source.readPreview(0),source.readPreview(4)]);return{total:resource.total,first:sample(first),last:sample(last),height:first.height,canvasHeight:first.canvas.height,different:previews[0]!==previews[1]};}finally{source.dispose();}},image);
  expect(result.total).toBe(5);expect(result.height).toBe(2400);expect(result.canvasHeight).toBeLessThanOrEqual(3072);expect(result.first.slice(0,3)).toEqual([212,88,88]);expect(result.last.slice(0,3)).toEqual([155,103,179]);expect(result.different).toBe(true);
});
test('tablet directory arrows align with their row labels',async({page})=>{
  await page.setViewportSize({width:1280,height:800});await start(page,true);
  await page.waitForFunction(()=>document.querySelector('.mobile-resource-card'));
  await page.evaluate(()=>document.querySelector<HTMLButtonElement>('[aria-label="资源库目录"]')!.click());
  await page.waitForFunction(()=>document.querySelector('.mobile-tree-toggle svg'));
  const offsets=await page.evaluate(()=>[...document.querySelectorAll('.mobile-tree-row')].flatMap(row=>{const arrow=row.querySelector('svg'),label=row.querySelector('button:not(.mobile-tree-toggle):not(.mobile-tree-manage)');if(!arrow||!label)return[];const a=arrow.getBoundingClientRect(),b=label.getBoundingClientRect();return[Math.abs(a.y+a.height/2-b.y-b.height/2)];}));
  expect(offsets.length).toBeGreaterThan(0);expect(Math.max(...offsets)).toBeLessThan(1);
});

test('background pagination preserves the visible raster readiness and adjacent swipe surface',async({page})=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await start(page);
  await page.evaluate(async()=>{
    const api=window.omicomic,data=await api.getAppData();if(!data.ok)throw Error('fixture');
    Object.assign(data.data.settings,{readerMemoryCacheSizeMb:100,readerPreloadPages:2,readerPageMode:'single',readerDefaultPanorama:false,readerDefaultImmersive:false});
    api.getResourcePages=async()=>({ok:true,data:{key:'epub:/mixed.epub',resourceKey:'epub:/mixed.epub',sourcePath:'/mixed.epub',sourceType:'epub',title:'Mixed',pages:[],total:0,readerInit:{settings:data.data.settings,progress:null}}});
    api.openDocument=async()=>({ok:true,data:{size:2000,chapters:[{index:0,name:'Image one',fixedLayout:true},{index:1,name:'Image two',fixedLayout:true},{index:2,name:'Text'}]}});
    api.readDocumentChapter=async(_id,index)=>({ok:true,data:index<2?'<html><body><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNQ8yoBAAF+AOUqTs0pAAAAAElFTkSuQmCC" width="1" height="1"></body></html>':'<html><body>'+'<p>后台分页应当保留当前图片和相邻页的就绪状态。</p>'.repeat(120)+'</body></html>'});
    document.querySelector<HTMLButtonElement>('.omi-home__book')!.click();
  });
  await page.waitForFunction(()=>Number(document.querySelector('.mobile-reader-total')?.textContent)>3);
  await page.waitForFunction(()=>!!document.querySelector('.reader-swipe-preview[data-swipe-group$=":1"] .reader-image'));
  const ready=await page.evaluate(()=>{const image=document.querySelector<HTMLImageElement>('.reader-page-frame[data-reader-page-index="0"] img');return image?.complete&&image.naturalWidth===1;});
  expect(ready).toBe(true);
});
test('card feedback stays subtle through a quick tap without a native highlight flash',async({page})=>{
  await start(page,true);await page.waitForFunction(()=>document.querySelector('.mobile-resource-card'));
  await page.evaluate(()=>{window.omicomic.getResourcePages=()=>new Promise(()=>{});});
  const box=await page.evaluate(()=>{const r=document.querySelector('.mobile-resource-card')!.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+40};});
  await page.mouse.move(box.x,box.y);await page.mouse.down();await page.mouse.up();await new Promise(r=>setTimeout(r,160));
  const state=await page.evaluate(()=>{const card=document.querySelector<HTMLElement>('.mobile-resource-card')!,style=getComputedStyle(card),overlay=getComputedStyle(card,'::before');return{overlay:Number(overlay.opacity),color:overlay.backgroundColor,opacity:style.opacity,tap:style.webkitTapHighlightColor};});
  expect(state.overlay).toBeGreaterThan(.1);expect(state.color).toContain('0.1)');expect(state.opacity).toBe('1');expect(state.tap).toBe('rgba(0, 0, 0, 0)');
  await page.waitForFunction(()=>!document.querySelector('.mobile-resource-card')?.hasAttribute('data-omi-pressed'));
});
