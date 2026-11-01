// Run with Electron, not node: nativeImage encodes photo-like RGB noise as JPEG
// and PNG. Generated files belong in the disposable test cache, never assets.
const { app, nativeImage } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const { zip } = require('../helpers/documentFixtures.cjs');
app.whenReady().then(() => {
  const target=path.resolve(process.argv[2]),width=2400,height=3200,entries=[];
  for(let page=0;page<24;page++){
    const pixels=Buffer.alloc(width*height*4);let seed=3211+page*103;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      seed=(Math.imul(seed,1664525)+1013904223)|0;
      const i=(y*width+x)*4,noise=(seed>>>25)-64;
      pixels[i]=Math.max(0,Math.min(255,50+x*150/width+noise));
      pixels[i+1]=Math.max(0,Math.min(255,70+y*150/height+noise));
      pixels[i+2]=Math.max(0,Math.min(255,80+page*4+noise));pixels[i+3]=255;
    }
    const image=nativeImage.createFromBitmap(pixels,{width,height}),png=page%6===0;
    entries.push([String(page+1).padStart(3,'0')+(png?'.png':'.jpg'),png?image.toPNG():image.toJPEG(92)]);
  }
  fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,zip(entries,true));
  console.log(JSON.stringify({pages:entries.length,width,height,archiveBytes:fs.statSync(target).size,entries:entries.map(([name,data])=>({name,bytes:data.length}))}));app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
