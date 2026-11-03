const assert=(ok,message)=>{if(!ok)throw Error(message);},pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(fn,label)=>{const end=Date.now()+25000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-600));await pause(30);}};
const button=label=>[...document.querySelectorAll('button')].find(el=>el.getBoundingClientRect().width>0&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label));
const tap=async el=>{assert(el,'Missing target');el.scrollIntoView({block:'center',behavior:'instant'});await pause(400);const r=el.getBoundingClientRect();assert(r.width>0,'Invisible target');window.__omiTap={x:r.x+r.width/2,y:r.y+Math.min(35,r.height/2),viewport:innerWidth};await wait(()=>!window.__omiTap,'real tap');};
const input=()=>document.querySelector('.virtual-folder-dialog input');
const trace=window.__omiMotionReport={events:[],saves:[],fields:[]};
for(const type of ['pointerdown','pointerup','click','focusin','focusout'])document.addEventListener(type,event=>{const target=event.target;if(!target?.closest?.('.virtual-folder-dialog'))return;const row={type,target:target.tagName,button:target.closest('button')?.textContent,mouseButton:event.button,buttons:event.buttons,trusted:event.isTrusted,x:event.clientX,y:event.clientY,height:innerHeight};trace.events.push(row);setTimeout(()=>{row.prevented=event.defaultPrevented;row.cancelBubble=event.cancelBubble;},0);if(trace.events.length>50)trace.events.shift();},true);
const update=window.omicomic.updateVirtualFolder;window.omicomic.updateVirtualFolder=async value=>{trace.saves.push(value);return update(value);};
const setName=async(name,keyboard=false)=>{await tap(input());input().select();window.__omiText=name;await wait(()=>!window.__omiText,'native typing');await wait(()=>input()?.value===name,'typed name');if(keyboard){window.__omiKey=66;await wait(()=>!window.__omiKey,'keyboard Enter');}else{const save=button('保存'),props=save[Object.keys(save).find(key=>key.startsWith('__reactProps'))];trace.fields.push({name,height:innerHeight,visual:visualViewport.height,focus:document.activeElement?.tagName,save:save.getBoundingClientRect().toJSON(),disabled:save.disabled,click:props?.onClick?.toString(),form:save.form?.className});window.__omiShot='shelf-before-'+name.toLowerCase();await wait(()=>!window.__omiShot,'save screenshot');await tap(save);}await wait(()=>!input(),'name saved');await pause(350);};
const suffix=String(Date.now()%100000),first='Shelf'+suffix,middle='Rename'+suffix,last='Final'+suffix;
const card=name=>[...document.querySelectorAll('.mobile-bookshelf-card')].find(el=>el.getAttribute('aria-label')===name);
const shelfTab=[...document.querySelectorAll('.sidebar-item')].find(el=>el.querySelector('span')?.textContent==='书架');await tap(shelfTab);
await wait(()=>button('书架分类'),'shelf category');await tap(button('书架分类'));const create=()=>[...document.querySelectorAll('.mobile-drawer-footer button')].find(el=>el.textContent.trim()==='新建书架');await wait(create,'new shelf action');await tap(create());
await wait(input,'new shelf form');assert(!document.querySelector('.virtual-folder-dialog textarea'),'New shelf still has a note');
await setName(first,true);await wait(()=>card(first),'created shelf');
window.dispatchEvent(new Event('omi-back'));await pause(350);
const checks=['new-shelf-name-only'];
for(const [before,after]of[[first,middle],[middle,last]]){
 const target=card(before);target.scrollIntoView({block:'center',behavior:'instant'});await pause(180);const rect=target.getBoundingClientRect();
 window.__omiDrag={from:{x:rect.x+rect.width/2,y:rect.y+35},to:{x:rect.x+rect.width/2,y:rect.y+35},viewport:innerWidth,holdMs:650};await wait(()=>!window.__omiDrag,'real shelf hold');
 await wait(()=>button('重命名'),'rename action');await tap(button('重命名'));await wait(input,'rename form');await setName(after);await wait(()=>card(after),'renamed shelf');checks.push(after);
}
const container=document.querySelector('.bookshelf-root-view');assert(getComputedStyle(container).scrollbarWidth==='none'||getComputedStyle(container,'::-webkit-scrollbar').display==='none','Shelf scrollbar remains');
const data=await window.omicomic.getAppData();assert(data.ok,'Saved data');const saved=data.data.virtualFolders.find(item=>item.name===last);assert(saved,'Name was not persisted');
await window.omicomic.deleteVirtualFolder(saved.id);
return {checks,scrollbar:'none',persisted:true};
