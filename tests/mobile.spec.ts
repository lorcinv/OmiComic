import { test, expect } from '@playwright/test';
import { installMock } from './mock';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
test.beforeEach(async({page})=>{
  await page.addInitScript(installMock,{count:12});
  await page.emulateMedia({reducedMotion:'reduce'});
});

test('Omi phone home and library fit the viewport, with reachable navigation and one-tap reading',async({page})=>{
  await page.goto('/');
  await expect(page.locator('.omi-home__book')).toHaveCount(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({path:'test-results/mobile-home.png',fullPage:true});
  await page.getByRole('button',{name:'打开资源库',exact:true}).tap();
  await expect(page.locator('.library-layout')).toBeVisible();
  const cards=page.locator('.resource-card');await expect(cards).toHaveCount(14);
  const first=await cards.first().boundingBox(),second=await cards.nth(1).boundingBox();
  expect(first!.width).toBeGreaterThan(140);expect(second!.x+second!.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole('button',{name:'显示选项',exact:true})).toBeVisible();
  expect((await page.locator('.resource-list-scroll').boundingBox())!.height).toBeGreaterThan(700);
  await page.screenshot({path:'test-results/mobile-library.png',fullPage:true});
  await cards.filter({hasText:'Book'}).tap();
  await expect(page.locator('.reader-layout')).toBeVisible();
  await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow','1');
  await expect(page.locator('.reader-toolbar')).toBeHidden();
  expect((await page.locator('.reader-stage').boundingBox())!.height).toBeGreaterThan(820);
  await page.locator('.reader-stage').dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:300,clientY:350});
  await page.locator('.reader-stage').dispatchEvent('pointerup',{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:110,clientY:350});
  await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow','2');
  await page.locator('.reader-stage').tap();
  await page.getByRole('button',{name:'阅读设置',exact:true}).tap();
  await page.setViewportSize({width:320,height:640});
  for (const label of await page.locator('.mobile-mode-label').all()) {
    const bounds=await label.boundingBox(),parent=await label.locator('..').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(parent!.x);
    expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(parent!.x+parent!.width);
  }
  await page.getByRole('combobox',{name:'缩放方式'}).tap();
  await page.getByRole('option',{name:'适应宽度',exact:true}).tap();
  await expect(page.getByRole('combobox',{name:'缩放方式'})).toHaveText('适应宽度');
  await page.getByRole('combobox',{name:'缩放方式'}).tap();
  await page.getByRole('option',{name:'适应窗口',exact:true}).tap();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'画面调整',exact:true}).tap();
  await expect(page.locator('.reader-tool-panel')).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
  await expect(page.locator('.reader-tool-panel')).toHaveCount(0);
  await expect(page.locator('.reader-layout')).toBeVisible();
  await page.getByRole('button',{name:'关闭阅读设置'}).tap();
  expect((await page.locator('.reader-toolbar').boundingBox())!.height).toBe(56);
  await page.locator('.reader-progress-rail').focus();await page.keyboard.press('End');
  await page.locator('.reader-stage').dispatchEvent('pointerdown',{pointerId:2,pointerType:'touch',isPrimary:true,button:0,clientX:300,clientY:350});
  await page.locator('.reader-stage').dispatchEvent('pointerup',{pointerId:2,pointerType:'touch',isPrimary:true,button:0,clientX:110,clientY:350});
  await expect(page.getByRole('button',{name:/^下一本：/})).toBeVisible();
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
  await page.getByRole('button',{name:'详情操作'}).tap();await page.getByRole('button',{name:'删除',exact:true}).tap();
  await expect(page.getByRole('radio',{name:/仅移除索引/})).toBeChecked();
  expect(await page.evaluate(()=>(window as any).__fileActions)).toHaveLength(0);
  await page.getByRole('button',{name:'移除索引',exact:true}).tap();
  await expect(page.getByRole('alert')).toContainText('测试文件正在使用');
  expect((await page.evaluate(()=>(window as any).__fileActions))[0].action).toBe('index');
  await page.getByRole('radio',{name:/同时删除本地文件/}).check();
  await page.getByRole('button',{name:'移入回收站',exact:true}).tap();
  expect((await page.evaluate(()=>(window as any).__fileActions))[1].action).toBe('trash');
  await page.getByRole('button',{name:'取消',exact:true}).tap();
  await page.getByRole('button',{name:'详情操作'}).tap();await page.getByRole('button',{name:'重命名',exact:true}).tap();
  await page.getByRole('textbox',{name:'新文件名'}).fill('New Book');
  await page.getByRole('button',{name:'确认重命名'}).tap();
  expect((await page.evaluate(()=>(window as any).__fileActions))[2]).toMatchObject({action:'rename',name:'New Book',path:'/comics/Book'});
  await page.screenshot({path:'test-results/mobile-file-dialog.png',fullPage:true});
});

test('phone continuous paging uses its two visible columns and preserves position across rotation',async({page})=>{
  await page.addInitScript(()=>{
    const api=(window as any).omicomic,original=api.getAppData;
    api.getAppData=async()=>{const result=await original();result.data.settings.cardScale=40;return result;};
    api.listDirectory=async(path:string)=>({ok:true,data:{path,parentPath:null,items:Array.from({length:151},(_,i)=>({id:`${path}/${i}`,path:`${path}/${i}`,name:`Book ${i+1}`,type:'folder',extension:''})),total:151}});
  });
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).tap();
  const list=page.getByLabel('当前目录文件列表',{exact:true});
  const current=page.getByRole('navigation',{name:'列表页码'});
  await expect.poll(()=>page.locator('.resource-card').count()).toBeLessThan(50);
  await page.getByRole('button',{name:'下一页资源'}).tap();
  const first=()=>list.evaluate(element=>{
    const top=element.getBoundingClientRect().top;
    return Number([...element.querySelectorAll<HTMLElement>('[data-library-index]')].find(card=>card.getBoundingClientRect().bottom>top+2)?.dataset.libraryIndex);
  });
  await expect.poll(first).toBe(50);
  await page.setViewportSize({width:844,height:390});
  // Wide layouts add columns; retain the same book in its containing row.
  await expect.poll(first).toBe(48);
  await page.setViewportSize({width:390,height:844});
  await expect.poll(first).toBe(48);
  await page.getByRole('button',{name:'下一页资源'}).tap();await page.getByRole('button',{name:'下一页资源'}).tap();
  await list.evaluate(element=>{element.scrollTop=element.scrollHeight;});
  await expect(page.locator('[data-library-index="150"]')).toBeVisible();
  await expect(current).toContainText('4 / 4');
  const canvas=await page.locator('.library-virtual-canvas').boundingBox();
  const last=await page.locator('[data-library-index="150"]').boundingBox();
  expect(Math.abs(canvas!.y+canvas!.height-last!.y-last!.height)).toBeLessThan(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('phone grid/list remembers the choice and directory/search controls remain reachable',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).tap();
  await page.getByRole('button',{name:'切换列表卡片'}).tap();
  await expect(page.locator('.library-layout')).toHaveClass(/mobile-cards-list/);
  const cards=page.locator('.resource-card');
  expect((await cards.first().boundingBox())!.height).toBe(123);
  expect((await cards.nth(1).boundingBox())!.y).toBeGreaterThan((await cards.first().boundingBox())!.y);
  await page.screenshot({path:'test-results/mobile-library-list.png'});
  await page.getByRole('button',{name:'资源库目录'}).tap();
  await expect(page.getByRole('dialog',{name:'资源库',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'添加目录',exact:true})).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
  await expect(page.getByRole('dialog',{name:'资源库',exact:true})).toHaveCount(0);
  await expect(page.locator('.library-layout')).toBeVisible();
  await page.getByRole('button',{name:'搜索',exact:true}).tap();
  await expect(page.getByRole('searchbox',{name:'搜索漫画、名称或标签'})).toBeVisible();
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
  await expect(page.getByRole('searchbox')).toHaveCount(0);
  await expect(page.locator('.library-controls')).toBeHidden();
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
  await page.getByRole('button',{name:'打开资源库',exact:true}).tap();
  await expect(page.locator('.library-layout')).toHaveClass(/mobile-cards-list/);
  await page.locator('.resource-card').filter({hasText:'Parent'}).tap();
  await expect(page.locator('.mobile-library-title')).toHaveText('Parent');
  await page.getByRole('button',{name:'资源库目录'}).tap();
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
  await expect(page.getByRole('dialog',{name:'资源库',exact:true})).toHaveCount(0);
  await expect(page.locator('.mobile-library-title')).toHaveText('Parent');
});

test('Android volume preferences work in the reader and release keys for panels and inputs',async({page})=>{
  await page.addInitScript(()=>{
    document.addEventListener('DOMContentLoaded',()=>{document.documentElement.dataset.platform='android';});
    (window as any).__volumeCapture=false;
    (window as any).omicomic.setReaderVolumeKeys=async(enabled:boolean)=>{(window as any).__volumeCapture=enabled;return {ok:true,data:enabled};};
  });
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).tap();
  await page.locator('.resource-card').filter({hasText:'Book'}).tap();
  await page.locator('.reader-stage').tap();
  await page.getByRole('button',{name:'阅读设置',exact:true}).tap();
  await page.getByRole('checkbox',{name:'音量键翻页',exact:true}).check();
  expect(await page.evaluate(()=>(window as any).__volumeCapture)).toBe(false);
  await page.getByRole('button',{name:'关闭阅读设置'}).tap();
  await expect.poll(()=>page.evaluate(()=>(window as any).__volumeCapture)).toBe(true);
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-volume-down')));
  await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow','2');
  await page.getByRole('button',{name:'阅读设置',exact:true}).tap();
  await page.getByRole('checkbox',{name:'反转音量键翻页方向'}).check();
  await page.getByRole('button',{name:'关闭阅读设置'}).tap();
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-volume-up')));
  await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow','3');
  await page.getByRole('button',{name:'阅读设置',exact:true}).tap();
  await expect.poll(()=>page.evaluate(()=>(window as any).__volumeCapture)).toBe(false);
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-volume-down')));
  await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow','3');
  await page.getByRole('button',{name:'关闭阅读设置'}).tap();
  await page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
  await expect.poll(()=>page.evaluate(()=>(window as any).__volumeCapture)).toBe(false);
  await page.getByRole('button',{name:'显示选项',exact:true}).tap();await page.getByRole('button',{name:/应用设置/}).tap();
  await page.getByRole('button',{name:/默认阅读/}).tap();
  await expect(page.getByRole('checkbox',{name:'音量键翻页',exact:true})).toBeChecked();
});

test('phone auto reading survives automatic chrome hiding and comic taps, and can be paused after reveal',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).tap();
  await page.locator('.resource-card').filter({hasText:'Book'}).tap();
  await page.locator('.reader-stage').tap();
  await page.getByRole('button',{name:'开始自动阅读'}).tap();
  await expect(page.getByRole('dialog',{name:'阅读设置'})).toHaveCount(0);
  await expect(page.locator('.reader-toolbar')).toBeVisible();
  await expect(page.getByRole('button',{name:'暂停自动阅读'})).toBeVisible();
  await expect(page.locator('.reader-progress-rail')).toHaveAttribute('aria-valuenow','2',{timeout:9000});
  // The three-second auto-hide expires before the five-second page interval.
  // Assert each actual visibility state instead of assuming chrome stayed open.
  await expect(page.locator('.reader-toolbar')).toBeHidden();
  await page.locator('.reader-stage').tap();
  await expect(page.locator('.mobile-reader-play')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'暂停自动阅读'})).toBeVisible();
  await page.locator('.reader-stage').tap();
  await expect(page.locator('.reader-toolbar')).toBeHidden();
  await page.locator('.reader-stage').tap();
  await page.getByRole('button',{name:'暂停自动阅读'}).tap();
  await expect(page.getByRole('button',{name:'开始自动阅读'})).toBeVisible();
});
