const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(value,label)=>{if(!value)throw Error(label);};
const wait=async(fn,label)=>{const until=Date.now()+20000;while(!await fn()){if(Date.now()>until)throw Error(label+' '+document.body.innerText.slice(-700));await pause(30);}};
const checks=[];
const dialog=name=>document.querySelector('[role="dialog"][aria-label="'+name+'"]');
const ready=el=>el?.isConnected&&el.style.willChange!=='transform'&&!document.documentElement.hasAttribute('data-mobile-navigation');
const button=name=>[...document.querySelectorAll('button')].find(el=>el.getAttribute('aria-label')===name||el.textContent.trim()===name);
const touch=async(action,x,y)=>{window.__omiTouch={action,x,y,viewport:innerWidth};await wait(()=>!window.__omiTouch,'native touch '+action);};
async function drag(el,distance,cancel=false){
  await wait(()=>ready(el),'sheet settles');await pause(100);
  const grip=el.querySelector('.mobile-sheet-grab-area'),r=grip?.getBoundingClientRect();assert(r?.height>=24,'Handle target missing');
  const x=r.x+r.width/2,y=r.y+r.height/2;
  await touch('down',x,y);
  for(let i=1;i<=8;i++){await touch('move',x,y+distance*i/8);await pause(distance<20?55:20);}
  const offset=new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
  assert(offset>distance*.85&&offset<distance*1.15,'Sheet does not follow native drag: '+offset);
  await touch(cancel?'cancel':'up',x,y+distance);
}
if(document.querySelector('.omi-home')){const open=[...document.querySelectorAll('.omi-home button')].find(el=>el.getAttribute('aria-label')==='打开资源库'||el.textContent.includes('进入资源库'));assert(open,'Library entry missing');open.click();}
await wait(()=>button('显示选项')&&!document.documentElement.hasAttribute('data-mobile-navigation'),'library settles');
button('显示选项').click();await wait(()=>ready(dialog('显示选项')),'display menu');
let sheet=dialog('显示选项');await drag(sheet,12);await wait(()=>ready(sheet)&&Math.abs(new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42)<1,'short drag snaps back');
await drag(sheet,160,true);await wait(()=>ready(sheet)&&Math.abs(new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42)<1,'cancelled drag restores');
await drag(sheet,160);await wait(()=>!dialog('显示选项'),'display menu dismissed');checks.push({flow:'native-display-handle',followsFinger:true,shortDragReturns:true,cancelReturns:true,downwardDismiss:true});
await wait(()=>document.querySelector('.mobile-resource-card [aria-label="打开资源信息"]'),'resource info action');document.querySelector('.mobile-resource-card [aria-label="打开资源信息"]').click();
await wait(()=>document.querySelector('.resource-detail-page')&&!document.documentElement.hasAttribute('data-mobile-navigation'),'details');
const readButton=document.querySelector('.resource-detail-read-button');assert(readButton&&getComputedStyle(readButton).boxShadow==='none','Read button still has glow');checks.push({flow:'native-read-action',shadow:'none'});
button('详情操作').click();await wait(()=>ready(dialog('漫画操作')),'detail menu');sheet=dialog('漫画操作');
assert(sheet.querySelector('.mobile-sheet-handle'),'Detail handle not restored');const rename=[...sheet.querySelectorAll('button')].find(el=>el.textContent.trim()==='重命名');assert(rename&&getComputedStyle(rename).borderTopWidth==='0px','Rename separator restored accidentally');
await pause(150);window.__omiShot='bottom1178-detail-handle';await wait(()=>!window.__omiShot,'native screenshot');
await drag(sheet,85);await wait(()=>!dialog('漫画操作'),'detail menu dismissed');checks.push({flow:'native-detail-handle',restored:true,topBorder:false,downwardDismiss:true});
button('添加标签').click();await wait(()=>ready(dialog('添加标签')),'tag sheet');sheet=dialog('添加标签');const input=sheet.querySelector('input');input.focus();let focusRestores=0;input.addEventListener('focus',()=>focusRestores++);
await drag(sheet,100);await wait(()=>!dialog('添加标签'),'tag sheet dismissed');assert(focusRestores===0&&!document.activeElement?.matches('input,textarea'),'Closing input regained focus');checks.push({flow:'native-input-handle',downwardDismiss:true,focusRestores});
return{checks,transport:'Real APK and native touch events; disposable emulator fixtures'};
