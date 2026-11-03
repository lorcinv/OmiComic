const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),assert=(ok,label)=>{if(!ok)throw Error(label);};
const wait=async(fn,label)=>{const deadline=Date.now()+20000;while(!await fn()){if(Date.now()>deadline)throw Error(label+' '+document.body.innerText.slice(-600));await pause(20);}};
const value=async promise=>{const result=await promise;assert(result.ok,JSON.stringify(result));return result.data;};
const api=window.omicomic,checks=[],report=window.__omiMotionReport={checks};
await value(api.updateSettings({showHomePage:true,colorTheme:'night'}));
window.dispatchEvent(new CustomEvent('omi-home-visibility-changed',{detail:true}));
const home=()=>document.querySelector('.omi-home');
for(let i=0;i<5&&!home();i++){
 const brand=[...document.querySelectorAll('.page-panel.is-visible .brand-home-button')].find(el=>el.textContent==='OmiComic');
 if(brand)brand.click();else window.dispatchEvent(new Event('omi-back'));await pause(350);
}
await wait(()=>home()?.querySelector('.omi-home__book'),'home recent book');await pause(350);document.documentElement.dataset.colorTheme='night';
window.__omiWaitScene=true;await wait(()=>!window.__omiWaitScene,'settled home frame');
const icon=()=>home()?.querySelector('.omi-brand-icon');await wait(()=>icon()&&!icon().disabled,'ready brand');
assert(!icon().querySelector('.omi-brand-icon__inner-rim'),'Inner ring hairline remained');
const svg=icon().querySelector('svg').cloneNode(true);svg.setAttribute('width','64');svg.setAttribute('height','64');const image=new Image();image.src='data:image/svg+xml;base64,'+btoa(new XMLSerializer().serializeToString(svg));await image.decode();
const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,64,64);
for(let x=7;x<=12;x++){const pixel=[...ctx.getImageData(x,32,1,1).data];assert(pixel.join(',')==='120,131,142,255','Non-matte left shell pixel '+x+': '+pixel);}
checks.push({flow:'matte-shell',theme:'night',pixels:[7,8,9,10,11,12],innerHairline:false});
window.__omiShot='brand1175-home-night';await wait(()=>!window.__omiShot,'night screenshot');
const tap=async el=>{const r=el.getBoundingClientRect();window.__omiTap={x:r.x+r.width*.5,y:r.y+Math.min(40,r.height*.5),viewport:innerWidth};await wait(()=>!window.__omiTap,'native recent tap');};
for(const failed of [true,false]){
 const read=api.getResourcePages,samples=[];let finish,calls=0,record=true;
 api.getResourcePages=async input=>{calls++;await new Promise(resolve=>{finish=resolve;});return failed?{ok:false,error:{code:'IO_ERROR',message:'Controlled brand opening failure'}}:read(input);};
 const node=icon(),sample=()=>{if(!record)return;if(node.getClientRects().length)samples.push({opacity:getComputedStyle(node).opacity,blink:node.classList.contains('is-blinking')});requestAnimationFrame(sample);};requestAnimationFrame(sample);
 try{
  await tap(home().querySelector('.omi-home__book'));await wait(()=>calls===1&&node.disabled&&node.getAttribute('aria-busy')==='true','busy recent entry');await pause(300);
  node.click();assert(calls===1,'Busy brand started a duplicate read');assert(getComputedStyle(node).opacity==='1','Pending recent book dimmed the icon');assert(!node.classList.contains('is-blinking'),'Recent tap blinked the eyes');
  if(failed){window.__omiShot='brand1175-home-pending';await wait(()=>!window.__omiShot,'pending screenshot');}
  finish();
  if(failed){await wait(()=>home()?.textContent.includes('Controlled brand opening failure')&&!node.disabled,'failed entry recovers');await pause(150);}
  else{await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage'),'reader entry');await wait(()=>document.querySelector('.reader-layout')?.getAttribute('aria-busy')==='false','reader interactive');await pause(300);}
  assert(samples.length>=5&&samples.every(s=>s.opacity==='1'&&!s.blink),'Brand changed appearance during recent entry');
  checks.push({flow:'recent-entry',failed,nativeTap:true,calls,samples:samples.length,minimumOpacity:Math.min(...samples.map(s=>Number(s.opacity))),blink:false,readerEntered:!failed});
 }finally{record=false;api.getResourcePages=read;}
}
return {checks,input:'Android native recent-book taps in night mode; successful and failed loading; busy shortcut guard'};
