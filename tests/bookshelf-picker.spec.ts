import{test,expect,type Page}from'@playwright/test';
import{installMock}from'./mock';

async function setup(page:Page,mobile:boolean,categories=2){
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.addInitScript(async({source,categories})=>{
  const install=eval('('+source+')');install({count:6});const api=window.omicomic,r=await api.getAppData();if(!r.ok)throw Error();const d=r.data;
  d.settings.showHomePage=false;d.bookshelves=Array.from({length:categories},(_,i)=>({id:'c'+i,name:i<2?['分类甲','分类乙'][i]:`分类${i+1}`,sortIndex:i,createdAt:1,updatedAt:1}));
  const list=api.listDirectory;api.listDirectory=async path=>path==='/comics/Book'?{ok:true,data:{path,parentPath:'/comics',items:[{id:'image',name:'1.png',path:path+'/1.png',type:'image',extension:'png'}],total:1}}:list(path);
  d.virtualFolders=['甲一','甲二','乙一'].map((name,i)=>({id:'s'+i,name,bookshelfId:i<2?'c0':'c1',note:'',tags:[],items:[],sortIndex:i,createdAt:1,updatedAt:1}));
  api.createBookshelf=async input=>{const category={...input,id:'new-category',sortIndex:2,createdAt:1,updatedAt:1};d.bookshelves.push(category);return{ok:true,data:category};};
  api.createVirtualFolder=async input=>{const shelf={...input,id:'new-shelf',note:'',tags:[],items:[],sortIndex:3,createdAt:1,updatedAt:1};d.virtualFolders.push(shelf);return{ok:true,data:shelf};};
  api.addVirtualFolderItems=async({folderId,items})=>{const shelf=d.virtualFolders.find(f=>f.id===folderId)!;shelf.items.push(...items.map(item=>({...item,id:item.resourceKey,folderId,addedAt:1,sortIndex:0})));return{ok:true,data:{folder:shelf,addedCount:items.length,skippedCount:0}};};
  api.importDroppedDirectory=async()=>({ok:true,data:{alreadyAdded:true,root:d.library.roots[0]}});
  api.getAppData=async()=>({ok:true,data:structuredClone(d)});
 },{source:installMock.toString(),categories});
 await page.goto('/');
 if(mobile){await page.locator('.mobile-resource-card').filter({has:page.locator('strong',{hasText:/^Book$/})}).dispatchEvent('contextmenu');await page.getByRole('button',{name:'加入书架',exact:true}).click();}
 else{await page.locator('.resource-card').filter({has:page.locator('strong',{hasText:/^Book$/})}).click({button:'right'});await page.getByRole('menuitem',{name:'加入书架',exact:true}).click();}
 await expect(page.locator('.shelf-picker')).toBeVisible();
}

for(const mobile of[false,true])test.describe(mobile?'mobile picker':'desktop picker',()=>{
 test.use(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
 test('search, category and shelf panels follow the requested layout and share action surfaces',async({page})=>{
  await setup(page,mobile);const picker=page.locator('.shelf-picker');
  await picker.getByRole('button',{name:/分类乙/}).click();await expect(picker.getByRole('button',{name:/乙一/})).toBeVisible();
  await picker.getByRole('searchbox',{name:'搜索书架',exact:true}).fill('甲二');await expect(picker.getByRole('button',{name:/甲二/})).toBeVisible();await expect(picker.getByRole('button',{name:/甲一/})).toHaveCount(0);
  await picker.getByRole('searchbox').fill('');await page.mouse.move(0,0);
  const frames=await picker.evaluate(el=>[...el.querySelectorAll('.shelf-picker-surface')].map(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return{border:s.borderColor,background:s.backgroundColor,radius:s.borderRadius,shadow:s.boxShadow,x:r.x,y:r.y,w:r.width,h:r.height};}));
  for(const frame of frames.slice(1))expect({border:frame.border,background:frame.background,radius:frame.radius,shadow:frame.shadow},JSON.stringify(frames)).toEqual({border:frames[0].border,background:frames[0].background,radius:frames[0].radius,shadow:frames[0].shadow});
  if(mobile){expect(frames[0].y+frames[0].h).toBeLessThan(frames[1].y);expect(frames[1].y+frames[1].h).toBeLessThan(frames[2].y);expect(frames[2].x).toBeLessThan(frames[3].x);await expect(page.getByRole('dialog',{name:'加入书架',exact:true})).toBeVisible();}
  await page.screenshot({path:`test-results/picker-${mobile?'mobile':'desktop'}.png`});
 });
 test('creating a category and a shelf in this flow keeps the source view and pending books',async({page})=>{
  await setup(page,mobile);const picker=page.locator('.shelf-picker');await picker.getByRole('button',{name:'新建书架分类',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'新建书架分类',exact:true});await dialog.getByRole('textbox',{name:'名称',exact:true}).fill('新分类');await dialog.getByRole('button',{name:'保存',exact:true}).click();
  await expect(dialog).toHaveCount(0);await expect(picker).toBeVisible();await expect(picker.getByRole('button',{name:/新分类/})).toHaveAttribute('aria-pressed','true');
  await picker.getByRole('button',{name:'新建书架并加入',exact:true}).click();dialog=page.getByRole('dialog',{name:'新建书架',exact:true});await dialog.getByRole('textbox',{name:'名称',exact:true}).fill('新书架');await dialog.getByRole('button',{name:'保存',exact:true}).click();
  await expect(dialog).toHaveCount(0);await expect(picker).toHaveCount(0);await expect(page.locator(mobile?'.mobile-resource-card':'.resource-card').first()).toBeVisible();await expect(page.locator('.bookshelf-folder-card')).toHaveCount(0);
  expect(await page.evaluate(async()=>{const data=await window.omicomic.getAppData();if(!data.ok)return null;return data.data.virtualFolders.find(s=>s.id==='new-shelf')?.items.length;})).toBe(1);
 });
 test('notices align to the content area with equal width and queue their visible timers',async({page})=>{
  await setup(page,mobile);if(mobile)await page.getByRole('dialog',{name:'加入书架',exact:true}).getByRole('button',{name:'关闭加入书架',exact:true}).click();else await page.locator('.bookshelf-target-context-layer').click({position:{x:2,y:2}});
  await page.evaluate(async()=>{const{showNotice}=await import('/src/notifications.ts');showNotice({owner:'align-error',text:'红色提示',kind:'error',duration:0,closeLabel:'关闭红色提示'});showNotice({owner:'align-info',text:'目录提示',kind:'info',duration:600,closeLabel:'关闭目录提示',className:'directory-drop-notice'});});
  await expect(page.getByRole('alert')).toHaveText('红色提示×');const data=await page.locator('.notice-stack').evaluate(el=>{const notices=[...el.querySelectorAll('.app-notice')].map(n=>n.getBoundingClientRect()),body=document.querySelector('.page-panel.is-visible .library-body')!.getBoundingClientRect();return{notices:notices.map(r=>({x:r.x,y:r.y,w:r.width})),body:{x:body.x,y:body.y,w:body.width}};});
  expect(data.notices[0].w).toBeCloseTo(data.notices[1].w,1);expect(data.notices[0].x).toBeCloseTo(data.body.x+(mobile?12:18),1);expect(data.notices[0].y).toBeCloseTo(data.body.y+(mobile?10:12),1);
  await page.screenshot({path:`test-results/notices-${mobile?'mobile':'desktop'}.png`});
  await page.waitForTimeout(750);await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'关闭红色提示',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'目录提示'})).toBeVisible();
  await page.waitForTimeout(350);await expect(page.getByRole('status').filter({hasText:'目录提示'})).toBeVisible();await expect(page.locator('.notice-stack')).toHaveCount(0,{timeout:2000});
 });
 if(mobile)test('categories use one vertical column with touch paging and no scrollbar',async({page})=>{
  await setup(page,true,16);const list=page.locator('.shelf-picker-category-list');await expect(page.getByRole('scrollbar')).toHaveCount(0);
  const rows=await list.locator('button').evaluateAll(items=>items.slice(0,2).map(item=>item.getBoundingClientRect().toJSON()));expect(rows[0].x).toBe(rows[1].x);expect(rows[1].y).toBeGreaterThanOrEqual(rows[0].bottom);
  const rect=(await list.boundingBox())!,session=await page.context().newCDPSession(page),x=rect.x+rect.width/2;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:rect.y+rect.height*.85}]});
  for(let i=1;i<=10;i++){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:rect.y+rect.height*(.85-.7*i/10)}]});await page.waitForTimeout(18);}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await session.detach();await expect.poll(()=>list.evaluate(el=>el.scrollTop)).toBeGreaterThan(80);
  await expect(page.getByRole('scrollbar')).toHaveCount(0);await page.screenshot({path:'test-results/picker-mobile-scroll.png'});
 });
});
