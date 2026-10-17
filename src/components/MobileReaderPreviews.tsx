import { t } from '../i18n';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { 阅读页面项 } from '../types';
import DetailPagePreview from './DetailPagePreview';

export default function MobileReaderPreviews({ pages, current, width, onPage, nativeImage, nativeImages, nativePages, nativeRadius = 0 }: {
  pages: 阅读页面项[]; current: number; width: number; onPage: (index: number) => void; nativeImage?: string | null;
  nativeImages?: Record<number, { url: string; native?: boolean; error?: string | null; prefetchFailed?: boolean }>; nativeRadius?: number; nativePages?: readonly number[];
}) {
  const rail=useRef<HTMLDivElement>(null), moving=useRef(false), programmatic=useRef<number|null>(null), timer=useRef<ReturnType<typeof setTimeout>>();
  const [offset,setOffset]=useState(0), [viewport,setViewport]=useState(360);
  const settled=useRef({center:current,pages:new Set<number>()});
  if(settled.current.center!==current)settled.current={center:current,pages:new Set()};
  const nativeTargets=new Set((nativePages??Array.from({length:nativeRadius*2+1},(_,i)=>current-nativeRadius+i)).filter(index=>index>=0&&index<pages.length&&Math.abs(index-current)<=nativeRadius));
  for(const index of nativeTargets){
    if(nativeImages?.[index]?.url||nativeImages?.[index]?.error||nativeImages?.[index]?.prefetchFailed)settled.current.pages.add(index);
  }
  const stride=width+8;
  useLayoutEffect(() => {
    const el=rail.current!; const resize=() => setViewport(el.clientWidth);
    resize(); const observer=new ResizeObserver(resize); observer.observe(el); return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    if(moving.current || !rail.current) return;
    rail.current.scrollLeft=current*stride; programmatic.current=rail.current.scrollLeft; setOffset(rail.current.scrollLeft);
  }, [current,stride]);
  useEffect(() => () => clearTimeout(timer.current), []);
  // The selected page is centred. Mount only the visible pages plus one on each
  // side; a long seek must not enqueue all the pages left behind by the thumb.
  const center=moving.current ? offset/stride : current;
  const radius=Math.ceil(viewport/stride/2)+1;
  const start=Math.max(0,Math.floor(center)-radius), end=Math.min(pages.length,Math.ceil(center)+radius+1);
  // Far thumbnails also read the archive. Let the current page and its immediate
  // neighbours finish first instead of competing with their native preparation.
  const nearbyPending=nativeImage!==undefined && nativeRadius>0 && [...nativeTargets]
    .some(index=>!/\.gif$/i.test(pages[index].name) && !settled.current.pages.has(index));
  return <section className="mobile-reader-previews" aria-label={t("拖动页面预览")}>
    <div className="mobile-reader-filmstrip" ref={rail} onPointerDown={() => {programmatic.current=null; moving.current=true;}}
      onScroll={event => { const left=event.currentTarget.scrollLeft; setOffset(left);
        const expected=programmatic.current; programmatic.current=null;
        if(expected!==null && Math.abs(left-expected)<1) return;
        // Native momentum may resume after a slow frame. An idle timer is not
        // evidence that scrolling ended; always follow a real changed offset.
        moving.current=true;
        onPage(Math.max(0,Math.min(pages.length-1,Math.round(left/stride)))); clearTimeout(timer.current); timer.current=setTimeout(() => {moving.current=false;},160);
      }} onPointerUp={() => { clearTimeout(timer.current); timer.current=setTimeout(() => {moving.current=false;},160); }}>
      <div className="mobile-filmstrip-track" style={{width:pages.length*stride+viewport-width-8,paddingLeft:(viewport-width)/2,paddingRight:(viewport-width)/2}}>
        <div style={{width:start*stride,flex:'none'}}/>
        {pages.slice(start,end).map(page => {
          const shared = nativeImages?.[page.index];
          const native = page.index===current ? nativeImage : nativeImage!==undefined && nativeTargets.has(page.index) && !/\.gif$/i.test(page.name) && !shared?.error && !shared?.prefetchFailed
            ? (shared?.native ? shared.url : settled.current.pages.has(page.index) ? undefined : null) : nearbyPending && !nativeTargets.has(page.index) ? null : undefined;
          return <div key={page.index} className="mobile-filmstrip-page" style={{width}}><DetailPagePreview page={page} selected={page.index===current} nativeImage={native} previewPriority={Math.abs(page.index-current)} eager onSelect={() => {moving.current=false; onPage(page.index);}} onOpen={() => {}}/></div>;
        })}
      </div>
    </div>
  </section>;
}
