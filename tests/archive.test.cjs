const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const archive = require('../dist-electron/services/archiveService');
const { ARCHIVE_LIMITS, createEntryGuard, validateEntryName } = require('../dist-electron/services/archiveSafety');
const { path7z: path7za } = require('7zip-bin-full');
const exec = promisify(execFile);
const crcTable = Uint32Array.from({length:256}, (_, n) => {for(let i=0;i<8;i++) n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data) { let n=0xffffffff; for(const b of data)n=crcTable[(n^b)&255]^(n>>>8);return(n^0xffffffff)>>>0; }
function zip(entries) {
  const chunks = [], directory = []; let offset=0;
  for(const e of entries) {
    const name=Buffer.from(e.name); const data=e.data||Buffer.from('image fixture'); const crc=e.badCrc?0:crc32(data);
    const local=Buffer.alloc(30); local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800|(e.encrypted?1:0),6);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length+(e.encrypted?12:0),18);local.writeUInt32LE(e.declaredSize??data.length,22);local.writeUInt16LE(name.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x800|(e.encrypted?1:0),8);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length+(e.encrypted?12:0),20);central.writeUInt32LE(e.declaredSize??data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    chunks.push(local,name,data);directory.push(central,name);offset+=local.length+name.length+data.length;
  }
  const dir=Buffer.concat(directory);const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...chunks,dir,end]);
}
async function temp(t) { const dir=await fs.mkdtemp(path.join(os.tmpdir(),'omicomic-archive-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir; }
async function fixture(t,name,entries) { const dir=await temp(t);const p=path.join(dir,name);await fs.writeFile(p,zip(entries));return p; }
const hasCode = code => error => error.code === code;
test('ZIP/CBZ naturally sorted, nested Unicode, exact bytes', async t => {
 const p=await fixture(t,'comic.cbz',[{name:'章/10.jpg'},{name:'章/2.jpg'},{name:'README.txt'}]);
 assert.deepEqual((await archive.读取压缩包图片列表(p)).map(e=>e.virtualPath),['章/2.jpg','章/10.jpg']);
 assert.equal((await archive.读取压缩包单张图片(p,'章/2.jpg')).toString(),'image fixture');
});
test('10,000 pages index and last page read; bounded metadata', async t => {
 const start=performance.now();const p=await fixture(t,'many.zip',Array.from({length:10000},(_,i)=>({name:`page-${i}.jpg`})));
 assert.equal((await archive.读取压缩包图片列表(p)).length,10000);
 assert.equal((await archive.读取压缩包单张图片(p,'page-9999.jpg')).length,13);
 t.diagnostic(JSON.stringify({scenario:'10000-entry ZIP',archiveBytes:(await fs.stat(p)).size,durationMs:Math.round(performance.now()-start)}));
});
test('20,001 entries rejected before enumeration', async t => {
 const p=await fixture(t,'overflow.zip',Array.from({length:20001},(_,i)=>({name:`${i}.jpg`})));await assert.rejects(archive.读取压缩包图片列表(p),hasCode('ARCHIVE_LIMIT_EXCEEDED'));
});
test('32 MiB page reads, tighter caller limit rejects without decoding', async t => {
 const data=Buffer.alloc(32*1024*1024,0x61);const p=await fixture(t,'large.cbz',[{name:'large.jpg',data}]);
 assert.equal((await archive.读取压缩包单张图片(p,'large.jpg')).length,data.length);
 await assert.rejects(archive.读取压缩包单张图片(p,'large.jpg',1024),hasCode('ARCHIVE_IMAGE_TOO_LARGE'));
 t.diagnostic(`1 entry; ${data.length} output bytes; ${(await fs.stat(p)).size} archive bytes`);
});
test('reject traversal, absolute, drive, control, duplicate names', async t => {
 for(const name of ['../out.jpg','/out.jpg','C:/out.jpg','safe/../../out.jpg','x\n.jpg']) {
  assert.throws(()=>validateEntryName(name)); const p=await fixture(t,'bad.zip',[{name}]);await assert.rejects(archive.读取压缩包图片列表(p));
 }
 const p=await fixture(t,'duplicate.zip',[{name:'a.jpg'},{name:'a.jpg'}]);await assert.rejects(archive.读取压缩包图片列表(p),hasCode('ARCHIVE_UNSAFE_ENTRY'));
});
test('corrupt ZIP CRC and truncated directories rejected', async t => {
 const p=await fixture(t,'crc.zip',[{name:'a.jpg',badCrc:true}]);await assert.rejects(archive.读取压缩包单张图片(p,'a.jpg'),hasCode('ARCHIVE_READ_FAILED'));
 await fs.writeFile(p,Buffer.from('PK corrupt'));await assert.rejects(archive.读取压缩包图片列表(p),hasCode('ARCHIVE_READ_FAILED'));
});
test('encrypted entry and invalid caller limits rejected', async t => {
 const p=await fixture(t,'encrypted.zip',[{name:'a.jpg',encrypted:true}]);await assert.rejects(archive.读取压缩包图片列表(p),hasCode('ARCHIVE_ENCRYPTED'));
 for(const limit of [NaN,0,-1,Infinity,ARCHIVE_LIMITS.imageBytes+1]) await assert.rejects(archive.读取压缩包单张图片(p,'a.jpg',limit),hasCode('ARCHIVE_LIMIT_EXCEEDED'));
});
test('metadata guard rejects declared bomb sizes, ratios and cumulative totals', () => {
 assert.throws(()=>createEntryGuard()({virtualPath:'huge.jpg',size:2**53}));
 assert.throws(()=>createEntryGuard()({virtualPath:'bomb.jpg',size:32*1024*1024},1));
 const guard=createEntryGuard(10);guard({virtualPath:'a.jpg',size:6});assert.throws(()=>guard({virtualPath:'b.jpg',size:6}));
});
test('7z and CB7 list/read; 1,000 entries, wildcard literal, Unicode', async t => {
 const dir=await temp(t);const input=path.join(dir,'input');await fs.mkdir(input);
 await Promise.all(Array.from({length:1000},(_,i)=>fs.writeFile(path.join(input,`page-${i}.jpg`),`image-${i}`)));
 await fs.writeFile(path.join(input,'封面.jpg'),'unicode');
 const p=path.join(dir,'comic.cb7');await exec(path7za,['a','-t7z',p,'.'],{cwd:input});
 assert.equal((await archive.读取压缩包图片列表(p)).length,1001);
 assert.equal((await archive.读取压缩包单张图片(p,'page-999.jpg')).toString(),'image-999');
 assert.equal((await archive.读取压缩包单张图片(p,'封面.jpg')).toString(),'unicode');
 t.diagnostic(`1001 entries; ${(await fs.stat(p)).size} compressed bytes`);
});
test('7z corrupt, encrypted content and encrypted headers rejected', async t => {
 const dir=await temp(t);const image=path.join(dir,'a.jpg');await fs.writeFile(image,'fixture');
 for(const headers of [false,true]) {const p=path.join(dir,`encrypted-${headers}.7z`);await exec(path7za,['a','-t7z','-psecret',...(headers?['-mhe=on']:[]),p,image]);await assert.rejects(archive.读取压缩包图片列表(p));}
 const p=path.join(dir,'bad.7z');await fs.writeFile(p,'7z damaged');await assert.rejects(archive.读取压缩包图片列表(p),hasCode('ARCHIVE_READ_FAILED'));
});
test('RAR corrupt input safely rejected', async t => {
 const dir=await temp(t);const p=path.join(dir,'bad.rar');await fs.writeFile(p,'Rar! damaged');await assert.rejects(archive.读取压缩包图片列表(p),hasCode('ARCHIVE_READ_FAILED'));

});

function rar(entries) {
 const header=(type,flags,size)=>{const b=Buffer.alloc(size);b[2]=type;b.writeUInt16LE(flags,3);b.writeUInt16LE(size,5);return b;};
 const seal=b=>{b.writeUInt16LE(crc32(b.subarray(2))&0xffff,0);return b;};
 const main=seal(header(0x73,0,13));const blocks=[Buffer.from([0x52,0x61,0x72,0x21,0x1a,0x07,0]),main];
 for(const entry of entries){const name=Buffer.from(entry.name);const data=entry.data||Buffer.from('rar fixture');const h=header(0x74,0x8000|(entry.encrypted?4:0),32+name.length);h.writeUInt32LE(data.length,7);h.writeUInt32LE(data.length,11);h[15]=2;h.writeUInt32LE(entry.badCrc?0:crc32(data),16);h[24]=20;h[25]=0x30;h.writeUInt16LE(name.length,26);h.writeUInt32LE(0x20,28);name.copy(h,32);blocks.push(seal(h),data);}
 blocks.push(seal(header(0x7b,0,7)));return Buffer.concat(blocks);
}
test('RAR/CBR real stored-format fixtures: 1,000 pages and exact bytes', async t=>{
 const dir=await temp(t);const p=path.join(dir,'comic.cbr');await fs.writeFile(p,rar(Array.from({length:1000},(_,i)=>({name:`pages/${i}.jpg`}))));
 assert.equal((await archive.读取压缩包图片列表(p)).length,1000);
 assert.equal((await archive.读取压缩包单张图片(p,'pages/999.jpg')).toString(),'rar fixture');
 t.diagnostic(`1000 RAR entries; ${(await fs.stat(p)).size} compressed bytes`);
});
test('RAR stored large page, corruption, encryption and traversal guards', async t=>{
 const dir=await temp(t);const p=path.join(dir,'page.rar');const data=Buffer.alloc(8*1024*1024,0x61);await fs.writeFile(p,rar([{name:'large.jpg',data}]));
 assert.equal((await archive.读取压缩包单张图片(p,'large.jpg')).length,data.length);
 await assert.rejects(archive.读取压缩包单张图片(p,'large.jpg',1024),hasCode('ARCHIVE_IMAGE_TOO_LARGE'));
 for(const [entry,code] of [[{name:'bad.jpg',badCrc:true},'ARCHIVE_READ_FAILED'],[{name:'encrypted.jpg',encrypted:true},'ARCHIVE_ENCRYPTED'],[{name:'../bad.jpg'},'ARCHIVE_UNSAFE_ENTRY']]){
  const name=path.join(dir,`${code}.rar`);await fs.writeFile(name,rar([entry]));await assert.rejects(archive.读取压缩包单张图片(name,entry.name),hasCode(code));
 }
});

test('7z 32 MiB stored page and high-compression bomb refusal', async t => {
 const dir=await temp(t);const page=path.join(dir,'large.jpg');const data=Buffer.alloc(32*1024*1024,0x61);await fs.writeFile(page,data);
 const normal=path.join(dir,'large.7z');await exec(path7za,['a','-t7z','-mx=0',normal,page]);
 assert.equal((await archive.读取压缩包单张图片(normal,'large.jpg')).length,data.length);
 await assert.rejects(archive.读取压缩包单张图片(normal,'large.jpg',1024),hasCode('ARCHIVE_IMAGE_TOO_LARGE'));
 const bomb=path.join(dir,'ratio.7z');await exec(path7za,['a','-t7z','-mx=1',bomb,page]);await assert.rejects(archive.读取压缩包图片列表(bomb),hasCode('ARCHIVE_LIMIT_EXCEEDED'));
 t.diagnostic(`1 entry; ${data.length} output bytes; stored ${(await fs.stat(normal)).size} bytes; bomb ${(await fs.stat(bomb)).size} bytes rejected`);
});
test('7z literal wildcard selector does not read other pages', {skip:process.platform==='win32'}, async t => {
 const dir=await temp(t);await fs.writeFile(path.join(dir,'a*.jpg'),'literal');await fs.writeFile(path.join(dir,'abc.jpg'),'other');const p=path.join(dir,'wild.7z');
 await exec(path7za,['a','-t7z',p,'a*.jpg','abc.jpg'],{cwd:dir});assert.equal((await archive.读取压缩包单张图片(p,'a*.jpg')).toString(),'literal');
});
test('metadata cache invalidates after archive replacement; parallel reads stay correct', async t => {
 const p=await fixture(t,'cache.cbz',[{name:'old.jpg'}]);assert.equal((await archive.读取压缩包图片列表(p))[0].virtualPath,'old.jpg');
 await fs.writeFile(p,zip([{name:'new-long-name.jpg',data:Buffer.from('updated')}]))
 assert.equal((await archive.读取压缩包图片列表(p))[0].virtualPath,'new-long-name.jpg');
 const reads=await Promise.all(Array.from({length:12},()=>archive.读取压缩包单张图片(p,'new-long-name.jpg')));assert.ok(reads.every(data=>data.toString()==='updated'));
});

test('legacy ZIP Windows separators normalize safely', async t => {
 const p=await fixture(t,'windows.cbz',[{name:'chapter\\page.jpg'}]);assert.equal((await archive.读取压缩包图片列表(p))[0].virtualPath,'chapter/page.jpg');assert.equal((await archive.读取压缩包单张图片(p,'chapter/page.jpg')).toString(),'image fixture');
 const unsafe=await fixture(t,'traversal.cbz',[{name:'chapter\\..\\..\\out.jpg'}]);await assert.rejects(archive.读取压缩包图片列表(unsafe));
});
