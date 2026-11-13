import {test,expect,type Page} from '@playwright/test';
import {installMock} from './mock';

async function open(page:Page,mobile:boolean,flow:string){
  await page.addInitScript(installMock,{count:48});
  await page.addInitScript(async flow=>{
    const api=window.omicomic,data=(await api.getAppData()).data!;
    Object.assign(data.settings,{mobileReaderAutoHide:false,readerDefaultFitMode:'fit-window'});
    const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=1800;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='#f5ede0';ctx.fillRect(0,0,1200,1800);ctx.fillStyle='#345';ctx.fillRect(100,100,1000,1600);
    const url=canvas.toDataURL();api.getPageImage=async()=>({ok:true,data:{url,width:1200,height:1800}});
    api.getReadingProgress=async()=>({ok:true,data:{currentPageIndex:12,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:flow==='vertical'?'vertical':'horizontal',panorama:flow!=='ordinary',immersive:false}} as any});
  },flow);
  await page.goto('/');
  if(mobile){await page.evaluate(()=>document.documentElement.dataset.platform='android');await page.getByRole('button',{name:'打开资源库',exact:true}).click();await page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).click();}
  else await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  await expect.poll(()=>page.locator('.reader-stage img').evaluateAll(images=>images.some(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await page.waitForTimeout(300);
}
for(const mobile of [false,true])test.describe(mobile?'Android tablet touch':'desktop mouse',()=>{
  test.use({viewport:mobile?{width:1100,height:800}:{width:1440,height:960},hasTouch:mobile,isMobile:mobile});
  for(const flow of ['ordinary','horizontal','vertical'])test(`${flow} can shrink to 25% and expand again`,async({page,context})=>{
    await open(page,mobile,flow);
    const stage=page.locator('.reader-stage'),box=(await stage.boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
    const cdp=mobile?await context.newCDPSession(page):null;
    async function pinch(distances:number[]){
      await cdp!.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-distances[0],y,id:1},{x:x+distances[0],y,id:2}]});
      for(const d of distances.slice(1)){await cdp!.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-d,y,id:1},{x:x+d,y,id:2}]});await page.waitForTimeout(25);}
      await cdp!.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    }
    if(mobile)await pinch([200,150,100,60,30,20]);
    else {await page.mouse.move(x,y);await page.keyboard.down('Control');await page.mouse.wheel(0,2000);await page.keyboard.up('Control');}
    await expect(stage).toHaveAttribute('data-reader-zoom','0.25');
    await page.waitForTimeout(200);await expect(stage).toHaveAttribute('data-reader-zoom','0.25');
    await page.screenshot({path:`test-results/reader-minimum-zoom/${mobile?'android':'desktop'}-${flow}-25.png`});
    if(mobile)await pinch([20,40,60,80,100]);
    else {await page.keyboard.down('Control');await page.mouse.wheel(0,-600);await page.keyboard.up('Control');}
    await expect.poll(async()=>Number(await stage.getAttribute('data-reader-zoom'))).toBeGreaterThan(.8);
  });
});
