import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

// Current Playwright role/visibility helpers require checkVisibility, absent
// in Chromium 100. Use real mouse clicks with an explicit hit-test instead.
async function clickControl(page:Page,selector:string,text?:string){
  const args={selector,text};
  await page.waitForFunction(({selector,text})=>Array.from(document.querySelectorAll(selector)).some(el=>(!text||el.textContent?.trim()===text)&&el.getClientRects().length>0),args);
  await page.evaluate(({selector,text})=>Array.from(document.querySelectorAll(selector)).find(el=>!text||el.textContent?.trim()===text)!.scrollIntoView({block:'center'}),args);
  await expect.poll(()=>page.evaluate(({selector,text})=>{const el=Array.from(document.querySelectorAll(selector)).find(el=>!text||el.textContent?.trim()===text)!;const r=el.getBoundingClientRect();return r.width>0&&r.height>0&&el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));},args)).toBe(true);
  const point=await page.evaluate(({selector,text})=>{const el=Array.from(document.querySelectorAll(selector)).find(el=>!text||el.textContent?.trim()===text)!;const r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};},args);
  await page.mouse.click(point.x,point.y);
}

for(const legacy of [false,true])test(`production Android boot and settings (${legacy?'missing legacy APIs':'native APIs'})`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript((legacy)=>{
    if(legacy){
      delete (window as any).globalThis;delete (Array.prototype as any).at;
      delete (Object as any).fromEntries;delete (Promise as any).allSettled;
      delete (String.prototype as any).replaceAll;delete (String.prototype as any).matchAll;
      delete (window as any).queueMicrotask;delete (window as any).WeakRef;
      Object.defineProperty(Crypto.prototype,'randomUUID',{configurable:true,value:undefined});
      Object.defineProperty(Animation.prototype,'finished',{configurable:true,value:undefined});
      const match=window.matchMedia.bind(window);
      window.matchMedia=(query:string)=>{const result=match(query);return {matches:result.matches,media:result.media,onchange:null,addListener:result.addListener.bind(result),removeListener:result.removeListener.bind(result)} as MediaQueryList;};
    }
    // Real main.tsx + connectAndroid + createAndroidApi. Only native file RPC is
    // replaced; no test-only React entry point bypasses production boot.
    window.addEventListener('load',()=>{
      const channel=new MessageChannel();
      channel.port1.onmessage=(event)=>{
        const request=JSON.parse(event.data);
        const data=request.method==='loadData'?null:request.method==='isSystemDark'?false:request.method==='takeExternalFile'?null:true;
        channel.port1.postMessage(JSON.stringify({id:request.id,data}));
      };
      window.postMessage('omi-native','*',[channel.port2]);
    });
  },legacy);
  await page.goto('/');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).some(button=>button.textContent?.trim()==='打开资源库'&&button.getClientRects().length>0));
  await clickControl(page,'button','设置');
  await page.waitForFunction(()=>!!document.querySelector('.mobile-settings-page')?.getClientRects().length);
  await page.evaluate(()=>Array.from(document.querySelectorAll('.mobile-settings-page button')).find(button=>button.querySelector('strong')?.textContent==='漫画阅读设置')?.setAttribute('data-test-settings','reader'));
  await clickControl(page,'[data-test-settings=reader]');
  const selector='[role=combobox][aria-label="上/下一篇按钮透明度"]';
  const select=page.locator(selector);
  await clickControl(page,selector);await clickControl(page,'[role=option]','20%');
  await expect(select).toContainText('20%');
  expect(errors).toEqual([]);
  await page.screenshot({path:`test-results/legacy-startup/${legacy?'legacy':'current'}-settings.png`});
});
test('failed app module shows recovery instead of a blank screen',async({page})=>{
  await page.route('**/assets/index-*.js',route=>route.abort());
  await page.goto('/');await expect(page.locator('[role=alert]')).toContainText('OmiComic 未能启动');
  await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role=alert] button')).some(button=>button.textContent==='重新打开'&&button.getClientRects().length>0));
});


for(const viewport of [{width:960,height:600},{width:1280,height:800}])test(`legacy aspect-ratio fallback stays inside landscape cards at ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.addInitScript(()=>{
    window.addEventListener('load',()=>{
      const channel=new MessageChannel();
      const recent=['One','Two','Three','Four'].map((title,i)=>({resourceKey:'folder:/comics/'+title,sourcePath:'/comics/'+title,sourceType:'folder',title,currentPageIndex:i,totalPages:12,updatedAt:Date.now()-i}));
      channel.port1.onmessage=event=>{
        const request=JSON.parse(event.data);
        const data=request.method==='loadData'?{recentOpened:recent}:request.method==='isSystemDark'?false:request.method==='takeExternalFile'?null:request.method==='getThumbnail'?{url:'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="120" height="180"%3E%3Crect width="120" height="180" fill="%23788"/%3E%3C/svg%3E'}:true;
        channel.port1.postMessage(JSON.stringify({id:request.id,data}));
      };
      window.postMessage('omi-native','*',[channel.port2]);
    });
  });
  await page.goto('/');await page.waitForFunction(()=>document.querySelectorAll('.omi-home__book').length===4);
  const css=readFileSync('src/styles/mobile.css','utf8');
  const fallback=css.slice(css.lastIndexOf('@supports not (aspect-ratio:2/3)')).replace('@supports not (aspect-ratio:2/3)','@media all');
  await page.addStyleTag({content:'.omi-home__cover,.mobile-bookshelf-shell{aspect-ratio:auto!important;}'+fallback});
  await page.waitForTimeout(100);
  const boxes=await page.evaluate(()=>Array.from(document.querySelectorAll('.omi-home__book')).map(book=>{
    const b=book.getBoundingClientRect(),c=book.querySelector('.omi-home__cover')!.getBoundingClientRect();
    const title=book.querySelector('.omi-home__book-title')!.getBoundingClientRect(),format=book.querySelector('.omi-home__book-format')!.getBoundingClientRect();
    return{top:b.top,bottom:b.bottom,right:b.right,coverTop:c.top,coverBottom:c.bottom,width:c.width,height:c.height,titleBottom:title.bottom,formatTop:format.top};
  }));
  expect(boxes).toHaveLength(4);
  for(const b of boxes){expect(b.formatTop).toBeGreaterThanOrEqual(b.titleBottom);expect(b.width).toBeGreaterThan(80);expect(b.height).toBeGreaterThan(120);expect(b.coverTop).toBeGreaterThanOrEqual(b.top-1);expect(b.coverBottom).toBeLessThanOrEqual(b.bottom+1);expect(b.right).toBeLessThan(viewport.width);expect(b.bottom).toBeLessThanOrEqual(viewport.height-64);}
  await page.screenshot({path:`test-results/legacy-startup/legacy-layout-${viewport.width}x${viewport.height}.png`});
});
