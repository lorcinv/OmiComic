const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(ok,label)=>{if(!ok)throw Error(label);};
const wait=async(fn,label)=>{const end=Date.now()+25000;while(!await fn()){if(Date.now()>end)throw Error(label+' '+document.body.innerText.slice(-400));await pause(25);}};
const value=async task=>{const result=await task;assert(result.ok,JSON.stringify(result));return result.data;};
const api=window.omicomic,data=await value(api.getAppData()),root=data.library.roots.find(item=>item.name==='Halftone1149')??data.library.roots[0];
await value(api.updateSettings({readerPageMode:'single',readerDefaultPanorama:false,readerDefaultFlow:'horizontal',readerPreloadPages:2,mobileReaderAutoHide:false,mobileReaderPreviews:true}));
const card=name=>[...document.querySelectorAll('.page-panel.is-visible .mobile-resource-card')].find(el=>el.querySelector('strong')?.textContent===name);
const openLibrary=[...document.querySelectorAll('button')].find(el=>el.textContent.trim()==='打开资源库');if(openLibrary)openLibrary.click();
for(let i=0;i<5&&!card('Preview1173.pdf');i++){window.dispatchEvent(new Event('omi-back'));await pause(180);}
const checks=[],report=window.__omiMotionReport={checks};
const tap=async el=>{el.scrollIntoView({block:'nearest',behavior:'instant'});const r=el.getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'native tap');};
const back=async name=>{for(let i=0;i<4&&document.querySelector('.page-panel.is-visible .reader-stage');i++){window.dispatchEvent(new Event('omi-back'));await pause(120);}await wait(()=>card(name),'library return');await pause(300);};
for(const name of ['Quick1172.cbz','Preview1173.pdf','Document.pdf']){
 const path=root.path+'/'+name,descriptor=await value(api.getResourcePages({path,type:name.endsWith('.pdf')?'pdf':'archive'}));
 await value(api.saveReadingProgress({resourceKey:descriptor.resourceKey,sourcePath:path,sourceType:descriptor.sourceType,title:name,currentPageIndex:4,totalPages:name==='Document.pdf'?6:100,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:'horizontal',panorama:false,immersive:false}}));
 const originalPages=api.getResourcePages,originalImage=api.getPageImage,post=MessagePort.prototype.postMessage;const images=[],commits=[];
 api.getResourcePages=async input=>{await pause(500);return originalPages(input);};
 api.getPageImage=async input=>{const r=await originalImage(input);if(r.ok&&!input.preview)images.push({input,url:r.data.url});return r;};
 MessagePort.prototype.postMessage=function(...args){try{const m=JSON.parse(args[0]);if(m.method==='readerIntent')assert(!m.args.image,'Cover placeholder was sent');if(m.method==='commitScene'&&m.args.direction==='forward'){const frame=document.querySelector('[data-reader-page-index="4"]:not([aria-hidden="true"])');commits.push({correctPage:!!frame,pdf:!!frame?.querySelector('canvas.reader-pdf-canvas')?.width,nativeUrl:frame?.querySelector('[data-native-image]')?.dataset.nativeImage,at:performance.now()});}}catch(error){if(String(error).includes('placeholder'))throw error;}return post.apply(this,args);};
 await wait(()=>card(name),'saved book');card(name).scrollIntoView({block:'center',behavior:'instant'});await pause(200);
 window.__omiReaderMotionStart=true;await wait(()=>!window.__omiReaderMotionStart,'start frame recorder');const r=card(name).getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+40,viewport:innerWidth};await wait(()=>!window.__omiTap,'open saved book');
 await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage'),'reader stage');await wait(()=>document.querySelector('.reader-layout')?.getAttribute('aria-busy')==='false','reader pixels');await pause(350);
 const progress=()=>document.querySelector('[aria-label="阅读进度"]');assert(Number(progress()?.getAttribute('aria-valuenow'))===5,'Did not resume the saved fifth page');
 window.__omiReaderMotionStop=true;await wait(()=>!window.__omiReaderMotionStop,'stop frame recorder');const frames=window.__omiReaderMotionFrames,tapTrace=window.__omiTapTransportTrace.at(-1),source=frames.find(f=>f.sceneSnapshot),slides=frames.filter(f=>f.sceneTranslationX>1&&f.sceneTranslationX<f.sceneWidth-1);
 report.entryFrames={name,frames};
 assert(frames.every(f=>f.sourceScale===1&&f.contentScale===1),'Whole-screen scaling pulse during reader entry');assert(source&&source.time-tapTrace.startedUptime<500,'Outgoing capture waited for the delayed manifest');assert(slides.length>=3,'No incoming animation intermediate frames');assert(slides.every(f=>f.readerDuration===200),'Reader animation duration changed');assert(frames.every(f=>!f.readerOpening),'Cover placeholder remained');assert(commits.length&&commits[0].correctPage,'Incoming scene was not the saved page');
 report.entryDebug={name,images,commits,savedPage:descriptor.pages[4],slides:slides.map(f=>({pixels:f.pixels,active:f.active,slots:f.slots,translation:f.sceneTranslationX}))};
 if(name.endsWith('.pdf'))assert(commits[0].pdf,'PDF page was not rendered before reveal');else{const first=slides.find(f=>f.pixels),expected=commits[0].nativeUrl;assert(first&&expected&&first.slots.some(slot=>slot.url===expected),'First incoming pixels were not the saved fifth page');}
 assert(!frames.some(f=>f.active&&!f.pixels&&!f.sceneCovered),'Uncovered empty reader');
 window.__omiShot='content200-'+name.toLowerCase().replace(/\W/g,'-');await wait(()=>!window.__omiShot,'saved page screenshot');
 if(!document.querySelector('.reader-layout.is-mobile-chrome-visible')){const sr=document.querySelector('.reader-stage').getBoundingClientRect();window.__omiTap={x:sr.x+sr.width/2,y:sr.y+sr.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'show controls');}
 await wait(()=>document.querySelector('.reader-layout.is-mobile-chrome-visible'),'visible controls');await pause(120);
 const pr=progress().getBoundingClientRect(),target=Math.round(.35*(Number(progress().getAttribute('aria-valuemax'))-1));window.__omiTap={x:pr.x+pr.width*.35,y:pr.y+pr.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'tap progress');await wait(()=>document.querySelector('.mobile-reader-filmstrip'),'preview after tap');
 const rail=document.querySelector('.mobile-reader-filmstrip'),centerError=()=>{const box=rail.getBoundingClientRect(),selected=rail.querySelector('[aria-pressed="true"]')?.getBoundingClientRect();return selected?Math.abs(selected.x+selected.width/2-box.x-box.width/2):999;};
 await wait(()=>Math.abs(rail.scrollLeft-target*96)<1&&centerError()<1,'progress tap centers the preview');await pause(450);assert(centerError()<1,'Progress centering bounced back');
 const neighbour=rail.querySelector('[aria-label^="第 '+(target+2)+' 页："]');assert(neighbour,'Adjacent thumbnail');await tap(neighbour);await wait(()=>Math.abs(rail.scrollLeft-(target+1)*96)<1&&centerError()<1,'thumbnail tap centers the preview');
 checks.push({flow:'saved-entry',name,savedPage:5,coverPlaceholder:false,durationMs:200,sourceCaptureMs:source.time-tapTrace.startedUptime,scaleStable:true,slideFrames:slides.length,correctPageAtCommit:true,progressTapCentered:true,thumbnailTapCentered:true,frames});
 api.getResourcePages=originalPages;api.getPageImage=originalImage;MessagePort.prototype.postMessage=post;await back(name);
}
for(const mode of ['single','panorama-horizontal','panorama-vertical']){
for(const name of ['Quick1172.cbz','Preview1173.pdf']){
 const path=root.path+'/'+name,book=await value(api.getResourcePages({path,type:name.endsWith('.pdf')?'pdf':'archive'}));
 await value(api.saveReadingProgress({resourceKey:book.resourceKey,sourcePath:path,sourceType:book.sourceType,title:name,currentPageIndex:0,totalPages:100,readerViewState:{fitMode:'fit-window',pageMode:'single',pageDirection:'left-to-right',flow:mode.endsWith('vertical')?'vertical':'horizontal',panorama:mode!=='single',immersive:false}}));
 await wait(()=>card(name),'source '+name);card(name).click();
 await wait(()=>document.querySelector('.page-panel.is-visible .reader-stage'),'reader stage');
 await wait(()=>document.querySelector('.reader-layout')?.getAttribute('aria-busy')==='false','reader ready');
 const stage=()=>document.querySelector('.page-panel.is-visible .reader-stage'),progress=()=>document.querySelector('[aria-label="阅读进度"]');
 if(name.endsWith('.pdf'))await wait(()=>stage()?.querySelector('canvas.reader-pdf-canvas')?.width>0,'PDF pixels');
 await pause(320);
 assert(stage().classList.contains('is-panorama')===(mode!=='single'),'Saved panorama mode was not restored');
 if(!document.querySelector('.reader-layout.is-mobile-chrome-visible')){const r=stage().getBoundingClientRect();window.__omiTap={x:r.x+r.width/2,y:r.y+r.height/2,viewport:innerWidth};await wait(()=>!window.__omiTap,'toolbar tap');}
 await wait(()=>document.querySelector('.reader-layout.is-mobile-chrome-visible')&&progress()?.getBoundingClientRect().width>40,'visible progress rail');await pause(300);
 const swipe=async(r,from,to,durationMs)=>{window.__omiDrag={from:{x:r.x+r.width*from,y:r.y+r.height*.45},to:{x:r.x+r.width*to,y:r.y+r.height*.45},viewport:innerWidth,shell:true,durationMs};await wait(()=>!window.__omiDrag,'native swipe');};
 report.gesture={mode,name,box:progress().getBoundingClientRect().toJSON(),chrome:document.querySelector('.reader-layout').className};
 await swipe(progress().getBoundingClientRect(),.2,.4,180);
 await wait(()=>document.querySelector('.mobile-reader-filmstrip'),'previews');await pause(350);
 const rail=document.querySelector('.mobile-reader-filmstrip'),trace=report[name]={positions:[],seeks:[],nativePans:0},original=rail.scrollTo.bind(rail);
 rail.scrollTo=(...args)=>{trace.seeks.push(args);original(...args);};
 rail.addEventListener('pointercancel',()=>{trace.nativePans++;});
 rail.addEventListener('touchend',()=>{trace.released=rail.scrollLeft;});
 rail.addEventListener('scroll',()=>{trace.positions.push({at:performance.now(),left:rail.scrollLeft});trace.last=performance.now();});
 const settle=async()=>{await wait(()=>performance.now()-(trace.last||0)>260,'scroll rest');return rail.scrollLeft;};
 const r=rail.getBoundingClientRect(),before=rail.scrollLeft;await swipe(r,.85,.15,90);const stopped=await settle(),released=trace.released;
 assert(trace.nativePans>0,'Touch was captured instead of native scrolling');
 assert(stopped>before+4*96,'Fast swipe did not travel across pages');
 assert(stopped>released+96,'Fast swipe lost native inertia');
 assert(trace.seeks.length===0,'Preview scheduled a seek during native scrolling');
 const first={before,released,stopped,inertia:stopped-released};
 for(let i=0;i<2;i++)await swipe(r,.85,.15,100);
 const forward=await settle();assert(forward>stopped+4*96,'Repeated swipes were blocked');
 await swipe(r,.15,.85,100);const reverse=await settle();assert(reverse<forward-2*96,'Reverse swipe was blocked');
 const stable=rail.scrollLeft;await pause(650);assert(Math.abs(rail.scrollLeft-stable)<1,'Preview recentered after stopping');
 const selected=rail.querySelector('[aria-pressed="true"]'),sr=selected?.getBoundingClientRect(),error=sr?Math.abs(sr.x+sr.width/2-r.x-r.width/2):Infinity;
 assert(error<=49,'Selection did not follow the real offset');
 const selectedPage=Math.round(stable/96)+1;await wait(()=>Number(progress()?.getAttribute('aria-valuenow'))===selectedPage,'reader follows the final preview page');
 await wait(()=>{const img=rail.querySelector('[aria-pressed="true"] img');return img?.complete&&img.naturalWidth>0;},'selected thumbnail decoded');
 assert(rail.querySelectorAll('.mobile-filmstrip-page').length<15,'Unbounded virtual previews');
 await pause(180);window.__omiShot=name.endsWith('.pdf')?'filmstrip1173-pdf':'filmstrip1173-comic';await wait(()=>!window.__omiShot,'screenshot');
 checks.push({flow:'filmstrip',mode,name,first,forward,reverse,stable,nativePans:trace.nativePans,seeks:trace.seeks.length,selectionError:error,selectedPage,decoded:true});
 window.dispatchEvent(new Event('omi-back'));await pause(150);if(document.querySelector('.page-panel.is-visible .reader-stage'))window.dispatchEvent(new Event('omi-back'));await wait(()=>card(name),'return');
}
}
return {checks,input:'Android native open taps and fast swipes; normal and both panorama directions'};
