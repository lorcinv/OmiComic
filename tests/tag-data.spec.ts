import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
test.use({ screenshot: 'only-on-failure' });

async function seed(page: Page, drawers = false) {
  await page.addInitScript(async ({source, drawers}) => {
    eval('(' + source + ')')({ count: 8 });
    const api = window.omicomic, result = await api.getAppData(); if (!result.ok) throw Error();
    const data = result.data; data.settings.showHomePage = false; data.settings.colorTheme = 'mist'; data.temporaryOpened = [];
    const tags = Array.from({ length: 60 }, (_, index) => '测试' + String(index + 1).padStart(2, '0'));
    const meta = (path: string, list: string[]) => ({ resourceKey: 'folder:' + path, sourcePath: path, sourceType: 'folder' as const, title: path.split('/').at(-1)!, tags: list, note: '保留简介', updatedAt: 1 });
    data.resourceMeta = { 'folder:/comics/Book': meta('/comics/Book', ['已有']), 'folder:/comics/Parent': meta('/comics/Parent', tags) };
    data.tagOrder = ['已有', ...tags];
    if(drawers){
      data.library.roots.push(...['two','three'].map((key,index)=>({path:'/comics-'+key,name:'Root '+key,addedAt:index+1,lastOpenedAt:0})));
      data.bookshelves=['a','b','c'].map((id,index)=>({id,name:'Shelf '+id,createdAt:0,updatedAt:0,sortIndex:index}));
      api.reorderLibraryRoots=async keys=>{(window as any).__rootOrder=keys;data.library.roots.sort((a,b)=>keys.indexOf(a.path)-keys.indexOf(b.path));return {ok:true,data:structuredClone(data.library.roots)};};
      api.reorderBookshelves=async keys=>{(window as any).__shelfOrder=keys;data.bookshelves.sort((a,b)=>keys.indexOf(a.id)-keys.indexOf(b.id));return {ok:true,data:structuredClone(data.bookshelves)};};
    }
    (window as any).__tagData = data; (window as any).__orders = []; (window as any).__importOptions = [];
    api.getAppInfo = async () => ({ name: 'OmiComic', version: '1.1.77', platform: 'win32' });
    api.getAppData = async () => ({ ok: true, data: structuredClone(data) });
    api.updateResourceMeta = async input => { await new Promise(resolve=>setTimeout(resolve,(window as any).__tagSaveDelay ?? 0)); const record = { ...data.resourceMeta[input.resourceKey], ...input, updatedAt: Date.now() }; data.resourceMeta[input.resourceKey] = record; return { ok: true, data: record }; };
    api.updateTagOrder = async order => { data.tagOrder = order; (window as any).__orders.push(order); return { ok: true, data: order }; };
    api.hasDataImportBackup = async () => ({ ok: true, data: false });
    api.exportDataBackup = async () => ({ ok: true, data: 'OmiComic-Data-win-20261103-160000.json' });
    api.readDataBackup = async () => ({ ok: true, data: { token: 'preview', backup: { format: 'OmiComic.Data', formatVersion: 1, appVersion: '1.1.77', platform: 'android', exportedAt: '2026-11-03T08:00:00Z', data: structuredClone(data) } } });
    api.applyDataBackup = async (_token, options) => { (window as any).__importOptions.push(options); return { ok: false, error: { code: 'TEST_WRITE', message: '模拟写入失败，原数据已保留。' } }; };
    api.selectFolder = async () => ({ ok: true, data: 'D:\\漫画' });
  }, {source:installMock.toString(), drawers});
  await page.goto('/'); await expect(page.locator('.resource-card,.mobile-resource-card').first()).toBeVisible();
}
async function details(page: Page) {
  await page.locator('.resource-card,.mobile-resource-card').filter({ has: page.locator('strong', { hasText: /^Book$/ }) }).getByRole('button', { name: '打开资源信息', exact: true }).click();
  await expect(page.locator('.resource-detail-page')).toBeVisible();
  await expect(page.locator('html')).not.toHaveAttribute('data-mobile-navigation');
}
async function swipe(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, middle?: () => Promise<void>) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / 12, y: from.y + (to.y - from.y) * i / 12 }] }); await page.waitForTimeout(16); }
  await middle?.(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
}

for (const mobile of [false, true]) test.describe(mobile ? 'phone tag and data tools' : 'desktop tag and data tools', () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : {});
  test('tag completions stay inside the input, fade at the edges, scroll without a bar, and fill an existing tag', async ({ page }) => {
    await seed(page); await details(page);
    await page.getByRole('button', { name: '添加标签', exact: true }).click();
    const input = page.getByRole('textbox', { name: '新标签', exact: true }); await input.fill('已有'); await expect(page.locator('.tag-completion-strip')).toHaveCount(0); await input.fill('测'); await input.click();
    const strip = page.locator('.tag-completion-strip'); await expect(strip).toBeVisible();
    const geometry = await strip.evaluate(el => { const r = el.getBoundingClientRect(), input = el.parentElement!.querySelector('input')!.getBoundingClientRect(), css = getComputedStyle(el); return { x: r.x, right: r.right, inputX: input.x, inputRight: input.right, scrollable: el.scrollWidth > el.clientWidth, bar: css.scrollbarWidth, mask: css.maskImage }; });
    expect(geometry.inputX).toBeGreaterThanOrEqual(0); expect(geometry.inputRight).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(Math.abs(geometry.x - geometry.inputX)).toBeLessThan(1); expect(Math.abs(geometry.right - geometry.inputRight)).toBeLessThan(1); expect(geometry.scrollable).toBe(true); expect(geometry.bar).toBe('none'); expect(geometry.mask).toContain('linear-gradient');
    if (mobile) { const box = (await strip.boundingBox())!; await swipe(page, { x: box.x + box.width - 20, y: box.y + box.height / 2 }, { x: box.x + 15, y: box.y + box.height / 2 }); }
    else { await strip.hover(); await page.mouse.wheel(0, 260); }
    await expect.poll(() => strip.evaluate(el => el.scrollLeft)).toBeGreaterThan(50); await expect(strip).toHaveAttribute('data-at-start', 'false');
    if(!mobile){const box=(await strip.boundingBox())!,before=await strip.evaluate(el=>el.scrollLeft);await page.mouse.move(box.x+box.width*.75,box.y+box.height/2);await page.mouse.down({button:'middle'});await page.mouse.move(box.x+box.width*.3,box.y+box.height/2,{steps:8});await page.mouse.up({button:'middle'});expect(await strip.evaluate(el=>el.scrollLeft)).toBeGreaterThan(before);await expect(input).toHaveValue('测');}
    await page.screenshot({path:`test-results/tags-${mobile?'phone':'desktop'}-suggestions.png`});
    await strip.evaluate(el => { el.scrollLeft = 0; });
    await strip.getByRole('button', { name: '测试01', exact: true }).click(); await expect(input).toHaveValue('测试01');
    await page.locator('.mobile-tag-add-form').getByRole('button', { name: '添加', exact: true }).click();
    await expect(page.locator('.resource-detail-tag-editor')).toContainText('测试01');
    expect(await page.evaluate(() => (window as any).__tagData.resourceMeta['folder:/comics/Book'].note)).toBe('保留简介');
    await page.screenshot({ path: `test-results/tags-${mobile ? 'phone' : 'desktop'}-completed.png` });
    await page.getByRole('button',{name:'添加标签',exact:true}).click(); await page.getByRole('textbox',{name:'新标签',exact:true}).fill('测试01'); await expect(page.locator('.tag-completion-strip')).toHaveCount(0);
    if(!mobile){await expect(page.locator('.detail-tag-add-inline').getByRole('button',{name:'取消',exact:true})).toHaveCount(0);await page.keyboard.press('Escape');await expect(page.locator('.detail-tag-add-inline')).toHaveCount(0);}
  });
  test('sorting cursor stays solid and fixed at one gap midpoint while the pointer crosses sides', async ({page})=>{
    await seed(page);
    if(mobile)await swipe(page,{x:365,y:200},{x:150,y:200});else await page.locator('.tag-filter-button').click();
    const dialog=page.getByRole('dialog',{name:mobile?'标签管理':'标签筛选',exact:true});await expect(dialog).toBeVisible();
    if(mobile)await expect.poll(()=>dialog.evaluate(el=>Math.abs(el.getBoundingClientRect().right-innerWidth))).toBeLessThan(1);
    await dialog.getByRole('button',{name:'选择',exact:true}).click();
    const list=dialog.locator('.tag-sort-list'),source=list.locator('[data-tag-sort="已有"]'),left=list.locator('[data-tag-sort="测试01"]'),right=list.locator('[data-tag-sort="测试02"]');
    const a=(await source.boundingBox())!,l=(await left.boundingBox())!,r=(await right.boundingBox())!;
    expect(l.y).toBeCloseTo(r.y,2);expect(r.x-l.x-l.width).toBeCloseTo(8,2);
    const from={x:a.x+a.width/2,y:a.y+5},mid=(l.x+l.width+r.x)/2,y=l.y+l.height/2;
    const cdp=mobile?await page.context().newCDPSession(page):null;
    if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});else{await page.mouse.move(from.x,from.y);await page.mouse.down();}
    const measurements:Array<{x:number;y:number;width:number;height:number;radius:string;mask:string;anchor:string;animation:string}>=[];
    for(const offset of [-1.5,1.5,-1.5,1.5]){
      if(cdp)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:mid+offset,y}]});else await page.mouse.move(mid+offset,y,{steps:8});
      await page.waitForTimeout(85);
      measurements.push(await list.evaluate(el=>{
        const target=el.querySelector<HTMLElement>('.drop-before,.drop-after')!;if(!target)throw Error('Missing insertion cursor');
        const before=target.classList.contains('drop-before'),style=getComputedStyle(target,before?'::before':'::after'),box=target.getBoundingClientRect(),matrix=new DOMMatrixReadOnly(style.transform),width=parseFloat(style.width),height=parseFloat(style.height);
        return{x:box.left+parseFloat(style.left)+matrix.m41+width/2,y:box.top+parseFloat(style.top)+height/2,width,height,radius:style.borderRadius,mask:style.maskImage,anchor:target.dataset.tagSort!+before,animation:style.animationName};
      }));
    }
    expect(new Set(measurements.map(item=>item.anchor)).size).toBe(2);
    for(const item of measurements){expect(item.x).toBeCloseTo(mid,2);expect(item.y).toBeCloseTo(y,2);expect(item.width).toBe(3);expect(item.height).toBeCloseTo(l.height-6,2);expect(item.radius).toBe('2px');expect(item.mask).toBe('none');expect(item.animation).toBe('none');}
    await page.screenshot({path:`test-results/tag-cursor-${mobile?'phone':'desktop'}-1177.png`});
    await page.screenshot({path:`test-results/tag-cursor-${mobile?'phone':'desktop'}-detail1177.png`,clip:{x:Math.floor(mid-18),y:Math.floor(y-30),width:36,height:60}});
    if(cdp){await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else await page.mouse.up();
    await expect.poll(()=>page.evaluate(()=>(window as any).__orders.at(-1)?.slice(0,3).join(','))).toBe('测试01,已有,测试02');
    await expect(list.locator('.drop-before,.drop-after')).toHaveCount(0);
  });
  test('selection lights up without checkboxes, delete is red, and direct dragging shows insertion and persists order', async ({ page }) => {
    await seed(page);
    if (mobile) await swipe(page, { x: 365, y: 200 }, { x: 150, y: 200 });
    else await page.locator('.tag-filter-button').click();
    const dialog = page.getByRole('dialog', { name: mobile ? '标签管理' : '标签筛选', exact: true }); await expect(dialog).toBeVisible();
    if(mobile){await dialog.getByRole('button',{name:'测试01',exact:true}).click();await expect(dialog.locator('.is-management-selected')).toHaveCount(0);await expect(dialog.getByRole('button',{name:'选择',exact:true})).toBeVisible();}
    await dialog.getByRole('button', { name: '选择', exact: true }).click();
    const list = dialog.locator('.tag-sort-list'); await list.getByRole('button', { name: '测试01', exact: true }).click({force:true});
    const selected = list.locator('.is-management-selected'); await expect(selected).toHaveCount(1); await expect(selected).toHaveAttribute('aria-pressed','true'); await expect(list.locator('.tag-selection-mark')).toHaveCount(0);
    expect(await selected.evaluate(el => getComputedStyle(el).animationName)).toContain('tag-manage-wiggle');
    const deletion = dialog.getByRole('button', { name: '删除 1', exact: true });
    expect(await deletion.evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(185, 54, 89)');
    expect(await selected.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgb(185, 54, 89)');
    const source = list.locator('[data-tag-sort="测试02"]'), target = list.locator('[data-tag-sort="已有"]');
    const a = (await source.boundingBox())!, b = (await target.boundingBox())!;
    const from = { x: a.x + a.width / 2, y: a.y + a.height / 2 }, to = { x: b.x + 3, y: b.y + b.height / 2 };
    const check = async () => { await expect(list.locator('.drop-before,.drop-after')).toHaveCount(1); await page.screenshot({ path: `test-results/tags-${mobile ? 'phone' : 'desktop'}-sorting.png` }); };
    if (mobile) await swipe(page, from, to, check);
    else { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps: 12 }); await check(); await page.mouse.up(); }
    await expect.poll(() => page.evaluate(() => (window as any).__orders.at(-1)?.[0])).toBe('测试02');
    await expect(list.locator('[data-tag-sort]').first()).toHaveAttribute('data-tag-sort', '测试02');
  });
  test('quick tags move only selected existing tags between the two sections and preserve the note', async ({ page }) => {
    await seed(page);
    let outsideGlass:{background:string;filter:string}|null=null;
    if(!mobile){await page.locator('.view-options-menu > summary').click();outsideGlass=await page.locator('.view-options-popover').evaluate(el=>{const c=getComputedStyle(el);return{background:c.backgroundColor,filter:c.backdropFilter};});await page.locator('.view-options-menu > summary').click();}
    await details(page);
    if (mobile) await swipe(page, { x: 365, y: 220 }, { x: 150, y: 220 });
    else { const quick = await page.getByRole('button', { name: '快速标签', exact: true }).boundingBox(), rename = await page.getByRole('button', { name: '重命名本地文件', exact: true }).boundingBox(); expect(quick!.x + quick!.width).toBeLessThan(rename!.x); await page.getByRole('button', { name: '快速标签', exact: true }).click(); }
    const dialog = page.getByRole('dialog', { name: '快速标签', exact: true }); await expect(dialog).toBeVisible();
    if(mobile)await expect.poll(()=>dialog.evaluate(el=>Math.abs(el.getBoundingClientRect().right-innerWidth))).toBeLessThan(1);
    if(!mobile){const glass=await dialog.evaluate(el=>{const c=getComputedStyle(el);return{background:c.backgroundColor,filter:c.backdropFilter};});expect(glass).toEqual(outsideGlass);expect(glass.filter).toContain('blur(18px)');expect(await dialog.locator('.quick-tags-actions').evaluate(el=>[getComputedStyle(el).borderTopWidth,getComputedStyle(el).borderBottomWidth])).toEqual(['0px','0px']);}
    const title=await dialog.getByRole('heading',{name:'快速标签',exact:true}).boundingBox();
    for(const region of ['已有标签','可用标签']){const heading=await dialog.getByRole('heading',{name:new RegExp(region)}).boundingBox(),body=await dialog.getByRole('group',{name:region,exact:true}).boundingBox();expect(Math.abs(title!.x-heading!.x)).toBeLessThan(1);expect(Math.abs(heading!.x-body!.x)).toBeLessThan(1);}
    expect(await dialog.getByRole('group',{name:'已有标签',exact:true}).evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('0px');
    await expect(dialog.locator('.quick-tag-chevron')).toHaveCount(2);
    if(mobile){const buttons=await dialog.locator('.quick-tags-actions button').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().width)),width=await dialog.locator('.quick-tags-actions').evaluate(el=>el.clientWidth);expect(Math.abs(buttons[0]-buttons[1])).toBeLessThan(1);expect(buttons[0]+buttons[1]+12).toBeCloseTo(width,0);}
    const available = dialog.getByRole('group', { name: '可用标签', exact: true }), assigned = dialog.getByRole('group', { name: '已有标签', exact: true });
    await expect(dialog.getByRole('textbox')).toHaveCount(0); await expect(dialog.getByRole('button', { name: '加入', exact: true })).toBeDisabled();
    if(!mobile){await expect(dialog.getByRole('button',{name:'关闭快速标签',exact:true})).toHaveCount(0);expect(await available.getByRole('button',{name:'测试01',exact:true}).evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('1px');expect(await dialog.locator('.quick-tags-actions button').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(13);}
    else{expect((await available.getByRole('button',{name:'测试01',exact:true}).boundingBox())!.height).toBeLessThanOrEqual(36);}
    const add=dialog.getByRole('button',{name:'加入 1',exact:true}), idleFill=await dialog.locator('.quick-tags-actions button').first().evaluate(el=>getComputedStyle(el).backgroundColor);
    await available.getByRole('button', { name: '测试01', exact: true }).click();
    if(mobile)expect(await add.evaluate(el=>getComputedStyle(el).backgroundColor)).not.toBe(idleFill);
    await page.evaluate(()=>(window as any).__tagSaveDelay=1200);await add.click();
    await expect(add).toHaveAttribute('aria-disabled','true');
    const waiting=available.getByRole('button',{name:'测试02',exact:true});expect(await waiting.evaluate(el=>(el as HTMLButtonElement).disabled)).toBe(false);expect(await waiting.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
    if(!mobile)expect(await add.evaluate(el=>el===document.activeElement)).toBe(true);
    await expect(assigned.getByRole('button', { name: '测试01', exact: true })).toBeVisible(); await expect(available.getByRole('button', { name: '测试01', exact: true })).toHaveCount(0);
    await assigned.getByRole('button', { name: '已有', exact: true }).click(); await dialog.getByRole('button', { name: '移出 1', exact: true }).click();
    await expect(available.getByRole('button', { name: '已有', exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as any).__tagData.resourceMeta['folder:/comics/Book'])).toMatchObject({ tags: ['测试01'], note: '保留简介' });
    await page.screenshot({ path: `test-results/tags-${mobile ? 'phone' : 'desktop'}-quick.png` });
  });
  test('data management exports and previews an import with pairing and explicit conflict options', async ({ page }) => {
    await seed(page); if (mobile) {await page.getByRole('button',{name:'显示选项',exact:true}).click();await page.getByRole('button',{name:/应用设置/}).click();} else await page.getByRole('button', { name: '设置', exact: true }).click();
    if (mobile) await page.getByRole('button', { name: /安全与备份/ }).click(); else await page.getByRole('tab', { name: /安全与备份/ }).click();
    await expect(page.locator('.data-backup-row')).toHaveCount(2);await expect(page.locator('.data-backup-row').first()).toContainText('导出阅读进度、收藏、书签、书架、标签、备注和设置。');await expect(page.locator('.data-backup-row').last()).toContainText('导入OmiComic数据');
    const rows=await page.locator('.data-backup-row').evaluateAll(els=>els.map(el=>{const b=el.querySelector('button')!.getBoundingClientRect(),s=el.querySelector('span')!.getBoundingClientRect();return {x:b.x,right:b.right,top:b.top,textX:s.x,font:getComputedStyle(el).fontSize};}));expect(rows[0].x).toBeCloseTo(rows[1].x);expect(rows[1].top).toBeGreaterThan(rows[0].top+30);expect(rows.every(row=>row.textX>row.right)).toBe(true);expect(rows[0].font).toBe(await page.locator(mobile?'.mobile-settings-body .settings-toggle':'#settings-section-safety .settings-toggle').first().evaluate(el=>getComputedStyle(el).fontSize));
    await page.getByRole('button', { name: '导出数据', exact: true }).click(); await expect(page.getByRole('status')).toContainText('数据备份已导出');
    await page.getByRole('button', { name: '导入数据', exact: true }).click(); await expect(page.getByRole('region', { name: '导入预览' })).toBeVisible();
    await page.getByRole('button', { name: '选择目录', exact: true }).click(); await expect(page.locator('.data-root-mapping')).toContainText('D:\\漫画');
    await page.getByRole('button', { name: '确认导入', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('模拟写入失败');
    expect(await page.evaluate(() => (window as any).__importOptions[0])).toEqual({ mode: 'merge', prefer: 'local', includeSettings: false, mappings: [{ from: '/comics', to: 'D:\\漫画' }] });
    if(mobile){const panel=page.locator('.data-import-preview .data-management-actions'),buttons=await panel.locator('button').evaluateAll(elements=>elements.map(el=>el.getBoundingClientRect().width));expect(Math.abs(buttons[0]-buttons[1])).toBeLessThan(1);expect(buttons[0]+buttons[1]+10).toBeCloseTo(await panel.evaluate(el=>el.clientWidth),0);}
    await page.getByRole('button',{name:'导入数据',exact:true}).click();await page.getByRole('button',{name:'选择目录',exact:true}).click();
    await page.screenshot({ path: `test-results/data-${mobile ? 'phone' : 'desktop'}-preview.png` });
  });
});

test('desktop folder reentry and a detail return both preserve the list position', async ({page})=>{
  await page.addInitScript(installMock,{count:180});
  await page.addInitScript(async()=>{
    const api=window.omicomic,result=await api.getAppData();if(!result.ok)throw Error();result.data.settings.showHomePage=false;
    const original=api.listDirectory;api.listDirectory=async path=>path==='/comics/Parent'?{ok:true,data:{path,parentPath:'/comics',items:Array.from({length:180},(_,i)=>({id:path+'/Image'+i+'.png',path:path+'/Image'+i+'.png',name:'Image'+i+'.png',type:'image',extension:'png',size:68,modifiedAt:0})),total:180}}:original(path);
  });
  await page.goto('/');
  const parent=page.locator('.resource-card').filter({has:page.locator('strong',{hasText:/^Parent$/})});
  await parent.dblclick();await expect(page.locator('.directory-title')).toHaveCount(0);await expect(page.locator('.resource-card strong').first()).toContainText('Image');
  const next=page.getByRole('button',{name:'下一页',exact:true});await next.click();
  const panel=page.locator('.resource-list-scroll[aria-label="当前目录文件列表"]');await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeGreaterThan(100);
  const scrolled=await panel.evaluate(el=>el.scrollTop);await page.locator('.resource-card').first().getByRole('button',{name:'打开资源信息',exact:true}).evaluate(el=>(el as HTMLButtonElement).click());
  await page.getByRole('button',{name:'返回资源列表',exact:true}).click();await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeCloseTo(scrolled,0);
  await page.getByRole('button',{name:'返回',exact:true}).click();await expect(parent).toBeVisible();await parent.dblclick();
  await expect(page.locator('.resource-card strong').first()).toContainText('Image');await expect.poll(()=>panel.evaluate(el=>el.scrollTop)).toBeCloseTo(scrolled,0);await expect(page.getByRole('button',{name:'上一页',exact:true})).toBeEnabled();
});

test.describe('phone interaction corrections',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('compact menus retain only their controls and tag dismissal never restores the closing input',async({page})=>{
    await seed(page);await page.getByRole('button',{name:'显示选项',exact:true}).click();
    const display=page.getByRole('dialog',{name:'显示选项',exact:true});await expect(display.locator('.mobile-sheet-heading')).toHaveCount(0);await expect(display).not.toContainText('仅调整');await expect(display.getByRole('slider',{name:'网格列数',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');await expect(display).toHaveCount(0);await details(page);
    await page.getByRole('button',{name:'详情操作',exact:true}).click();const menu=page.getByRole('dialog',{name:'漫画操作',exact:true});await expect(menu.locator('.mobile-sheet-heading')).toHaveCount(0);await expect(menu.getByRole('button')).toHaveCount(2);await expect(menu.getByRole('button',{name:'重命名',exact:true})).toBeVisible();await expect(menu.getByRole('button',{name:'删除',exact:true})).toBeVisible();await expect(menu.locator('.mobile-sheet-handle')).toBeVisible();expect(await menu.getByRole('button',{name:'重命名',exact:true}).evaluate(el=>getComputedStyle(el).borderTopWidth)).toBe('0px');await expect.poll(()=>menu.evaluate(el=>el.style.willChange)).not.toBe('transform');await page.screenshot({path:'test-results/phone-detail-actions-clean1177.png'});
    await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);
    await page.getByRole('button',{name:'添加标签',exact:true}).click();const input=page.getByRole('textbox',{name:'新标签',exact:true});await input.click();await input.fill('测');
    await page.evaluate(()=>{(window as any).__closingTagFocus=0;document.querySelector<HTMLInputElement>('.mobile-tag-add-form input')!.addEventListener('focus',()=>{(window as any).__closingTagFocus++;});});
    await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'添加标签',exact:true})).toHaveCount(0);expect(await page.evaluate(()=>(window as any).__closingTagFocus)).toBe(0);
    expect(await page.evaluate(()=>document.activeElement?.matches('input,textarea'))).toBe(false);
  });
  test('mobile global and information sizes save independently and the home switch follows them',async({page})=>{
    await seed(page);await page.getByRole('button',{name:'显示选项',exact:true}).click();await page.getByRole('button',{name:/应用设置/}).click();await page.getByRole('button',{name:/外观与主题/}).click();
    const global=page.getByRole('spinbutton',{name:'全局字号',exact:true}),info=page.getByRole('spinbutton',{name:'页码与信息字号',exact:true});
    await expect(global).toHaveValue('14');await expect(info).toHaveValue('12');
    const positions=await page.locator('.mobile-settings-body').evaluate(el=>['全局字号','页码与信息字号','显示主界面'].map(name=>[...el.querySelectorAll('.settings-row,.settings-toggle')].find(row=>row.querySelector('span')?.textContent===name)!.getBoundingClientRect().top));expect(positions[0]).toBeLessThan(positions[1]);expect(positions[1]).toBeLessThan(positions[2]);
    await page.getByRole('button',{name:'增大全局字号',exact:true}).click();await page.getByRole('button',{name:'增大页码与信息字号',exact:true}).click();await expect(global).toHaveValue('15');await expect(info).toHaveValue('13');
    expect(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--desktop-font-scale').trim())).toBe(String(15/14));
    expect(await page.evaluate(()=>(window as any).__tagData.settings)).toMatchObject({mobileGlobalFontSize:15,mobileInfoFontSize:13});
    await page.locator('.mobile-settings-page').evaluate(el=>{el.style.fontFamily='cursive';});
    for(const width of [390,320]){await page.setViewportSize({width,height:844});expect(await global.evaluate(el=>el.getBoundingClientRect().right)).toBeLessThanOrEqual(width-10);for(const name of ['全局字号','页码与信息字号']){const boxes=await page.getByRole('group',{name,exact:true}).locator('button,input').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect();return{width:r.width,height:r.height,top:r.top};}));expect(boxes).toHaveLength(3);for(const box of boxes){expect(box.width).toBe(40);expect(box.height).toBe(40);expect(box.top).toBeCloseTo(boxes[0].top,2);}}}

    await page.screenshot({path:'test-results/phone-font-sizes1177.png'});
  });
  test('both left drawers repeatedly reorder when a hold starts on a nested button',async({page})=>{
    await seed(page,true);
    for(const shelf of [false,true]){
      if(shelf)await page.locator('.sidebar-primary-nav').getByRole('button',{name:/书架/}).click();
      await page.getByRole('button',{name:shelf?'书架分类':'资源库目录',exact:true}).click();
      const dialog=page.getByRole('dialog',{name:shelf?'书架分类':'资源库',exact:true});await expect(dialog).toBeVisible();await expect.poll(()=>dialog.evaluate(el=>Math.abs(el.getBoundingClientRect().left))).toBeLessThan(1);
      const rows=dialog.locator('[data-reorder-key]'),cdp=await page.context().newCDPSession(page);
      for(let trial=0;trial<3;trial++){
        const source=rows.first(),target=rows.nth(2),key=await source.getAttribute('data-reorder-key'),a=(await source.locator('button').filter({visible:true}).first().boundingBox())!,b=(await target.boundingBox())!;
        const from={x:a.x+a.width/2,y:a.y+a.height/2},to={x:from.x,y:b.y+b.height/2};
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});await page.waitForTimeout(480);await expect(source).toHaveClass(/is-dragging/);
        for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:to.x,y:from.y+(to.y-from.y)*i/10}]});await page.waitForTimeout(16);}
        await expect(source).toHaveClass(/is-dragging/);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect.poll(()=>rows.last().getAttribute('data-reorder-key')).toBe(key);
        await expect(dialog).toBeVisible();
      }
      await cdp.detach();await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
    }
  });
});
