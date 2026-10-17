const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { _electron, expect } = require('@playwright/test');
const { Resvg } = require('@resvg/resvg-js');
const { zip } = require('./helpers/documentFixtures.cjs');

async function hash(file) {
  const result = createHash('sha256');
  for await (const chunk of createReadStream(file)) result.update(chunk);
  return result.digest('hex');
}
function bmp(width=16, height=16) {
  const bytes=width*height*3;
  const data=Buffer.alloc(54+bytes); data.write('BM'); data.writeUInt32LE(data.length,2);
  data.writeUInt32LE(54,10); data.writeUInt32LE(40,14); data.writeInt32LE(width,18); data.writeInt32LE(height,22);
  data.writeUInt16LE(1,26); data.writeUInt16LE(24,28); data.writeUInt32LE(bytes,34);
  data.fill(Buffer.from([160,125,85]),54); return data;
}
function largePng() {
  const width=2400,height=2400,stride=width*3+1;
  const data=Buffer.alloc(stride*height);
  for(let row=0;row<height;row++)data.fill(Buffer.from([85,125,160]),row*stride+1,(row+1)*stride);
  const table=Uint32Array.from({length:256},(_,crc)=>{for(let bit=0;bit<8;bit++)crc=crc&1?0xedb88320^(crc>>>1):crc>>>1;return crc>>>0;});
  function chunk(name,data) {
    const result=Buffer.alloc(data.length+12);result.writeUInt32BE(data.length);result.write(name,4);data.copy(result,8);
    let crc=0xffffffff;for(const byte of result.subarray(4,-4))crc=table[(crc^byte)&255]^(crc>>>8);
    result.writeUInt32BE((crc^0xffffffff)>>>0,result.length-4);return result;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',require('node:zlib').deflateSync(data,{level:0})),chunk('IEND',Buffer.alloc(0))]);
}

test('PC large scan covers decode, coalesce, retain first-page order, and render in the real library', {timeout:120000}, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-large-covers-'));
  const books=path.join(root,'Books'),profile=path.join(root,'profile');
  await fs.mkdir(books); await fs.mkdir(profile);
  let app;
  t.after(async()=>{
    if(app) await app.close();
    assert.equal(path.dirname(root),path.resolve(os.tmpdir())); assert.ok(path.basename(root).startsWith('omicomic-large-covers-'));
    await fs.rm(root,{recursive:true,force:true});
  });
  const scan=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="3500" height="5200"><rect width="3500" height="5200" fill="#7498b7"/><circle cx="1750" cy="2000" r="1000" fill="#e6ddc8"/><path d="M0 5200 1750 2600 3500 5200" fill="#4e627a"/></svg>').render().asPng();
  const pixel=await fs.readFile('tests/fixtures/images/pixel.png');
  await fs.writeFile(path.join(books,'01 High resolution.cbz'),zip([['001.png',scan],['002.png',pixel]]));
  const largeImage=largePng();
  await fs.writeFile(path.join(books,'02 Large image.cbz'),zip([['001.png',largeImage],['002.png',pixel]]));
  await fs.writeFile(path.join(books,'03 Broken first.cbz'),zip([['001.png','broken'],['002.png',scan]]));
  for(const [name,fixture] of [['04 RAR4.rar','RAR4.rar'],['05 RAR5.cbr','RAR5.cbr'],['06 Solid.cb7','Solid.cb7']]) {
    await fs.copyFile(path.join('tests/fixtures/android-archives',fixture),path.join(books,name));
  }
  await fs.writeFile(path.join(books,'07 Bitmap.cbz'),zip([['001.bmp',bmp()]]));
  const sample=process.env.OMICOMIC_COVER_SAMPLE;
  const before=sample?{hash:await hash(sample),stat:await fs.stat(sample)}:null;
  const roots=[{path:books,name:'Books',addedAt:1,lastOpenedAt:1}];
  if(sample) roots.push({path:path.dirname(sample),name:'Read-only sample',addedAt:1,lastOpenedAt:1});
  await fs.writeFile(path.join(profile,'omicomic-data.json'),JSON.stringify({version:1,library:{roots,lastActiveRootPath:books,lastCurrentPath:books}}));
  const env={...process.env,OMICOMIC_TEST_PROFILE:profile,OMICOMIC_TEST_HEADLESS:'1'};
  delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
  const executable=process.env.OMICOMIC_PACKAGED_EXE||require('electron');
  app=await _electron.launch({executablePath:executable,args:process.env.OMICOMIC_PACKAGED_EXE?[]:['.'],env});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1440,960));
  const page=await app.firstWindow(); await page.emulateMedia({reducedMotion:'reduce'});
  await page.locator('.omi-home__library').click();
  const cards=page.locator('.resource-card'); await expect(cards).toHaveCount(7);
  await expect.poll(()=>cards.locator('.resource-preview img').evaluateAll(images=>images.filter(image=>image.complete&&image.naturalWidth>0).length),{timeout:25000}).toBe(7);
  const sizes=await cards.locator('.resource-preview img').evaluateAll(images=>images.map(image=>({width:image.naturalWidth,height:image.naturalHeight})));
  assert.deepEqual(sizes[0],{width:242,height:360});
  assert.deepEqual(sizes[1],{width:360,height:360});
  assert.deepEqual(sizes[2],{width:242,height:360});
  assert.ok(sizes.every(size=>Math.max(size.width,size.height)<=360));
  await page.screenshot({path:'test-results/pc-large-covers.png'});
  let sampleResult;
  if(sample) {
    sampleResult=await page.evaluate(async file=>{
      const start=performance.now();
      const results=await Promise.all(Array.from({length:12},()=>window.omicomic.getThumbnail({path:file,type:'archive'})));
      if(!results.every(result=>result.ok&&result.data.url))throw new Error('Missing real sample cover');
      const url=results[0].data.url;
      const image=new Image();image.src=url;await image.decode();
      const coldMs=Math.round(performance.now()-start),warmStart=performance.now();
      const cached=await window.omicomic.getThumbnail({path:file,type:'archive'});
      return {requests:results.length,allEqual:results.every(result=>result.data.url===url),width:image.naturalWidth,height:image.naturalHeight,coldMs,warmMs:Math.round(performance.now()-warmStart),cachedEqual:cached.ok&&cached.data.url===url,outputBytes:url.length};
    },sample);
    assert.equal(sampleResult.allEqual,true);assert.equal(sampleResult.cachedEqual,true);
    assert.deepEqual([sampleResult.width,sampleResult.height],[242,360]);
    const after=await fs.stat(sample); assert.equal(after.size,before.stat.size);assert.equal(after.mtimeMs,before.stat.mtimeMs);
    assert.equal(await hash(sample),before.hash);
    sampleResult={...sampleResult,archiveBytes:after.size,sourceUnchanged:true};
  }
  // Exercise the real dialog without ever submitting a file action.
  await cards.first().getByRole('button',{name:'打开资源信息',exact:true}).click();
  const dismiss=page.getByRole('button',{name:'关闭错误提示',exact:true});
  if(await dismiss.isVisible())await dismiss.click();
  await page.getByRole('button',{name:'删除…',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'删除资源',exact:true});
  await expect(dialog.getByRole('radio',{name:/仅移除索引/})).toBeChecked();
  for(const theme of ['mist','night','sand']) {
    await page.evaluate(theme=>{document.documentElement.dataset.colorTheme=theme;},theme);
    await page.screenshot({path:`test-results/pc-delete-dialog-${theme}.png`});
  }
  await dialog.getByRole('radio',{name:/同时删除本地文件/}).check();
  await expect(dialog.getByRole('button',{name:'移入回收站',exact:true})).toBeVisible();
  await page.evaluate(()=>{document.documentElement.dataset.colorTheme='mist';});
  await page.screenshot({path:'test-results/pc-delete-dialog-trash.png'});
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
  const result={version:await app.evaluate(({app})=>app.getVersion()),executable,realLibraryCovers:7,largeImageBytes:largeImage.length,sizes,sample:sampleResult,deleteDialogThemes:['mist','night','sand'],fileActionSubmitted:false};
  await fs.writeFile('test-results/large-covers-smoke.json',JSON.stringify(result,null,2)+'\n');t.diagnostic(JSON.stringify(result));
});
