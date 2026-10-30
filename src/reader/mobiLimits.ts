export const MAX_MOBI_BYTES=64*1024*1024,MAX_MOBI_TEXT=8*1024*1024;
function textRecordLength(input:Uint8Array,compression:number,flags:number){
  let data=input;
  for(let bits=flags>>>1;bits;bits>>>=1)if(bits&1){let size=0;for(const byte of data.subarray(Math.max(0,data.length-4))){if(byte&128)size=0;size=(size<<7)|(byte&127);}if(size<=0||size>data.length)throw Error('MOBI 文本尾部无效。');data=data.subarray(0,data.length-size);}
  if(flags&1){const tail=(data[data.length-1]&3)+1;if(tail>data.length)throw Error('MOBI 文本尾部无效。');data=data.subarray(0,data.length-tail);}
  if(compression===1)return data.length;
  let length=0;
  for(let i=0;i<data.length;i++){
    const byte=data[i];
    if(byte>=1&&byte<=8){if(i+byte>=data.length)throw Error('MOBI 压缩文本损坏。');i+=byte;length+=byte;}
    else if(byte>=128&&byte<192){if(++i>=data.length)throw Error('MOBI 压缩文本损坏。');const value=((byte<<8)|data[i])&0x3fff,distance=value>>>3;if(!distance||distance>length)throw Error('MOBI 压缩文本引用无效。');length+=(value&7)+3;}
    else length+=byte>=192?2:1;
    if(length>16384)throw Error('MOBI 解压文本记录过大。');
  }
  return length;
}
/** Bound records before invoking the third-party decompressor. */
export function inspectMobi(buffer:ArrayBuffer){
  const bytes=new Uint8Array(buffer),view=new DataView(buffer),ascii=(start:number,count:number)=>String.fromCharCode(...bytes.subarray(start,start+count));
  if(bytes.length<78||bytes.length>MAX_MOBI_BYTES||ascii(60,8)!=='BOOKMOBI')throw Error('文件不是有效的 MOBI，或超过本版 64 MB 上限。');
  const count=view.getUint16(76);if(count<2||count>20000||78+count*8>bytes.length)throw Error('MOBI 记录表无效。');
  const offsets=Array.from({length:count},(_,n)=>view.getUint32(78+n*8));
  if(offsets.some((offset,n)=>offset<78+count*8||offset>=bytes.length||n>0&&offset<=offsets[n-1]))throw Error('MOBI 记录范围无效。');
  const header=(index:number)=>{
    const start=offsets[index],end=offsets[index+1]??bytes.length;
    if(start===undefined||end-start<248||ascii(start+16,4)!=='MOBI')throw Error('MOBI 书目无效。');
    if(view.getUint16(start+12)!==0)throw Error('暂不支持带 DRM 加密的 MOBI。');
    const compression=view.getUint16(start),text=view.getUint32(start+4),records=view.getUint16(start+8),version=view.getUint32(start+36),encoding=view.getUint32(start+28),length=view.getUint32(start+20);
    if(![1,2].includes(compression))throw Error('本版暂不支持这种 MOBI 压缩方式，请先转换为 EPUB。');
    if(!text||text>MAX_MOBI_TEXT||!records||records>4096||index+records>=count)throw Error('MOBI 文本或章节超过本版上限。');
    if(![1252,65001].includes(encoding))throw Error('MOBI 文字编码暂不支持，请先转换为 EPUB。');
    if(length<232||start+16+length>end||!(view.getUint32(start+128)&64))throw Error('本版暂不支持此旧式 MOBI 书目，请先转换为 EPUB。');
    const exth=start+16+length;
    if(exth+12>end||ascii(exth,4)!=='EXTH')throw Error('MOBI 扩展书目无效。');
    const exthEnd=exth+view.getUint32(exth+4),exthCount=view.getUint32(exth+8);if(exthEnd>end||exthCount>1000)throw Error('MOBI 扩展书目过大。');
    let cursor=exth+12,boundary=-1;
    for(let n=0;n<exthCount;n++){if(cursor+8>exthEnd)throw Error('MOBI 扩展书目损坏。');const kind=view.getUint32(cursor),size=view.getUint32(cursor+4);if(size<8||cursor+size>exthEnd)throw Error('MOBI 扩展记录损坏。');if(kind===121&&size>=12){const candidate=view.getUint32(cursor+8);if(candidate!==0xffffffff)boundary=candidate;}cursor+=size;}
    // Every record is bounded, including a malicious compression stream. HUFF
    // is deliberately excluded from this first integration.
    let encoded=0,decoded=0;for(let n=1;n<=records;n++){const begin=offsets[index+n],end=offsets[index+n+1]??bytes.length,size=end-begin;if(size>16384)throw Error('MOBI 文本记录过大。');encoded+=size;decoded+=textRecordLength(bytes.subarray(begin,end),compression,view.getUint32(start+240));if(decoded>MAX_MOBI_TEXT||decoded>text+16384)throw Error('MOBI 解压文本超过本版上限。');}if(encoded>MAX_MOBI_TEXT*2)throw Error('MOBI 压缩文本过大。');
    return {version,boundary};
  };
  const first=header(0);
  if(first.version>=8||first.boundary>=0)throw Error('本版先支持传统 MOBI，KF8／双格式文件请先转换为 EPUB。');
  if(offsets.some(offset=>ascii(offset,4)==='FONT'))throw Error('本版暂不支持此 MOBI 的内嵌字体，请先转换为 EPUB。');
  return {kf8:false};
}
