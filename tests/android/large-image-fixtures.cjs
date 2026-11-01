// Deterministic, streaming PNG fixtures. No giant source bitmap or checked-in binaries.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { once } = require('node:events');
const table = Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1;
  return n >>> 0;
});
function chunk(type, data) {
  const name = Buffer.from(type), out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); name.copy(out, 4); data.copy(out, 8);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([name, data])) crc = table[(crc ^ byte) & 255] ^ crc >>> 8;
  out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4); return out;
}
async function png(file, width, height, channels, noise) {
  const output = fs.createWriteStream(file), deflate = zlib.createDeflate({ level: 1 });
  const done = once(output, 'finish');
  output.write(Buffer.from([137,80,78,71,13,10,26,10]));
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height,4);
  header[8] = 8; header[9] = channels === 4 ? 6 : channels === 3 ? 2 : 0;
  output.write(chunk('IHDR',header));
  const drain = (async () => { for await (const data of deflate) if (!output.write(chunk('IDAT',data))) await once(output,'drain'); output.end(chunk('IEND',Buffer.alloc(0))); })();
  let seed = 73939133;
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1+width*channels);
    for (let x = 0; x < width*channels; x++) {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
      row[x+1] = noise ? seed & 255 : (Math.floor(x/channels)+y)%3 === 0 ? 35 : 220;
    }
    if (!deflate.write(row)) await once(deflate,'drain');
  }
  deflate.end(); await drain; await done;
  return { name:path.basename(file),width,height,bytes:fs.statSync(file).size };
}
(async () => {
  const dir = path.resolve(process.argv[2] || '.cache/android-large-images');fs.mkdirSync(dir,{recursive:true});
  const results=[];
  for (const [name,w,h,c,noise] of [['bytes',1500,1500,3,true],['pixels',4096,4096,1,false],['long',257,16384,1,false],['alpha',1200,1200,4,true]])
    results.push(await png(path.join(dir,name+'.png'),w,h,c,noise));
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
})().catch(error=>{console.error(error);process.exitCode=1;});
