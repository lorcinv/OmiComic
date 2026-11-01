import { BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';

type Thumbnail = {url:string;width:number;height:number};
let window:BrowserWindow|undefined,boot:Promise<BrowserWindow>|undefined,sequence=0,listening=false;
let idle:ReturnType<typeof setTimeout>|undefined;
let active:{id:number;window:BrowserWindow;resolve:(result:Thumbnail)=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}|undefined;

function decoder(){
  if(boot)return boot;
  if(!listening){
    ipcMain.on('omi:thumbnail-result',(event,result)=>{
      const task=active;if(!task||event.sender!==task.window.webContents||result.id!==task.id)return;
      active=undefined;clearTimeout(task.timer);
      if(result.error)task.reject(Error('Thumbnail decode failed'));
      else if(result.width>0&&result.height>0&&Math.max(result.width,result.height)<=360&&typeof result.url==='string'&&result.url.startsWith('data:image/png;'))task.resolve({url:result.url,width:result.width,height:result.height});
      else task.reject(Error('Invalid thumbnail result'));
      idle=setTimeout(()=>window?.destroy(),30000);idle.unref();
    });
    listening=true;
  }
  // The application renderer has no access to this preload or its IPC. Only
  // authorized source paths/bytes from the main process reach the decoder.
  const owner=BrowserWindow.getAllWindows()[0];
  const created=new BrowserWindow({show:false,parent:owner,webPreferences:{preload:path.join(__dirname,'thumbnailPreload.js'),contextIsolation:true,nodeIntegration:false,sandbox:false,backgroundThrottling:false}});
  window=created;
  const destroy=()=>{if(!created.isDestroyed())created.destroy();};
  owner?.once('closed',destroy);
  created.webContents.on('render-process-gone',destroy);
  created.once('closed',()=>{
    owner?.removeListener('closed',destroy);
    if(window===created){window=undefined;boot=undefined;clearTimeout(idle);}
    if(active?.window===created){const task=active;active=undefined;clearTimeout(task.timer);task.reject(Error('Thumbnail decoder closed'));}
  });
  boot=created.loadURL('data:text/html,'+encodeURIComponent('<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'"><title>Omi thumbnail decoder</title>')).then(()=>created);
  return boot;
}

/** Prepare alongside the loaded UI so the first cover need not start a process. */
export function warmThumbnailDecoder(){
  void decoder().then(()=>{if(!active){clearTimeout(idle);idle=setTimeout(()=>window?.destroy(),30000);idle.unref();}}).catch(()=>undefined);
}

/** Serialized by pagePreviewService. Full-size decode and resize run in a
 * separate renderer process; main receives only the <=360px result. */
export async function decodeThumbnail(file:string,load?:()=>Promise<Buffer>):Promise<Thumbnail>{
  clearTimeout(idle);
  const data=load?await load():undefined,worker=await decoder();
  return new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{if(active?.id===id){active=undefined;reject(Error('Thumbnail decode timed out'));worker.destroy();}},30000);
    active={id,window:worker,resolve,reject,timer};
    try{worker.webContents.send('omi:thumbnail-decode',{id,file:data?undefined:file,data});}
    catch(error){active=undefined;clearTimeout(timer);reject(error);}
  });
}
