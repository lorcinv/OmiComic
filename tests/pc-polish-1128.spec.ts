import { test, expect, type Page, type Locator } from '@playwright/test';
import { installMock } from './mock';
import { expectReaderPixels } from './readerPixels';

async function setup(page: Page, theme = 'mist') {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(installMock, { count: 20 });
  await page.addInitScript(async theme => {
    const api = (window as any).omicomic, data = (await api.getAppData()).data;
    data.settings.colorTheme = theme;
    data.bookshelves = [{id:'cat',name:'测试',sortIndex:0}];
    data.virtualFolders = ['1','2','3'].map(id => ({id,name:`书架 ${id}`,bookshelfId:'cat',items:[],tags:[],note:'',sortIndex:Number(id),createdAt:1,updatedAt:1}));
  }, theme);
  await page.goto('/');
}

for (const theme of ['mist', 'nord', 'sand', 'night']) test(`${theme}: home library action matches the library toolbar controls`, async ({ page }) => {
  await setup(page,theme);
  const colors = await page.locator('.omi-home__library').evaluate(button => {
    const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;
    const rgb=(color:string)=>{ctx.fillStyle=color;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3);};
    const css=getComputedStyle(button),bg=rgb(css.backgroundColor),text=rgb(css.color),surface=rgb(getComputedStyle(document.querySelector('.omi-home')!).backgroundColor);
    const luminance=(v:number[])=>v.map(n=>n/255).map(n=>n<=.04045?n/12.92:((n+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const light=luminance(text),dark=luminance(bg);
    return {contrast:(Math.max(light,dark)+.05)/(Math.min(light,dark)+.05),lightness:dark,background:css.backgroundColor,color:css.color};
  });
  expect(colors.contrast).toBeGreaterThan(4.5);
  if(theme!=='night') expect(colors.lightness).toBeGreaterThan(.6);
  await page.screenshot({path:`test-results/pc-1.1.30-home-${theme}.png`});
  await page.locator('.omi-home__library').click();
  await expect(page.locator('.library-controls .tag-filter-button')).toHaveCSS('background-color',colors.background);
  await expect(page.locator('.library-controls .tag-filter-button')).toHaveCSS('color',colors.color);
});

test('desktop pointer drags cannot select chrome, but detail and reader titles and inputs remain selectable', async({page})=>{
  await setup(page); await page.locator('.omi-home__library').click();
  const selection=()=>page.evaluate(()=>window.getSelection()?.toString()??'');
  async function drag(locator:Locator) { await page.evaluate(()=>window.getSelection()?.removeAllRanges()); const r=(await locator.boundingBox())!; await page.mouse.move(r.x+2,r.y+r.height/2); await page.mouse.down(); await page.mouse.move(r.x+r.width-2,r.y+r.height/2,{steps:10}); await page.mouse.up(); }
  const card=page.locator('.resource-card').filter({hasText:'Book'});
  await drag(card.locator('.resource-details strong')); expect(await selection()).toBe('');
  await card.getByRole('button',{name:'打开资源信息'}).click();
  await drag(page.locator('#resource-detail-title')); expect(await selection()).not.toBe('');
  await page.locator('.sidebar-settings-button').click();
  await expect(page.locator('.settings-window-content')).toHaveCSS('user-select','none');
  await page.locator('#settings-category-appearance').click();
  await expect(page.getByRole('spinbutton',{name:'全局字号',exact:true})).toHaveCSS('user-select','text');
  await page.getByRole('button',{name:'关闭设置',exact:true}).click();
  await page.locator('.resource-detail-read-button').click(); await expectReaderPixels(page.locator('.reader-image').first());
  await drag(page.locator('#reader-title')); expect(await selection()).not.toBe('');
  await expect(page.locator('.reader-footer')).toHaveCSS('user-select','none');
  await page.getByRole('button',{name:'画面调整',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'启用画面调整'})).toHaveCount(0);
  await expect(page.locator('.reader-tool-comparison')).toHaveCount(0);
  await page.getByRole('slider',{name:'亮度',exact:true}).fill('120');
  await expect(page.locator('.reader-effects').first()).toHaveCSS('filter',/brightness\(1.2\)/);
  await page.screenshot({path:'test-results/pc-1.1.28-realtime-adjustments.png'});
});

test('fixed category uses two white bars with inward light and the drop card has a narrow outer highlight',async({page})=>{
  await setup(page); await page.locator('.omi-home__library').click();
  await page.locator('.page-panel.is-visible .library-sidebar button').filter({hasText:'书架'}).first().click();
  const marker=page.locator('.bookshelf-category-slot-marker');
  await expect(marker.locator('svg')).toHaveCount(0);
  const bars=await marker.evaluate(el=>['::before','::after'].map(p=>{const s=getComputedStyle(el,p);return {fill:s.backgroundColor,height:s.height,shadow:s.boxShadow};}));
  expect(bars.every(b=>b.fill==='rgb(255, 255, 255)'&&b.height==='3px')).toBe(true);
  expect(bars[0].shadow).toContain('0px 4px 7px');expect(bars[1].shadow).toContain('0px -4px 7px');
  await page.screenshot({path:'test-results/pc-1.1.30-category.png'});
  const cards=page.locator('.bookshelf-folder-card');
  const a=(await cards.nth(0).boundingBox())!,b=(await cards.nth(1).boundingBox())!;
  await page.mouse.move(a.x+50,a.y+50);await page.mouse.down({button:'middle'});await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5,{steps:12});
  await expect(cards.nth(1)).toHaveClass(/is-card-middle-drop-/);
  await expect(cards.nth(1).locator('.card-drop-glow')).toHaveCount(0);
  await expect(cards.nth(1)).toHaveCSS('box-shadow',/0px 0px 0px 2px/);
  const before=await cards.nth(1).evaluate(el=>getComputedStyle(el,'::before').content);
  expect(before).toBe('none');
  await page.screenshot({path:'test-results/pc-1.1.31-drag.png',style:'.middle-drag-floating-card { visibility: hidden; }'});
  await page.mouse.move(100,50);await page.mouse.up({button:'middle'});
  await expect(cards.nth(1)).not.toHaveCSS('box-shadow',/0px 0px 0px 2px/);
});

test('detail has a separate window drag strip without covering its title or window controls',async({page})=>{
  await setup(page);await page.locator('.omi-home__library').click();
  await page.locator('.resource-card').filter({hasText:'Book'}).getByRole('button',{name:'打开资源信息'}).click();
  const strip=page.locator('.resource-detail-window-drag');await expect(strip).toBeVisible();
  expect(await strip.evaluate(e=>getComputedStyle(e).getPropertyValue('-webkit-app-region'))).toBe('drag');
  const rect=(await strip.boundingBox())!,title=(await page.locator('#resource-detail-title').boundingBox())!,controls=(await page.locator('.window-controls').boundingBox())!;
  expect(rect.y).toBe(0);expect(rect.y+rect.height).toBeLessThanOrEqual(title.y);expect(rect.x+rect.width).toBeLessThan(controls.x);
  await expect(page.locator('#resource-detail-title')).toHaveCSS('user-select','text');
  await page.screenshot({path:'test-results/pc-1.1.30-detail.png'});
  await page.setViewportSize({width:390,height:844});await expect(strip).toHaveCount(0);
});
