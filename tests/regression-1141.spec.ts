import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function setup(page: Page, mobile = false) {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(installMock, { count: 8 });
  await page.addInitScript(() => {
    const api = window.omicomic, state = (window as any).__regression = { scans: 0, covers: 0, cancellations: 0, booksOnly: [] as boolean[] };
    const item = (path: string, type: 'folder'|'archive') => ({ id: path, path, name: path.split('/').at(-1)!, type, extension: type === 'archive' ? 'cbz' : '' });
    const tree: Record<string, ReturnType<typeof item>[]> = {
      '/comics': [item('/comics/Artists','folder'),item('/comics/Other','folder')],
      '/comics/Artists': [item('/comics/Artists/Volumes','folder')],
      '/comics/Artists/Volumes': [item('/comics/Artists/Volumes/Series','folder')],
      '/comics/Artists/Volumes/Series': [item('/comics/Artists/Volumes/Series/Target JK：特别篇.cbz','archive')],
      '/comics/Other': [item('/comics/Other/Unrelated.cbz','archive')],
    };
    api.listDirectory = async path => {
      await new Promise(resolve => setTimeout(resolve,15));
      const items=tree[path]??[];return {ok:true,data:{path,parentPath:path==='/comics'?null:path.slice(0,path.lastIndexOf('/')),items,total:items.length}};
    };
    api.scanLibrary = async (_path,_refresh,booksOnly) => {
      state.scans++;state.booksOnly.push(Boolean(booksOnly));await new Promise(resolve=>setTimeout(resolve,100));
      const items=Object.values(tree).flat().filter(item=>!booksOnly||item.type==='archive');
      return {ok:true,data:{items,directories:5,skipped:0,scannedAt:Date.now()}};
    };
    api.cancelLibraryScan=()=>{state.cancellations++;};
    const originalCover=api.getThumbnail;
    api.getThumbnail=async request=>{state.covers++;await new Promise(resolve=>setTimeout(resolve,10));const result=await originalCover(request);return result.ok?{...result,data:{...result.data,itemCount:7,folderSummary:{folders:3,books:2,images:2}}}:result;};
    api.getResourcePages=async({path,type})=>{
      if(type==='folder'||!path.endsWith('.cbz'))return {ok:false,error:{code:'NO_IMAGES',message:'未在该文件夹中找到可阅读图片。'}};
      return {ok:true,data:{key:'archive:'+path,resourceKey:'archive:'+path,sourcePath:path,sourceType:'archive',title:'Target',total:8,pages:Array.from({length:8},(_,index)=>({index,name:index+'.png',sourcePath:path,type:'archive-image',archiveInnerPath:index+'.png'}))}};
    };
  });
  await page.goto('/');
  if(mobile)await page.evaluate(()=>{document.documentElement.dataset.platform='android';});
  await page.getByRole('button',{name:'打开资源库',exact:true}).click();
  await expect(page.locator('.resource-card')).toHaveCount(2);
}

async function back(page:Page) { await page.evaluate(()=>window.dispatchEvent(new Event('omi-back',{cancelable:true}))); }
async function openFolder(page:Page,name:string,mobile:boolean) {
  const card=page.locator('.resource-card').filter({hasText:name}).first();
  if(mobile)await card.click();else await card.dblclick();
}

test('ordinary browsing starts covers without an unsolicited library inventory',async({page})=>{
  await setup(page);
  await expect.poll(()=>page.evaluate(()=>(window as any).__regression.covers)).toBeGreaterThan(0);
  await page.waitForTimeout(1500); // Explicitly cross the removed 1200 ms prewarm trigger.
  expect(await page.evaluate(()=>(window as any).__regression.scans)).toBe(0);
  await expect(page.locator('.resource-card-meta').first()).toHaveText('7 项');
  await expect(page.locator('.resource-card-meta').first()).not.toContainText('文档');
});

test('desktop clears with SVG; first Escape blurs, second clears, neither navigates folders',async({page})=>{
  await setup(page);
  const input=page.getByRole('textbox',{name:'搜索当前资源库',exact:true});
  await input.fill('Target');
  await expect(page.locator('.resource-card')).toHaveCount(1);
  await expect(page.locator('.resource-card').first()).toContainText('Target JK');
  await expect(page.locator('.search-clear-button svg')).toHaveCount(1);
  await expect(page.locator('.search-clear-button')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await page.keyboard.press('Escape');await expect(input).not.toBeFocused();await expect(input).toHaveValue('Target');
  await page.keyboard.press('Escape');await expect(input).toHaveValue('');
  await expect(page.locator('.resource-card')).toHaveCount(2);
});

test('wide desktop keeps inline navigation; compact floats above cards with visible labels and no rail gutter',async({page})=>{
  await setup(page);
  await page.evaluate(async()=>{
    const api=window.omicomic,original=api.listDirectory;
    api.listDirectory=async path=>{const r=await original(path);if(r.ok&&path==='/comics')r.data.items=Array.from({length:120},(_,i)=>({id:'/comics/F'+i,path:'/comics/F'+i,name:'F'+i,type:'folder',extension:''}));return r;};
  });
  await page.getByRole('button',{name:'刷新并检测失效资源',exact:true}).click();
  await expect(page.locator('.desktop-inline-page-navigation').first()).toBeVisible();
  await expect(page.locator('.desktop-library-float')).toBeHidden();
  await page.setViewportSize({width:1000,height:800});
  await expect(page.locator('.desktop-library-float')).toBeVisible();
  await expect(page.locator('.desktop-library-float button').first().locator('span')).toHaveText('顶部');
  expect(await page.locator('.resource-list-scroll').evaluate(element=>parseFloat(getComputedStyle(element).paddingRight))).toBeLessThan(30);
  await page.screenshot({path:'test-results/regression-1141-compact.png'});
});

test('root/sort menus retain glass while the view popover remains readable',async({page})=>{
  await setup(page);
  await page.getByRole('button',{name:'切换资源目录',exact:true}).click();
  const root=await page.locator('.root-library-options').evaluate(element=>getComputedStyle(element).backgroundColor);
  expect(root).toContain('0.78');
  await page.getByRole('button',{name:'切换资源目录',exact:true}).click();
  await page.getByRole('combobox',{name:'排序方式',exact:true}).click();
  expect(await page.getByRole('listbox').evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(root);
  await page.keyboard.press('Escape');await page.locator('.view-options-menu summary').click();
  expect(await page.locator('.view-options-popover').evaluate(element=>getComputedStyle(element).backgroundColor)).toBe(root);
});

for (const mobile of [false, true]) test.describe(mobile ? 'Android search sessions' : 'PC search sessions', () => {
  test.use(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } : { viewport: { width: 1440, height: 960 } });
  test('files penetrate directly, reading returns to the same search, and folders match their own names', async ({ page }) => {
    await setup(page, mobile);
    if (mobile) await page.getByRole('button', { name: '搜索', exact: true }).click();
    const input = mobile ? page.getByRole('searchbox') : page.getByRole('textbox', { name: '搜索当前资源库', exact: true });
    await input.fill('Target');
    await expect(page.locator('.resource-card')).toHaveCount(1);
    await expect(page.locator('.resource-card')).toContainText('Target JK');
    await openFolder(page, 'Target JK', mobile);
    await expect(page.locator('.reader-layout')).toBeVisible();
    await back(page); await expect(input).toHaveValue('Target');
    await input.fill('Artists');
    await expect(page.locator('.resource-card')).toHaveCount(2); // own folder + file path; never Volumes/Series
    await expect(page.locator('.resource-card').first()).toContainText('Artists');
    await expect(page.locator('.resource-card').last()).toContainText('Target JK');
    await input.fill('Volumes');
    await expect(page.locator('.resource-card').filter({hasText:/^Volumes/})).toHaveCount(1);
  });
  test('folder entry suspends search, nested Back walks directories, then restores search without focus', async ({ page }) => {
    await setup(page, mobile);
    if (mobile) await page.getByRole('button', { name: '搜索', exact: true }).click();
    const input = mobile ? page.getByRole('searchbox') : page.getByRole('textbox', { name: '搜索当前资源库', exact: true });
    await input.fill('Artists');
    await openFolder(page, 'Artists', mobile);
    await expect(page.locator('.resource-card')).toHaveCount(1);
    await expect(page.locator('.resource-card')).toContainText('Volumes');
    if (mobile) await expect(input).toHaveCount(0); else await expect(input).toHaveValue('');
    await openFolder(page, 'Volumes', mobile); await expect(page.locator('.resource-card')).toContainText('Series');
    if (mobile) await back(page); else await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page.locator('.resource-card')).toContainText('Volumes');
    if (mobile) await back(page); else await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(input).toHaveValue('Artists'); await expect(input).not.toBeFocused();
    await expect(page.locator('.resource-card').first()).toContainText('Artists');
    if (!mobile) {
      await page.getByRole('button', { name: '前进', exact: true }).click();
      await expect(input).toHaveValue(''); await expect(page.locator('.resource-card')).toContainText('Volumes');
    }
    await page.locator('.sidebar-primary-nav').getByRole('button', { name: /^资源库/ }).dispatchEvent('click');
    await expect(page.locator('.resource-card')).toHaveCount(2);
    if (mobile) await expect(input).toHaveCount(0); else await expect(input).toHaveValue('');
  });
  if (mobile) {
    test('keyboard hide keeps the search; the next Back exits it, and the single cross clears then closes', async ({ page }) => {
      await setup(page, true); await page.getByRole('button', { name: '搜索', exact: true }).click();
      const input = page.getByRole('searchbox'); await input.fill('Target');
      await page.evaluate(() => window.dispatchEvent(new Event('omi-keyboard-hidden')));
      await expect(input).toHaveValue('Target'); await expect(input).not.toBeFocused();
      await expect(page.locator('.resource-card')).toContainText('Target JK');
      await back(page); await expect(input).toHaveCount(0); await expect(page.locator('.resource-card')).toHaveCount(2);
      await page.getByRole('button', { name: '搜索', exact: true }).click(); await input.fill('Target');
      await page.getByRole('button', { name: '清空搜索', exact: true }).click(); await expect(input).toHaveValue('');
      await page.getByRole('button', { name: '关闭搜索', exact: true }).click(); await expect(input).toHaveCount(0);
      expect(await page.evaluate(() => (window as any).__regression.cancellations)).toBe(0);
    });
    test('random shares the base catalog and the mobile redraw stays readable text', async ({ page }) => {
      await setup(page, true); await page.getByRole('button', { name: '显示选项', exact: true }).click();
      await page.getByRole('switch', { name: '随机阅读', exact: true }).click();
      await page.getByRole('button', { name: '关闭显示选项', exact: true }).click();
      const button = page.getByRole('button', { name: '重随机', exact: true }); await expect(button).toBeEnabled();
      await expect(button).toHaveText('重随机'); await expect(button.locator('svg')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => (window as any).__regression.scans)).toBe(1);
      const before = await page.evaluate(() => (window as any).__regression.scans);
      await button.click(); expect(await page.evaluate(() => (window as any).__regression.scans)).toBe(before);
      expect(await page.evaluate(() => (window as any).__regression.booksOnly)).toEqual([false]);
    });
  }
});
