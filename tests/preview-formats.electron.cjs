const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {_electron}=require('@playwright/test'),{zip}=require('./helpers/documentFixtures.cjs');

test('actual desktop thumbnails decode every supported image format from files and archives',{timeout:90000},async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-preview-formats-')),profile=path.join(root,'profile');await fs.mkdir(profile);
 const bmp=Buffer.alloc(58);bmp.write('BM');bmp.writeUInt32LE(58,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(1,18);bmp.writeInt32LE(1,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);bmp[54]=120;bmp[55]=90;bmp[56]=60;
 const entries=[['test.png',await fs.readFile('tests/fixtures/images/pixel.png')],['test.jpg',await fs.readFile('tests/fixtures/android-antialias/lines.jpg')],['test.jpeg',await fs.readFile('tests/fixtures/android-antialias/lines.jpg')],['test.webp',await fs.readFile('tests/fixtures/omi-icon.webp')],['test.bmp',bmp],['test.gif',Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7','base64')]];
 for(const[name,bytes]of entries)await fs.writeFile(path.join(root,name),bytes);const archive=path.join(root,'images.cbz');await fs.writeFile(archive,zip(entries));
 const env={...process.env,OMICOMIC_TEST_PROFILE:profile,OMICOMIC_TEST_HEADLESS:'1'};delete env.ELECTRON_RUN_AS_NODE;delete env.VITE_DEV_SERVER_URL;
 const exe=process.env.OMICOMIC_PACKAGED_EXE,app=await _electron.launch({executablePath:exe||require('electron'),args:exe?[]:['.'],env});
 t.after(async()=>{await app.close();assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith('omicomic-preview-formats-'));await fs.rm(root,{recursive:true,force:true});});
 const page=await app.firstWindow();await page.waitForFunction(()=>!!window.omicomic);
 await page.evaluate(async root=>{const result=await window.omicomic.addLibraryRoot({path:root,name:'Synthetic previews'});if(!result.ok)throw Error(result.error.message);},root);
 const results=await page.evaluate(async({root,archive,names})=>{
  const result=[];for(const archived of[false,true])for(const name of names){
   const preview=await window.omicomic.getPageImage({sourcePath:archived?archive:root+'/'+name,archiveInnerPath:archived?name:undefined,type:archived?'archive-image':'folder-image',preview:true});
   if(!preview.ok)throw Error(name+': '+JSON.stringify(preview));const image=new Image();image.src=preview.data.url;await image.decode();
   result.push({name,archived,width:image.naturalWidth,height:image.naturalHeight,url:preview.data.url.slice(0,22)});
  }return result;
 },{root,archive,names:entries.map(([name])=>name)});
 assert.equal(results.length,12);assert(results.every(item=>item.width>0&&item.height>0&&Math.max(item.width,item.height)<=360&&item.url==='data:image/png;base64,'));
 console.log(JSON.stringify({previewFormats:results}));
});
