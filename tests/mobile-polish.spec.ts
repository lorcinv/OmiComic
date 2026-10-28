import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function setup(page:Page,count=12) {
  await page.addInitScript(installMock,{count});
  await page.addInitScript(() => {
    const api=window.omicomic, original=api.getAppData; let saved:any;
    api.getAppData=async()=>{if(saved)return {ok:true,data:saved};const result=await original();if(result.ok){saved=result.data;const book={resourceKey:'folder:/comics/Book',sourcePath:'/comics/Book',sourceType:'folder',title:'Book',tags:['科幻','彩色'],note:'夜空',addedAt:1,createdAt:1,updatedAt:1,sortIndex:0};saved.favorites=[book];saved.bookmarks=[{...book,id:'mark',pageIndex:2,pageName:'00000003.png',totalPages:12}];saved.bookshelves=[{id:'cat',name:'我的分类',sortIndex:0,createdAt:1,updatedAt:1}];saved.virtualFolders=['我的第一座漫画书架','长标题也应完整显示的第二座书架'].map((name,i)=>({id:'shelf'+i,bookshelfId:'cat',name,items:[{...book,id:'item',folderId:'shelf'+i}],tags:[],note:'',sortIndex:i,createdAt:1,updatedAt:1}));saved.resourceMeta[book.resourceKey]=book;}return result;};
    api.getBookmarks=async()=>({ok:true,data:(await api.getAppData() as any).data.bookmarks});
    api.getFavorites=async()=>({ok:true,data:(await api.getAppData() as any).data.favorites});
    api.getBookmarkPagePreview=async()=>{(window as any).__bookmarkPreviews=((window as any).__bookmarkPreviews??0)+1;const image=await api.getPageImage({} as any);return {ok:true,data:{dataUrl:image.ok?image.data.url:''}} as any;};
    api.updateBookmarkMeta=async(id,input)=>{const item=saved.bookmarks.find((v:any)=>v.id===id);Object.assign(item,input);return {ok:true,data:item};};
    api.updateBookshelf=async(input:any)=>{Object.assign(saved.bookshelves[0],input);return {ok:true,data:saved.bookshelves[0]};};
    (window as any).__localChanges=[];api.changeLocalResource=async(input)=>{(window as any).__localChanges.push(input);return {ok:true,data:{appData:saved,newPath:null}};};
  });
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect(page.getByRole('button',{name:'打开资源库',exact:true})).toBeVisible({timeout:20000});
}
const back=(page:Page)=>page.evaluate(()=>window.dispatchEvent(new Event('omi-back')));
async function library(page:Page){await page.getByRole('button',{name:'打开资源库',exact:true}).click();await expect(page.locator('.mobile-resource-card').first()).toBeVisible({timeout:15000});}

test.describe('phone polish',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  test('backdrops consume taps, nested drawer dialogs keep the drawer, details scroll',async({page})=>{
    await setup(page);await page.evaluate(()=>document.documentElement.dataset.platform='android');await library(page);
    const book=page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})});
    await page.getByRole('button',{name:'显示选项'}).click();
    await page.locator('.mobile-sheet-overlay').click({position:{x:180,y:100}});
    await expect(page.locator('.mobile-sheet-overlay')).toHaveCount(0);await expect(page.locator('.reader-layout')).toHaveCount(0);
    await book.getByRole('button',{name:'打开资源信息'}).click();
    await expect(page.getByRole('button',{name:'路径',exact:true})).toBeHidden();
    await expect(page.locator('.resource-detail-kicker')).toBeHidden();
    const cover=(await page.locator('.resource-detail-cover').boundingBox())!,read=(await page.locator('.resource-detail-read-button').boundingBox())!;
    expect(cover.width).toBe(162);expect(Math.abs(cover.y+cover.height-read.y-read.height)).toBeLessThan(2);
    await page.screenshot({path:'test-results/polish-detail.png'});
    await page.locator('.resource-detail-page').evaluate(el=>el.scrollTop=220);
    expect((await page.locator('.mobile-detail-toolbar').boundingBox())!.y).toBeLessThan(0);
    await back(page);await page.getByRole('button',{name:'书架',exact:true}).click();
    await page.getByRole('button',{name:'书架分类',exact:true}).click();
    await page.getByRole('button',{name:'管理分类 我的分类'}).click();
    await page.getByRole('button',{name:'重命名分类',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'书架分类',exact:true})).toBeVisible();
    await expect(page.locator('.root-delete-overlay')).toBeVisible();
    await back(page);await expect(page.locator('.root-delete-overlay')).toHaveCount(0);await expect(page.getByRole('dialog',{name:'书架分类',exact:true})).toBeVisible();await back(page);
  });
  test('bookmark covers, index rename, SVG actions, settings and mixed search',async({page})=>{
    await setup(page);await page.evaluate(()=>document.documentElement.dataset.platform='android');await library(page);
    await page.getByRole('button',{name:'书签',exact:true}).click();const card=page.locator('.mobile-resource-card').first();
    await expect(card.locator('img')).toBeVisible();expect(await page.evaluate(()=>(window as any).__bookmarkPreviews)).toBe(1);
    await card.dispatchEvent('contextmenu');await expect(page.getByRole('button',{name:'重命名书签',exact:true})).toBeVisible();
    await page.screenshot({path:'test-results/polish-actions.png'});
    await page.getByRole('button',{name:'重命名书签',exact:true}).click();await page.getByRole('textbox',{name:'书签名称'}).fill('月光书签');await page.getByRole('button',{name:'保存',exact:true}).click();
    await expect(card).toContainText('月光书签');expect(await page.evaluate(()=>(window as any).__localChanges)).toEqual([]);
    // Long press keeps the card selected after editing; leave that mode before
    // using the normal tabs (the selection controls intentionally cover them).
    await back(page);await expect(card.getByRole('checkbox')).toHaveCount(0);
    await page.getByRole('button',{name:'收藏',exact:true}).click();await page.getByRole('button',{name:'书签',exact:true}).click();await expect(card.locator('img')).toBeVisible();expect(await page.evaluate(()=>(window as any).__bookmarkPreviews)).toBe(1);
    await page.getByRole('button',{name:'资源库',exact:true}).click();await page.getByRole('button',{name:'搜索',exact:true}).click();await page.getByRole('searchbox').fill('Book，科幻，夜空');await expect(page.locator('.mobile-resource-card')).toHaveCount(1);await back(page);await expect(page.getByRole('searchbox')).toHaveCount(0);
    await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:/应用设置/}).click();
    await expect(page.locator('.mobile-setting-category')).toHaveCount(7);await page.getByRole('button',{name:/外观与主题/}).click();await page.getByRole('slider',{name:'缩略预览行宽'}).fill('120');await back(page);await page.getByRole('button',{name:/性能与缓存/}).click();await expect(page.getByRole('slider',{name:'阅读图片内存缓存'})).toBeVisible();await back(page);await page.screenshot({path:'test-results/polish-settings.png'});await back(page);
  });
  test('shelf grid and list have readable labels and bottom actions',async({page})=>{
    await setup(page);await library(page);await page.getByRole('button',{name:'书架',exact:true}).click();
    const shelf=page.locator('.mobile-bookshelf-card').first();await expect(shelf).toBeVisible();await page.screenshot({path:'test-results/polish-shelf-grid.png'});
    expect((await shelf.boundingBox())!.width).toBeGreaterThan(150);
    await page.getByRole('button',{name:'切换列表卡片'}).click();await page.screenshot({path:'test-results/polish-shelf-list.png'});
    expect((await shelf.boundingBox())!.width).toBeGreaterThan(340);
    await shelf.dispatchEvent('contextmenu');await expect(page.getByRole('button',{name:'重置封面',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'置顶',exact:true})).toBeVisible();await back(page);
    await shelf.click();await expect(page.locator('.mobile-resource-card')).toHaveCount(1);await page.getByRole('button',{name:'书架',exact:true}).click();await expect(page.locator('.mobile-bookshelf-card')).toHaveCount(2);
  });
  test('compact rail, fit window, retained virtual filmstrip and direct panorama scrubbing',async({page})=>{
    await setup(page);await page.evaluate(()=>{document.documentElement.dataset.platform='android'; window.omicomic.getReadingProgress=async()=>({ok:true,data:{readerViewState:{fitMode:'fit-height',pageMode:'single',flow:'horizontal',panorama:false},currentPageIndex:0} as any});});await library(page);await page.locator('.mobile-resource-card').filter({has:page.getByText('Book',{exact:true})}).click();
    await expect(page.locator('.reader-page-spread .reader-page-frame:not([aria-hidden]) img')).toBeVisible();await page.locator('.reader-stage').tap();await page.getByRole('button',{name:'阅读设置',exact:true}).click();
    await expect(page.getByRole('combobox',{name:'缩放方式'})).toContainText('适应窗口');
    await expect(page.getByRole('slider',{name:'全景音量键翻页间隔'})).toHaveValue('1');await back(page);
    expect((await page.locator('.reader-footer').boundingBox())!.height).toBe((await page.locator('.reader-toolbar').boundingBox())!.height);
    const rail=page.getByRole('slider',{name:'阅读进度'}),r=(await rail.boundingBox())!;
    await page.mouse.move(r.x+3,r.y+22);await page.mouse.down();await page.mouse.move(r.x+r.width*.6,r.y+22,{steps:8});await page.mouse.up();
    await expect(page.locator('.mobile-reader-previews')).toBeVisible();await expect(page.locator('.mobile-reader-current')).toHaveText('8');await expect(page.locator('.mobile-reader-total')).toHaveText('12');
    await page.screenshot({path:'test-results/polish-reader-preview.png'});await page.locator('.mobile-filmstrip-page').filter({has:page.getByRole('button',{name:/第 6 页/})}).click();await expect(rail).toHaveAttribute('aria-valuenow','6');
    await back(page);await expect(page.locator('.mobile-reader-previews')).toHaveCount(0);await expect(page.locator('.reader-layout')).toBeVisible();
  });
  test('continuous list has floating landmarks and configurable page size',async({page})=>{
    await setup(page,120);await library(page);const pill=page.getByRole('navigation',{name:'列表页码'});await expect(pill).toContainText('1 / 3');await expect(page.locator('.pagination-bar')).toHaveCount(0);
    await page.getByRole('button',{name:'下一页资源'}).click();await expect(pill).toContainText('2 / 3');
    await page.getByRole('button',{name:'资源库',exact:true}).click();await expect(pill).toContainText('1 / 3');
    await page.getByRole('button',{name:'显示选项'}).click();await page.getByRole('button',{name:/应用设置/}).click();await page.locator('.mobile-setting-category').filter({hasText:'资源库'}).click();await page.getByRole('combobox',{name:'每页数量',exact:true}).click();await expect(page.getByRole('option',{name:'500',exact:true})).toBeVisible();await page.getByRole('option',{name:'100',exact:true}).click();await back(page);await back(page);await expect(pill).toContainText('1 / 2');await page.screenshot({path:'test-results/polish-page-pill.png'});
  });
});

test('PC bubble uses page ordinals and appears near the thumb only',async({page})=>{
  await setup(page);await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();await expect(page.locator('.reader-page-spread .reader-page-frame:not([aria-hidden]) img')).toBeVisible();
  const rail=page.getByRole('slider',{name:'阅读进度'}),r=(await rail.boundingBox())!;
  await page.mouse.move(r.x+r.width*.6,r.y+r.height/2);await expect(page.locator('.reader-progress-label')).toHaveCount(0);
  await page.mouse.move(r.x+2,r.y+r.height/2);await expect(page.locator('.reader-progress-label')).toHaveText('1');
  const theme=await page.evaluate(()=>{const swatch=document.createElement('i');swatch.style.cssText='background:color-mix(in srgb,var(--面板色) 92%,transparent);color:var(--主文字)';document.body.append(swatch);const s=getComputedStyle(swatch),value={background:s.backgroundColor,text:s.color};swatch.remove();return value;});
  await expect(page.locator('.reader-progress-label')).toHaveCSS('background-color',theme.background);
  await expect(page.locator('.reader-progress-label')).toHaveCSS('color',theme.text);
  await page.mouse.move(600,300);await expect(page.locator('.reader-progress-label')).toHaveCount(0,{timeout:2200});
});

for(const mobile of [false,true]) test.describe(mobile?'phone panorama gestures':'PC panorama gestures',()=>{
  test.use({viewport:mobile?{width:390,height:844}:{width:1440,height:960},isMobile:mobile,hasTouch:mobile});
  test('rail drag is continuous while rail click alone creates the jump animation',async({page})=>{
    await setup(page);await page.emulateMedia({reducedMotion:'no-preference'});await page.getByRole('button',{name:'继续上次阅读',exact:true}).click();
    await expect(page.locator('.reader-page-spread .reader-page-frame:not([aria-hidden]) img')).toBeVisible();
    if(mobile){await page.locator('.reader-stage').tap();await page.getByRole('button',{name:'阅读设置',exact:true}).click();}
    await page.getByRole('button',{name:'开启全景连环画'}).click();if(mobile){await back(page);await expect(page.locator('.mobile-sheet')).toHaveCount(0);}
    await expect(page.locator('.reader-stage')).toHaveClass(/is-panorama/);
    await page.evaluate(()=>{(window as any).__ghosts=0;new MutationObserver(records=>{for(const r of records)for(const n of r.addedNodes)if(n instanceof HTMLElement&&n.matches('.reader-panorama-jump-ghost'))(window as any).__ghosts++;}).observe(document.querySelector('.reader-stage')!,{childList:true});});
    const rail=page.getByRole('slider',{name:'阅读进度'}),r=(await rail.boundingBox())!,spread=page.locator('.reader-page-spread');
    await page.mouse.move(r.x+2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width*.41,r.y+r.height/2,{steps:9});
    await expect(rail).toHaveAttribute('aria-valuenow','6');const first=await spread.evaluate(el=>getComputedStyle(el).transform);
    await page.mouse.move(r.x+r.width*.425,r.y+r.height/2);await expect(rail).toHaveAttribute('aria-valuenow','6');
    expect(await spread.evaluate(el=>getComputedStyle(el).transform)).not.toBe(first);expect(await page.evaluate(()=>(window as any).__ghosts)).toBe(0);await page.mouse.up();
    if(mobile){await expect(page.locator('.mobile-reader-previews')).toBeVisible();const film=page.locator('.mobile-reader-filmstrip');await film.dispatchEvent('pointerdown');await film.evaluate(el=>el.scrollLeft=2*96);await expect(rail).toHaveAttribute('aria-valuenow','3');await film.dispatchEvent('pointerup');await back(page);}
    await page.mouse.click(r.x+r.width*.8,r.y+r.height/2);await expect.poll(()=>page.evaluate(()=>(window as any).__ghosts)).toBeGreaterThan(0);await expect(rail).toHaveAttribute('aria-valuenow','10');
  });
});

test('PC bookmark rename retains the resource and source line stays hidden',async({page})=>{
  await setup(page);await page.getByRole('button',{name:'打开资源库',exact:true}).click();await page.getByRole('button',{name:/^书签/}).click();
  const card=page.locator('.bookmark-card').first();await expect(card).toBeVisible();await expect(card.locator('.bookmark-card-source')).toBeHidden();
  await card.click({button:'right'});await page.getByRole('menuitem',{name:'重命名书签'}).click();await page.getByRole('textbox',{name:'书签名称'}).fill('PC 阅读标记');await page.getByRole('button',{name:'保存',exact:true}).click();await expect(card).toContainText('PC 阅读标记');expect(await page.evaluate(()=>(window as any).__localChanges)).toEqual([]);
  await page.getByRole('button',{name:/^收藏/}).first().click();await page.locator('.recent-resource-list .resource-card').first().click({button:'right'});await expect(page.getByRole('menuitem',{name:'重命名本地文件'})).toBeVisible();await page.keyboard.press('Escape');
});
