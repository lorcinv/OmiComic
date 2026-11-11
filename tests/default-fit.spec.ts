import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';
import { FIT_MODE_OPTIONS } from '../electron/shared/readerPreferences';

async function seed(page: Page, mobile: boolean, snapshot: boolean, savedMode?: string) {
  page.on('pageerror',error=>console.error(error.stack));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(async ({ source, mobile, snapshot, savedMode }) => {
    eval(`(${source})`)({ count: 3 });
    if (mobile) {
      const markAndroid=()=>{document.documentElement.dataset.platform='android';};
      if(document.documentElement)markAndroid();
      else document.addEventListener('DOMContentLoaded',markAndroid,{once:true});
    }
    const api = window.omicomic, result = await api.getAppData();
    if (!result.ok) throw Error('fixture');
    const data: any = result.data;
    Object.assign(data.settings, {showHomePage:false,readerDefaultFitMode:'fit-window',readerDefaultPanorama:false,readerPageMode:'single',mobileReaderAutoHide:false}, JSON.parse(localStorage.getItem('fit-settings') ?? '{}'));
    localStorage.setItem('fit-settings',JSON.stringify(data.settings));
    const progress: any = JSON.parse(localStorage.getItem('fit-progress') ?? '{}');
    if (savedMode && !progress['folder:/comics/Book']) progress['folder:/comics/Book'] = {resourceKey:'folder:/comics/Book',sourcePath:'/comics/Book',sourceType:'folder',title:'Book',currentPageIndex:0,totalPages:3,updatedAt:1,readerViewState:{fitMode:savedMode,pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}};
    data.readingProgress = progress;
    api.updateSettings = async patch => {Object.assign(data.settings,patch);localStorage.setItem('fit-settings',JSON.stringify(data.settings));return {ok:true,data:structuredClone(data.settings)};};
    api.getReadingProgress = async key => ({ok:true,data:progress[key] ?? null});
    api.saveReadingProgress = async input => {progress[input.resourceKey]=structuredClone(input);localStorage.setItem('fit-progress',JSON.stringify(progress));return {ok:true,data:structuredClone(input)};};
    const resource = api.getResourcePages;
    api.getResourcePages = async input => {
      const result = await resource(input);
      if (result.ok && snapshot) result.data.readerInit = {settings:structuredClone(data.settings),progress:structuredClone(progress[result.data.resourceKey] ?? null)};
      return result;
    };
    const canvas=document.createElement('canvas');canvas.width=800;canvas.height=1200;
    const context=canvas.getContext('2d')!;context.fillStyle='#bed5e7';context.fillRect(0,0,800,1200);
    api.getPageImage=async()=>({ok:true,data:{url:canvas.toDataURL(),width:800,height:1200}});
  }, { source:installMock.toString(),mobile,snapshot,savedMode });
  await page.goto('/');
  await expect(page.locator('.page-panel.is-visible .resource-card').first()).toBeVisible();
}

async function settings(page: Page, mobile: boolean) {
  if(mobile){
    await page.getByRole('button',{name:'显示选项',exact:true}).click();
    await page.getByRole('button',{name:'应用设置',exact:true}).click();
    await page.getByRole('button',{name:/默认阅读/}).click();
  }else{
    await page.getByRole('button',{name:'设置',exact:true}).click();
    await page.locator('#settings-category-reader-default').click();
  }
}
async function openBook(page: Page, mobile: boolean) {
  const card=page.locator('.page-panel.is-visible .resource-card').filter({has:page.locator('strong',{hasText:/^Book$/})});
  if(mobile)await card.tap();else await card.dblclick();
  await expect(page.locator('.reader-layout')).toHaveAttribute('aria-busy','false');
  await expect.poll(()=>page.locator('.reader-page-spread img').first().evaluate((image:any)=>image.complete&&image.naturalWidth===800)).toBe(true);
}

for(const mobile of [false,true])test.describe(mobile?'Android default fit':'PC default fit',()=>{
  test.use(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
  for(const option of FIT_MODE_OPTIONS)test(`${option.label} can be selected, survives restart and controls the first reading layout`,async({page})=>{
    await seed(page,mobile,['original','fit-height'].includes(option.value));
    await settings(page,mobile);
    const selector=page.getByRole('combobox',{name:'默认缩放模式',exact:true});
    await selector.click();
    await expect(page.getByRole('option')).toHaveCount(FIT_MODE_OPTIONS.length);
    for(const item of FIT_MODE_OPTIONS)await expect(page.getByRole('option',{name:item.label,exact:true})).toBeVisible();
    await page.getByRole('option',{name:option.label,exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('fit-settings')!).readerDefaultFitMode)).toBe(option.value);
    if(mobile){
      await expect(page.getByText('打开漫画时的缩放',{exact:true})).toHaveCount(0);
      await expect(page.getByText('关闭后，点击翻页无需等待，仍可双指缩放。',{exact:true})).toHaveCount(0);
      await expect(page.getByRole('checkbox',{name:'双击放大画面',exact:true})).toBeChecked();
    }
    await page.reload();await settings(page,mobile);await expect(selector).toContainText(option.label);
    if(option.value==='fit-height')await page.screenshot({path:`test-results/default-fit-${mobile?'android':'pc'}.png`});
    if(mobile){await page.getByRole('button',{name:'返回设置',exact:true}).click();await page.getByRole('button',{name:'关闭设置',exact:true}).click();}else await page.keyboard.press('Escape');
    await openBook(page,mobile);
    if(!mobile)await expect(page.locator('.reader-fit-select')).toContainText(option.label);
    const metrics=await page.locator('.reader-stage').evaluate(stage=>{
      const style=getComputedStyle(stage),image=stage.querySelector('img')!.getBoundingClientRect();
      return {width:image.width,height:image.height,availableWidth:stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),availableHeight:stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)};
    });
    if(option.value==='original'){expect(metrics.width).toBeCloseTo(800,0);expect(metrics.height).toBeCloseTo(1200,0);}
    else if(option.value==='fit-width')expect(metrics.width).toBeCloseTo(metrics.availableWidth,0);
    else if(option.value==='fit-height')expect(metrics.height).toBeCloseTo(metrics.availableHeight,0);
    else{expect(metrics.width).toBeLessThanOrEqual(metrics.availableWidth+1);expect(metrics.height).toBeLessThanOrEqual(metrics.availableHeight+1);}
    await expect.poll(()=>page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('fit-progress') ?? '{}')).some((item:any)=>item.readerViewState?.fitMode===JSON.parse(localStorage.getItem('fit-settings')!).readerDefaultFitMode))).toBe(true);
  });

  test('a comic resumes its saved fit mode using the same rule on both platforms',async({page})=>{
    await seed(page,mobile,false,'original');
    await page.evaluate(async()=>{await window.omicomic.updateSettings({readerDefaultFitMode:'fit-width'});});
    await page.reload();await openBook(page,mobile);
    if(mobile)await expect.poll(()=>page.locator('.reader-page-spread img').first().evaluate(image=>image.getBoundingClientRect().width)).toBeCloseTo(800,0);
    else await expect(page.locator('.reader-fit-select')).toContainText('原始尺寸');
  });
});
