import { t } from '../i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { 阅读页面项 } from '../types';
import DetailPagePreview from './DetailPagePreview';
import type { DocumentSource } from '../reader/documentSource';
import {requestMobilePagePreview} from '../reader/mobilePagePreviews';

export default function MobileReaderPreviews({ pages, current, currentGroup, followingProgress = false, width, onPage, nativeImage, nativeImages, nativePages, nativeRadius = 0, documentSource }: {
  pages: 阅读页面项[]; current: number; width: number; onPage: (index: number) => void; nativeImage?: string | null;
  currentGroup?: readonly number[]; followingProgress?: boolean;
  nativeImages?: Record<number, { url: string; native?: boolean; error?: string | null; prefetchFailed?: boolean }>; nativeRadius?: number; nativePages?: readonly number[];
  documentSource?: DocumentSource;
}) {
  const stride=width+8;
  const rail=useRef<HTMLDivElement>(null), programmatic=useRef<number|null>(null), timer=useRef<ReturnType<typeof setTimeout>>();
  const moving=useRef(false), requested=useRef(current), align=useRef<number|null>(current*stride);
  const pending=useRef<number[]>([]);
  const progressTarget=useRef<number|null>(null);
  if(followingProgress)progressTarget.current=current;
  const ownsScroll=useRef(false),publishTimer=useRef<ReturnType<typeof setTimeout>>(),lastPublish=useRef(0),lastSent=useRef(current);
  const direction=useRef(1),lastOffset=useRef(current*stride);
  const drag=useRef<{id:number;x:number;left:number;moved:boolean}|null>(null),suppressClick=useRef(false);
  const onPageRef=useRef(onPage);onPageRef.current=onPage;
  const requestPage=(index:number,immediate=false)=>{
    requested.current=index;
    const publish=()=>{publishTimer.current=undefined;const target=requested.current;if(target===lastSent.current)return;lastSent.current=target;lastPublish.current=Date.now();pending.current.push(target);onPageRef.current(target);};
    // Keep the strip on the compositor; do not restart full-page decoding for
    // every crossed thumbnail during a fling. Always flush the final target.
    if(immediate||Date.now()-lastPublish.current>=100){clearTimeout(publishTimer.current);publish();}
    else if(!publishTimer.current)publishTimer.current=setTimeout(publish,100-(Date.now()-lastPublish.current));
  };
  const [offset,setOffset]=useState(current*stride), [viewport,setViewport]=useState(360);
  const geometry=useRef({stride,viewport});
  const settled=useRef({center:current,pages:new Set<number>()});
  if(settled.current.center!==current)settled.current={center:current,pages:new Set()};
  const nativeTargets=new Set((nativePages??Array.from({length:nativeRadius*2+1},(_,i)=>current-nativeRadius+i)).filter(index=>index>=0&&index<pages.length&&Math.abs(index-current)<=nativeRadius));
  for(const index of nativeTargets){
    if(nativeImages?.[index]?.url||nativeImages?.[index]?.error||nativeImages?.[index]?.prefetchFailed)settled.current.pages.add(index);
  }
  useLayoutEffect(() => {
    const el=rail.current!; const resize=() => setViewport(el.clientWidth);
    resize(); const observer=new ResizeObserver(resize); observer.observe(el); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const resized=geometry.current.stride!==stride || Math.abs(geometry.current.viewport-viewport)>=1;
    geometry.current={stride,viewport};
    if(!followingProgress&&progressTarget.current!==null){
      const target=progressTarget.current;
      if(current!==target&&!currentGroup?.includes(target))return;
      progressTarget.current=null;requested.current=target;lastSent.current=target;clearTimeout(publishTimer.current);pending.current=[];
      ownsScroll.current=true;moving.current=false;align.current=target*stride;setOffset(target*stride);return;
    }
    // Reader updates caused by this strip must not scroll it a second time.
    // A paired-page reader may report the other page in the same group.
    if(!resized && !followingProgress){
      let acknowledged=-1;
      for(let i=pending.current.length-1;i>=0;i--)if(pending.current[i]===current||currentGroup?.includes(pending.current[i])){acknowledged=i;break;}
      if(acknowledged>=0){pending.current.splice(0,acknowledged+1);return;}
      if(ownsScroll.current||moving.current||current===requested.current||currentGroup?.includes(requested.current))return;
    }
    if(resized&&moving.current&&!followingProgress)return;
    moving.current=false; clearTimeout(timer.current); requested.current=current;
    clearTimeout(publishTimer.current);lastSent.current=current;
    pending.current=[];
    // Outside explicit progress seeks, keep the current page inside a central
    // band. A normal page turn need not drag it back to the exact centre.
    const left=rail.current?.scrollLeft??0,slack=Math.min(Math.max(stride,viewport*.24),Math.max(0,(viewport-width)/2-8)),target=current*stride;
    const next=followingProgress||resized?target:Math.max(target-slack,Math.min(target+slack,left));
    if(Math.abs(next-left)<1)return;
    align.current=next;setOffset(next);
  }, [current,stride,viewport,followingProgress,pages.length]);
  useLayoutEffect(() => {
    if(!rail.current || align.current===null || Math.abs(offset-align.current)>.01) return;
    // Mount the destination's virtual pages before an explicit progress seek.
    // User scrolling never schedules a second positioning operation.
    rail.current.scrollTo({left:align.current,behavior:'instant'});
    programmatic.current=rail.current.scrollLeft;align.current=null;
  }, [offset,current,stride,viewport,followingProgress]);
  useEffect(() => {
    const el=rail.current;
    const end=()=>{if(!drag.current)moving.current=false;clearTimeout(timer.current);requestPage(requested.current,true);};
    el?.addEventListener('scrollend',end);return()=>el?.removeEventListener('scrollend',end);
  }, []);
  useEffect(()=>{
    const external=(event:Event)=>{
      if(event.type==='pointerdown'&&(event.target as Element)?.closest('.mobile-reader-previews'))return;
      progressTarget.current=null;
      if(ownsScroll.current&&rail.current){rail.current.scrollTo({left:rail.current.scrollLeft,behavior:'instant'});programmatic.current=rail.current.scrollLeft;}
      ownsScroll.current=false;moving.current=false;
    };
    document.addEventListener('pointerdown',external,true);window.addEventListener('keydown',external);window.addEventListener('omi-volume-up',external);window.addEventListener('omi-volume-down',external);
    return()=>{document.removeEventListener('pointerdown',external,true);window.removeEventListener('keydown',external);window.removeEventListener('omi-volume-up',external);window.removeEventListener('omi-volume-down',external);};
  },[]);
  const finishDrag=()=>{
    const gesture=drag.current;drag.current=null;moving.current=false;clearTimeout(timer.current);
    if(!gesture?.moved)return false;
    // Only mouse dragging is implemented here. Touch keeps the browser's
    // compositor scrolling and inertia, without a release snap or recenter.
    const left=rail.current!.scrollLeft,index=Math.max(0,Math.min(pages.length-1,Math.round(left/stride)));
    suppressClick.current=true;setOffset(left);requestPage(index,true);return true;
  };
  useEffect(() => () => {clearTimeout(timer.current);clearTimeout(publishTimer.current);}, []);
  // Follow the actual offset throughout native inertia. Mount only the visible
  // pages plus one on each side, including during a long fling.
  const center=Math.max(0,Math.min(pages.length-1,offset/stride));
  const selected=progressTarget.current??(ownsScroll.current?Math.round(center):current);
  const radius=Math.ceil(viewport/stride/2)+1;
  const start=Math.max(0,Math.floor(center)-radius), end=Math.min(pages.length,Math.ceil(center)+radius+1);
  useEffect(()=>{
    if(documentSource||!ownsScroll.current)return;
    // Warm a short directional runway in the same bounded preview cache.
    const requests=Array.from({length:3},(_,step)=>direction.current>0?end+step:start-1-step)
      .filter(index=>index>=0&&index<pages.length).map(index=>requestMobilePagePreview(pages[index],8+Math.abs(index-selected)));
    for(const request of requests)void request.promise.catch(()=>undefined);
    return()=>requests.forEach(request=>request.cancel());
  },[start,end,documentSource]);
  // The body and tiny previews have separate budgets. A missing body page
  // must not freeze the whole visible strip behind a large source decode.
  return <section className="mobile-reader-previews" aria-label={t("拖动页面预览")}>
    <div className="mobile-reader-filmstrip" ref={rail} onPointerDown={event=>{
        if(event.pointerType==='mouse'&&(event.button!==0||!event.isPrimary))return;
        progressTarget.current=null;suppressClick.current=false;programmatic.current=null;moving.current=true;ownsScroll.current=true;clearTimeout(timer.current);
        // Capturing and preventing touch moves disables native fast scrolling.
        if(event.pointerType==='mouse')drag.current={id:event.pointerId,x:event.clientX,left:event.currentTarget.scrollLeft,moved:false};
      }} onPointerMove={event=>{
        const gesture=drag.current;if(!gesture||gesture.id!==event.pointerId)return;
        const delta=gesture.x-event.clientX;if(!gesture.moved&&Math.abs(delta)<3)return;
        if(!gesture.moved){gesture.moved=true;event.currentTarget.setPointerCapture(event.pointerId);}
        event.preventDefault();event.currentTarget.scrollLeft=gesture.left+delta;
      }} onPointerUp={event=>{
        if(drag.current?.id!==event.pointerId)return;
        if(finishDrag()){event.preventDefault();event.stopPropagation();}
        if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
      }} onPointerCancel={event=>{
        // Native pan takes over with pointercancel and continues after release.
        if(event.pointerType==='touch'){suppressClick.current=true;return;}
        if(drag.current?.id===event.pointerId)finishDrag();
      }} onLostPointerCapture={event=>{
        // Touch initially captures the pressed thumbnail. Taking that capture
        // for the rail also bubbles the child's lost event through this handler.
        if(event.target===event.currentTarget&&drag.current?.id===event.pointerId)finishDrag();
      }}
      onClickCapture={event=>{if(suppressClick.current){suppressClick.current=false;event.preventDefault();event.stopPropagation();}}}
      onScroll={event => { const left=event.currentTarget.scrollLeft; setOffset(left);
        const expected=programmatic.current; programmatic.current=null;
        if(expected!==null && Math.abs(left-expected)<1) return;
        if(Math.abs(left-lastOffset.current)>1)direction.current=left>lastOffset.current?1:-1;lastOffset.current=left;
        // Native momentum may resume after a slow frame. An idle timer is not
        // evidence that scrolling ended; always follow a real changed offset.
        moving.current=true;ownsScroll.current=true;
        const index=Math.max(0,Math.min(pages.length-1,Math.round(left/stride)));
        requestPage(index);
        // Older WebViews may omit scrollend. This only ends gesture ownership;
        // it never changes the scroll position after native inertia finishes.
        clearTimeout(timer.current);timer.current=setTimeout(()=>{if(!drag.current)moving.current=false;requestPage(requested.current,true);},160);
      }}>
      <div className="mobile-filmstrip-track" style={{width:pages.length*stride+viewport-width-8,paddingLeft:(viewport-width)/2,paddingRight:(viewport-width)/2}}>
        <div style={{width:start*stride,flex:'none'}}/>
        {pages.slice(start,end).map(page => {
          const shared = nativeImages?.[page.index];
          const native = page.index===current && nativeImage ? nativeImage
            : shared?.native && shared.url && nativeTargets.has(page.index) && !/\.gif$/i.test(page.name) ? shared.url : undefined;
          return <div key={page.index} className="mobile-filmstrip-page" style={{width}}><DetailPagePreview page={page} selected={page.index===selected} nativeImage={native} documentSource={documentSource} previewPriority={Math.abs(page.index-selected)+(direction.current*(page.index-selected)<-1?2:0)} eager onSelect={() => {progressTarget.current=null;ownsScroll.current=true;moving.current=false;clearTimeout(timer.current);align.current=page.index*stride;setOffset(page.index*stride);requestPage(page.index,true);}} onOpen={() => {}}/></div>;
        })}
      </div>
    </div>
  </section>;
}
