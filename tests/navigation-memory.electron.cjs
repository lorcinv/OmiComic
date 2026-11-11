const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { _electron, expect } = require('@playwright/test');

test('Windows startup tabs and positions survive closing the application process', { timeout: 120000 }, async () => {
  const directory = await fs.mkdtemp(path.resolve('test-results/navigation-memory-'));
  const profile = path.join(directory, 'profile'), source = path.join(directory, 'books');
  await fs.mkdir(profile); await fs.mkdir(source);
  const pixel = await fs.readFile('tests/fixtures/images/pixel.png');
  const images = Array.from({length:200},(_,i)=>path.join(source,`${String(i).padStart(3,'0')}.png`));
  await Promise.all(images.map(file=>fs.writeFile(file,pixel)));
  const env = {...process.env,OMICOMIC_TEST_HEADLESS:'1',OMICOMIC_TEST_PROFILE:profile};
  delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  let app;
  const launch = async () => {
    app = await _electron.launch({executablePath:process.env.OMICOMIC_PACKAGED_EXE || require('electron'),args:process.env.OMICOMIC_PACKAGED_EXE ? [] : ['.'],env});
    const page = await app.firstWindow();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
    await page.emulateMedia({reducedMotion:'reduce'});
    return page;
  };
  try {
    let page = await launch();
    const initial = await page.evaluate(()=>window.omicomic.getAppData()); assert.equal(initial.ok,true);
    await app.close(); app = null;
    const data = initial.data;
    Object.assign(data.settings,{showHomePage:true,startupPage:'directory',hideBookshelfItemsInLibrary:false,sortMode:'name-asc',cardScale:60});
    data.library = {roots:[{path:source,name:'Navigation fixture',addedAt:1,lastOpenedAt:1}],lastActiveRootPath:source,lastCurrentPath:source};
    const resource = (sourcePath,i) => ({resourceKey:`image:${sourcePath}`,sourcePath,sourceType:'image',title:`Book ${String(i).padStart(3,'0')}`,currentPageIndex:0,totalPages:1,sortIndex:i,addedAt:1,updatedAt:1000-i});
    data.favorites = images.map(resource);
    data.recentOpened = images.map(resource);
    data.bookshelves = [{id:'category',name:'分类',sortIndex:0,createdAt:1,updatedAt:1}];
    data.virtualFolders = Array.from({length:80},(_,shelf)=>({id:`s${shelf}`,name:`Shelf ${String(shelf).padStart(3,'0')}`,bookshelfId:'category',sortIndex:shelf,note:'',tags:[],createdAt:1,updatedAt:1,
      items:images.map((sourcePath,i)=>({...resource(sourcePath,i),id:`s${shelf}-b${i}`,folderId:`s${shelf}`}))}));
    await fs.writeFile(path.join(profile,'omicomic-data.json'),JSON.stringify(data));
    page = await launch();
    const nav = label => page.locator('.sidebar-primary-nav .sidebar-item').filter({has:page.locator('span',{hasText:new RegExp(`^${label}$`)})});
    const list = () => page.getByLabel('当前目录文件列表',{exact:true});
    const body = () => page.locator('.page-panel.is-visible .resource-list-scroll');
    const root = () => page.locator('.bookshelf-root-view');
    const books = () => page.getByLabel('书架资源列表',{exact:true});
    const at = async (list,top) => {await expect(list).toBeVisible();await expect.poll(()=>list.evaluate((element,top)=>Math.abs(element.scrollTop-top),top)).toBeLessThan(2);};
    const scroll = async (list,top) => {await expect(list).toBeVisible();await list.evaluate((element,top)=>{element.scrollTop=top;element.dispatchEvent(new Event('scroll'));},top);await at(list,top);};
    await scroll(list(),1200);
    await nav('收藏').click(); await scroll(body(),900);
    await nav('书架').click(); await scroll(root(),1100);
    const name = await root().evaluate(element=>{
      const box=element.getBoundingClientRect();
      return [...element.querySelectorAll('.bookshelf-folder-card')].find(card=>{const r=card.getBoundingClientRect();return r.top>box.top+90&&r.bottom<box.bottom-20;}).querySelector('strong').textContent;
    });
    const shelf = () => page.locator('.bookshelf-folder-card').filter({has:page.locator('strong',{hasText:new RegExp(`^${name}$`)})});
    await shelf().dblclick(); await scroll(books(),950);
    await page.evaluate(async()=>{const result=await window.omicomic.updateSettings({startupPage:'bookshelf'});if(!result.ok)throw Error(result.error.message);});
    await app.close(); app=null;
    page=await launch();
    await expect(nav('书架')).toHaveClass(/is-active/); await at(books(),950);
    await page.getByRole('button',{name:'返回书架',exact:true}).click(); await at(root(),1100);
    await nav('收藏').click(); await at(body(),900);
    await nav('资源库').click(); await at(list(),1200);
    const checks=[];
    for (const [startupPage,label] of [['favorites','收藏'],['bookmarks','书签'],['recent','最近阅读'],['temporary','临时存放'],['directory','资源库'],['home','主页']]) {
      await page.evaluate(async startupPage=>{const result=await window.omicomic.updateSettings({startupPage});if(!result.ok)throw Error(result.error.message);},startupPage);
      await app.close();app=null;page=await launch();
      if(startupPage==='home')await expect(page.locator('.omi-home')).toBeVisible();
      else {await expect(nav(label)).toHaveClass(/is-active/);await expect(page.locator('.omi-home')).toHaveCount(0);}
      checks.push(startupPage);
    }
    const runtime=await app.evaluate(({app,BrowserWindow})=>({version:app.getVersion(),packaged:app.isPackaged,visible:BrowserWindow.getAllWindows().some(window=>window.isVisible())}));
    assert.equal(runtime.visible,false);
    await fs.writeFile('output/navigation-20261111/windows-runtime.json',JSON.stringify({runtime,startupPages:['bookshelf',...checks],positions:{directory:1200,favorites:900,bookshelf:1100,books:950},processRestart:true},null,2));
  } finally {if(app)await app.close();}
});
