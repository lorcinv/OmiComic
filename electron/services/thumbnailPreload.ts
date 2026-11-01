import { ipcRenderer, nativeImage } from 'electron';

// This isolated preload loads no page scripts and exposes no renderer API.
ipcRenderer.on('omi:thumbnail-decode',(_event,{id,file,data}:{id:number;file?:string;data?:Uint8Array})=>{
  try{
    const image=data?nativeImage.createFromBuffer(Buffer.from(data.buffer,data.byteOffset,data.byteLength)):nativeImage.createFromPath(file!);
    if(image.isEmpty())throw Error('Unsupported thumbnail');
    const size=image.getSize(),factor=Math.min(1,360/Math.max(size.width,size.height));
    const width=Math.max(1,Math.round(size.width*factor)),height=Math.max(1,Math.round(size.height*factor));
    const output=factor<1?image.resize({width,height,quality:'good'}):image;
    ipcRenderer.send('omi:thumbnail-result',{id,url:output.toDataURL(),width,height});
  }catch{ipcRenderer.send('omi:thumbnail-result',{id,error:true});}
});
