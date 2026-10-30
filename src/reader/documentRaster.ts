/** Raster metadata only; never decode unbounded document resources. */
export function documentRaster(data:Uint8Array):string|null {
  const v=new DataView(data.buffer,data.byteOffset,data.byteLength),ascii=(offset:number,n:number)=>String.fromCharCode(...data.subarray(offset,offset+n));
  let width=0,height=0,mime='';
  if(data.length>=24&&data[0]===137&&ascii(1,3)==='PNG'){width=v.getUint32(16);height=v.getUint32(20);mime='image/png';}
  else if(data.length>=10&&/^GIF8[79]a$/.test(ascii(0,6))){width=v.getUint16(6,true);height=v.getUint16(8,true);mime='image/gif';}
  else if(data.length>=26&&ascii(0,2)==='BM'){width=Math.abs(v.getInt32(18,true));height=Math.abs(v.getInt32(22,true));mime='image/bmp';}
  else if(data.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
    mime='image/webp';const kind=ascii(12,4);
    if(kind==='VP8X'){width=1+data[24]+(data[25]<<8)+(data[26]<<16);height=1+data[27]+(data[28]<<8)+(data[29]<<16);}
    else if(kind==='VP8 '&&data[23]===157&&data[24]===1&&data[25]===42){width=v.getUint16(26,true)&0x3fff;height=v.getUint16(28,true)&0x3fff;}
    else if(kind==='VP8L'&&data[20]===47){width=1+data[21]+((data[22]&63)<<8);height=1+(data[22]>>6)+(data[23]<<2)+((data[24]&15)<<10);}
  }else if(data.length>4&&data[0]===255&&data[1]===216){
    mime='image/jpeg';let i=2;const sof=new Set([192,193,194,195,197,198,199,201,202,203,205,206,207]);
    while(i+8<data.length){if(data[i++]!==255)continue;while(data[i]===255)i++;const marker=data[i++];if(marker===218||marker===217)break;if(marker===1||marker>=208&&marker<=216)continue;if(i+2>data.length)break;const size=v.getUint16(i);if(size<2||i+size>data.length)break;if(sof.has(marker)&&size>=7){height=v.getUint16(i+3);width=v.getUint16(i+5);break;}i+=size;}
  }
  return width>0&&height>0&&width<=16384&&height<=16384&&width*height<=16_000_000?mime:null;
}
