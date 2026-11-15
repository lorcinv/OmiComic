const test = require('node:test');
const assert = require('node:assert/strict');
const {adjacentSplitPosition,splitHalf,splitPart,splitIdentity,parseSplitIdentity,sourcePageProgress}=require('../dist-electron/shared/splitPages.js');
const {resolvePageIndex,bookmarkMatches,normalizeReaderPreferences,sortReaderPages}=require('../dist-electron/shared/readerPreferences.js');

test('mixed source pages traverse both halves once in either direction, including a split first and last page',()=>{
  for(const rtl of [false,true])for(const wide of [[true,false,true],[false,true,false],[true],[false]]){
    let at={index:0,part:0};const seen=[];
    while(at){seen.push(`${at.index}:${wide[at.index]?splitHalf(at.part,rtl):'whole'}`);at=adjacentSplitPosition(at.index,at.part,1,wide.length,wide[at.index]);}
    assert.equal(new Set(seen).size,seen.length);
    assert.equal(seen.length,wide.reduce((n,w)=>n+(w?2:1),0));
    at={index:wide.length-1,part:1};const reverse=[];
    while(at){reverse.push(`${at.index}:${wide[at.index]?splitHalf(at.part,rtl):'whole'}`);at=adjacentSplitPosition(at.index,at.part,-1,wide.length,wide[at.index]);}
    assert.deepEqual(reverse,seen.toReversed());
  }
});

test('first half of the last source stays incomplete through actual disk persistence and reload',async t=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),Module=require('node:module');
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'omi-split-progress-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const source=require.resolve('../dist-electron/services/appDataService.js');
  function load(){const original=Module._load;Module._load=function(id,...args){return id==='electron'?{app:{getPath:()=>dir}}:original.call(this,id,...args);};try{delete require.cache[source];return require(source);}finally{Module._load=original;}}
  for(const rtl of [false,true]){
    let api=load();const view={fitMode:'fit-window',pageMode:'single',pageDirection:rtl?'right-to-left':'left-to-right',flow:'horizontal',panorama:false,immersive:false,splitWidePages:true,splitPageHalf:splitHalf(0,rtl)};
    const p={resourceKey:'pdf:/test.pdf',sourcePath:'/test.pdf',sourceType:'pdf',title:'test',currentPageIndex:2,totalPages:3,readerViewState:view};
    assert.deepEqual(sourcePageProgress(2,3,view),{completed:false,percent:83});
    assert.equal((await api.保存阅读进度(p)).completed,false);
    api=load();let saved=(await api.读取应用数据()).readingProgress[p.resourceKey];assert.equal(saved.completed,false);assert.equal(saved.readerViewState.splitPageHalf,view.splitPageHalf);
    await api.保存阅读进度({...p,readerViewState:{...view,splitPageHalf:splitHalf(1,rtl)}});
    api=load();saved=(await api.读取应用数据()).readingProgress[p.resourceKey];assert.equal(saved.completed,true);assert.equal(saved.percent,100);
    assert.equal(sourcePageProgress(2,3,{...view,splitWidePages:false}).completed,true);
    assert.equal(sourcePageProgress(2,3,{...view,panorama:true}).completed,true);
    assert.equal(sourcePageProgress(2,3,{...view,pageMode:'double'}).completed,true);
  }
});
test('physical half survives restore, and half bookmarks stay distinct while resolving the same sorted source page',()=>{
  const pages=[{index:0,name:'1.png',type:'folder-image',sourcePath:'book'},{index:1,name:'2.png',type:'folder-image',sourcePath:'book'}];
  const base='folder-image:1.png',left=splitIdentity(base,'L'),right=splitIdentity(base,'R');
  for(const rtl of [false,true])for(const half of ['L','R'])assert.equal(splitHalf(splitPart(half,rtl),rtl),half);
  assert.equal(resolvePageIndex(sortReaderPages(pages,'name-desc'),right,undefined,0),1);
  assert.equal(bookmarkMatches({pageIndex:0,sourceType:'folder',pageId:left},0,right),false);
  assert.equal(bookmarkMatches({pageIndex:0,sourceType:'folder',pageId:left},0,left),true);
  assert.equal(bookmarkMatches({pageIndex:0,sourceType:'pdf'},0,splitIdentity('pdf-page:0','R')),false);
  assert.deepEqual(parseSplitIdentity(right),{identity:base,half:'R'});
  assert.equal(normalizeReaderPreferences({splitWidePages:'yes',splitPageHalf:'anything'}).splitWidePages,false);
  assert.equal(normalizeReaderPreferences({splitWidePages:true,splitPageHalf:'R'}).splitPageHalf,'R');
});
