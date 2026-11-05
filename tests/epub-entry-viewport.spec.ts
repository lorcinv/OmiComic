import { test, expect } from '@playwright/test';
import { installMock } from './mock';

test.use({viewport:{width:800,height:1200},isMobile:true,hasTouch:true,deviceScaleFactor:2});
test('Android EPUB prepares its final portrait viewport and indexes only after the entry animation',async({page})=>{
  test.setTimeout(60000);
  await page.addInitScript(installMock,{count:4});
  await page.goto('/');await expect(page.locator('.omi-home__book').first()).toBeVisible();
  await page.exposeFunction('__epubFullViewport',async()=>{await page.setViewportSize({width:800,height:1224});});
  await page.evaluate(async()=>{
    document.documentElement.dataset.platform='android';
    const out=(window as any).__epubEntry={opens:0,chapters:[] as number[],openHeight:0,prepared:0,entered:false,release:null};
    const api=window.omicomic,getPages=api.getResourcePages;
    api.getResourcePages=async input=>{const result=await getPages(input);if(result.ok){result.data.sourceType='epub';result.data.sourcePath='/comics/Book.epub';result.data.resourceKey='epub:/comics/Book.epub';result.data.pages=[];result.data.total=0;}return result;};
    api.prepareEpubReaderViewport=async()=>{out.prepared++;await (window as any).__epubFullViewport();return{ok:true,data:true};};
    api.openDocument=async()=>{out.opens++;out.openHeight=innerHeight;return{ok:true,data:{size:2000,chapters:[0,1,2].map(index=>({index,name:'Chapter '+index}))}};};
    api.readDocumentChapter=async(_id,index)=>{out.chapters.push(index);return{ok:true,data:`<html><body><h1>Chapter ${index}</h1>${'<p>EPUB 首屏在最终窗口排版，后台章节等待入场完成。</p>'.repeat(30)}</body></html>`};};
    const {connectAndroid}=await import('/src/android/bridge.ts');
    const channel=new MessageChannel(),connection=connectAndroid();
    channel.port1.onmessage=async event=>{
      const call=JSON.parse(event.data);
      if(call.method==='commitScene'&&call.args.direction==='forward')await (window as any).__epubFullViewport();
      if(call.method==='waitScene'){out.entered=true;await new Promise<void>(resolve=>{out.release=resolve;});}
      if(call.id)channel.port1.postMessage(JSON.stringify({id:call.id,data:true}));
    };
    window.postMessage('omi-native','*',[channel.port2]);await connection;
  });
  await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  const card=page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})});await expect(card).toBeVisible({timeout:15000});await card.locator('strong').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__epubEntry.entered)).toBe(true);
  await expect(page.locator('.page-panel.is-visible .reader-chapter')).toBeVisible();
  await page.waitForTimeout(450);
  const before=await page.evaluate(()=>{const out=(window as any).__epubEntry;return{opens:out.opens,openHeight:out.openHeight,prepared:out.prepared,chapters:out.chapters.slice(),height:innerHeight};});
  expect(before.prepared).toBeGreaterThan(0);
  expect({...before,prepared:undefined}).toEqual({opens:1,openHeight:1224,prepared:undefined,chapters:[0],height:1224});
  await page.evaluate(()=>(window as any).__epubEntry.release());
  await expect.poll(()=>page.evaluate(()=>(window as any).__epubEntry.chapters.length)).toBeGreaterThan(1);
  expect(await page.evaluate(()=>(window as any).__epubEntry.opens)).toBe(1);
  await page.screenshot({path:'test-results/epub-hotfix1185-portrait.png'});
});
