const fs=require('node:fs'),path=require('node:path');
const {Resvg}=require('@resvg/resvg-js'),{zip}=require('../helpers/documentFixtures.cjs');
const base=path.resolve('.cache/android-native-fixtures/Native112');fs.mkdirSync(base+'/Pages',{recursive:true});
const colors=['#e2e8ee','#d2dedf','#e9dfd1','#e3ddea','#dce7d9','#e6dce2'];
for(let i=0;i<12;i++){
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1800"><rect width="100%" height="100%" fill="${colors[i%6]}"/><rect x="30" y="30" width="1140" height="1740" rx="20" fill="none" stroke="#53687a" stroke-width="4"/><text x="600" y="250" text-anchor="middle" font-size="85" fill="#34485b">OmiComic</text><text x="600" y="960" text-anchor="middle" font-size="300" fill="#34485b">${i+1}</text><text x="600" y="1600" text-anchor="middle" font-size="44" fill="#34485b">NATIVE READER TEST</text></svg>`;
  fs.writeFileSync(`${base}/Pages/${String(i+1).padStart(3,'0')}.png`,new Resvg(svg).render().asPng());
}
const entries=fs.readdirSync(base+'/Pages').map(n=>[n,fs.readFileSync(base+'/Pages/'+n)]);
fs.writeFileSync(base+'/Deflate.cbz',zip(entries,true));fs.writeFileSync(base+'/Stored.cbz',zip(entries));
fs.writeFileSync(base+'/Unicode.cbz',zip([['漫画/页1.png',entries[0][1]],['漫画/页2.png',entries[1][1]]]));
fs.mkdirSync(base+'/Large',{recursive:true});let lines='';
for(let y=0;y<10000;y+=500)lines+=`<path d="M0 ${y}H8000" stroke="#466075" stroke-width="6"/><text x="200" y="${y+200}" font-size="120" fill="#34485b">OmiComic ${y/500+1}</text>`;
for(let x=0;x<8000;x+=500)lines+=`<path d="M${x} 0V10000" stroke="#677f8e" stroke-width="4"/>`;
fs.writeFileSync(base+'/Large/large.png',new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="10000"><rect width="100%" height="100%" fill="#d2dedf"/>${lines}</svg>`).render().asPng());
fs.writeFileSync(base+'/Many.cbz',zip(Array.from({length:2500},(_,i)=>[`${String(i+1).padStart(4,'0')}.png`,entries[i%12][1]]),true));
// ZIP64 with small actual data verifies 64-bit fields without a multi-GB fixture.
const regular=zip([entries[0]],true),end=regular.length-22,central=regular.readUInt32LE(end+16),header=Buffer.from(regular.subarray(central,central+46));
const name=Buffer.from(entries[0][0]),extra=Buffer.alloc(28);extra.writeUInt16LE(1);extra.writeUInt16LE(24,2);
extra.writeBigUInt64LE(BigInt(header.readUInt32LE(24)),4);extra.writeBigUInt64LE(BigInt(header.readUInt32LE(20)),12);extra.writeBigUInt64LE(0n,20);
header.writeUInt32LE(0xffffffff,20);header.writeUInt32LE(0xffffffff,24);header.writeUInt32LE(0xffffffff,42);header.writeUInt16LE(28,30);
const cd=Buffer.concat([header,name,extra]),record=Buffer.alloc(56),locator=Buffer.alloc(20),eocd=Buffer.alloc(22);
record.writeUInt32LE(0x06064b50);record.writeBigUInt64LE(44n,4);record.writeUInt16LE(45,12);record.writeUInt16LE(45,14);record.writeBigUInt64LE(1n,24);record.writeBigUInt64LE(1n,32);record.writeBigUInt64LE(BigInt(cd.length),40);record.writeBigUInt64LE(BigInt(central),48);
locator.writeUInt32LE(0x07064b50);locator.writeBigUInt64LE(BigInt(central+cd.length),8);locator.writeUInt32LE(1,16);
eocd.writeUInt32LE(0x06054b50);eocd.writeUInt16LE(65535,8);eocd.writeUInt16LE(65535,10);eocd.writeUInt32LE(0xffffffff,12);eocd.writeUInt32LE(0xffffffff,16);
fs.writeFileSync(base+'/Zip64.cbz',Buffer.concat([regular.subarray(0,central),cd,record,locator,eocd]));
const encrypted=Buffer.from(regular);encrypted.writeUInt16LE(1,6);encrypted.writeUInt16LE(1,central+8);fs.writeFileSync(base+'/Encrypted.cbz',encrypted);
const corrupt=Buffer.from(regular);corrupt.writeUInt32LE(12345,central+16);fs.writeFileSync(base+'/BadCRC.cbz',corrupt);
fs.writeFileSync(base+'/Truncated.cbz',regular.subarray(0,regular.length-100));
console.log(base);
