import { useLayoutEffect,useRef,type RefObject } from 'react';
import { desktopViewportRaster, viewportContains, viewportRaster } from '../reader/viewportRaster';
import { afterDisplaySamplingMotion } from '../reader/displaySampling';
import { queueImageProcessing } from '../reader/processingClient';

/** Large originals remain decoded at source resolution. Zoom/pan redraw a
 * bounded viewport instead of waiting for Chromium to reraster a giant layer. */
export default function useReaderViewportRaster(host: RefObject<HTMLDivElement>,sourceKey: string,enabled: boolean,onBytes?: (bytes:number)=>void,denoise=0,sharpen=0,alignmentKey='') {
  const canvas=useRef<HTMLCanvasElement>(null),notify=useRef(onBytes);notify.current=onBytes;
  const align=useRef(()=>{});
  useLayoutEffect(()=>{
    const element=host.current,surface=canvas.current,stage=element?.closest<HTMLElement>('.reader-stage');
    if(!enabled||!element||!surface||!stage)return;
    let frame=0,bytes=0,disposed=false,regionKey='',timer=0,wait=()=>{},stop=()=>{};const reportBytes=notify.current;
    let cached:ReturnType<typeof viewportRaster>=null,mapping='';
    const report=(value:number)=>{if(bytes!==value){bytes=value;reportBytes?.(value);}};
    // One CSS owner switches the surfaces atomically. Inline visibility on the
    // original used to outlive React's display/processed-raster state changes.
    const cancelProcessing=()=>{clearTimeout(timer);wait();stop();};
    const fallback=()=>{delete element.dataset.viewportReady;regionKey='';cached=null;mapping='';cancelProcessing();};
    const draw=()=>{
      frame=0;if(disposed)return;
      const image=element.querySelector<HTMLImageElement>('.reader-effects-original img');
      if(!image?.complete||!image.naturalWidth){fallback();return;}
      const box=image.getBoundingClientRect(),rect=element.getBoundingClientRect();
      const clip=stage.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
      const region=desktopViewportRaster(box,clip,image.naturalWidth,image.naturalHeight,dpr);
      if(!region||element.closest('[data-reader-page-index][aria-hidden="true"]')){fallback();surface.width=surface.height=0;report(0);return;}
      const layout=getComputedStyle(image);
      const scaleX=box.width/(Number.parseFloat(layout.width)||image.offsetWidth||box.width),scaleY=box.height/(Number.parseFloat(layout.height)||image.offsetHeight||box.height);
      const nextMapping=JSON.stringify([layout.width,layout.height,scaleX,scaleY,dpr,(box.left-rect.left)/scaleX,(box.top-rect.top)/scaleY]);
      const visible=viewportRaster(box,clip,image.naturalWidth,image.naturalHeight,dpr,0);
      if(cached&&visible&&mapping===nextMapping&&element.dataset.viewportReady&&viewportContains(cached,visible))return;
      const key=JSON.stringify([region.x,region.y,region.sourceWidth,region.sourceHeight,region.pixelsWide,region.pixelsHigh,scaleX,scaleY]);
      if(key===regionKey&&element.dataset.viewportReady)return;
      cancelProcessing();regionKey=key;surface.dataset.processing='original';
      try{
        if(surface.width!==region.pixelsWide)surface.width=region.pixelsWide;
        if(surface.height!==region.pixelsHigh)surface.height=region.pixelsHigh;
        const context=surface.getContext('2d');if(!context)throw Error('No viewport surface');
        context.clearRect(0,0,surface.width,surface.height);context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';
        context.drawImage(image,region.x,region.y,region.sourceWidth,region.sourceHeight,0,0,surface.width,surface.height);
        surface.style.left=`${(region.left-rect.left)/scaleX}px`;surface.style.top=`${(region.top-rect.top)/scaleY}px`;
        surface.style.width=`${region.width/scaleX}px`;surface.style.height=`${region.height/scaleY}px`;
        surface.dataset.sourceWidth=String(image.naturalWidth);surface.dataset.sourceHeight=String(image.naturalHeight);
        surface.dataset.drawnAt=String(performance.now());surface.dataset.zoom=stage.dataset.readerZoom||'1';
        element.dataset.viewportReady='true';report(surface.width*surface.height*4);
        cached=region;mapping=nextMapping;
        // Optional effects operate on the source-derived visible region, never
        // on an enlarged fit-size preview. Native detail is visible immediately.
        if(denoise>0||sharpen>0)wait=afterDisplaySamplingMotion(()=>{
          timer=window.setTimeout(()=>{
            if(disposed||regionKey!==key)return;
            surface.dataset.processing='pending';
            stop=queueImageProcessing(async()=>{
              if(disposed||regionKey!==key)throw Error('Cancelled');
              return createImageBitmap(surface);
            },denoise,sharpen,result=>{
              if(disposed||regionKey!==key)return;
              if(!result.blob){surface.dataset.processing='original';return;}
              void createImageBitmap(result.blob).then(bitmap=>{
                try{if(!disposed&&regionKey===key){context.clearRect(0,0,surface.width,surface.height);context.drawImage(bitmap,0,0);surface.dataset.processing='ready';}}
                finally{bitmap.close();}
              }).catch(()=>{if(!disposed&&regionKey===key)surface.dataset.processing='original';});
            });
          },120);
        });
      }catch{fallback();surface.width=surface.height=0;report(0);}
    };
    const schedule=()=>{if(disposed)return;if(!frame)frame=requestAnimationFrame(draw);};
    // Geometry and its bounded source viewport must reach the same paint. A
    // second rAF after a React/gesture frame exposed the old crop for one frame
    // when shrinking, or revealed an unpainted edge while dragging.
    const redraw=()=>{cancelAnimationFrame(frame);draw();};align.current=redraw;
    const spread=element.closest('.reader-page-spread');
    const changes=new MutationObserver(redraw);if(spread)changes.observe(spread,{attributes:true,attributeFilter:['style']});
    const page=element.closest('[data-reader-page-index]');if(page)changes.observe(page,{attributes:true,attributeFilter:['style','aria-hidden']});
    const resize=new ResizeObserver(redraw);resize.observe(element);resize.observe(stage);
    const visible=new IntersectionObserver(schedule,{root:stage});visible.observe(element);
    element.addEventListener('load',schedule,true);spread?.addEventListener('omi-reader-aligned',redraw);window.addEventListener('resize',schedule);redraw();
    return()=>{disposed=true;align.current=()=>{};cancelAnimationFrame(frame);changes.disconnect();resize.disconnect();visible.disconnect();element.removeEventListener('load',schedule,true);spread?.removeEventListener('omi-reader-aligned',redraw);window.removeEventListener('resize',schedule);fallback();surface.width=surface.height=0;report(0);};
  },[host,sourceKey,enabled,denoise,sharpen]);
  useLayoutEffect(()=>align.current(),[alignmentKey]);
  return canvas;
}
