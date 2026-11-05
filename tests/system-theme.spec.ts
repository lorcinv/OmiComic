import { test, expect, type Page } from '@playwright/test';
import { installMock } from './mock';

async function setup(page: Page) {
  await page.emulateMedia({ colorScheme:'light', reducedMotion:'reduce' });
  await page.addInitScript(installMock,{count:8});
  await page.addInitScript(()=>{
    const api=window.omicomic,read=api.getAppData,save=api.updateSettings;
    api.getAppData=async()=>{
      const result=await read(),saved=sessionStorage.getItem('system-theme-settings');
      if(result.ok&&saved)Object.assign(result.data.settings,JSON.parse(saved));
      return result;
    };
    api.updateSettings=async patch=>{
      const result=await save(patch);
      if(result.ok)sessionStorage.setItem('system-theme-settings',JSON.stringify(result.data));
      return result;
    };
  });
  await page.goto('/');
}
async function settings(page:Page,mobile:boolean){
  if(mobile){await page.locator('.mobile-home-nav').getByRole('button',{name:'设置',exact:true}).click();await page.locator('.mobile-setting-category').filter({hasText:'外观与主题'}).click();}
  else {await page.getByRole('button',{name:'打开资源库',exact:true}).click();await page.locator('.sidebar-settings-button').click();await page.getByRole('tab',{name:/外观与主题/}).click();}
}
async function choose(page:Page,mobile:boolean,id:string,label:string){
  if(mobile){await page.getByRole('combobox',{name:'界面主题',exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click();}
  else await page.locator('.theme-option').filter({has:page.getByRole('radio',{name:label,exact:true})}).click();
}
for(const [layout,width,height] of [['pc',1440,960],['tablet',800,1280],['phone',390,844]] as const){
  test.describe(layout,()=>{
    test.use({viewport:{width,height},isMobile:layout!=='pc',hasTouch:layout!=='pc'});
    test('system appearance preserves the chosen day palette and the setting survives reload',async({page})=>{
      test.setTimeout(60000);const mobile=layout!=='pc';await setup(page);await settings(page,mobile);
      const follow=page.getByRole('checkbox',{name:'跟随系统主题',exact:true});
      await expect(follow).not.toBeChecked();
      await follow.check();
      await expect(page.locator('.settings-hint').filter({hasText:'日间配色'})).toContainText(mobile?'雾蓝':'雾灰');
      await follow.uncheck();
      await choose(page,mobile,'sand','暖沙');
      await expect(page.locator('html')).toHaveAttribute('data-color-theme','sand');
      await follow.check();
      if(mobile){
        expect(await follow.evaluate(el=>el.closest('label')!.compareDocumentPosition(document.querySelector('[aria-label="界面主题"]')!)&Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
        await page.getByRole('combobox',{name:'界面主题',exact:true}).click();await expect(page.getByRole('option',{name:'夜色',exact:true})).toHaveAttribute('aria-disabled','true');await page.keyboard.press('Escape');
      }else{
        expect(await follow.evaluate(el=>document.querySelector('.theme-options')!.compareDocumentPosition(el)&Node.DOCUMENT_POSITION_FOLLOWING)).toBeTruthy();
        await expect(page.getByRole('radio',{name:'夜色',exact:true})).toBeDisabled();
      }
      await page.screenshot({path:`test-results/system-theme-${layout}-light.png`});
      await page.emulateMedia({colorScheme:'dark'});
      await expect(page.locator('html')).toHaveAttribute('data-color-theme','night');
      await page.screenshot({path:`test-results/system-theme-${layout}-dark.png`});
      await choose(page,mobile,'nord','北境');
      await expect(page.locator('html')).toHaveAttribute('data-color-theme','night');
      await expect(page.locator('.settings-hint').filter({hasText:'日间配色'})).toContainText('北境');
      await page.emulateMedia({colorScheme:'light'});
      await expect(page.locator('html')).toHaveAttribute('data-color-theme','nord');
      await page.reload();await settings(page,mobile);
      await expect(follow).toBeChecked();
      await expect(page.locator('html')).toHaveAttribute('data-color-theme','nord');
      await follow.uncheck();await choose(page,mobile,'night','夜色');
      await page.emulateMedia({colorScheme:'dark'});await page.emulateMedia({colorScheme:'light'});
      await expect(page.locator('html')).toHaveAttribute('data-color-theme','night');
      await follow.check();await expect(page.locator('html')).toHaveAttribute('data-color-theme','nord');
      await expect.poll(()=>page.evaluate(()=>JSON.parse(sessionStorage.getItem('system-theme-settings')!).followSystemTheme)).toBe(true);
    });
  });
}

test.describe('Android card feedback',()=>{
  test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  for(const theme of ['mist','sand','night'])test(`${theme} keeps a visible themed veil without fading the card`,async({page})=>{
    await setup(page);
    const card=page.locator('.omi-home__book').first();await expect(card).toBeVisible();
    await page.evaluate(theme=>{document.documentElement.dataset.platform='android';document.documentElement.dataset.colorTheme=theme;},theme);
    const box=(await card.boundingBox())!;
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await expect(card).toHaveAttribute('data-omi-pressed','true');
    await page.waitForTimeout(100);
    const veil=await card.evaluate(el=>({card:getComputedStyle(el).opacity,color:getComputedStyle(el,'::before').backgroundColor,opacity:getComputedStyle(el,'::before').opacity}));
    expect(veil.card).toBe('1');expect(veil.opacity).toBe('1');expect(veil.color).toContain(theme==='night'?'0.15':'0.17');
    await page.screenshot({path:`test-results/card-press1185-${theme}.png`});
    await page.mouse.move(2,2);await page.mouse.up();
    await expect(card).not.toHaveAttribute('data-omi-pressed','true');
    await expect.poll(()=>card.evaluate(el=>getComputedStyle(el,'::before').opacity)).toBe('0');
  });
});
