import {test,expect,type Page} from '@playwright/test';
import {installMock} from './mock';
import {expectReaderPixels} from './readerPixels';
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
async function setup(page:Page,count=150){
  await page.addInitScript(installMock,{count});
  await page.addInitScript(async()=>{
    const api=window.omicomic,data=(await api.getAppData() as any).data;
    data.settings.readerPreloadPages=0;
    data.resourceMeta['folder:/comics/Book']={resourceKey:'folder:/comics/Book',title:'Book',sourcePath:'/comics/Book',sourceType:'folder',tags:['科幻','彩色'],note:'原始简介'};
    data.tagOrder=['科幻','彩色'];
    data.readingProgress={'folder:/comics/Book':{resourceKey:'folder:/comics/Book',sourcePath:'/comics/Book',sourceType:'folder',title:'VeryLongUnbrokenComicName'.repeat(12),currentPageIndex:0,totalPages:150,updatedAt:1}};
    data.bookshelves=[{id:'cat',name:'我的分类',sortIndex:0}];
    data.virtualFolders=[{id:'shelf',bookshelfId:'cat',name:'我的长标题漫画书架',items:[{id:'item',...data.resourceMeta['folder:/comics/Book']}],tags:[],note:'',sortIndex:0}];
    (window as any).__metaPatches=[];
    api.updateResourceMeta=async(input:any)=>{(window as any).__metaPatches.push(input);Object.assign(data.resourceMeta[input.resourceKey],input);return {ok:true,data:data.resourceMeta[input.resourceKey]};};
    api.updateTagOrder=async(tags:any)=>({ok:true,data:tags} as any);
  });
  await page.goto('/');await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await expect(page.locator('.mobile-resource-card').first()).toBeVisible({timeout:15000});
}
const back=(page:Page)=>page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
const book=(page:Page)=>page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})});

test('phone keeps the decoded old page while the next DOM image decodes, then swaps without a blank frame',async({page})=>{
  await setup(page,12);
  await page.evaluate(()=>{
    const original=HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode=async function(){await original.call(this);if(this.classList.contains('reader-image')){if(this.alt==='page0.png')(window as any).__initialDecoded=true;if(this.alt==='page1.png')await new Promise<void>(resolve=>(window as any).__releasePage=resolve);}};
  });
  await book(page).click();const old=page.locator('.reader-page-frame[data-reader-page-index="0"]');await expectReaderPixels(old.locator('img'));
  await expect.poll(()=>page.evaluate(()=>(window as any).__initialDecoded)).toBe(true);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  await page.keyboard.press('ArrowRight');const next=page.locator('.reader-page-frame[data-reader-page-index="1"]');
  await expect(next).toHaveAttribute('aria-hidden','true');await expectReaderPixels(old.locator('img'));
  await expect.poll(()=>page.evaluate(()=>typeof (window as any).__releasePage)).toBe('function');
  await page.screenshot({path:'test-results/fixes-decoding-old-page.png'});
  await page.evaluate(()=>(window as any).__releasePage());await expectReaderPixels(next.locator('img'));await expect(old).toHaveCount(0);
  await page.keyboard.press('ArrowLeft');await expectReaderPixels(page.locator('.reader-page-frame[data-reader-page-index="0"] img'));
});

test('reading preview closes on the first outside tap without hiding controls or turning pages',async({page})=>{
  await setup(page,12);await book(page).click();await expectReaderPixels(page.locator('.reader-image'));await page.locator('.reader-stage').tap();
  const rail=page.getByRole('slider',{name:'阅读进度'}),r=(await rail.boundingBox())!;
  await page.mouse.move(r.x+2,r.y+22);await page.mouse.down();await page.mouse.move(r.x+r.width*.5,r.y+22,{steps:8});await page.mouse.up();
  const preview=page.locator('.mobile-reader-previews');await expect(preview).toBeVisible();await expect(page.getByRole('button',{name:'收起页面预览'})).toHaveCount(0);
  expect(await preview.evaluate(el=>getComputedStyle(el).paddingTop===getComputedStyle(el).paddingBottom)).toBe(true);
  await page.screenshot({path:'test-results/fixes-reader-preview.png'});const before=await rail.getAttribute('aria-valuenow');
  await page.touchscreen.tap(365,270);await expect(preview).toHaveCount(0);await expect(rail).toHaveAttribute('aria-valuenow',before!);await expect(page.locator('.reader-toolbar')).toBeVisible();
});

test('settings including very long book titles stay within narrow and rotated viewports',async({page})=>{
  await setup(page);await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:/应用设置/}).click();await page.getByRole('button',{name:/漫画阅读设置/}).click();
  await expect(page.getByRole('slider',{name:'翻页间隔',exact:true})).toBeVisible();
  for(const size of [{width:320,height:740},{width:390,height:844},{width:740,height:360}]){
    await page.setViewportSize(size);
    expect(await page.locator('.mobile-settings-page').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
    for(const el of await page.locator('.mobile-settings-body .glass-select,.mobile-settings-body input[type=range]').all()){const box=(await el.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(size.width);}
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/fixes-book-settings.png'});
});

test('directory index survives drawer reopening and a page reload; leaf nodes have no expand affordance',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    (window as any).__directoryReads=0;
    window.omicomic.listDirectory=async path=>{(window as any).__directoryReads++;const names=path==='/comics'?['Branch','ArchiveLeaf','Pictures']:path.endsWith('/Branch')?['Child']:[];const items=names.map(name=>({id:path+'/'+name,name,path:path+'/'+name,type:'folder',extension:''}));if(path.endsWith('/ArchiveLeaf'))items.push({id:'zip',name:'book.cbz',path:path+'/book.cbz',type:'archive',extension:'.cbz'});return {ok:true,data:{path,parentPath:'/comics',items,total:items.length}} as any;};
  });
  await page.getByRole('button',{name:'资源库目录'}).click();await page.getByRole('button',{name:'展开 Comics',exact:true}).click();await expect(page.getByRole('button',{name:'ArchiveLeaf',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'展开 ArchiveLeaf',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Pictures',exact:true})).toHaveCount(0);
  const calls=await page.evaluate(()=>(window as any).__directoryReads);await back(page);await page.getByRole('button',{name:'资源库目录'}).click();await page.getByRole('button',{name:'展开 Comics',exact:true}).click();await expect(page.getByRole('button',{name:'ArchiveLeaf',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).__directoryReads)).toBe(calls);
  await page.reload();await page.getByRole('button',{name:'打开资源库',exact:true}).click();await expect(page.locator('.mobile-resource-card').first()).toBeVisible();await page.evaluate(()=>{window.omicomic.listDirectory=async()=>{throw new Error('A cached drawer must not read again');};});await page.getByRole('button',{name:'资源库目录'}).click();await page.getByRole('button',{name:'展开 Comics',exact:true}).click();await expect(page.getByRole('button',{name:'ArchiveLeaf',exact:true})).toBeVisible();await expect(page.getByRole('dialog',{name:'资源库',exact:true}).getByRole('alert')).toHaveCount(0);
});

test('compact SVG pager accepts direct input and detail paging floats only after passing its dock',async({page})=>{
  await setup(page);const pager=page.getByRole('navigation',{name:'列表页码',exact:true});expect((await pager.boundingBox())!.width).toBeLessThan(170);
  await pager.getByRole('button',{name:/跳转页码/}).click();await page.getByRole('textbox',{name:'跳转页码输入'}).fill('3');await page.getByRole('button',{name:'跳转',exact:true}).click();await expect(pager).toContainText('3 / 4');
  await page.getByRole('button',{name:'资源库',exact:true}).click();await book(page).getByRole('button',{name:'打开资源信息'}).click();
  const dock=page.getByRole('navigation',{name:'预览分页',exact:true});await expect(dock).toBeVisible();await expect(page.getByRole('navigation',{name:'浮动预览分页'})).toHaveCount(0);
  await page.locator('.resource-detail-page').evaluate(el=>el.scrollTop=800);const floating=page.getByRole('navigation',{name:'浮动预览分页'});await expect(floating).toBeVisible();
  await floating.getByRole('button',{name:/跳转页码/}).click();await page.getByRole('textbox',{name:'跳转页码输入'}).fill('2');await page.getByRole('button',{name:'跳转',exact:true}).click();await expect(floating).toContainText('2 / 4');
  await page.screenshot({path:'test-results/fixes-detail-pager.png'});
});

test('tag and note edits save only their own fields, and mobile tag management has no search',async({page})=>{
  await setup(page);await book(page).getByRole('button',{name:'打开资源信息'}).click();
  expect(await page.getByRole('button',{name:'添加标签',exact:true}).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
  await page.getByRole('button',{name:'添加标签',exact:true}).click();await expect(page.getByRole('textbox',{name:'资源简介'})).toHaveCount(0);
  await page.getByRole('textbox',{name:'新标签'}).fill('新标签');await page.getByRole('button',{name:'添加',exact:true}).click();await expect(page.getByRole('button',{name:'移除标签：新标签'})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__metaPatches.at(-1).note)).toBeUndefined();await page.locator('#resource-detail-title').click();
  await page.getByRole('button',{name:'编辑简介'}).click();await expect(page.getByRole('button',{name:/移除标签/})).toHaveCount(0);await page.getByRole('textbox',{name:'资源简介'}).fill('修改后的简介');await page.getByRole('button',{name:'保存简介'}).click();expect(await page.evaluate(()=>(window as any).__metaPatches.at(-1).tags)).toBeUndefined();
  await page.getByRole('button',{name:'科幻',exact:true}).dispatchEvent('contextmenu');await expect(page.getByRole('button',{name:'移除标签：科幻'})).toBeVisible();await page.locator('#resource-detail-title').click();await back(page);
  await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:/标签管理/}).click();const manager=page.getByRole('dialog',{name:'标签管理'});await expect(manager).toBeVisible();await expect(manager.getByRole('textbox')).toHaveCount(0);expect((await manager.boundingBox())!.x).toBeGreaterThan(40);await manager.getByRole('button',{name:'选择',exact:true}).click();await manager.getByRole('button',{name:'全选',exact:true}).click();await expect(manager.getByRole('button',{name:/删除/})).toBeEnabled();await page.screenshot({path:'test-results/fixes-tag-manager.png'});await back(page);await expect(manager).toBeVisible();await back(page);await expect(manager).toHaveCount(0);
});

test('search mode persists OR vs AND comma semantics; shelves use stacked covers and blue sorting mask',async({page})=>{
  await setup(page);await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByRole('searchbox').fill('Book，不存在');await expect(book(page)).toBeVisible();await back(page);
  await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:/应用设置/}).click();await page.locator('.mobile-setting-category').filter({hasText:'资源库'}).click();await page.getByRole('combobox',{name:'多条件匹配方式'}).click();await page.getByRole('option',{name:'全部条件',exact:true}).click();await back(page);await expect(page.locator('.mobile-setting-category')).toHaveCount(7);await back(page);await expect(page.locator('.mobile-settings-page')).toHaveCount(0);
  await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByRole('searchbox').fill('Book，不存在');await expect(page.locator('.mobile-resource-card')).toHaveCount(0);await page.getByRole('searchbox').fill('Book，科幻');await expect(book(page)).toBeVisible();await back(page);
  await page.getByRole('button',{name:'书架',exact:true}).click();const shelf=page.locator('.mobile-bookshelf-card').first();await expect(shelf.locator('.mobile-bookshelf-stack')).toBeVisible();await page.screenshot({path:'test-results/fixes-shelf-grid.png'});await shelf.dispatchEvent('contextmenu');await page.getByRole('button',{name:'排序',exact:true}).click();expect(await shelf.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('none');expect(await shelf.evaluate(el=>getComputedStyle(el,'::after').backgroundColor)).toBe('rgba(112, 173, 225, 0.26)');await back(page);await page.getByRole('button',{name:'切换列表卡片'}).click();await page.screenshot({path:'test-results/fixes-shelf-list.png'});
});
