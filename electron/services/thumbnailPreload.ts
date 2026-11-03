import { ipcRenderer, nativeImage } from 'electron';
import { readFile } from 'node:fs/promises';

// This isolated preload loads no page scripts and exposes no renderer API.
ipcRenderer.on('omi:thumbnail-decode',async(_event,{id,file,data}:{id:number;file?:string;data?:Uint8Array})=>{
  try{
    const image=data?nativeImage.createFromBuffer(Buffer.from(data.buffer,data.byteOffset,data.byteLength)):nativeImage.createFromPath(file!);
    if(image.isEmpty()){
      // Chromium supports WebP/GIF and the other reader formats even when the
      // platform nativeImage decoder does not. Keep full pixels in this worker.
      const bytes=data?new Uint8Array(data):new Uint8Array(await readFile(file!));
      const bitmap=await createImageBitmap(new Blob([bytes]));
      try{
        const factor=Math.min(1,360/Math.max(bitmap.width,bitmap.height));
        const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*factor));canvas.height=Math.max(1,Math.round(bitmap.height*factor));
        canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
        ipcRenderer.send('omi:thumbnail-result',{id,url:canvas.toDataURL('image/png'),width:canvas.width,height:canvas.height});
      }finally{bitmap.close();}
      return;
    }
    const size=image.getSize(),factor=Math.min(1,360/Math.max(size.width,size.height));
    const width=Math.max(1,Math.round(size.width*factor)),height=Math.max(1,Math.round(size.height*factor));
    const output=factor<1?image.resize({width,height,quality:'good'}):image;
    ipcRenderer.send('omi:thumbnail-result',{id,url:output.toDataURL(),width,height});
  }catch{ipcRenderer.send('omi:thumbnail-result',{id,error:true});}
});
