const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),vm=require('node:vm');
function api(file){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,DOMException});return exports;}
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
test('background decode leaves a foreground lane and never decodes two speculative images together',async()=>{
 const {queueDesktopDecode:q}=api('desktopDecodeQueue.ts'),started=[];let release1,release2;
 const a=q(()=>{started.push('background1');return new Promise(r=>release1=r);},60*1024**2,true);
 const b=q(async()=>{started.push('background2');},60*1024**2,true);
 const f=q(()=>{started.push('foreground');return new Promise(r=>release2=r);},60*1024**2,false);
 await tick();assert.deepEqual(started,['background1','foreground']);release2();await f;await tick();assert.equal(started.length,2);
 release1();await Promise.all([a,b]);assert.deepEqual(started,['background1','foreground','background2']);
});
test('byte reservations bound parallel full-resolution decoding; cancelled queued work never starts',async()=>{
 const {queueDesktopDecode:q}=api('desktopDecodeQueue.ts');let release,ran=false;
 const first=q(()=>new Promise(r=>release=r),150*1024**2,false);await tick();
 const controller=new AbortController(),next=q(async()=>{ran=true;},100*1024**2,false,controller.signal);const rejected=assert.rejects(next,{name:'AbortError'});
 await tick();assert.equal(ran,false);controller.abort();await rejected;release();await first;
 await assert.rejects(q(async()=>{throw Error('decode failed');},1,false),/decode failed/);
 await q(async()=>{ran=true;},1,false);assert.equal(ran,true);
});
test('viewport geometry copies source pixels and caps working surfaces independently from original dimensions',()=>{
 const {viewportRaster:crop}=api('viewportRaster.ts');
 const box=(l,t,w,h)=>({left:l,top:t,right:l+w,bottom:t+h,width:w,height:h});
 const exact=crop(box(-500,-250,2000,1000),box(0,0,1000,500),2000,1000,1);
 assert.equal(exact.x,436);assert.equal(exact.y,186);assert.equal(exact.sourceWidth,exact.pixelsWide);assert.equal(exact.sourceHeight,exact.pixelsHigh);
 const huge=crop(box(-12000,-8000,40000,40000),box(0,0,7680,4320),20000,20000,2);
 assert.ok(huge.pixelsWide*huge.pixelsHigh<=8_000_000);assert.ok(huge.sourceWidth<20000);
 assert.equal(crop(box(5000,0,100,100),box(0,0,1000,500),100,100,1),null);
});

test('ordinary small pages decode ahead in parallel and queued speculation can be promoted',async()=>{
 const {queueDesktopDecode:q,prioritizeDesktopDecodes:promote}=api('desktopDecodeQueue.ts'),started=[];const releases=[];
 const jobs=Array.from({length:3},(_,i)=>q(()=>{started.push(i);return new Promise(r=>releases.push(r));},8*1024**2,true));
 let background=true;const fourth=q(async()=>{started.push(3);},8*1024**2,()=>background);
 await tick();assert.deepEqual(started,[0,1,2]);background=false;promote();await tick();assert.deepEqual(started,[0,1,2,3]);
 releases.forEach(r=>r());await Promise.all([...jobs,fourth]);
});
