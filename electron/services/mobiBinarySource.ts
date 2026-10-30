import { open,type FileHandle } from 'node:fs/promises';

/** Separate, read-only range source. MOBI never enters the PDF or EPUB parser. */
export class MobiBinarySource {
  private constructor(private file:FileHandle,readonly size:number){}
  static async open(path:string){
    const file=await open(path,'r');
    try{
      const info=await file.stat(),header=Buffer.alloc(78);
      if(!info.isFile()||info.size<78||info.size>64*1024*1024)throw Error('MOBI 文件为空或超过本版 64 MB 上限。');
      await file.read(header,0,78,0);
      if(header.toString('ascii',60,68)!=='BOOKMOBI')throw Error('文件不是有效的 MOBI。');
      return new MobiBinarySource(file,info.size);
    }catch(error){await file.close();throw error;}
  }
  async range(begin:number,end:number){
    if(!Number.isInteger(begin)||!Number.isInteger(end)||begin<0||end<=begin||end>this.size||end-begin>1024*1024)throw Error('MOBI 读取范围无效。');
    const data=Buffer.alloc(end-begin);let offset=0;
    while(offset<data.length){const next=await this.file.read(data,offset,data.length-offset,begin+offset);if(!next.bytesRead)throw Error('MOBI 文件读取中断。');offset+=next.bytesRead;}
    return data;
  }
  close(){return this.file.close();}
}
