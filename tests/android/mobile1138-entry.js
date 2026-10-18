const assert=(v,m)=>{if(!v)throw new Error(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
const wait=async(fn,label)=>{const until=Date.now()+20000;while(!await fn()){if(Date.now()>until)throw new Error('Timeout: '+label);await pause(20);}};
const visible=el=>el&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden';
const button=label=>[...document.querySelectorAll('button')].find(el=>visible(el)&&(el.getAttribute('aria-label')===label||el.textContent.trim()===label||el.querySelector('strong')?.textContent===label));
const tap=async el=>{assert(el,'Missing tap target');const r=el.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'native touch');};
const data=await window.omicomic.getAppData(),root=data.ok&&data.data.library.roots.find(item=>item.name==='OmiSmoke');
assert(root,'Dedicated fixture root missing');
await window.omicomic.updateLibraryState({lastActiveRootPath:root.path,lastCurrentPath:root.path});
const observe=window.__omiFixture==='observe';
if(window.__omiFixture==='night'&&document.documentElement.dataset.colorTheme!=='night'){
  await wait(()=>document.querySelector('.mobile-home-nav'),'home for theme');
  await tap(button('设置'));await wait(()=>button('外观与主题'),'appearance settings');await tap(button('外观与主题'));
  await wait(()=>document.querySelector('[role="combobox"][aria-label="界面主题"]'),'theme selector');
  await tap(document.querySelector('[role="combobox"][aria-label="界面主题"]'));
  await wait(()=>[...document.querySelectorAll('[role="option"]')].some(el=>el.textContent.trim()==='夜色'),'night option');
  await tap([...document.querySelectorAll('[role="option"]')].find(el=>el.textContent.trim()==='夜色'));
  await wait(()=>document.documentElement.dataset.colorTheme==='night','night theme');
  for(let i=0;i<2;i++){window.__omiKey=4;await wait(()=>!window.__omiKey,'back from settings');await pause(300);}
}
const web=[],native=[],original=document.startViewTransition?.bind(document),post=MessagePort.prototype.postMessage;
if(original)document.startViewTransition=update=>{
  const run={direction:document.documentElement.dataset.mobileNavigation,started:performance.now(),frames:[]},transition=original(update);web.push(run);
  transition.ready.then(()=>{
    run.ready=performance.now();let done=false;
    const sample=()=>{if(done)return;const animation=document.getAnimations().find(a=>String(a.animationName).startsWith('mobile-home-'));
      if(animation){const t=animation.effect.getComputedTiming();run.frames.push({ms:performance.now()-run.ready,time:animation.currentTime,progress:t.progress,duration:t.duration});}requestAnimationFrame(sample);};sample();
    transition.finished.finally(()=>{done=true;run.finished=performance.now();});
  }).catch(error=>{run.error=String(error);});return transition;
};
MessagePort.prototype.postMessage=function(message,...rest){try{const call=JSON.parse(message);if(['beginScene','commitScene','cancelScene'].includes(call.method))native.push({method:call.method,args:call.args,ms:performance.now()});}catch{}return post.call(this,message,...rest);};
await wait(()=>document.querySelector('.mobile-home-nav'),'cold home');
const icon=document.querySelector('.omi-home .omi-brand-icon');
const rims=[...icon.querySelectorAll('.omi-brand-icon__inner-rim')];
if(!observe)assert(rims.length===2&&rims.every(rim=>getComputedStyle(rim).display==='none'),'Phone icon retained its bright inner outline');
window.__omiShot=observe?'mobile1138-brand-before':window.__omiFixture==='night'?'mobile1138-brand-after-night':'mobile1138-brand-after';await wait(()=>!window.__omiShot,'brand screenshot');
const results=[];window.__omiEntryTrace=results;
for(const route of ['cold-enter','return-home','warm-enter']){
  window.__omiFrameProbe=true;await wait(()=>!window.__omiFrameProbe,'start frame probe');
  const start=performance.now(),webBefore=web.length,nativeBefore=native.length;
  if(route==='return-home'){window.__omiKey=4;await wait(()=>!window.__omiKey,'back');}
  else await tap(button('打开资源库'));
  await wait(()=>route==='return-home'?document.querySelector('.omi-home'):document.querySelector('.page-panel.is-visible .library-layout'),'destination');
  await pause(700);await wait(()=>!document.documentElement.dataset.mobileNavigation,'web transition settled');
  window.__omiFrameProbeStop=true;await wait(()=>!window.__omiFrameProbeStop,'finish frame probe');
  const result={route,totalMs:performance.now()-start,web:web.slice(webBefore),native:native.slice(nativeBefore),pixels:window.__omiFrameProbeResult};
  results.push(result);
  if(!observe){
    const moving=result.pixels.frames.filter(frame=>frame.nativeReveal);
    assert(result.web.length===0&&result.native.filter(call=>call.method==='commitScene').length===1,'Home reveal did not use one native scene: '+route);
    assert(result.pixels.uniformBlankFrames===0,'Blank frame during '+route);
    assert(result.pixels.contentLayerType===0&&!result.pixels.snapshotRetained&&!result.pixels.revealRetained,'Transition retained native resources: '+route);
    assert(moving.length>=4&&moving.every(frame=>frame.revealDuration===280),'Incomplete native duration: '+JSON.stringify({route,moving}));
    assert(moving.at(-1).ms-moving[0].ms>=120,'Reveal flashed instead of playing: '+route);
    assert(new Set(moving.map(frame=>Math.round(frame.meanRgb*10))).size>=4,'Too few distinct displayed transition frames: '+route);
  }
}
document.startViewTransition=original;MessagePort.prototype.postMessage=post;
return {viewport:[innerWidth,innerHeight],reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,results};
