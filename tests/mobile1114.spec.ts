import { test,expect } from '@playwright/test';
import {installMock} from './mock';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
test('home/library reveal expands from and contracts to the Omi icon',async({page})=>{
  await page.addInitScript(installMock,{count:12});
  await page.addInitScript(()=>{
    const original=document.startViewTransition.bind(document);
    (window as any).__reveal=[];
    document.startViewTransition=((update:any)=>{
      const direction=document.documentElement.dataset.mobileNavigation;
      const transition=original(update);
      if(direction?.startsWith('home-'))void transition.ready.then(()=>{
        const animations=document.getAnimations().filter(a=>(a.effect as KeyframeEffect)?.pseudoElement?.includes('view-transition'));
        animations.forEach(a=>{a.pause();a.currentTime=140;});
        (window as any).__reveal.push({direction,x:document.documentElement.style.getPropertyValue('--mobile-home-x'),y:document.documentElement.style.getPropertyValue('--mobile-home-y'),animations});
      });
      return transition;
    }) as typeof document.startViewTransition;
  });
  await page.goto('/');
  const origin=await page.locator('.omi-home .omi-brand-icon').boundingBox();expect(origin).not.toBeNull();
  await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__reveal.length)).toBe(1);
  const first=await page.evaluate(()=>{const r=(window as any).__reveal[0];return {direction:r.direction,x:r.x,y:r.y};});
  expect(first.direction).toBe('home-expand');expect(parseFloat(first.x)).toBeCloseTo(origin!.x+origin!.width/2,1);
  await page.screenshot({path:'test-results/mobile1114-home-expand.png'});
  await page.evaluate(()=>(window as any).__reveal[0].animations.forEach((a:Animation)=>a.finish()));
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.mobileNavigation??'')).toBe('');
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
  await expect.poll(()=>page.evaluate(()=>(window as any).__reveal.length)).toBe(2);
  expect(await page.evaluate(()=>(window as any).__reveal[1].direction)).toBe('home-collapse');
  await page.screenshot({path:'test-results/mobile1114-home-collapse.png'});
  await page.evaluate(()=>(window as any).__reveal[1].animations.forEach((a:Animation)=>a.finish()));
  await expect(page.locator('.omi-home')).toBeVisible();
});
test('Android loads visible covers individually without waiting for the whole folder',async({page})=>{
  await page.addInitScript(installMock,{count:500});
  await page.addInitScript(()=>{
    const api=window.omicomic,old=api.getThumbnail;
    (window as any).__coverReads=[];(window as any).__holdCover=null;
    api.getThumbnail=async input=>{
      (window as any).__coverReads.push(input.path);
      if(input.path==='/comics/Book')await new Promise(resolve=>(window as any).__holdCover=resolve);
      return old(input);
    };
  });
  await page.goto('/');await page.evaluate(()=>document.documentElement.dataset.platform='android');
  await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await expect(page.locator('.page-panel.is-visible .resource-preview img').first()).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__coverReads.length)).toBeLessThan(20);
  expect(await page.evaluate(()=>(window as any).__coverReads.some((p:string)=>p.endsWith('/page400.png')))).toBe(false);
  expect(await page.evaluate(()=>typeof (window as any).__holdCover)).toBe('function');
  await page.evaluate(()=>(window as any).__holdCover());
  await expect(page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).locator('.resource-preview img')).toBeVisible();
  await page.locator('.resource-list-scroll').evaluate(element=>{element.scrollTop=10000;});
  await expect.poll(()=>page.evaluate(()=>(window as any).__coverReads.length)).toBeGreaterThan(10);
  await page.screenshot({path:'test-results/mobile1114-visible-covers.png'});
});
