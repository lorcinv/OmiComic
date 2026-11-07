// Exercises the packaged runtime with an isolated profile. Render outside all
// displays without focus/taskbar presence: a hidden window throttles input to 1 Hz.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron,expect}=require('@playwright/test');
const {Resvg}=require('@resvg/resvg-js');
const {zip}=require('./helpers/documentFixtures.cjs');
(async()=>{
  const root=path.resolve(process.env.OMICOMIC_ZOOM_TEST_ROOT||'.cache/zoom1188'),profile=path.join(root,'windows-profile-'+Date.now());
  await fs.mkdir(profile,{recursive:true});
  const grid=Array.from({length:24},(_,i)=>`<path d="M0 ${i*50} H800" stroke="#9bb2bd"/><text x="330" y="${i*50+30}" font-size="20" fill="#243f4b">Omi ${i+1}</text>`).join('');
  const png=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200"><rect width="800" height="1200" fill="#e3eaf0"/>${grid}</svg>`).render().asPng();
  const book=path.join(root,'Zoom-grid.cbz');await fs.writeFile(book,zip(Array.from({length:12},(_,i)=>[`${i+1}.png`,png]),true));
  const env={...process.env,OMICOMIC_TEST_HEADLESS:'1',OMICOMIC_TEST_PROFILE:profile};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
  let app;
  try{
    app=await _electron.launch({executablePath:path.resolve(process.env.OMICOMIC_PACKAGED_EXE||'.cache/zoom1188/windows-final/win-unpacked/OmiComic.exe'),args:[book,'--disable-features=CalculateNativeWinOcclusion','--disable-background-timer-throttling','--disable-renderer-backgrounding'],env});
    await app.evaluate(({BrowserWindow,screen})=>{const win=BrowserWindow.getAllWindows()[0];win.webContents.setBackgroundThrottling(false);win.setFocusable(false);win.setSkipTaskbar(true);const left=Math.min(...screen.getAllDisplays().map(d=>d.bounds.x));win.setBounds({x:left-1300,y:0,width:1100,height:850});win.showInactive();});
    const page=await app.firstWindow(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    const info=await app.evaluate(({app,BrowserWindow})=>({version:app.getVersion(),packaged:app.isPackaged,visible:BrowserWindow.getAllWindows().some(w=>w.isVisible())}));
    assert.equal(info.version,require('../package.json').desktopVersion||require('../package.json').version);assert.equal(info.packaged,true);
    await expect(page.locator('.reader-stage')).toBeVisible();await page.waitForTimeout(600);
    await page.evaluate(()=>{window.__zoomEvents=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','blur','visibilitychange'])window.addEventListener(type,event=>window.__zoomEvents.push({type,t:event.timeStamp,x:event.clientX,y:event.clientY,visibility:document.visibilityState}),true);});
    const pose=()=>page.locator('.reader-page-spread').evaluate(e=>{const p=e.style.translate.split(' ').map(parseFloat);return{x:p[0]||0,y:p[1]||0};}),checks=[];
    for(const flow of ['ordinary','horizontal','vertical']){
      if(flow==='horizontal')await page.getByRole('button',{name:'开启全景连环画',exact:true}).click();
      if(flow==='vertical')await page.getByRole('button',{name:'当前横向阅读，点击切换纵向阅读',exact:true}).click();
      await page.waitForTimeout(350);
      const r=await page.locator('.reader-stage').boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2,axis=flow==='vertical'?'x':'y';
      await page.mouse.move(x,y);await page.keyboard.down('Control');await page.mouse.wheel(0,-550);await page.keyboard.up('Control');
      await expect.poll(async()=>Number(await page.locator('.reader-stage').getAttribute('data-reader-zoom'))).toBeGreaterThan(2.7);
      const scale=await page.locator('.reader-stage').getAttribute('data-reader-zoom');await page.waitForTimeout(100);
      await page.mouse.down();for(let i=1;i<=6;i++){await page.mouse.move(x-(axis==='x'?100*i/6:0),y-(axis==='y'?100*i/6:0));if(i<6)await page.waitForTimeout(12);}
      const held=await pose();await page.mouse.up();await page.waitForTimeout(180);const coast=await pose();assert.ok(coast[axis]<held[axis]-10,JSON.stringify({flow,held,coast,events:await page.evaluate(()=>window.__zoomEvents)}));
      await page.screenshot({path:path.join(root,`windows-zoom-${flow}.png`)});
      await page.mouse.move(x,y);await page.mouse.down({clickCount:2});await page.mouse.up({clickCount:2});await page.waitForTimeout(80);const caught=await pose();await page.waitForTimeout(180);assert.deepEqual(await pose(),caught);await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom',scale);
      checks.push({flow,held,coast,caught});
      await page.mouse.dblclick(x,y);await expect(page.locator('.reader-stage')).toHaveAttribute('data-reader-zoom','1');
    }
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(root,'windows-zoom.json'),JSON.stringify({info,checks,errors},null,2));console.log(JSON.stringify({info,checks}));
  }finally{if(app)await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
