import {useId,useLayoutEffect,useRef,useState,type ReactNode}from'react';
import {t}from'../i18n';

export default function PickerScrollArea({children,className,label,hideScrollbar=false}:{children:ReactNode;className:string;label:string;hideScrollbar?:boolean}){
  const id=useId(),scroll=useRef<HTMLDivElement>(null),drag=useRef<{id:number;y:number;top:number;range:number;travel:number}|null>(null);
  const [size,setSize]=useState({height:0,content:0,top:0});
  const sync=()=>{const el=scroll.current;if(!el)return;const next={height:el.clientHeight,content:el.scrollHeight,top:el.scrollTop};setSize(old=>old.height===next.height&&old.content===next.content&&old.top===next.top?old:next);};
  useLayoutEffect(()=>{if(hideScrollbar)return;const el=scroll.current!;sync();const resize=new ResizeObserver(sync),changes=new MutationObserver(sync);resize.observe(el);changes.observe(el,{childList:true,subtree:true,characterData:true});return()=>{resize.disconnect();changes.disconnect();};},[hideScrollbar]);
  const range=Math.max(0,size.content-size.height),thumb=Math.min(size.height,Math.max(28,size.height*size.height/Math.max(1,size.content))),travel=Math.max(1,size.height-thumb),top=range?size.top/range*travel:0;
  return <div className="picker-scroll-area">
    <div ref={scroll} id={id} className={`picker-scroll-content ${className}`} style={{paddingRight:range>1&&!hideScrollbar?18:0}} onScroll={hideScrollbar?undefined:sync}>{children}</div>
    {range>1&&!hideScrollbar&&<div className="picker-scrollbar" role="scrollbar" aria-label={t(label)} aria-controls={id} aria-orientation="vertical" aria-valuemin={0} aria-valuemax={Math.round(range)} aria-valuenow={Math.round(size.top)} tabIndex={0}
      onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.stopPropagation();const el=scroll.current!;
        if(!(event.target instanceof Element&&event.target.closest('.picker-scroll-thumb'))){el.scrollTop+=event.clientY<event.currentTarget.getBoundingClientRect().top+top?-size.height:size.height;sync();return;}
        drag.current={id:event.pointerId,y:event.clientY,top:el.scrollTop,range,travel};event.currentTarget.setPointerCapture(event.pointerId);
      }} onPointerMove={event=>{const current=drag.current;if(!current||current.id!==event.pointerId)return;event.preventDefault();scroll.current!.scrollTop=current.top+(event.clientY-current.y)*current.range/current.travel;sync();}}
      onPointerUp={event=>{drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}}
      onKeyDown={event=>{const el=scroll.current!;const delta=event.key==='PageDown'?size.height:event.key==='PageUp'?-size.height:event.key==='ArrowDown'?44:event.key==='ArrowUp'?-44:0;if(event.key==='Home')el.scrollTop=0;else if(event.key==='End')el.scrollTop=range;else if(delta)el.scrollTop+=delta;else return;event.preventDefault();sync();}}>
      <span className="picker-scroll-thumb" style={{height:thumb,transform:`translateY(${top}px)`}}/>
    </div>}
  </div>;
}
