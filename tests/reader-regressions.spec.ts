import {test,expect} from '@playwright/test';
import {installMock} from './mock';

test('zoomed single and double pages keep click paging while a drag stays a pan',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.addInitScript(installMock,{count:12});
  await page.addInitScript(()=>{
    const c=document.createElement('canvas');c.width=600;c.height=900;const ctx=c.getContext('2d')!;ctx.fillStyle='white';ctx.fillRect(0,0,600,900);
    const url=c.toDataURL();window.omicomic.getPageImage=async()=>({ok:true,data:{url,width:600,height:900}});
  });
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  const stage=page.locator('.reader-stage');await expect(stage).toBeVisible();
  for(const double of [false,true]){
    if(double)await page.getByRole('button',{name:'当前单页，点击切换双页',exact:true}).click();
    const before=await page.locator('.reader-page-frame:not([aria-hidden="true"])').first().getAttribute('data-reader-page-index');
    const r=(await stage.boundingBox())!;
    await page.mouse.move(r.x+r.width*.5,r.y+r.height*.5);await page.keyboard.down('Control');await page.mouse.wheel(0,-400);await page.keyboard.up('Control');
    await expect.poll(async()=>Number(await stage.getAttribute('data-reader-zoom'))).toBeGreaterThan(1.5);
    await page.mouse.move(r.x+r.width*.85,r.y+r.height*.5);await page.mouse.down();await page.mouse.up();
    await expect.poll(()=>page.locator('.reader-page-frame:not([aria-hidden="true"])').first().getAttribute('data-reader-page-index')).not.toBe(before);
    const after=await page.locator('.reader-page-frame:not([aria-hidden="true"])').first().getAttribute('data-reader-page-index');
    await page.mouse.move(r.x+r.width*.5,r.y+r.height*.5);await page.keyboard.down('Control');await page.mouse.wheel(0,-400);await page.keyboard.up('Control');
    await page.mouse.down();await page.mouse.move(r.x+r.width*.65,r.y+r.height*.55,{steps:8});await page.mouse.up();
    expect(await page.locator('.reader-page-frame:not([aria-hidden="true"])').first().getAttribute('data-reader-page-index')).toBe(after);
  }
});

test('desktop opens the reader before history is saved and every resource card can open its folder',async({page})=>{
  await page.addInitScript(installMock,{count:8});
  await page.addInitScript(()=>{
    (window as any).__savedBeforeReader=false;
    const save=window.omicomic.saveReadingProgress;
    window.omicomic.saveReadingProgress=async input=>{
      const reader=document.querySelector('.reader-stage');
      if(!reader||!reader.getBoundingClientRect().width)(window as any).__savedBeforeReader=true;
      return save(input);
    };
  });
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  const card=page.locator('.resource-card').filter({hasText:'Book'}).first();await card.click({button:'right'});
  await expect(page.getByRole('menuitem',{name:'打开路径',exact:true})).toBeVisible();
  await page.getByRole('menuitem',{name:'打开路径',exact:true}).click();
  await expect(page.locator('.resource-card').first()).toBeVisible();
  await page.getByRole('button',{name:/^最近阅读 \d+$/}).click();
  const recent=page.locator('.resource-card').filter({hasText:'Second'}).first();await recent.click({button:'right'});
  await expect(page.getByRole('menuitem',{name:'打开路径',exact:true})).toBeVisible();await page.keyboard.press('Escape');
  await recent.dblclick();await expect(page.locator('.reader-stage')).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>(window as any).__saved.length)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>(window as any).__savedBeforeReader)).toBe(false);
});
