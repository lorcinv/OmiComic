import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { installMock } from './mock';

async function open(page:Page,mobile:boolean,flow='ordinary') {
  await page.addInitScript(installMock,{count:48});
  await page.addInitScript(async(flow)=>{
    const api=window.omicomic,data=(await api.getAppData()).data!;
    Object.assign(data.settings,{mobileReaderAutoHide:false,readerDefaultFitMode:'fit-window'});
    data.recentOpened[0].currentPageIndex=12;
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1800;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#fafafa';ctx.fillRect(0,0,1200,1800);
    ctx.fillStyle='#242424';for(let y=0;y<1800;y+=24)ctx.fillRect(0,y,1200,5);
    const url=canvas.toDataURL();api.getPageImage=async()=>({ok:true,data:{url,width:1200,height:1800}});
    api.getReadingProgress=async()=>({ok:true,data:{currentPageIndex:12,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:flow!=='ordinary',immersive:false}} as any});
  },flow);
  await page.goto('/');
  if(mobile){await page.evaluate(()=>document.documentElement.dataset.platform='android');await page.getByRole('button',{name:'打开资源库',exact:true}).click();await page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).click();}
  else await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  await expect.poll(()=>page.locator('.reader-stage img').evaluateAll(images=>images.some(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.waitForTimeout(700);
}
const pose=(page:Page)=>page.locator('.reader-page-spread').evaluate(e=>{
  const translate=(e as HTMLElement).style.translate.split(' ').map(parseFloat);
  return{x:translate[0]||0,y:translate[1]||0};
});
const index=(page:Page)=>page.locator('[aria-label="阅读进度"]').getAttribute('aria-valuenow');
async function input(page:Page,context:BrowserContext,mobile:boolean) {
  const cdp=mobile?await context.newCDPSession(page):null;
  const box=(await page.locator('.reader-stage').boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
  const send=async(kind:'down'|'move'|'up'|'cancel',dx=0,dy=0,timestamp?:number)=>{
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:({down:'touchStart',move:'touchMove',up:'touchEnd',cancel:'touchCancel'} as const)[kind],timestamp,touchPoints:kind==='up'||kind==='cancel'?[]:[{x:x+dx,y:y+dy,id:1}]});
    else if(kind==='down'){await page.mouse.move(x+dx,y+dy);await page.mouse.down();}
    else if(kind==='move')await page.mouse.move(x+dx,y+dy);
    else await page.mouse.up();
  };
  const pinch=async()=>{
    if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});await page.waitForTimeout(25);for(const d of [40,55,70,90]){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-d,y,id:1},{x:x+d,y,id:2}]});await page.waitForTimeout(20);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else {await page.mouse.move(x,y);await page.keyboard.down('Control');await page.mouse.wheel(0,-550);await page.keyboard.up('Control');}
    await expect.poll(async()=>Number(await page.locator('.reader-stage').getAttribute('data-reader-zoom'))).toBeGreaterThan(2.7);
    await page.waitForTimeout(100);
  };
  const drag=async(dx:number,dy:number,paused=false)=>{
    // Fixed touch sampling times separate gesture speed from test-driver IPC
    // latency. Android instrumentation separately exercises real event times.
    const started=Date.now()/1000;await send('down',0,0,mobile?started:undefined);
    for(let n=1;n<=6;n++){await send('move',dx*n/6,dy*n/6,mobile?started+n*.016:undefined);if(n<6)await page.waitForTimeout(12);}
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    if(paused)await page.waitForTimeout(180);const held=await pose(page);
    await send('up',0,0,mobile?started+.112+(paused?.180:0):undefined);return held;
  };
  return{send,pinch,drag,cdp,x,y};
}
for(const device of ['desktop','phone','tablet'])test.describe(device,()=>{
  const mobile=device!=='desktop';
  test.use({viewport:device==='phone'?{width:390,height:844}:device==='tablet'?{width:1100,height:800}:{width:1440,height:960},hasTouch:mobile,isMobile:mobile});
  for(const flow of ['ordinary','horizontal','vertical'])test(`${flow}: zoomed drag follows, coasts, catches and reverses`,async({page,context},info)=>{
    await open(page,mobile,flow);const controls=await input(page,context,mobile);await controls.pinch();
    const axis=flow==='vertical'?'x':'y',start=await pose(page),before=await index(page);
    const held=await controls.drag(axis==='x'?-85:0,axis==='y'?-85:0);
    expect(held[axis]-start[axis]).toBeCloseTo(-85,0);
    const frames=[];for(let n=0;n<5;n++){await page.waitForTimeout(25);frames.push(await pose(page));}
    expect(frames.at(-1)![axis]).toBeLessThan(held[axis]-10);
    for(let n=1;n<frames.length;n++)expect(frames[n][axis]).toBeLessThanOrEqual(frames[n-1][axis]+.1);
    await controls.send('down');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const caught=await pose(page);await page.waitForTimeout(180);
    expect((await pose(page))[axis]).toBeCloseTo(caught[axis],1);await controls.send('up');await page.waitForTimeout(100);
    expect((await pose(page))[axis]).toBeCloseTo(caught[axis],1);expect(await index(page)).toBe(before);
    const reverse=await controls.drag(axis==='x'?65:0,axis==='y'?65:0);await page.waitForTimeout(120);
    expect((await pose(page))[axis]).toBeGreaterThan(reverse[axis]+10);
    await info.attach('zoom-poses',{body:JSON.stringify({start,held,frames,caught,reverse}),contentType:'application/json'});
  });
  test('paused release stays put; a held reversal replaces old velocity; resize stops coasting',async({page,context})=>{
    await open(page,mobile);const {send,pinch,drag}=await input(page,context,mobile);await pinch();
    const held=await drag(0,-70,true);await page.waitForTimeout(250);expect((await pose(page)).y).toBeCloseTo(held.y,1);
    await send('down');for(const y of [-20,-40,-70,-50,-30,-10]){await send('move',0,y);if(y!==-10)await page.waitForTimeout(14);}
    const reversal=await pose(page);await send('up');await page.waitForTimeout(100);expect((await pose(page)).y).toBeGreaterThan(reversal.y+10);
    await page.setViewportSize({width:900,height:700});await page.waitForTimeout(80);const resized=await pose(page);await page.waitForTimeout(200);expect(await pose(page)).toEqual(resized);
  });
  test('inertia stops at bounds without flipping, reset or pinch takes over',async({page,context})=>{
    await open(page,mobile);const controls=await input(page,context,mobile);await controls.pinch();const before=await index(page);
    for(let n=0;n<9;n++){await controls.drag(0,-130);await page.waitForTimeout(100);}
    await page.waitForTimeout(500);const edge=await pose(page);await page.waitForTimeout(180);expect(await pose(page)).toEqual(edge);expect(await index(page)).toBe(before);
    await controls.drag(0,85);
    if(mobile)await controls.pinch();else {await page.mouse.dblclick(controls.x,controls.y);await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom','1');}
    await page.waitForTimeout(400);const stopped=await pose(page);await page.waitForTimeout(180);expect(await pose(page)).toEqual(stopped);
  });
  if(!mobile)test('a quick second click catches a fling without becoming double-click reset',async({page,context})=>{
    await open(page,false);const controls=await input(page,context,false);await controls.pinch();
    await controls.drag(0,-85);const scale=await page.locator('.reader-stage').getAttribute('data-reader-zoom');
    await page.mouse.move(controls.x,controls.y-85);await page.mouse.down({clickCount:2});await page.mouse.up({clickCount:2});await page.waitForTimeout(350);
    await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom',scale!);
  });
});
