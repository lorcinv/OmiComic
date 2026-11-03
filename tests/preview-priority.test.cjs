const{test}=require('node:test'),assert=require('node:assert/strict');
test('visible page previews overtake waiting covers without increasing decode concurrency',async()=>{
 const decoder=require('../dist-electron/services/thumbnailDecoder'),original=decoder.decodeThumbnail,started=[],finish=new Map();
 decoder.decodeThumbnail=file=>new Promise(resolve=>{started.push(file);finish.set(file,()=>resolve({url:'data:image/png;base64,AA',width:1,height:1}));});
 try{
  const{nativePageThumbnail,pagePreview}=require('../dist-electron/services/pagePreviewService'),tick=()=>new Promise(resolve=>setImmediate(resolve));
  const first=nativePageThumbnail('cover1');await tick();const second=nativePageThumbnail('cover2'),third=nativePageThumbnail('cover3'),preview=pagePreview('visible','page',()=>null);
  assert.deepEqual(started,['cover1']);finish.get('cover1')();await tick();assert.deepEqual(started,['cover1','page']);
  finish.get('page')();await tick();assert.deepEqual(started,['cover1','page','cover2']);finish.get('cover2')();await tick();finish.get('cover3')();await Promise.all([first,second,third,preview]);await tick();
 }finally{decoder.decodeThumbnail=original;}
});
