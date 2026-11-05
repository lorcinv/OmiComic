import { open,type FileHandle } from 'node:fs/promises';
import { MAX_MOBI_BYTES } from '../shared/mobiLimits';

/** Separate, read-only range source. MOBI never enters the PDF or EPUB parser. */
export class MobiBinarySource {
  private constructor(private file:FileHandle,readonly size:number){}
  static async open(path:string){
    const file=await open(path,'r');
    try{
      const info=await file.stat(),header=Buffer.alloc(78);
      if(!info.isFile()||info.size<78||info.size>0x7fffffff)throw Error('MOBI 文件为空或超过 2 GiB 上限。');
      await file.read(header,0,78,0);
      if(header.toString('ascii',60,68)!=='BOOKMOBI')throw Error('文件不是有效的 MOBI。');
      return new MobiBinarySource(file,info.size);
    }catch(error){await file.close();throw error;}
  }
  async signatures(){
    if(this.size<=MAX_MOBI_BYTES)return undefined;
    const header=await this.range(0,78),count=header.readUInt16BE(76);
    if(count<2||count>20000||78+count*8>this.size)throw Error('MOBI 记录表无效。');
    const table=await this.range(78,78+count*8),signatures=Buffer.alloc(count*4);let previous=-1;
    for(let n=0;n<count;n++){const at=table.readUInt32BE(n*8);if(at<78+count*8||at<=previous||at>this.size-4)throw Error('MOBI 记录范围无效。');const bytes=await this.range(at,at+4);bytes.copy(signatures,n*4);previous=at;}
    return signatures.toString('base64');
  }
  async range(begin:number,end:number){
    if(!Number.isInteger(begin)||!Number.isInteger(end)||begin<0||end<=begin||end>this.size||end-begin>1024*1024)throw Error('MOBI 读取范围无效。');
    const data=Buffer.alloc(end-begin);let offset=0;
    while(offset<data.length){const next=await this.file.read(data,offset,data.length-offset,begin+offset);if(!next.bytesRead)throw Error('MOBI 文件读取中断。');offset+=next.bytesRead;}
    return data;
  }
  close(){return this.file.close();}
}
