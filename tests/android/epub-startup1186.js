const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(condition,message)=>{if(!condition)throw Error(message);};
const api=window.omicomic,root=window.__omiTabletRoot;
const value=async promise=>{const result=await promise;if(!result.ok)throw Error(result.error.message);return result.data;};
const digest=text=>{let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return(hash>>>0).toString(16);};
const checks=[];
// Exercise the shipped native document service and its normal chapter sanitizer.
// UI entry timing is measured separately; these numbers isolate file/ZIP work.
for(const name of ['Text.epub','StartupPictures.epub','StartupDeep.epub']){
  let expected;
  const runs=[];
  for(let run=0;run<8;run++){
    const id='startup1186-'+name+'-'+run,started=performance.now();
    try{
      const opened=await value(api.openDocument({path:root+'/'+name,type:'epub',id,purpose:'reader'}));
      const openMs=performance.now()-started,count=opened.chapters.length;
      assert(count>0,'empty EPUB '+name);
      const indexes=[0,Math.floor((count-1)/2),count-1],reads=[];
      for(const index of indexes){
        const before=performance.now(),html=await value(api.readDocumentChapter(id,index));
        reads.push({index,ms:performance.now()-before,chars:html.length,digest:digest(html)});
      }
      const identity=JSON.stringify(reads.map(({index,chars,digest})=>({index,chars,digest})));
      if(expected===undefined)expected=identity;else assert(identity===expected,'chapter changed across opens '+name);
      runs.push({warmup:run===0,openMs,reads,totalMs:performance.now()-started,chapters:count});
    }finally{await api.closeDocument(id);}
    const afterClose=await api.readDocumentChapter(id,0);
    assert(!afterClose.ok,'closed EPUB session still readable '+name);
    await pause(30);
  }
  const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
  const measured=runs.filter(run=>!run.warmup);
  checks.push({name,runs,median:{openMs:median(measured.map(run=>run.openMs)),totalMs:median(measured.map(run=>run.totalMs)),firstMs:median(measured.map(run=>run.openMs+run.reads[0].ms)),lastChapterMs:median(measured.map(run=>run.reads.at(-1).ms))}});
}
for(const [name,shouldRead] of [['StartupFallback.epub',true],['StartupCorrupt.epub',false]]){
  const id='startup1186-'+name;
  try{
    const opened=await value(api.openDocument({path:root+'/'+name,type:'epub',id,purpose:'reader'}));
    const result=await api.readDocumentChapter(id,opened.chapters.length-1);
    assert(result.ok===shouldRead,'unexpected compatibility/integrity result '+name+': '+JSON.stringify(result));
    checks.push({name,readable:result.ok,chars:result.ok?result.data.length:undefined});
  }finally{await api.closeDocument(id);}
}
return{checks,measurement:'openDocument plus sanitized chapter reads; no UI rendering timing',viewport:{width:innerWidth,height:innerHeight},webview:navigator.userAgent};
