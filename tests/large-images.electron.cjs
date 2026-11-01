const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { deflateSync } = require('node:zlib');
const { _electron, expect } = require('@playwright/test');
const { Resvg } = require('@resvg/resvg-js');
const { zip } = require('./helpers/documentFixtures.cjs');

// A valid RGB PNG with uncompressed DEFLATE blocks isolates the encoded-size
// cutoff from the pixel cutoff without a huge in-memory browser fixture.
function byteHeavyPng(width, height) {
  const crc32 = data => { let crc = -1; for (const byte of data) { crc ^= byte; for (let n=0;n<8;n++) crc=(crc>>>1)^(0xedb88320&-(crc&1)); } return (crc^-1)>>>0; };
  const chunk = (name, data) => { const type=Buffer.from(name), header=Buffer.alloc(4), footer=Buffer.alloc(4);header.writeUInt32BE(data.length);footer.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([header,type,data,footer]); };
  const pixels=Buffer.alloc((width*3+1)*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*(width*3+1)+1+x*3;pixels[i]=70;pixels[i+1]=140;pixels[i+2]=190;}
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels,{level:0})),chunk('IEND',Buffer.alloc(0))]);
}

test('desktop fit filtering uses pixel budgets and zoom keeps original source pixels', {timeout:120000}, async t => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-large-images-')),books=path.join(root,'Books'),profile=path.join(root,'profile');
  await fs.mkdir(books);await fs.mkdir(profile);
  const svg=(width,height)=>new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#468cbe"/></svg>`).render().asPng();
  const cases=[{name:'01_pixels',bytes:svg(6000,4000),size:[6000,4000]},{name:'02_bytes',bytes:byteHeavyPng(2200,2000),size:[2200,2000]},{name:'03_long',bytes:svg(400,9000),size:[400,9000]}];
  assert.ok(cases[0].bytes.length<5*1024*1024);assert.ok(cases[1].bytes.length>=5*1024*1024);
  for(const entry of cases){await fs.mkdir(path.join(books,entry.name));await fs.writeFile(path.join(books,entry.name,'01.png'),entry.bytes);}
  const small=svg(600,900),archive=path.join(books,'04_small.cbz');
  await fs.writeFile(archive,zip([['01.png',small],['padding.bin',Buffer.alloc(6*1024*1024)]]));
  await fs.writeFile(path.join(profile,'omicomic-data.json'),JSON.stringify({version:1,library:{roots:[{path:books,name:'Books',addedAt:1,lastOpenedAt:1}]},settings:{readerPageMode:'single',readerPreloadPages:0,readerMemoryCacheSizeMb:128,desktopPerformanceProfile:'auto'}}));
  const env={...process.env,OMICOMIC_TEST_PROFILE:profile,OMICOMIC_TEST_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
  let app;
  t.after(async()=>{if(app)await app.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert.ok(path.basename(root).startsWith('omicomic-large-images-'));await fs.rm(root,{recursive:true,force:true});});
  const executable=process.env.OMICOMIC_PACKAGED_EXE||require('electron');
  app=await _electron.launch({executablePath:executable,args:process.env.OMICOMIC_PACKAGED_EXE?[]:['.'],env});
  const runtime=await app.evaluate(({app})=>({version:app.getVersion(),packaged:app.isPackaged}));
  assert.equal(runtime.version,require('../package.json').version);
  if(process.env.OMICOMIC_PACKAGED_EXE)assert.equal(runtime.packaged,true);
  const page=await app.firstWindow();await page.waitForFunction(()=>!!window.omicomic);
  // Production creates a display worker only on demand. Count the URL so other
  // workers do not affect the assertion.
  await page.evaluate(()=>{window.__displayWorkers=0;const Original=window.Worker;window.Worker=new Proxy(Original,{construct(Target,args){if(String(args[0]).includes('displaySampling'))window.__displayWorkers++;return new Target(...args);}});});
  await page.locator('.omi-home__library').click();
  const results=[];
  for(const entry of cases){
    const sourcePath=path.join(books,entry.name,'01.png');
    const preview=await page.evaluate(async sourcePath=>window.omicomic.getPageImage({sourcePath,type:'folder-image',preview:true}),sourcePath);
    assert.equal(preview.ok,true,JSON.stringify(preview));assert.ok(preview.data.url.startsWith('data:image/png;'));
    assert.ok(preview.data.width<=360&&preview.data.height<=360);
    const packed=path.join(books,entry.name+'.cbz');await fs.writeFile(packed,zip([['01.png',entry.bytes]]));
    const zipPreview=await page.evaluate(async sourcePath=>window.omicomic.getPageImage({sourcePath,type:'archive-image',archiveInnerPath:'01.png',preview:true}),packed);
    assert.equal(zipPreview.ok,true,JSON.stringify(zipPreview));assert.ok(zipPreview.data.width<=360&&zipPreview.data.height<=360);
    const started=Date.now();await page.locator('.resource-card').filter({hasText:entry.name}).dblclick();
    const frame=page.locator('.reader-page-frame:not([aria-hidden="true"])').first(),effects=frame.locator('.reader-effects'),image=frame.locator('img.reader-image');
    const viewport=effects.locator('.reader-viewport-raster');
    await expect(effects).toHaveAttribute('data-display-sampling','ready',{timeout:20000});
    await expect(effects.locator('.reader-display-raster')).toBeVisible();
    await expect.poll(()=>image.evaluate(img=>[img.naturalWidth,img.naturalHeight])).toEqual(entry.size);
    const fit=await effects.locator('.reader-display-raster').evaluate(c=>({width:c.width,height:c.height,rgba:[...c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data]}));
    assert.ok(fit.width*fit.height>0&&fit.width*fit.height<=4_000_000);assert.deepEqual(fit.rgba,[70,140,190,255]);
    const rgba=await image.evaluate(img=>{const c=document.createElement('canvas');c.width=c.height=1;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];});
    assert.deepEqual(rgba,[70,140,190,255]);
    const stage=page.locator('.reader-stage'),box=await stage.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
    await page.keyboard.down('Control');await page.mouse.wheel(0,-550);await page.keyboard.up('Control');
    await expect(viewport).toBeVisible({timeout:20000});
    await expect.poll(()=>viewport.evaluate(c=>Number(c.dataset.sourceWidth))).toBe(entry.size[0]);
    await expect.poll(()=>page.locator('.reader-stage').getAttribute('data-reader-zoom')).not.toBe('1');
    await page.waitForTimeout(150);
    const crop=await viewport.evaluate(c=>({width:c.width,height:c.height,rgba:[...c.getContext('2d').getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data]}));
    assert.ok(crop.width*crop.height<=8_000_000);assert.deepEqual(crop.rgba,[70,140,190,255]);
    results.push({name:entry.name,encodedBytes:entry.bytes.length,dimensions:entry.size,openMs:Date.now()-started,preview:[preview.data.width,preview.data.height],zipPreview:[zipPreview.data.width,zipPreview.data.height],rgba,fit,crop});
    await page.keyboard.press('Escape');
    await expect(page.locator('.resource-card').first()).toBeVisible();
  }
  const metadata=await page.evaluate(async archive=>window.omicomic.getPageImage({sourcePath:archive,type:'archive-image',archiveInnerPath:'01.png'}),archive);
  assert.equal(metadata.ok,true);assert.equal(metadata.data.encodedBytes,small.length);assert.ok(metadata.data.encodedBytes<5*1024*1024);
  await fs.mkdir('test-results',{recursive:true});
  const displayWorkers=await page.evaluate(()=>window.__displayWorkers);assert.ok(displayWorkers>0);
  await fs.writeFile('test-results/large-images-smoke.json',JSON.stringify({executable,...runtime,cases:results,displayWorkers,largeArchiveSmallEntryBytes:metadata.data.encodedBytes},null,2));
});
