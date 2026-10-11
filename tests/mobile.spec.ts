import { test, expect } from '@playwright/test';
import { installMock } from './mock';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
test.beforeEach(async({page})=>{
  await page.addInitScript(installMock,{count:12});
  await page.emulateMedia({reducedMotion:'reduce'});
});

test('Omi phone home and library fit the viewport, with reachable navigation and one-tap reading',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'test-results/mobile-home.png',fullPage:true});
  await page.getByRole('button',{name:'打开资源库',exact:true}).tap();
  await expect(page.locator('.library-layout')).toBeVisible();
  const cards=page.locator('.resource-card');await expect(cards).toHaveCount(14);
  const first=await cards.first().boundingBox(),second=await cards.nth(1).boundingBox();
  expect(first!.width).toBeGreaterThan(140);expect(second!.x+second!.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button',{name:'设置',exact:true})).toBeVisible();
  await page.screenshot({path:'test-results/mobile-library.png',fullPage:true});
  await cards.filter({hasText:'Book'}).tap();
  await expect(page.locator('.reader-layout')).toBeVisible();
  await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('1');
  await page.locator('.reader-stage').dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:300,clientY:350});
  await page.locator('.reader-stage').dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:110,clientY:350});
  await expect(page.getByRole('textbox',{name:'跳转到页码'})).toHaveValue('2');
  await page.screenshot({path:'test-results/mobile-reader.png',fullPage:true});
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
  await expect(page.locator('.library-layout')).toBeVisible();
});

test('file dialog defaults to index removal, preserves failure feedback, and requires a separate local delete choice',async({page})=>{
  await page.addInitScript(()=>{
    (window as any).__fileActions=[];
    (window as any).omicomic.changeLocalResource=async(input:any)=>{(window as any).__fileActions.push(input);return {ok:false,error:{code:'LOCKED',message:'测试文件正在使用。'}};};
  });
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).tap();
  await page.locator('.resource-card').filter({hasText:'Book'}).getByRole('button',{name:'打开资源信息',exact:true}).tap();
  await expect(page.locator('.resource-detail-page')).toBeVisible();
  await page.getByRole('button',{name:'删除…',exact:true}).tap();
  await expect(page.getByRole('radio',{name:/仅移除索引/})).toBeChecked();
  expect(await page.evaluate(()=>(window as any).__fileActions)).toHaveLength(0);
  await page.getByRole('button',{name:'移除索引',exact:true}).tap();
  await expect(page.getByRole('alert')).toContainText('测试文件正在使用');
  expect((await page.evaluate(()=>(window as any).__fileActions))[0].action).toBe('index');
  await page.getByRole('radio',{name:/同时删除本地文件/}).check();
  await page.getByRole('button',{name:'移入回收站',exact:true}).tap();
  expect((await page.evaluate(()=>(window as any).__fileActions))[1].action).toBe('trash');
  await page.getByRole('button',{name:'取消',exact:true}).tap();
  await page.getByRole('button',{name:'重命名本地文件',exact:true}).tap();
  await page.getByRole('textbox',{name:'新文件名'}).fill('New Book');
  await page.getByRole('button',{name:'确认重命名'}).tap();
  expect((await page.evaluate(()=>(window as any).__fileActions))[2]).toMatchObject({action:'rename',name:'New Book',path:'/comics/Book'});
  await page.screenshot({path:'test-results/mobile-file-dialog.png',fullPage:true});
});
