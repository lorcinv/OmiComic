import { test, expect } from '@playwright/test';
import { installMock } from './mock';
import { expectReaderPixels } from './readerPixels';

test.beforeEach(async ({page}) => {
  await page.addInitScript(installMock,{count:12});
  await page.addInitScript(() => {
    const api = window.omicomic, original = api.getAppData;
    api.getAppData = async () => { const result = await original(); if(result.ok) result.data.settings.readerDefaultFitMode = 'fit-window'; return result; };
  });
  await page.emulateMedia({reducedMotion:'reduce'});
});

test('PC ctrl-wheel zoom, left drag, reset and live seek bubble',async ({page}) => {
  await page.goto('/');await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
  const stage=page.locator('.reader-stage'), spread=page.locator('.reader-page-spread');
  await expectReaderPixels(spread.locator('img'));
  await stage.hover();await page.keyboard.down('Control');await page.mouse.wheel(0,-600);await page.keyboard.up('Control');
  await expect(page.getByRole('button',{name:'重置大小'})).toBeVisible();
  expect(await spread.evaluate(el=>Number(getComputedStyle(el).scale))).toBeGreaterThan(2);
  const box=(await stage.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+60,box.y+box.height/2+80,{steps:5});await page.mouse.up();
  expect(await spread.evaluate(el=>getComputedStyle(el).translate)).not.toBe('0px');
  await page.getByRole('button',{name:'重置大小'}).click();
  await expect(page.getByRole('button',{name:'重置大小'})).toHaveCount(0);
  await page.getByRole('button',{name:'当前单页，点击切换双页'}).click();
  await expect(spread.locator('figure')).toHaveCount(2);
  const rail=page.getByRole('slider',{name:'阅读进度'}), r=(await rail.boundingBox())!;
  await page.mouse.move(r.x+10,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width*.5,r.y+r.height/2,{steps:3});
  await expect.poll(async()=>Number(await rail.getAttribute('aria-valuenow'))).toBeGreaterThan(5);
  await expect(page.locator('.reader-progress-label')).toContainText('|');
  expect(await page.locator('.reader-progress-label').textContent()).not.toContain('.png');
  await page.mouse.up();await page.mouse.move(700,300);
  await expect(page.locator('.reader-progress-label')).toHaveCount(0,{timeout:2200});
});

test('PC detail actions and tag catalogue fixed controls',async ({page}) => {
  await page.addInitScript(() => {
    const api=window.omicomic,original=api.getAppData;
    api.getAppData=async()=>{const result=await original();if(result.ok){result.data.tagOrder=Array.from({length:130},(_,i)=>'标签'+i);result.data.resourceMeta['folder:/comics/Book']={resourceKey:'folder:/comics/Book',sourcePath:'/comics/Book',sourceType:'folder',title:'Book',tags:result.data.tagOrder,note:'',updatedAt:1};}return result;};
  });
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await page.locator('.resource-card').filter({has:page.getByText('Book',{exact:true})}).getByRole('button',{name:'打开资源信息'}).click();
  const back=page.getByRole('button',{name:'返回资源列表'}),rename=page.getByRole('button',{name:'重命名本地文件'});
  expect((await back.boundingBox())!.x).toBeLessThan((await rename.boundingBox())!.x);
  await back.click();
  await page.getByRole('button',{name:'标签',exact:true}).click();
  const header=page.locator('.tag-manage-section'),before=(await header.boundingBox())!;
  await page.locator('.tag-all-section .tag-filter-list').evaluate(el=>el.scrollTop=el.scrollHeight);
  expect((await header.boundingBox())!.y).toBe(before.y);
  expect(await page.locator('.tag-all-section .tag-filter-list').evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({path:'test-results/rework-pc-tags.png'});
});
