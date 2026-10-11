// A large, disposable local library. Generated data stays outside Git and never uses user comics.
const fs = require('node:fs');
const path = require('node:path');
const { deflateSync } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const root = path.resolve('.cache/android-performance');
const images = path.join(root, 'Pages');
const library = path.join(root, 'Performance');
fs.mkdirSync(images, { recursive: true }); fs.mkdirSync(library, { recursive: true });
const table = Array.from({ length: 256 }, (_, i) => { for (let j = 0; j < 8; j++) i = (i >>> 1) ^ (i & 1 ? 0xedb88320 : 0); return i >>> 0; });
function crc(data) { let n = -1; for (const b of data) n = (n >>> 8) ^ table[(n ^ b) & 255]; return (n ^ -1) >>> 0; }
function chunk(type, data) { const body = Buffer.concat([Buffer.from(type), data]), head = Buffer.alloc(4), tail = Buffer.alloc(4); head.writeUInt32BE(data.length); tail.writeUInt32BE(crc(body)); return Buffer.concat([head, body, tail]); }
for (let page = 1; page <= 64; page++) {
  const output = path.join(images, `page${page}.png`); if (fs.existsSync(output)) continue;
  const width = 512, height = 768, pixels = Buffer.alloc((width * 3 + 1) * height); let seed = page * 87654321;
  for (let y = 0; y < height; y++) for (let x = 1; x <= width * 3; x++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; pixels[y * (width * 3 + 1) + x] = seed & 255; }
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 2;
  fs.writeFileSync(output, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels, {level:1})), chunk('IEND', Buffer.alloc(0))]));
}
const seven = require('7zip-bin-full').path7z;
const cbz = path.join(library, 'Book01.cbz');
if (!fs.existsSync(cbz)) execFileSync(seven, ['a','-tzip','-mx=0','-bd','-bso0',cbz, path.join(images,'*.png')]);
for (let i=2;i<=12;i++) { const target=path.join(library,`Book${String(i).padStart(2,'0')}.cbz`); if(!fs.existsSync(target))fs.copyFileSync(cbz,target); }
const cb7 = path.join(library, 'Solid.cb7');
if (!fs.existsSync(cb7)) execFileSync(seven, ['a','-t7z','-mx=1','-ms=on','-md=4m','-bd','-bso0',cb7, path.join(images,'*.png')]);
const rar = path.resolve('.cache/libarchive/rar-tool/Rar.exe');
const cbr = path.join(library,'Solid.cbr');
if (fs.existsSync(rar) && !fs.existsSync(cbr)) execFileSync(rar,['a','-ma5','-m1','-s','-ep1','-idq',cbr,path.join(images,'*.png')]);
const files=fs.readdirSync(library).map(name=>({name,bytes:fs.statSync(path.join(library,name)).size}));
console.log(JSON.stringify({directory:library,pagesPerBook:64,books:files.length,totalBytes:files.reduce((s,f)=>s+f.bytes,0),files}));
