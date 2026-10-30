/** Original, tiny MOBI fixtures. No copyrighted books or external executables. */
function mobiFixture(pages,images=[],options={}){
  const text=Buffer.from('<html><head><title>Omi fixture</title></head><body>'+pages.join('<mbp:pagebreak/>')+'</body></html>');
  const texts=[];for(let n=0;n<text.length;n+=4096)texts.push(text.subarray(n,n+4096));
  const first=Buffer.alloc(280);first.writeUInt16BE(options.compression??1,0);first.writeUInt32BE(text.length,4);first.writeUInt16BE(texts.length,8);first.writeUInt16BE(4096,10);first.writeUInt16BE(options.encryption??0,12);
  first.write('MOBI',16);first.writeUInt32BE(232,20);first.writeUInt32BE(2,24);first.writeUInt32BE(65001,28);first.writeUInt32BE(1234,32);first.writeUInt32BE(6,36);first.writeUInt32BE(260,84);first.writeUInt32BE(11,88);first.writeUInt32BE(texts.length+1,108);first.writeUInt32BE(0x40,128);first.writeUInt32BE(0xffffffff,244);first.write('EXTH',248);first.writeUInt32BE(12,252);first.writeUInt32BE(0,256);first.write('Omi fixture',260);
  const records=[first,...texts,...images],header=Buffer.alloc(78+records.length*8+2);header.write('Omi fixture');header.write('BOOKMOBI',60);header.writeUInt16BE(records.length,76);
  let offset=header.length;for(let n=0;n<records.length;n++){header.writeUInt32BE(offset,78+n*8);header.writeUInt32BE(n+1,82+n*8);offset+=records[n].length;}
  return Buffer.concat([header,...records]);
}
module.exports={mobiFixture};
