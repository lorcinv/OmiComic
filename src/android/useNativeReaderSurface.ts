import { useLayoutEffect, type RefObject } from 'react';
import type { AppSettings } from '../types';
import type { ImageAdjustments } from '../../electron/shared/readerPreferences';
import { androidNotify, hasAndroidRenderer } from './bridge';

let geometrySequence=0;

/** Only geometry crosses the bridge. Native Canvas retains decoded pages; Omi
 * continues to own its toolbar, gestures, pagination, overlays and themes. */
export default function useNativeReaderSurface(stage:RefObject<HTMLDivElement>, session:number, enabled:boolean, active:boolean, settings:Pick<AppSettings,'readerMemoryCacheSizeMb'|'readerImageLoadConcurrency'>, effects:ImageAdjustments) {
  useLayoutEffect(()=>{
    if(!hasAndroidRenderer())return;
    const configure=()=>{
      if(enabled&&active)document.documentElement.dataset.nativeReader='on';
      else delete document.documentElement.dataset.nativeReader;
      androidNotify('readerConfigure',{session,reading:active,active:enabled&&active,memoryMb:settings.readerMemoryCacheSizeMb,concurrency:settings.readerImageLoadConcurrency,effects,background:getComputedStyle(document.documentElement).getPropertyValue('--阅读背景').trim()});
    };
    configure();
    const observer=new MutationObserver(configure);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-color-theme']});
    return()=>observer.disconnect();
  },[session,enabled,active,settings.readerMemoryCacheSizeMb,settings.readerImageLoadConcurrency,effects]);
  useLayoutEffect(()=>{
    if(!hasAndroidRenderer())return;
    return()=>{delete document.documentElement.dataset.nativeReader;androidNotify('readerConfigure',{session,reading:false,active:false});};
  },[session]);
  useLayoutEffect(()=>{
    if(!enabled||!active)return;
    let frame=0,last='',dirty=true,settleFrames=2;
    const element=stage.current;
    const scene=element?.closest('.reader-layout') ?? element?.parentElement;
    const mark=()=>{dirty=true;settleFrames=2;};
    const resize=new ResizeObserver(mark);
    const observeLayout=()=>{
      resize.disconnect();if(!element)return;resize.observe(element);
      element.querySelectorAll<HTMLElement>('.reader-page-spread,[data-native-image]').forEach(node=>resize.observe(node));
    };
    const observer=new MutationObserver(records=>{mark();if(records.some(record=>record.type==='childList'))observeLayout();});
    if(scene)observer.observe(scene,{attributes:true,childList:true,subtree:true});
    const overlays=new MutationObserver(mark);overlays.observe(document.body,{childList:true});
    observeLayout();
    element?.addEventListener('scroll',mark);window.addEventListener('resize',mark);window.visualViewport?.addEventListener('resize',mark);
    scene?.addEventListener('scroll',mark,true);
    // CSS layout uses fractions of a physical pixel. Replaying alternating
    // fractions in a separate Canvas made fine line art shimmer while idle.
    const rectangle=(r:DOMRect)=>[r.left,r.top,r.right,r.bottom].map(n=>Math.round(n*(window.devicePixelRatio||1))/(window.devicePixelRatio||1));
    const paint=()=>{
      if(element&&(dirty||settleFrames>0||element.hasAttribute('data-panorama-jump-phase'))){
        dirty=false;
        if(settleFrames>0)settleFrames--;
        const clip=element.getBoundingClientRect();
        const slots:Array<{url:string;rect:number[];alpha:number}>=[];
        const nodes=element.querySelectorAll<HTMLElement>('[data-native-image]');
        for(const node of nodes){
          if(getComputedStyle(node).visibility==='hidden')continue;
          const r=node.getBoundingClientRect();
          if(r.width<=0||r.height<=0||r.right<=clip.left||r.left>=clip.right||r.bottom<=clip.top||r.top>=clip.bottom)continue;
          let alpha=1;
          for(let parent:HTMLElement|null=node;parent&&parent!==element;parent=parent.parentElement)alpha*=Number(getComputedStyle(parent).opacity);
          if(alpha>0)slots.push({url:node.dataset.nativeImage!,rect:rectangle(r),alpha});
        }
        const previews:Array<{url:string;rect:number[];clip:number[]}>=[];
        scene?.querySelectorAll<HTMLElement>('[data-native-preview]').forEach(node=>{
          const r=node.getBoundingClientRect(),rail=node.closest('.mobile-reader-filmstrip')?.getBoundingClientRect();
          if(!rail||r.width<=0||r.height<=0)return;
          const left=Math.max(r.left,rail.left),right=Math.min(r.right,rail.right),top=Math.max(r.top,rail.top),bottom=Math.min(r.bottom,rail.bottom);
          if(right<=left||bottom<=top)return;
          // A sheet, settings panel or dismiss shield must cover the native
          // preview exactly as it covers the rest of the reader's web UI.
          const hit=document.elementFromPoint((left+right)/2,(top+bottom)/2);
          if(!hit||!(node.contains(hit)||hit===node.closest('button')))return;
          previews.push({url:node.dataset.nativePreview!,rect:rectangle(r),clip:rectangle(new DOMRect(left,top,right-left,bottom-top))});
        });
        const message={session,viewportWidth:window.innerWidth,clip:rectangle(clip),slots,previews,nativeExpected:nodes.length>0};
        const key=JSON.stringify(message);if(key!==last){last=key;androidNotify('readerFrame',{...message,sequence:++geometrySequence});}
      }
      frame=requestAnimationFrame(paint);
    };
    paint();
    return()=>{cancelAnimationFrame(frame);observer.disconnect();overlays.disconnect();resize.disconnect();element?.removeEventListener('scroll',mark);scene?.removeEventListener('scroll',mark,true);window.removeEventListener('resize',mark);window.visualViewport?.removeEventListener('resize',mark);};
  },[session,enabled,active,stage]);
}
