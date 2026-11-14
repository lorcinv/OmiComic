import { test, expect } from '@playwright/test';
import { installMock } from './mock';

for(const snapshot of [false,true]) for(const enabled of [false,true]) test(`desktop immersive default ${enabled}, snapshot ${snapshot}`,async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(installMock,{count:3});
  await page.addInitScript(async({enabled,snapshot})=>{
    const api=window.omicomic,result=await api.getAppData();if(!result.ok)throw Error('fixture');
    result.data.settings.showHomePage=false;
    result.data.settings.readerDefaultImmersive=enabled;
    const progress:any={currentPageIndex:1,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:!enabled}};
    api.getReadingProgress=async()=>({ok:true,data:progress});
    const get=api.getResourcePages;api.getResourcePages=async input=>{const book=await get(input);if(book.ok&&snapshot)book.data.readerInit={settings:result.data.settings,progress};return book;};
    api.setFullscreen=async value=>{(window as any).__fullscreen=value;return{ok:true,data:value};};
  },{enabled,snapshot});
  await page.goto('/');
  await page.locator('.resource-card').filter({has:page.locator('strong',{hasText:/^Book$/})}).dblclick();
  const reader=page.locator('.page-panel.is-visible .reader-layout');await expect(reader).toBeVisible();await expect(reader).toHaveAttribute('aria-busy','false');
  await expect.poll(()=>reader.evaluate(el=>el.classList.contains('is-immersive'))).toBe(enabled);
  await expect.poll(()=>page.evaluate(()=>(window as any).__fullscreen)).toBe(enabled);
  // The preference must not prevent manually leaving or entering immersive mode.
  await page.keyboard.press('f');
  await expect.poll(()=>reader.evaluate(el=>el.classList.contains('is-immersive'))).toBe(!enabled);
});
test('desktop reading settings exposes the persisted opt-in toggle',async({page})=>{
  await page.addInitScript(installMock,{count:3});await page.goto('/');
  await page.locator('.omi-home__library').click();await page.locator('.sidebar-settings-button').click();
  await page.locator('#settings-category-reader').click();
  const toggle=page.getByRole('checkbox',{name:'默认进入沉浸模式',exact:true});await expect(toggle).not.toBeChecked();await toggle.check();
  await expect.poll(()=>page.evaluate(async()=>{const result=await window.omicomic.getAppData();return result.ok&&result.data.settings.readerDefaultImmersive;})).toBe(true);
});
