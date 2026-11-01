const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {_electron}=require('@playwright/test');
const {Resvg}=require('@resvg/resvg-js');
const {zip}=require('./helpers/documentFixtures.cjs');

test('real large covers decode asynchronously without blocking the main-process image path', {timeout:90000},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-cover-latency-')),profile=path.join(root,'profile');
  await fs.mkdir(profile);
  const picture=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="6000" height="4000"><rect width="6000" height="4000" fill="#d8d0c0"/><path d="M0 0L6000 4000M0 4000L6000 0" stroke="#283444" stroke-width="23"/></svg>').render().asPng();
  const file=path.join(root,'cover.png'),archive=path.join(root,'cover.cbz');
  await fs.writeFile(file,picture);await fs.writeFile(archive,zip([['cover.png',picture]]));
  await fs.writeFile(path.join(profile,'omicomic-data.json'),JSON.stringify({version:1,library:{roots:[{path:root,name:'Fixture',addedAt:1,lastOpenedAt:1}]}}));
  const env={...process.env,OMICOMIC_TEST_PROFILE:profile,OMICOMIC_TEST_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
  let app;t.after(async()=>{if(app)await app.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('omicomic-cover-latency-'));await fs.rm(root,{recursive:true,force:true});});
  const packaged=process.env.OMICOMIC_PACKAGED_EXE;
  app=await _electron.launch({executablePath:packaged||require('electron'),args:packaged?[]:['.'],env});
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.omicomic);
  const result=await app.evaluate(async({nativeImage,ipcMain,BrowserWindow,app},{file,archive,encoded})=>{
    const contents=BrowserWindow.getAllWindows()[0].webContents;
    const handler=ipcMain._invokeHandlers.get('缩略图:获取');if(!handler)throw Error('Missing cover handler');
    const cover=async(path,type)=>{const r=await handler({sender:contents,senderFrame:contents.mainFrame},{path,type});if(!r.ok)throw Error(JSON.stringify(r));return r.data.url;};
    const measure=async run=>{
      let previous=performance.now(),maxGapMs=0;
      const pulse=setInterval(()=>{const now=performance.now();maxGapMs=Math.max(maxGapMs,now-previous);previous=now;},5);
      try{await new Promise(r=>setTimeout(r,25));const start=performance.now(),url=await run();const elapsedMs=performance.now()-start;await new Promise(r=>setTimeout(r,25));return {url,elapsedMs,maxGapMs};}
      finally{clearInterval(pulse);}
    };
    const data=Buffer.from(encoded);
    // The previous implementation decoded and resized the full PNG on main.
    const baseline=await measure(()=>nativeImage.createFromBuffer(data).resize({width:360,height:240,quality:'good'}).toDataURL());
    let synchronousDecodes=0,asyncDecodes=0;
    const sync=nativeImage.createFromBuffer,asyncDecode=nativeImage.createThumbnailFromPath;
    nativeImage.createFromBuffer=(...args)=>{synchronousDecodes++;return sync(...args);};
    nativeImage.createThumbnailFromPath=(...args)=>{asyncDecodes++;return asyncDecode(...args);};
    try{
      const local=await measure(()=>cover(file,'image'));
      const packed=await measure(()=>cover(archive,'archive'));
      const decoder=BrowserWindow.getAllWindows().find(w=>w.getTitle()==='Omi thumbnail decoder');
      let decoderNavigation=0;
      if(decoder){const send=decoder.webContents.send.bind(decoder.webContents);decoder.webContents.send=(channel,...args)=>{if(channel==='外部文件:待打开')decoderNavigation++;return send(channel,...args);};}
      app.emit('second-instance',{},[],process.cwd());
      return {source:[6000,4000],encodedBytes:data.length,synchronousDecodes,asyncDecodes,backgroundDecoder:!!decoder,decoderNavigation,baseline,local,packed};
    }finally{nativeImage.createFromBuffer=sync;nativeImage.createThumbnailFromPath=asyncDecode;}
  },{file,archive,encoded:[...picture]});
  assert.equal(result.synchronousDecodes,0);assert.equal(result.asyncDecodes,0);assert.equal(result.backgroundDecoder,true);
  assert.equal(result.decoderNavigation,0);
  for(const sample of [result.local,result.packed]){
    assert.match(sample.url,/^data:image\//);
    const size=await page.evaluate(async url=>{const i=new Image();i.src=url;await i.decode();return [i.naturalWidth,i.naturalHeight];},sample.url);
    assert.ok(size.every(n=>n>0&&n<=360));delete sample.url;
  }
  delete result.baseline.url;
  await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/cover-responsiveness.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
});
