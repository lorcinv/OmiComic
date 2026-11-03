const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,label)=>{if(!ok)throw Error(label);};
const value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;};
const wait=async(fn,label)=>{const deadline=Date.now()+20000;while(!await fn()){if(Date.now()>deadline)throw Error(label+' '+document.body.innerText.slice(-800));await pause(30);}};
const api=window.omicomic,checks=[];
// Discard only this fixture's synthetic roots before testing a fresh import.
for(const item of (await value(api.getAppData())).library.roots.filter(item=>/^Polish1177-(two|three)$/.test(item.name)))await value(api.removeLibraryRoot(item.path));
const root=await value(api.addLibraryRoot({path:window.__omiTagDataRoot,name:'Native backup fixture'})),ref={resourceKey:'folder:'+root.path,sourcePath:root.path,sourceType:'folder',title:root.name};
await value(api.updateResourceMeta({...ref,tags:['原始标签'],note:'备份备注'}));
assert(await value(api.exportDataBackup()),'Native export returned no document');
checks.push({flow:'native-json-export',platform:'android',filenameVerified:true});
await value(api.updateResourceMeta({...ref,tags:['导入前标签']}));
const preview=await value(api.readDataBackup());
assert(preview.backup.format==='OmiComic.Data'&&preview.backup.platform==='android','Wrong native backup contents');
assert(preview.matches.some(match=>match.from===root.path&&match.to===root.path),'Original directory did not match automatically');
await value(api.applyDataBackup(preview.token,{mode:'replace',prefer:'imported',includeSettings:false,mappings:preview.matches.map(({from,to})=>({from,to}))}));
let data=await value(api.getAppData());assert(data.resourceMeta[ref.resourceKey].tags.join()==='原始标签','Import did not restore tags');assert(data.resourceMeta[ref.resourceKey].note==='备份备注','Note lost');
checks.push({flow:'native-import',automaticDirectory:true,tags:true,note:true});
assert(await value(api.hasDataImportBackup()),'Pre-import backup missing');
await value(api.restoreDataBackup());data=await value(api.getAppData());assert(data.resourceMeta[ref.resourceKey].tags.join()==='导入前标签','Undo did not restore the previous state');
checks.push({flow:'native-undo-import',restored:true});
const browse=await value(api.openResourceDirectory(ref));assert(browse?.path===root.path,'Granted unsaved folder could not open');
for(const name of ['Polish1177-two','Polish1177-three'])await value(api.addLibraryRoot({path:root.path+'/'+name,name}));
for(const name of ['Polish1177 A','Polish1177 B'])if(!(await value(api.getAppData())).bookshelves.some(item=>item.name===name))await value(api.createBookshelf({name}));
if(document.querySelector('.omi-home')){[...document.querySelectorAll('.omi-home button')].find(el=>el.getAttribute('aria-label')==='打开资源库'||el.textContent.includes('进入资源库')).click();await wait(()=>document.querySelector('.library-layout'),'open library');}
const settled=()=>!document.documentElement.hasAttribute('data-mobile-navigation')&&![...document.querySelectorAll('.mobile-sheet')].some(el=>el.style.willChange==='transform');
const tap=async el=>{assert(el,'Missing tap target');await wait(settled,'tap target settles');await pause(100);el.scrollIntoView({block:'nearest',behavior:'instant'});const r=el.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
const button=name=>[...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')===name||el.textContent.trim()===name);
const touch=async(action,x,y)=>{window.__omiTouch={action,x,y,viewport:innerWidth};await wait(()=>!window.__omiTouch,'native '+action);};
async function reorderDrawer(shelf){
  await tap(button(shelf?'书架分类':'资源库目录'));await wait(()=>document.querySelector('[data-reorder-key]')&&settled(),'drawer settles');
  for(let trial=0;trial<2;trial++){
    const rows=[...document.querySelectorAll('[data-reorder-key]')],source=rows[0],target=rows[2],key=source.dataset.reorderKey;
    const a=source.querySelector('button').getBoundingClientRect(),b=target.getBoundingClientRect(),x=a.x+a.width/2,y=a.y+a.height/2,end=b.y+b.height/2;
    await touch('down',x,y);await pause(500);assert(source.classList.contains('is-dragging'),'Long press not active');
    for(let i=1;i<=8;i++)await touch('move',x,y+(end-y)*i/8);
    assert(source.classList.contains('is-dragging'),'Long press cancelled during move');await touch('up',x,end);
    await wait(()=>document.querySelectorAll('[data-reorder-key]')[2]?.dataset.reorderKey===key,'order saved');
  }
  window.dispatchEvent(new Event('omi-library-back'));await wait(()=>!document.querySelector('[data-reorder-key]'),'drawer closes');
  checks.push({flow:shelf?'native-shelf-reorder':'native-library-reorder',repetitions:2,nativeTouch:true});
}
await wait(()=>button('资源库目录'),'library menu');await reorderDrawer(false);
await tap([...document.querySelectorAll('.sidebar-primary-nav button')].find(el=>el.querySelector('span')?.textContent==='书架'));await wait(()=>button('书架分类')&&settled(),'bookshelf');await reorderDrawer(true);
await tap([...document.querySelectorAll('.sidebar-primary-nav button')].find(el=>el.querySelector('span')?.textContent==='资源库'));await wait(()=>button('显示选项')&&settled(),'library again');
await tap(button('显示选项'));await wait(()=>document.querySelector('[role="dialog"][aria-label="显示选项"]')&&settled(),'display sheet');
assert(!document.querySelector('[role="dialog"][aria-label="显示选项"] .mobile-sheet-heading'),'Display heading still present');
assert(!document.querySelector('[role="dialog"][aria-label="显示选项"]').textContent.includes('仅调整'),'Redundant display note');
await tap([...document.querySelectorAll('.mobile-settings-link')].find(el=>el.textContent.includes('应用设置')));
await wait(()=>[...document.querySelectorAll('.mobile-setting-category')].some(el=>el.textContent.includes('安全与备份'))&&settled(),'Safety settings category');
await tap([...document.querySelectorAll('.mobile-setting-category')].find(el=>el.textContent.includes('安全与备份')));
await wait(()=>document.querySelector('.data-management')&&settled(),'Native backup settings');
const rows=[...document.querySelectorAll('.data-backup-row')];assert(rows.length===2,'Expected two data rows');
const boxes=rows.map(row=>({button:row.querySelector('button').getBoundingClientRect(),text:row.querySelector('span').getBoundingClientRect()}));
assert(boxes[0].button.y<boxes[1].button.y,'Data actions are not separate rows');
assert(boxes.every(box=>box.button.right<=box.text.left&&box.text.right<=innerWidth),'Data actions overflow');
assert(rows[0].textContent.includes('导出阅读进度、收藏、书签、书架、标签、备注和设置。'),'Wrong export description');
window.__omiShot='tagpolish1177-native-settings';await wait(()=>!window.__omiShot,'native settings screenshot');
checks.push({flow:'native-settings',twoRows:true,buttonsOnLeft:true,overflow:false});
await tap(button('返回设置'));await wait(()=>document.querySelector('.mobile-setting-category')&&settled(),'settings categories');
await tap([...document.querySelectorAll('.mobile-setting-category')].find(el=>el.textContent.includes('外观与主题')));await wait(()=>document.querySelector('[role="group"][aria-label="全局字号"]')&&settled(),'font settings');
const textBefore=await value(api.getAppData()),global=textBefore.settings.mobileGlobalFontSize??14,infoSizeBefore=textBefore.settings.mobileInfoFontSize??12;
await tap(button('增大全局字号'));await tap(button('增大页码与信息字号'));await pause(100);
const fonts=(await value(api.getAppData())).settings;assert(fonts.mobileGlobalFontSize===Math.min(24,global+1)&&fonts.mobileInfoFontSize===Math.min(24,infoSizeBefore+1),'Mobile font settings not saved');
for(const control of document.querySelectorAll('.font-size-control')){const controlBoxes=[...control.querySelectorAll('button,input')].map(el=>el.getBoundingClientRect());assert(controlBoxes.length===3&&controlBoxes.every(box=>Math.abs(box.width-40)<.1&&Math.abs(box.height-40)<.1&&Math.abs(box.top-controlBoxes[0].top)<.1),'Font control dimensions differ');}
checks.push({flow:'native-font-sizes',global:fonts.mobileGlobalFontSize,info:fonts.mobileInfoFontSize,persisted:true,equalControls:true,controlSizePx:40});
await value(api.updateSettings({mobileGlobalFontSize:14,mobileInfoFontSize:12}));
return {checks,transport:'Real APK bridge, native touch and document streams; system picker result supplied by test instrumentation'};
