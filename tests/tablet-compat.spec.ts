import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { installMock } from './mock';
import { mobiFixture } from './helpers/mobiFixture.cjs';

async function start(page:Page, library=false, missingApis=true) {
  page.on('pageerror',error=>console.log('Browser error:',error.message));
  page.on('console',message=>{if(message.type()==='error'||message.type()==='warning')console.log('Browser '+message.type()+':',message.text().slice(0,400));});
  await page.addInitScript(installMock, { count:12 });
  await page.addInitScript(async ({library,missingApis}) => {
    // Reproduce the missing APIs shown on the Huawei screenshots even when
    // this suite runs on the current browser.
    if(missingApis){delete (Promise as any).withResolvers; delete (Promise as any).try;
      delete (AbortSignal as any).any; delete (AbortSignal.prototype as any).throwIfAborted;
      delete (globalThis as any).structuredClone;}
    const result = await window.omicomic.getAppData();
    if (result.ok) result.data.settings.showHomePage = !library;
  }, {library,missingApis});
  await page.goto('/tests/tablet-harness.html');
  await page.waitForFunction(selector=>{const el=document.querySelector(selector);return !!el&&el.getBoundingClientRect().width>0;},library?'.mobile-resource-card':'.omi-home__book');
}

for (const viewport of [{width:800,height:1280},{width:1280,height:800},{width:960,height:600},{width:390,height:844}]) {
  test(`home fills and aligns at ${viewport.width}x${viewport.height}`, async({page}) => {
    await page.setViewportSize(viewport); await start(page);
    const geometry=await page.evaluate(()=>[...document.querySelectorAll('.omi-home__book')].map(book=>{
      const r=(el:Element)=>{const b=el.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
      return {book:r(book),cover:r(book.querySelector('.omi-home__cover')!),title:r(book.querySelector('.omi-home__book-title')!)};
    }));
    expect(geometry).toHaveLength(4);
    for(const item of geometry){
      expect(item.book.right).toBeLessThanOrEqual(viewport.width-8);
      expect(item.cover.height).toBeGreaterThan(100); expect(item.title.width).toBeGreaterThan(80);
      if(viewport.width>=600 && viewport.width>viewport.height){expect(item.title.x).toBeGreaterThan(item.cover.right);expect(item.title.y).toBeLessThan(item.cover.y+20);}
      else {expect(Math.abs(item.title.width-item.cover.width)).toBeLessThan(2);expect(item.title.y).toBeGreaterThanOrEqual(item.cover.bottom);}
    }
    if(viewport.width>=600){expect(Math.abs(geometry[0].book.x-(viewport.width-geometry[1].book.right))).toBeLessThan(2);}
    if(viewport.width>viewport.height) expect(geometry[1].book.right).toBeGreaterThan(viewport.width*.9);
    const nav=await page.evaluate(()=>{const nav=document.querySelector('.mobile-home-nav')!,buttons=nav.querySelectorAll('button');return{height:nav.getBoundingClientRect().height,background:getComputedStyle(buttons[0]).backgroundColor,active:getComputedStyle(buttons[0]).color,inactive:getComputedStyle(buttons[1]).color,ratio:buttons[0].getBoundingClientRect().width/buttons[1].getBoundingClientRect().width};});
    expect(nav.ratio).toBeCloseTo(1.8,1);expect(nav.height).toBeGreaterThan(40);expect(nav.background).not.toBe('rgba(0, 0, 0, 0)');expect(nav.active).not.toBe(nav.inactive);
    await page.screenshot({path:`test-results/tablet1179/home-${viewport.width}x${viewport.height}.png`});
  });
}

test('wide Android reader has no scrollbars, extra settings heading or deep thumb shadow',async({page})=>{
  await start(page,true);
  await page.evaluate(()=>{([...document.querySelectorAll('.mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent==='Book') as HTMLElement).click();});
  await page.waitForFunction(()=>!!document.querySelector('.reader-layout'));
  await page.waitForFunction(()=>!!document.querySelector('button[aria-label="阅读设置"]'));
  await page.evaluate(()=>{(document.querySelector('button[aria-label="阅读设置"]') as HTMLElement).click();});
  await page.waitForFunction(()=>!!document.querySelector('[role="dialog"][aria-label="阅读设置"]'));
  const styles=await page.evaluate(()=>{const panel=document.querySelector('[role="dialog"][aria-label="阅读设置"]')!;return{extras:panel.querySelectorAll('.mobile-sheet-heading,.mobile-reader-help').length,scrollbar:getComputedStyle(panel,'::-webkit-scrollbar').display,shadow:getComputedStyle(document.querySelector('.reader-progress-thumb')!).boxShadow};});
  expect(styles.extras).toBe(0);expect(styles.scrollbar).toBe('none');expect(styles.shadow).toMatch(/0\.18/);expect(styles.shadow).toMatch(/0\.08/);
  await page.screenshot({path:'test-results/tablet1179/reader-settings-wide.png'});
});

test('Android exposes and saves the adjacent-book button opacity',async({page})=>{
  await start(page);
  // The current test driver's role visibility engine uses a newer browser API;
  // query the actual controls directly when running the Chromium 100 binary.
  await page.evaluate(()=>([...document.querySelectorAll('button')].find(button=>button.textContent?.trim()==='设置') as HTMLButtonElement).click());
  await page.waitForFunction(()=>!!document.querySelector('.mobile-settings-page'));
  await page.evaluate(()=>([...document.querySelectorAll('.mobile-settings-page button')].find(button=>button.querySelector('strong')?.textContent==='漫画阅读设置') as HTMLButtonElement).click());
  const selector='.mobile-settings-page [role="combobox"][aria-label="上/下一篇按钮透明度"]';
  await page.waitForFunction(selector=>!!document.querySelector(selector)?.getClientRects().length,selector);
  await page.evaluate(selector=>(document.querySelector(selector) as HTMLButtonElement).click(),selector);
  await page.waitForFunction(()=>[...document.querySelectorAll('[role="option"]')].some(option=>option.textContent?.trim()==='20%'));
  await page.evaluate(()=>([...document.querySelectorAll('[role="option"]')].find(option=>option.textContent?.trim()==='20%') as HTMLButtonElement).click());
  await expect.poll(()=>page.evaluate(async()=>((await window.omicomic.getAppData()).data as any).settings.bookSwitchButtonOpacity)).toBe(20);
  const drawn=await page.evaluate(()=>{const button=document.createElement('button');button.className='reader-book-switch';button.style.setProperty('--book-switch-opacity','.2');document.body.append(button);const opacity=getComputedStyle(button).opacity;button.remove();return opacity;});expect(drawn).toBe('0.2');
});

for(const missingApis of [true,false])test(`PDF renders text on successive pages and previews (${missingApis?'missing APIs':'native APIs'})`,async({page})=>{
  await start(page,false,missingApis);
  const fixture=[...readFileSync('tests/fixtures/documents/three-pages.pdf')];
  const result=await page.evaluate(async fixture=>{
    const bytes=new Uint8Array(fixture),api=window.omicomic;
    api.openDocument=async()=>({ok:true,data:{size:bytes.length,chapters:[]}});
    api.readDocumentRange=async(_id,begin,end)=>({ok:true,data:bytes.slice(begin,end)});
    const source=await (window as any).__openTestDocument('pdf');
    const painted=(canvas:HTMLCanvasElement)=>{const data=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;let pixels=0;for(let i=0;i<data.length;i+=4)if(data[i]<240||data[i+1]<240||data[i+2]<240)pixels++;return pixels;};
    try {const opened=await source.open();const first=await source.readPage(0),second=await source.readPage(1),preview=await source.readPreview(2);
      return {pages:opened.total,width:first.width,height:first.height,first:painted(first.canvas),second:painted(second.canvas),preview:preview.slice(0,23)};
    } finally {source.dispose();}
  },fixture);
  expect(result.pages).toBe(3); expect(result.width).toBeGreaterThan(100);expect(result.height).toBeGreaterThan(100);expect(result.first).toBeGreaterThan(50);expect(result.second).toBeGreaterThan(50);expect(result.preview).toBe('data:image/jpeg;base64,');
});

for(const theme of ['mist','nord','sand','night'])test(`detail and tag effects retain the soft palette in ${theme}`,async({page})=>{
  await start(page);
  const styles=await page.evaluate(theme=>{
    document.documentElement.dataset.colorTheme=theme;
    const probe=document.createElement('div');probe.innerHTML='<div class="is-mobile-library"><div class="resource-detail-cover"></div><button class="resource-detail-thumbnail is-selected"></button><div class="mobile-tag-catalogue"><button class="tag-catalogue-chip">标签</button></div><div class="quick-tags-list"><button class="tag-catalogue-chip">标签</button></div></div>';
    document.body.append(probe);const style=(selector:string)=>getComputedStyle(probe.querySelector(selector)!);
    const color=(value:string)=>{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d')!;ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
    const rootStyle=getComputedStyle(document.documentElement);
    const result={cover:style('.resource-detail-cover').boxShadow,thumbnail:style('.resource-detail-thumbnail').boxShadow,tag:color(style('.mobile-tag-catalogue button').borderTopColor),quick:color(style('.quick-tags-list button').borderTopColor),ink:color(rootStyle.getPropertyValue('--主文字').trim()),panel:color(rootStyle.getPropertyValue('--面板色').trim())};probe.remove();return result;
  },theme);
  expect(styles.cover).toMatch(/0\.14/);expect(styles.thumbnail).toMatch(/0\.16/);expect(styles.thumbnail).toMatch(/0\.08/);
  for(let i=0;i<3;i++){const expected=Math.round(styles.ink[i]*.26+styles.panel[i]*.74);expect(Math.abs(styles.tag[i]-expected)).toBeLessThanOrEqual(1);expect(Math.abs(styles.quick[i]-expected)).toBeLessThanOrEqual(1);}
});

test('EPUB text and image chapters open and both generate visible previews',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNQ8yoBAAF+AOUqTs0pAAAAAElFTkSuQmCC';
    const api=window.omicomic;
    api.openDocument=async()=>({ok:true,data:{size:2000,chapters:[{index:0,name:'Text'},{index:1,name:'Image'}]}});
    api.readDocumentChapter=async(_id,index)=>({ok:true,data:index===0?'<html><body><h1>兼容性正文</h1><p>这是可以正常阅读的中文章节。</p></body></html>':`<html><body><img src="${image}"></body></html>`});
    const source=await (window as any).__openTestDocument('epub');
    try {await source.open();const body=await source.readPage(0);const previews=await Promise.all([source.readPreview(0),source.readPreview(1)]);return{html:body.html,previews};}finally{source.dispose();}
  });
  expect(result.html).toContain('兼容性正文'); for(const url of result.previews)expect(url).toMatch(/^data:image\/jpeg;base64,/);expect(result.previews[0]).not.toBe(result.previews[1]);
});

test('a 300 MiB MOBI uses bounded ranges, opens later images and cancels its live source',async({page})=>{
  await start(page);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR42mNQ8yoBAAF+AOUqTs0pAAAAAElFTkSuQmCC','base64');
  const fixture=mobiFixture(['<p>大书第一章</p>','<p>第二章插图</p><img recindex="2">'],[Buffer.from('PADDING'),png,Buffer.from('PADDING')]);
  // Move the image to the end of a sparse book while keeping record indices.
  const count=fixture.readUInt16BE(76),imageOffset=fixture.readUInt32BE(78+(count-2)*8),size=300*1024*1024;
  const header=Buffer.from(fixture.subarray(0,imageOffset));header.writeUInt32BE(size-png.length-8,78+(count-2)*8);header.writeUInt32BE(size-8,78+(count-1)*8);
  const result=await page.evaluate(async({header,png,size})=>{
    const Client=await (window as any).__mobiTest(),client=new Client(),controller=new AbortController();
    let readBytes=0,largest=0,laterReads=0,opened=false;
    const read=async(begin:number,end:number)=>{readBytes+=end-begin;largest=Math.max(largest,end-begin);if(opened)laterReads++;
      const part=new Uint8Array(end-begin),blocks=[{at:0,data:header},{at:size-png.length-8,data:png}];
      for(const block of blocks){const start=Math.max(begin,block.at),stop=Math.min(end,block.at+block.data.length);if(stop>start)part.set(block.data.slice(start-block.at,stop-block.at),start-begin);}return part;};
    try{const spine=await client.open(size,read,controller.signal);opened=true;const first=await client.chapter(0),second=await client.chapter(1);controller.abort();let cancelled='';try{await client.chapter(0);}catch(e){cancelled=String(e);}return{count:spine.length,first,second,readBytes,largest,laterReads,cancelled};}finally{client.close();}
  },{header:[...header],png:[...png],size});
  expect(result.count).toBe(2);expect(result.first).toContain('大书第一章');expect(result.second).toContain('data:image/png;base64,');
  expect(result.readBytes).toBeLessThan(1024*1024);expect(result.largest).toBeLessThanOrEqual(1024*1024);expect(result.laterReads).toBeGreaterThan(0);expect(result.cancelled).toMatch(/关闭/);
});

test('home refresh invalidates covers and gives persistent press and completion feedback',async({page})=>{
  await start(page);
  await page.evaluate(()=>{(window as any).__refreshCount=0;window.omicomic.refreshThumbnails=async()=>{(window as any).__refreshCount++;await new Promise(r=>setTimeout(r,80));return{ok:true,data:null};};});
  const box=await page.evaluate(()=>{const r=document.querySelectorAll('.mobile-home-nav button')[1].getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
  await page.mouse.move(box.x,box.y);await page.mouse.down();
  expect(await page.evaluate(()=>getComputedStyle(document.querySelectorAll('.mobile-home-nav button')[1]).opacity)).toBe('0.62');
  await page.mouse.up();
  await page.waitForFunction(()=>document.querySelector('.is-mobile-home [role="status"]')?.textContent==='已刷新');
  expect(await page.evaluate(()=>(window as any).__refreshCount)).toBe(1);
});
test('an unavailable root and one unreadable child do not block the usable library tree',async({page})=>{
  await page.addInitScript(installMock,{count:12});
  await page.addInitScript(async()=>{
    const api=window.omicomic,data=await api.getAppData();if(!data.ok)return;
    data.data.settings.showHomePage=false;
    data.data.library.roots.unshift({path:'/missing-drive',name:'External',addedAt:0,lastOpenedAt:0});data.data.library.lastActiveRootPath='/missing-drive';data.data.library.lastCurrentPath='/missing-drive';
    const list=api.listDirectory;
    api.listDirectory=async path=>path==='/missing-drive'||path==='/comics/Parent'?{ok:false,error:{code:'NOT_FOUND',message:'Device disconnected'}}:list(path);
  });
  await page.goto('/tests/tablet-harness.html');
  await page.waitForFunction(()=>[...document.querySelectorAll('.mobile-resource-card strong')].some(el=>el.textContent==='Book'));
  await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')==='资源库目录');if(!button)throw Error('drawer trigger missing');button.click();});
  await page.waitForFunction(()=>document.querySelector('.mobile-tree-error'));
  expect(await page.evaluate(()=>[...document.querySelectorAll('.mobile-tree-row')].map(el=>el.textContent).join(' '))).toContain('Comics');
  expect(await page.evaluate(()=>document.querySelector('.mobile-tree-error')!.textContent)).toContain('重试');
});
test('SVG raster wrappers retain only their local image reference',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const calls:string[]=[];
    const html=await (window as any).__sanitizeChapter(JSON.stringify({path:'book.epub',entry:'OEBPS/Text/p.xhtml',html:'<svg onload="alert(1)"><script>bad()</script><image width="1451" height="2048" xlink:href="../Images/p.jpeg"/><image href="https://evil.example/a.jpg"/></svg><iframe src="https://evil.example"></iframe>'}),async(_method:string,args:{href:string})=>{calls.push(args.href);return 'https://omi.local/media/safe';});
    const doc=new DOMParser().parseFromString(html,'text/html');return{calls,images:doc.images.length,unsafe:doc.body.querySelectorAll('svg,script,iframe,[onload]').length};
  });
  expect(result).toEqual({calls:['../Images/p.jpeg'],images:1,unsafe:0});
});
test('long Android text chapters become bounded pages with distinct page previews',async({page})=>{
  await start(page);
  const result=await page.evaluate(async()=>{
    const api=window.omicomic;api.openDocument=async()=>({ok:true,data:{size:1000,chapters:[{index:0,name:'Text'}]}});
    api.readDocumentChapter=async()=>({ok:true,data:'<html><body>'+Array.from({length:180},(_,i)=>'<p>段落 '+i+'：'+String.fromCharCode(0x4e00+i).repeat(100)+'</p>').join('')+'</body></html>'});
    const source=await (window as any).__openTestDocument('epub');
    try{const opened=await source.open(),first=await source.readPage(0),last=await source.readPage(opened.total-1),previews=await Promise.all([source.readPreview(0),source.readPreview(1)]);return{total:opened.total,first:[first.width,first.height],last:[last.width,last.height],samePreview:previews[0]===previews[1],firstId:opened.pages[0].pageId,lastId:opened.pages.at(-1).pageId};}finally{source.dispose();}
  });
  expect(result.total).toBeGreaterThan(10);expect(result.first).toEqual([900,1200]);expect(result.last).toEqual([900,1200]);expect(result.samePreview).toBe(false);expect(result.firstId).toBe('epub-chapter:0');expect(result.lastId).toMatch(/^epub-text:0:/);
});

for(const theme of ['mist','nord','sand'])test(`light navigation distinguishes the selected column in ${theme}`,async({page})=>{
  await start(page,true);
  const result=await page.evaluate(theme=>{document.documentElement.dataset.colorTheme=theme;const nav=document.querySelector('.sidebar-primary-nav')!,active=nav.querySelector('.sidebar-item.is-active')!,idle=nav.querySelector('.sidebar-item:not(.is-active)')!;const a=getComputedStyle(active),b=getComputedStyle(idle);return{active:a.color,idle:b.color,activeOpacity:a.opacity,idleOpacity:b.opacity,weight:a.fontWeight,shadow:a.boxShadow};},theme);
  expect(result.active).not.toBe(result.idle);expect(result.activeOpacity).toBe('1');expect(result.idleOpacity).toBe('0.68');expect(Number(result.weight)).toBeGreaterThanOrEqual(700);expect(result.shadow).toBe('none');
});
