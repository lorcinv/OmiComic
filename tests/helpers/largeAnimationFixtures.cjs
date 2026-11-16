const fs = require('node:fs/promises');
const path = require('node:path');
const { crc32 } = require('node:zlib');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../../.cache/large-animation-fixtures');

// Valid container padding exercises byte limits without thousands of decoded frames.
function padded(data, format, size = 66 * 1024 ** 2) {
  const padding = Buffer.alloc(size);
  if (format === 'gif') {
    const blocks = [Buffer.from([0x21, 0xfe])];
    for (let at = 0; at < size; at += 255) { const count = Math.min(255, size-at); blocks.push(Buffer.from([count]), padding.subarray(at, at+count)); }
    blocks.push(Buffer.from([0])); return Buffer.concat([data.subarray(0,-1), ...blocks, data.subarray(-1)]);
  }
  if (format === 'webp') {
    const header = Buffer.alloc(8); header.write('JUNK'); header.writeUInt32LE(size,4);
    const result = Buffer.concat([data,header,padding]);result.writeUInt32LE(result.length-8,4);return result;
  }
  const header=Buffer.alloc(8), end=Buffer.alloc(4);header.writeUInt32BE(size);header.write('npAd',4);end.writeUInt32BE(crc32(padding,crc32(header.subarray(4))));
  return Buffer.concat([data.subarray(0,-12),header,padding,end,data.subarray(-12)]);
}
function zip(entries) {
  const local=[], central=[];let offset=0;
  for (const [name,value] of entries) {
    const n=Buffer.from(name),data=Buffer.isBuffer(value)?value:Buffer.from(value),crc=crc32(data),h=Buffer.alloc(30),c=Buffer.alloc(46);
    h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt32LE(crc,14);h.writeUInt32LE(data.length,18);h.writeUInt32LE(data.length,22);h.writeUInt16LE(n.length,26);
    c.writeUInt32LE(0x02014b50);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt32LE(crc,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    local.push(h,n,data);central.push(c,n);offset+=h.length+n.length+data.length;
  }
  const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,cd,end]);
}
async function prepare() {
  await fs.mkdir(root,{recursive:true});
  const still=await fs.readFile(path.join(__dirname,'../fixtures/animations/static.webp'));
  for(const format of ['gif','webp','apng']) {
    const folder=path.join(root,`Large-${format}`);await fs.mkdir(folder,{recursive:true});
    if(!await fs.stat(path.join(folder,`01.${format}`)).catch(()=>null))await fs.writeFile(path.join(folder,`01.${format}`),padded(await fs.readFile(path.join(__dirname,`../fixtures/animations/animated.${format}`)),format));
    await fs.writeFile(path.join(folder,'02.webp'),still);
    const data=await fs.readFile(path.join(folder,`01.${format}`));
    if(!await fs.stat(folder+'.cbz').catch(()=>null))await fs.writeFile(folder+'.cbz',zip([[`01.${format}`,data],['02.webp',still]]));
    if(!await fs.stat(folder+'.epub').catch(()=>null))await fs.writeFile(folder+'.epub',zip([
      ['META-INF/container.xml','<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'],
      ['book.opf','<package><manifest><item id="a" href="first.xhtml" media-type="application/xhtml+xml"/><item id="b" href="second.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>'],
      ['first.xhtml',`<html><body><img src="01.${format}"/></body></html>`],['second.xhtml','<html><body><img src="02.webp"/></body></html>'],[`01.${format}`,data],['02.webp',still],
    ]));
  }
  const seven=path.join(root,'Large-gif.cb7');
  const mixed=path.join(root,'Large-gif.mixed.epub');
  if(!await fs.stat(mixed).catch(()=>null))await fs.writeFile(mixed,zip([
    ['META-INF/container.xml','<container><rootfiles><rootfile full-path="book.opf"/></rootfiles></container>'],
    ['book.opf','<package><manifest><item id="a" href="first.xhtml" media-type="application/xhtml+xml"/><item id="b" href="second.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>'],
    ['first.xhtml','<html><body><p>Animation in text</p><img src="01.gif"/><p>Text after animation</p></body></html>'],['second.xhtml','<html><body><img src="02.webp"/></body></html>'],['01.gif',await fs.readFile(path.join(root,'Large-gif/01.gif'))],['02.webp',still],
  ]));
  if(!await fs.stat(seven).catch(()=>null))execFileSync(require('7zip-bin-full').path7z,['a','-t7z','-mx=0','-bd','-bso0',seven,'01.gif','02.webp'],{cwd:path.join(root,'Large-gif'),windowsHide:true});
  if(process.env.OMICOMIC_REAL_GIF){const folder=path.join(root,'Lorenzo');await fs.mkdir(folder,{recursive:true});await fs.copyFile(process.env.OMICOMIC_REAL_GIF,path.join(folder,'01.gif'));await fs.writeFile(path.join(folder,'02.webp'),still);}
  return root;
}
module.exports={root,prepare,padded,zip};
if(require.main===module)prepare().then(root=>console.log(root)).catch(error=>{console.error(error);process.exitCode=1;});
